import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/errorHandler.js'
import { sendPatientChatMessageEmail, sendNotificationEmail } from '../../lib/mailer.js'
import {
  publishChatToStaff,
  publishChatToUser,
  publishChatToUsers,
  type ChatRealtimeEvent,
} from '../../lib/chatRealtime.js'
import { createUserNotification } from '../../lib/userNotifications.js'
import { formatDevisPdfFileName } from '../../lib/devisNumber.js'
import type { UserRole } from '../auth/auth.types.js'
import type { MarkReadInput, SendMessageInput } from './chat.schema.js'

async function publishThreadEvent(
  patientId: string,
  event: ChatRealtimeEvent,
  opts?: { includePatient?: boolean; staffRoles?: UserRole[] },
) {
  const includePatient = opts?.includePatient !== false
  const staffRoles = opts?.staffRoles ?? (['medecin', 'gestionnaire'] as UserRole[])
  const [patient, staff] = await Promise.all([
    includePatient
      ? prisma.patient.findUnique({ where: { id: patientId }, select: { userId: true } })
      : Promise.resolve(null),
    staffRoles.length > 0
      ? prisma.user.findMany({
          where: { role: { in: staffRoles } },
          select: { id: true },
        })
      : Promise.resolve([]),
  ])
  const userIds = [
    ...(patient ? [patient.userId] : []),
    ...staff.map((s) => s.id),
  ]
  if (userIds.length === 0) return
  publishChatToUsers(userIds, event)
}

async function lastPublicStaffRole(patientId: string): Promise<'medecin' | 'gestionnaire' | null> {
  const last = await prisma.message.findFirst({
    where: {
      patientId,
      staffOnly: false,
      deletedForAll: false,
      expediteurRole: { in: ['medecin', 'gestionnaire'] },
    },
    orderBy: { dateEnvoi: 'desc' },
    select: { expediteurRole: true },
  })
  if (last?.expediteurRole === 'medecin' || last?.expediteurRole === 'gestionnaire') {
    return last.expediteurRole
  }
  return null
}

/** True si le message chat est le PDF d’un devis (pièce jointe sendDevis). */
function messageMatchesDevisPdf(
  m: { pieceJointeNom?: string | null; pieceJointeUrl?: string | null; contenu?: string | null },
  refs: string[],
): boolean {
  if (refs.length === 0) return false
  const hay = `${m.pieceJointeNom ?? ''} ${m.pieceJointeUrl ?? ''} ${m.contenu ?? ''}`.toLowerCase()
  if (!hay.trim()) return false
  // Uniquement les pièces jointes / PDF (pas les SMS texte du template devis)
  const looksLikeAttachment =
    Boolean(m.pieceJointeNom?.trim())
    || Boolean(m.pieceJointeUrl?.trim())
    || /pi[eè]ce jointe/i.test(m.contenu ?? '')
    || /\.pdf\b/i.test(hay)
  if (!looksLikeAttachment) return false
  return refs.some((ref) => {
    const r = ref.trim().toLowerCase()
    if (r.length < 3) return false
    return hay.includes(r)
  })
}

function buildDevisPdfMatchRefs(input: {
  numeroDevis?: string | null
  dossierNumber?: string | null
  pieceJointeNom?: string | null
  version?: number | null
  patientFullName?: string | null
}): string[] {
  const refs = new Set<string>()
  if (input.numeroDevis?.trim()) refs.add(input.numeroDevis.trim())
  if (input.dossierNumber?.trim()) refs.add(input.dossierNumber.trim())
  if (input.pieceJointeNom?.trim()) {
    refs.add(input.pieceJointeNom.trim())
    refs.add(input.pieceJointeNom.replace(/\.pdf$/i, '').trim())
  }
  // Slug disque (chat-…-MC-08-029-…)
  for (const raw of [input.numeroDevis, input.dossierNumber]) {
    if (!raw?.trim()) continue
    refs.add(raw.trim().replace(/[^\w.-]+/g, '_'))
  }
  return [...refs]
}

/**
 * Tombstone TOUS les PDF devis du fil chat patient (pièces jointes sendDevis).
 * Affiche « Message supprimé » côté patient + staff.
 */
export async function softDeleteAllDevisPdfMessagesForPatient(patientId: string): Promise<number> {
  const candidates = await prisma.message.findMany({
    where: {
      patientId,
      deletedForAll: false,
      OR: [
        { pieceJointeNom: { not: null } },
        { pieceJointeUrl: { not: null } },
        { contenu: { contains: 'Pièce jointe' } },
        { contenu: { contains: '.pdf' } },
      ],
    },
    select: {
      id: true,
      pieceJointeNom: true,
      pieceJointeUrl: true,
      contenu: true,
      expediteurRole: true,
    },
  })

  const ids = candidates
    .filter((m) => {
      const hay = `${m.pieceJointeNom ?? ''} ${m.pieceJointeUrl ?? ''} ${m.contenu ?? ''}`.toLowerCase()
      if (!hay.trim()) return false
      const isPdf =
        /\.pdf\b/i.test(hay)
        || Boolean(m.pieceJointeUrl?.includes('/uploads/'))
        || /pi[eè]ce jointe/i.test(m.contenu ?? '')
      if (!isPdf) return false
      // Devis : n° MC-… / « Devis- » / nom fichier chat-
      return (
        /\bmc-\d{2}-\d{3}-\d{4}\b/i.test(hay)
        || /\bdevis[-_\s]/i.test(hay)
        || /chat-\d+-/i.test(hay)
      )
    })
    .map((m) => m.id)

  if (ids.length === 0) return 0

  await prisma.message.updateMany({
    where: { id: { in: ids } },
    data: {
      deletedForAll: true,
      deletedForAllAt: new Date(),
      contenu: '',
      pieceJointeUrl: null,
      pieceJointeNom: null,
      pinned: false,
      pinnedAt: null,
      pinnedById: null,
    },
  })

  void publishThreadEvent(patientId, {
    type: 'chat:thread',
    patientId,
  })

  return ids.length
}

/**
 * Tombstone les PDF devis dans le chat correspondant aux références données.
 */
export async function softDeleteDevisPdfMessages(
  patientId: string,
  match: {
    numeroDevis?: string | null
    dossierNumber?: string | null
    pieceJointeNom?: string | null
    version?: number | null
    patientFullName?: string | null
  },
): Promise<number> {
  const refs = buildDevisPdfMatchRefs(match)
  if (refs.length === 0) return 0

  const candidates = await prisma.message.findMany({
    where: {
      patientId,
      deletedForAll: false,
      OR: [
        { pieceJointeNom: { not: null } },
        { pieceJointeUrl: { not: null } },
        { contenu: { contains: 'Pièce jointe' } },
        { contenu: { contains: '.pdf' } },
      ],
    },
    select: {
      id: true,
      pieceJointeNom: true,
      pieceJointeUrl: true,
      contenu: true,
    },
  })

  const ids = candidates.filter((m) => messageMatchesDevisPdf(m, refs)).map((m) => m.id)
  if (ids.length === 0) return 0

  await prisma.message.updateMany({
    where: { id: { in: ids } },
    data: {
      deletedForAll: true,
      deletedForAllAt: new Date(),
      contenu: '',
      pieceJointeUrl: null,
      pieceJointeNom: null,
      pinned: false,
      pinnedAt: null,
      pinnedById: null,
    },
  })

  void publishThreadEvent(patientId, {
    type: 'chat:thread',
    patientId,
  })

  return ids.length
}

/** Masque les PDF encore visibles alors que le devis est déjà soft-supprimé. */
export async function syncHiddenDevisPdfsForPatient(patientId: string): Promise<void> {
  const deletedCount = await prisma.devis.count({
    where: { patientId, deletedAt: { not: null } },
  })
  if (deletedCount === 0) return

  // Si au moins un devis a été supprimé : retirer tous les PDF devis restants du fil
  // (les envois futurs recréeront une pièce jointe propre).
  const activeVisible = await prisma.devis.count({
    where: {
      patientId,
      deletedAt: null,
      statut: { in: ['envoye', 'accepte', 'refuse'] },
    },
  })
  if (activeVisible === 0) {
    await softDeleteAllDevisPdfMessagesForPatient(patientId)
    return
  }

  const deleted = await prisma.devis.findMany({
    where: { patientId, deletedAt: { not: null } },
    select: {
      numeroDevis: true,
      version: true,
      patient: { select: { dossierNumber: true, user: { select: { fullName: true } } } },
    },
  })

  for (const d of deleted) {
    const pieceJointeNom = formatDevisPdfFileName(
      d.numeroDevis ?? d.patient.dossierNumber,
      d.patient.user.fullName,
      d.version,
    )
    await softDeleteDevisPdfMessages(patientId, {
      numeroDevis: d.numeroDevis,
      dossierNumber: d.patient.dossierNumber,
      version: d.version,
      patientFullName: d.patient.user.fullName,
      pieceJointeNom,
    })
  }
}

export const EQUIPE_THREAD_ID = 'equipe'

/** Nom affiché dans le canal interne (une seule discussion gestionnaire ↔ médecin). */
function equipeDisplayName(role: string): string {
  if (role === 'gestionnaire') return 'Houda'
  if (role === 'medecin') return 'Dr Chennoufi'
  return role
}

function mapMessage(m: {
  id: string
  patientId: string
  expediteurId: string
  expediteurRole: string
  contenu: string
  pieceJointeUrl?: string | null
  pieceJointeNom?: string | null
  lu: boolean
  dateEnvoi: Date
  deletedForAll?: boolean
  pinned?: boolean
  pinnedAt?: Date | null
  staffOnly?: boolean
  dossierLink?: boolean
  expediteur?: { fullName: string } | null
  patient?: {
    dossierNumber: string
    user: { fullName: string }
  } | null
}) {
  const deletedForAll = Boolean(m.deletedForAll)
  const staffOnly = Boolean(m.staffOnly)
  const expediteurNom = staffOnly
    ? equipeDisplayName(m.expediteurRole)
    : (m.expediteur?.fullName ?? null)
  return {
    id: m.id,
    dossierPatientId: m.patientId,
    patientId: m.patientId,
    expediteurId: m.expediteurId,
    expediteurRole: m.expediteurRole as UserRole,
    expediteurNom,
    contenu: deletedForAll ? '' : m.contenu,
    pieceJointeUrl: deletedForAll ? null : (m.pieceJointeUrl ?? null),
    pieceJointeNom: deletedForAll ? null : (m.pieceJointeNom ?? null),
    dateEnvoi: m.dateEnvoi.toISOString(),
    lu: m.lu,
    deletedForAll,
    pinned: Boolean(m.pinned),
    pinnedAt: m.pinnedAt?.toISOString() ?? null,
    staffOnly,
    dossierLink: staffOnly && Boolean(m.dossierLink),
    patientNom: m.patient?.user.fullName ?? null,
    dossierNumber: m.patient?.dossierNumber ?? null,
  }
}

async function resolvePatientIdForUser(userId: string, role: UserRole, patientId?: string): Promise<string> {
  if (role === 'patient') {
    const patient = await prisma.patient.findUnique({
      where: { userId },
      select: { id: true },
    })
    if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Dossier patient introuvable.')
    return patient.id
  }

  if (!patientId) throw new AppError(400, 'PATIENT_ID_REQUIRED', 'patientId requis.')
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')
  return patient.id
}

async function getAccessibleMessage(userId: string, role: UserRole, messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { expediteur: { select: { fullName: true } } },
  })
  if (!message) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message introuvable.')

  if (role === 'patient') {
    const patient = await prisma.patient.findUnique({
      where: { userId },
      select: { id: true },
    })
    if (!patient || patient.id !== message.patientId) {
      throw new AppError(403, 'FORBIDDEN', 'Accès refusé.')
    }
    if (message.staffOnly) {
      throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message introuvable.')
    }
  }

  // Médecin : pas d’accès aux messages publics gestionnaire ↔ patiente
  if (
    role === 'medecin' &&
    !message.staffOnly &&
    message.expediteurRole === 'gestionnaire'
  ) {
    throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message introuvable.')
  }

  const hidden = await prisma.messageHidden.findUnique({
    where: { messageId_userId: { messageId, userId } },
    select: { id: true },
  })
  if (hidden) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message introuvable.')

  return message
}

async function firstMedecinPublicMessageAt(patientId: string): Promise<Date | null> {
  const first = await prisma.message.findFirst({
    where: {
      patientId,
      expediteurRole: 'medecin',
      staffOnly: false,
      deletedForAll: false,
    },
    orderBy: { dateEnvoi: 'asc' },
    select: { dateEnvoi: true },
  })
  return first?.dateEnvoi ?? null
}

/** Dossiers où le Dr a déjà écrit à la patiente (les fils Houda restent invisibles). */
async function medecinStartedPatientThreads(): Promise<Map<string, Date>> {
  const rows = await prisma.message.groupBy({
    by: ['patientId'],
    where: {
      expediteurRole: 'medecin',
      staffOnly: false,
      deletedForAll: false,
    },
    _min: { dateEnvoi: true },
  })
  const map = new Map<string, Date>()
  for (const r of rows) {
    if (r._min.dateEnvoi) map.set(r.patientId, r._min.dateEnvoi)
  }
  return map
}

async function notifyStaffNewPatientMessage(input: {
  patientId: string
  patientName: string
  dossierNumber: string
  preview: string
}) {
  const staff = await prisma.user.findMany({
    where: { role: { in: ['medecin', 'gestionnaire'] } },
    select: { id: true, role: true },
  })
  const titre = 'Nouveau message chat'
  const message = `${input.patientName} (${input.dossierNumber}) : ${input.preview.slice(0, 120)}`

  // Dr : uniquement si la patiente lui répond (dernier message équipe = médecin), pas le fil Houda
  const lastStaff = await lastPublicStaffRole(input.patientId)
  const notifyDoctor = lastStaff === 'medecin'
  const recipients = staff.filter((u) => u.role === 'gestionnaire' || notifyDoctor)

  await Promise.all([
    ...recipients.map((u) =>
      createUserNotification({
        userId: u.id,
        type: 'info',
        titre,
        message,
        lienAction: u.role === 'medecin' ? '/medecin/chat?channel=patient' : '/gestionnaire/chat?channel=patient',
        kind: 'chat',
      }).catch(() => undefined)
    ),
  ])
}

async function notifyStaffPeerInternalMessage(input: {
  senderRole: UserRole
  patientName: string
  dossierNumber: string
  preview: string
  /** Email au Dr uniquement si Houda lui écrit (pas l’inverse, pas le fil patiente). */
  email?: boolean
}) {
  const peerRole: UserRole = input.senderRole === 'medecin' ? 'gestionnaire' : 'medecin'
  const peers = await prisma.user.findMany({
    where: { role: peerRole },
    select: { id: true, role: true, email: true },
  })
  if (peers.length === 0) return
  const titre = input.senderRole === 'gestionnaire' ? 'Message de Houda' : 'Message du Dr Chennoufi'
  const message = `${input.patientName} (${input.dossierNumber}) : ${input.preview.slice(0, 120)}`
  const lienAction = peerRole === 'medecin' ? '/medecin/chat?channel=equipe' : '/gestionnaire/chat?channel=equipe'
  await Promise.all(
    peers.map((u) =>
      createUserNotification({
        userId: u.id,
        type: 'info',
        titre,
        message,
        lienAction,
        kind: 'chat',
      }).catch(() => undefined),
    ),
  )
  if (input.email && input.senderRole === 'gestionnaire') {
    await sendNotificationEmail({
      titre,
      message,
      lienAction,
      audience: 'medecin',
      extraTo: peers.map((p) => p.email),
      ctaLabel: 'Ouvrir le chat →',
    }).catch((err) => {
      console.warn('[chat] Email médecin (message Houda) non envoyé', err)
    })
  }
}

async function notifyPatientNewStaffMessage(input: {
  patientUserId: string
  patientEmail?: string | null
  patientFullName: string
  patientStatus?: string | null
  senderRole: UserRole
  preview: string
}) {
  const who = input.senderRole === 'medecin' ? 'Dr Chennoufi' : 'la gestionnaire'
  const titre = 'Nouveau message de l’équipe'
  const message = `${who} : ${input.preview.slice(0, 140)}`
  await createUserNotification({
    userId: input.patientUserId,
    type: 'info',
    titre,
    message,
    lienAction: '/patient/chat',
    kind: 'chat',
  })

  const email = input.patientEmail?.trim()
  if (email) {
    void sendPatientChatMessageEmail({
      to: email,
      patientFullName: input.patientFullName,
      aboutDecision: input.patientStatus === 'abstention',
    })
  } else {
    console.warn('[chat] Pas d’email patient — notification email message ignorée', {
      patientUserId: input.patientUserId,
    })
  }
}

export async function searchChatPatients(search?: string) {
  const q = search?.trim()
  const patients = await prisma.patient.findMany({
    where: q
      ? {
          OR: [
            { dossierNumber: { contains: q, mode: 'insensitive' } },
            { user: { fullName: { contains: q, mode: 'insensitive' } } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : undefined,
    take: q ? 50 : 40,
    orderBy: { updatedAt: 'desc' },
    include: {
      user: { select: { fullName: true, email: true } },
    },
  })

  if (patients.length === 0) return { patients: [] }

  const ids = patients.map((p) => p.id)
  const withMessages = await prisma.message.groupBy({
    by: ['patientId'],
    where: { patientId: { in: ids } },
    _count: { id: true },
  })
  const hasMsg = new Set(withMessages.map((r) => r.patientId))

  return {
    patients: patients.map((p) => ({
      id: p.id,
      dossierNumber: p.dossierNumber,
      fullName: p.user.fullName,
      email: p.user.email,
      hasConversation: hasMsg.has(p.id),
    })),
  }
}

export async function listConversations(
  role: UserRole,
  channel: 'patient' | 'equipe' = 'patient',
) {
  if (role === 'patient') {
    throw new AppError(403, 'FORBIDDEN', 'Réservé à l’équipe.')
  }

  // Canal équipe : une seule discussion Houda ↔ Dr (toutes les demandes dossiers)
  if (channel === 'equipe') {
    const last = await prisma.message.findFirst({
      where: { staffOnly: true, deletedForAll: false },
      orderBy: { dateEnvoi: 'desc' },
      select: {
        contenu: true,
        pieceJointeNom: true,
        dateEnvoi: true,
        expediteurRole: true,
        patient: {
          select: { dossierNumber: true, user: { select: { fullName: true } } },
        },
      },
    })

    if (!last) return { conversations: [] }

    const unreadCount = await prisma.message.count({
      where: {
        staffOnly: true,
        lu: false,
        deletedForAll: false,
        expediteurRole: role === 'medecin' ? 'gestionnaire' : 'medecin',
      },
    })

    const previewRaw =
      last.contenu?.trim() ||
      (last.pieceJointeNom ? `📎 ${last.pieceJointeNom}` : '')
    const patientHint = last.patient
      ? `${last.patient.user.fullName} · ${last.patient.dossierNumber}`
      : ''
    const preview = patientHint
      ? `${patientHint} — ${previewRaw}`.slice(0, 100)
      : previewRaw.slice(0, 100)

    const peerName = role === 'medecin' ? 'Houda' : 'Dr Chennoufi'

    return {
      conversations: [
        {
          patientId: EQUIPE_THREAD_ID,
          dossierNumber: 'Équipe',
          fullName: peerName,
          email: role === 'medecin' ? 'Gestionnaire' : 'Médecin',
          unreadCount,
          lastMessageAt: last.dateEnvoi.toISOString(),
          lastMessagePreview: preview,
          lastExpediteurRole: last.expediteurRole,
          channel: 'equipe' as const,
          unified: true,
        },
      ],
    }
  }

  /** Médecin : uniquement les dossiers où il a lui-même écrit (pas l’historique Houda). */
  const medecinPatientOnly = role === 'medecin'
  const medecinStarted = medecinPatientOnly ? await medecinStartedPatientThreads() : null
  if (medecinPatientOnly && medecinStarted && medecinStarted.size === 0) {
    return { conversations: [] }
  }

  const threadWhere = medecinPatientOnly
    ? {
        staffOnly: false,
        deletedForAll: false,
        expediteurRole: { in: ['patient', 'medecin'] as string[] },
        patientId: { in: [...medecinStarted!.keys()] },
      }
    : { staffOnly: false, deletedForAll: false }

  const grouped = await prisma.message.groupBy({
    by: ['patientId'],
    where: threadWhere,
    _count: { id: true },
    _max: { dateEnvoi: true },
  })

  if (grouped.length === 0) return { conversations: [] }

  const patientIds = grouped.map((g) => g.patientId)
  const [patients, unreadRows, latestMessages] = await Promise.all([
    prisma.patient.findMany({
      where: { id: { in: patientIds } },
      include: { user: { select: { fullName: true, email: true } } },
    }),
    prisma.message.groupBy({
      by: ['patientId'],
      where: {
        patientId: { in: patientIds },
        lu: false,
        deletedForAll: false,
        staffOnly: false,
        expediteurRole: 'patient',
        ...(medecinPatientOnly && medecinStarted
          ? {
              OR: [...medecinStarted.entries()].map(([id, at]) => ({
                patientId: id,
                dateEnvoi: { gte: at },
              })),
            }
          : {}),
      },
      _count: { id: true },
    }),
    Promise.all(
      patientIds.map((id) =>
        prisma.message.findFirst({
          where: {
            patientId: id,
            ...(medecinPatientOnly
              ? {
                  staffOnly: false,
                  deletedForAll: false,
                  expediteurRole: { in: ['patient', 'medecin'] },
                  ...(medecinStarted?.get(id)
                    ? { dateEnvoi: { gte: medecinStarted.get(id) } }
                    : {}),
                }
              : { staffOnly: false, deletedForAll: false }),
          },
          orderBy: { dateEnvoi: 'desc' },
          select: {
            patientId: true,
            contenu: true,
            expediteurRole: true,
            dateEnvoi: true,
            pieceJointeNom: true,
            staffOnly: true,
          },
        }),
      ),
    ),
  ])

  const patientMap = new Map(patients.map((p) => [p.id, p]))
  const unreadMap = new Map(unreadRows.map((r) => [r.patientId, r._count.id]))
  const lastByPatient = new Map(
    latestMessages.filter(Boolean).map((m) => [m!.patientId, m!] as const),
  )

  const conversations = grouped
    .map((g) => {
      const p = patientMap.get(g.patientId)
      if (!p) return null
      const last = lastByPatient.get(g.patientId)
      const preview = last
        ? last.contenu?.trim() || (last.pieceJointeNom ? `📎 ${last.pieceJointeNom}` : '')
        : 'Message supprimé'
      return {
        patientId: p.id,
        dossierNumber: p.dossierNumber,
        fullName: p.user.fullName,
        email: p.user.email,
        unreadCount: unreadMap.get(p.id) ?? 0,
        lastMessageAt: (last?.dateEnvoi ?? g._max?.dateEnvoi ?? new Date()).toISOString(),
        lastMessagePreview: preview.slice(0, 100),
        lastExpediteurRole: last?.expediteurRole ?? null,
        channel: 'patient' as const,
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())

  return { conversations }
}

export async function getMessages(
  userId: string,
  role: UserRole,
  patientIdQuery?: string,
  channel: 'patient' | 'equipe' | 'all' = 'all',
) {
  // Une seule discussion interne : tous les messages staffOnly (tous dossiers)
  if (
    role !== 'patient' &&
    channel === 'equipe' &&
    (!patientIdQuery || patientIdQuery === EQUIPE_THREAD_ID)
  ) {
    const messages = await prisma.message.findMany({
      where: {
        staffOnly: true,
        deletedForAll: false,
        hiddenBy: { none: { userId } },
      },
      orderBy: { dateEnvoi: 'asc' },
      include: {
        expediteur: { select: { fullName: true } },
        patient: {
          select: {
            dossierNumber: true,
            user: { select: { fullName: true } },
          },
        },
      },
    })

    return {
      patientId: EQUIPE_THREAD_ID,
      messages: messages.map(mapMessage),
    }
  }

  const patientId = await resolvePatientIdForUser(userId, role, patientIdQuery)

  // Filet : PDF d’un devis soft-supprimé → « Message supprimé »
  await syncHiddenDevisPdfsForPatient(patientId).catch(() => undefined)

  const staffFilter =
    role === 'patient'
      ? { staffOnly: false as const }
      : channel === 'equipe'
        ? { staffOnly: true as const }
        : channel === 'patient' && role === 'medecin'
          ? {
              staffOnly: false as const,
              expediteurRole: { in: ['patient', 'medecin'] },
            }
          : channel === 'patient'
            ? { staffOnly: false as const }
            : role === 'medecin'
              ? {
                  OR: [
                    { staffOnly: true },
                    { staffOnly: false, expediteurRole: { in: ['patient', 'medecin'] } },
                  ],
                }
              : {}

  let medecinVisibleFrom: Date | undefined
  if (role === 'medecin' && channel !== 'equipe') {
    const from = await firstMedecinPublicMessageAt(patientId)
    if (!from) {
      return { patientId, messages: [] }
    }
    medecinVisibleFrom = from
  }

  const messages = await prisma.message.findMany({
    where: {
      patientId,
      hiddenBy: { none: { userId } },
      ...staffFilter,
      ...(medecinVisibleFrom ? { dateEnvoi: { gte: medecinVisibleFrom } } : {}),
    },
    orderBy: { dateEnvoi: 'asc' },
    include: {
      expediteur: { select: { fullName: true } },
      patient: {
        select: {
          dossierNumber: true,
          user: { select: { fullName: true } },
        },
      },
    },
  })

  return {
    patientId,
    messages: messages.map(mapMessage),
  }
}

export async function sendMessage(
  userId: string,
  role: UserRole,
  input: SendMessageInput,
) {
  const patientId = await resolvePatientIdForUser(userId, role, input.patientId)

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')

  const staffOnly = Boolean(input.staffOnly) && role !== 'patient'
  if (input.staffOnly && role === 'patient') {
    throw new AppError(403, 'FORBIDDEN', 'Message interne réservé à l’équipe.')
  }

  const preview = input.contenu.trim() || (input.pieceJointeNom ? `📎 ${input.pieceJointeNom}` : 'Pièce jointe')

  const message = await prisma.message.create({
    data: {
      patientId,
      expediteurId: userId,
      expediteurRole: role,
      contenu: input.contenu.trim() || (input.pieceJointeNom ? `Pièce jointe : ${input.pieceJointeNom}` : 'Pièce jointe'),
      pieceJointeUrl: input.pieceJointeUrl ?? null,
      pieceJointeNom: input.pieceJointeNom ?? null,
      lu: false,
      staffOnly,
    },
    include: {
      expediteur: { select: { fullName: true } },
      patient: {
        select: {
          dossierNumber: true,
          user: { select: { fullName: true } },
        },
      },
    },
  })

  if (role === 'patient') {
    await prisma.message.updateMany({
      where: {
        patientId,
        expediteurRole: { in: ['medecin', 'gestionnaire'] },
        lu: false,
        deletedForAll: false,
        staffOnly: false,
      },
      data: { lu: true },
    })
    void notifyStaffNewPatientMessage({
      patientId,
      patientName: patient.user.fullName,
      dossierNumber: patient.dossierNumber,
      preview,
    })
  } else if (staffOnly) {
    await prisma.message.updateMany({
      where: {
        patientId,
        staffOnly: true,
        lu: false,
        deletedForAll: false,
        expediteurId: { not: userId },
      },
      data: { lu: true },
    })
    void notifyStaffPeerInternalMessage({
      senderRole: role,
      patientName: patient.user.fullName,
      dossierNumber: patient.dossierNumber,
      preview,
      email: role === 'gestionnaire',
    })
  } else {
    await prisma.message.updateMany({
      where: {
        patientId,
        expediteurRole: 'patient',
        lu: false,
        deletedForAll: false,
        staffOnly: false,
      },
      data: { lu: true },
    })
    void notifyPatientNewStaffMessage({
      patientUserId: patient.user.id,
      patientEmail: patient.user.email,
      patientFullName: patient.user.fullName,
      patientStatus: patient.status,
      senderRole: role,
      preview,
    })
  }

  const mapped = mapMessage(message)
  const lastStaff = role === 'patient' ? await lastPublicStaffRole(patientId) : null
  const staffRoles: UserRole[] = staffOnly
    ? ['medecin', 'gestionnaire']
    : role === 'patient'
      ? lastStaff === 'medecin'
        ? ['medecin', 'gestionnaire']
        : ['gestionnaire']
      : role === 'medecin'
        ? ['medecin', 'gestionnaire']
        : ['gestionnaire']

  void publishThreadEvent(
    patientId,
    {
      type: 'chat:message',
      patientId,
      messageId: mapped.id,
      senderId: userId,
    },
    { includePatient: !staffOnly, staffRoles },
  )
  publishChatToUsers(
    (
      await prisma.user.findMany({
        where: { role: { in: staffRoles } },
        select: { id: true },
      })
    ).map((u) => u.id),
    { type: 'chat:unread', patientId },
  )
  if (role !== 'patient' && !staffOnly) {
    publishChatToUser(patient.user.id, { type: 'chat:unread', patientId })
  }

  return { message: mapped }
}

export async function markMessagesRead(
  userId: string,
  role: UserRole,
  input: MarkReadInput,
) {
  const channel = input.channel ?? 'all'

  // Fil unifié Équipe : marquer toutes les demandes internes comme lues
  if (
    role !== 'patient' &&
    channel === 'equipe' &&
    (!input.patientId || input.patientId === EQUIPE_THREAD_ID)
  ) {
    await prisma.message.updateMany({
      where: {
        staffOnly: true,
        lu: false,
        deletedForAll: false,
        expediteurId: { not: userId },
      },
      data: { lu: true },
    })
    publishChatToStaff({ type: 'chat:unread', patientId: EQUIPE_THREAD_ID })
    return { ok: true as const }
  }

  const patientId = await resolvePatientIdForUser(userId, role, input.patientId)

  if (role === 'patient') {
    await prisma.message.updateMany({
      where: {
        patientId,
        expediteurRole: { in: ['medecin', 'gestionnaire'] },
        lu: false,
        deletedForAll: false,
        staffOnly: false,
      },
      data: { lu: true },
    })
  } else if (channel === 'equipe') {
    await prisma.message.updateMany({
      where: {
        patientId,
        lu: false,
        deletedForAll: false,
        staffOnly: true,
        expediteurId: { not: userId },
      },
      data: { lu: true },
    })
  } else if (channel === 'patient') {
    await prisma.message.updateMany({
      where: {
        patientId,
        lu: false,
        deletedForAll: false,
        staffOnly: false,
        expediteurRole: 'patient',
      },
      data: { lu: true },
    })
  } else {
    await prisma.message.updateMany({
      where: {
        patientId,
        lu: false,
        deletedForAll: false,
        OR: [
          { expediteurRole: 'patient', staffOnly: false },
          { staffOnly: true, expediteurId: { not: userId } },
        ],
      },
      data: { lu: true },
    })
  }

  void publishThreadEvent(patientId, { type: 'chat:unread', patientId })
  return { ok: true as const }
}

export async function getUnreadCount(userId: string, role: UserRole) {
  if (role === 'patient') {
    const patient = await prisma.patient.findUnique({
      where: { userId },
      select: { id: true },
    })
    if (!patient) return { unread: 0 }
    const unread = await prisma.message.count({
      where: {
        patientId: patient.id,
        lu: false,
        deletedForAll: false,
        staffOnly: false,
        expediteurRole: { in: ['medecin', 'gestionnaire'] },
        hiddenBy: { none: { userId } },
      },
    })
    return { unread }
  }

  // Médecin : uniquement ses fils patiente + demandes internes Houda
  // Gestionnaire : messages patiente + réponses internes médecin
  const peerRole = role === 'medecin' ? 'gestionnaire' : 'medecin'
  const medecinStarted = role === 'medecin' ? await medecinStartedPatientThreads() : null
  const medecinPatientUnreadWhere =
    role === 'medecin'
      ? medecinStarted && medecinStarted.size > 0
        ? {
            lu: false,
            deletedForAll: false,
            staffOnly: false,
            expediteurRole: 'patient' as const,
            OR: [...medecinStarted.entries()].map(([id, at]) => ({
              patientId: id,
              dateEnvoi: { gte: at },
            })),
          }
        : null
      : {
          lu: false,
          deletedForAll: false,
          staffOnly: false,
          expediteurRole: 'patient' as const,
        }

  const [patientUnread, equipeUnread, medecinInPatientUnread] = await Promise.all([
    medecinPatientUnreadWhere
      ? prisma.message.count({ where: medecinPatientUnreadWhere })
      : Promise.resolve(0),
    prisma.message.count({
      where: {
        lu: false,
        deletedForAll: false,
        staffOnly: true,
        expediteurRole: peerRole,
      },
    }),
    role === 'gestionnaire'
      ? prisma.message.count({
          where: {
            lu: false,
            deletedForAll: false,
            staffOnly: false,
            expediteurRole: 'medecin',
          },
        })
      : Promise.resolve(0),
  ])

  return {
    unread: patientUnread + equipeUnread,
    patientUnread,
    equipeUnread,
    /** Messages médecin non lus dans le canal patiente (filtre « Médecin »). */
    medecinUnread: medecinInPatientUnread,
  }
}

/**
 * Message interne équipe (ex. gestionnaire → médecin) dans le fil du dossier.
 * Invisible pour la patiente.
 */
export async function sendStaffOnlyMessage(
  actorId: string,
  patientId: string,
  contenu: string,
  expediteurRole: 'gestionnaire' | 'medecin' = 'gestionnaire',
  opts?: { dossierLink?: boolean },
) {
  const text = contenu.trim()
  if (!text) throw new AppError(400, 'EMPTY_MESSAGE', 'Le message ne peut pas être vide.')

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, dossierNumber: true, user: { select: { fullName: true } } },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')

  const dossierLink = opts?.dossierLink !== false

  const message = await prisma.message.create({
    data: {
      patientId,
      expediteurId: actorId,
      expediteurRole,
      contenu: text,
      lu: false,
      staffOnly: true,
      dossierLink,
    },
    include: {
      expediteur: { select: { fullName: true } },
      patient: {
        select: {
          dossierNumber: true,
          user: { select: { fullName: true } },
        },
      },
    },
  })

  await prisma.$executeRaw`UPDATE messages SET dossier_link = true WHERE id = ${message.id}`.catch(() => undefined)

  const mapped = { ...mapMessage(message), dossierLink }
  void publishThreadEvent(
    patientId,
    {
      type: 'chat:message',
      patientId,
      messageId: mapped.id,
      senderId: actorId,
    },
    { includePatient: false, staffRoles: ['medecin', 'gestionnaire'] },
  )
  publishChatToStaff({ type: 'chat:unread', patientId })
  void notifyStaffPeerInternalMessage({
    senderRole: expediteurRole,
    patientName: patient.user.fullName,
    dossierNumber: patient.dossierNumber,
    preview: text.slice(0, 120),
  })

  return { message: mapped, patient }
}

/** Supprimer pour tout le monde (tombstone visible). */
export async function deleteMessageForAll(userId: string, role: UserRole, messageId: string) {
  const message = await getAccessibleMessage(userId, role, messageId)
  if (message.deletedForAll) {
    return { message: mapMessage(message) }
  }

  const isStaff = role === 'medecin' || role === 'gestionnaire'
  const isSender = message.expediteurId === userId
  if (!isSender && !isStaff) {
    throw new AppError(403, 'FORBIDDEN', 'Seul l’expéditeur ou l’équipe peut supprimer pour tous.')
  }

  const preview = (message.contenu || message.pieceJointeNom || '').slice(0, 200)

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: {
      deletedForAll: true,
      deletedForAllAt: new Date(),
      contenu: '',
      pieceJointeUrl: null,
      pieceJointeNom: null,
      pinned: false,
      pinnedAt: null,
      pinnedById: null,
    },
    include: { expediteur: { select: { fullName: true } } },
  })

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      actorRole: role,
      action: 'delete',
      entity: 'message',
      entityId: messageId,
      before: {
        patientId: message.patientId,
        expediteurId: message.expediteurId,
        expediteurRole: message.expediteurRole,
        preview,
        pieceJointeNom: message.pieceJointeNom,
      } as never,
      after: { deletedForAll: true } as never,
    },
  }).catch(() => undefined)

  void publishThreadEvent(message.patientId, {
    type: 'chat:thread',
    patientId: message.patientId,
    messageId,
  })

  return { message: mapMessage(updated) }
}

/** Supprimer pour moi seulement. */
export async function deleteMessageForMe(userId: string, role: UserRole, messageId: string) {
  const message = await getAccessibleMessage(userId, role, messageId)

  await prisma.messageHidden.upsert({
    where: { messageId_userId: { messageId, userId } },
    create: { messageId, userId },
    update: {},
  })

  // Visible seulement pour l’utilisateur courant (pas besoin de broadcast global)
  publishChatToUser(userId, {
    type: 'chat:thread',
    patientId: message.patientId,
    messageId,
  })

  return { ok: true as const }
}

export async function setMessagePinned(
  userId: string,
  role: UserRole,
  messageId: string,
  pinned: boolean,
) {
  const message = await getAccessibleMessage(userId, role, messageId)
  if (message.deletedForAll) {
    throw new AppError(400, 'MESSAGE_DELETED', 'Impossible d’épingler un message supprimé.')
  }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: pinned
      ? { pinned: true, pinnedAt: new Date(), pinnedById: userId }
      : { pinned: false, pinnedAt: null, pinnedById: null },
    include: { expediteur: { select: { fullName: true } } },
  })

  void publishThreadEvent(message.patientId, {
    type: 'chat:thread',
    patientId: message.patientId,
    messageId,
  })

  return { message: mapMessage(updated) }
}

/**
 * Marquer comme non lu à partir de ce message (et les suivants du fil
 * provenant de l’autre partie). Empêche le re-marquage auto immédiat côté client.
 */
export async function markMessageUnread(userId: string, role: UserRole, messageId: string) {
  const message = await getAccessibleMessage(userId, role, messageId)
  if (message.deletedForAll) {
    throw new AppError(400, 'MESSAGE_DELETED', 'Message déjà supprimé.')
  }

  if (role === 'patient') {
    if (message.expediteurRole === 'patient') {
      throw new AppError(400, 'INVALID', 'Sélectionnez un message de l’équipe.')
    }
    await prisma.message.updateMany({
      where: {
        patientId: message.patientId,
        expediteurRole: { in: ['medecin', 'gestionnaire'] },
        deletedForAll: false,
        dateEnvoi: { gte: message.dateEnvoi },
        hiddenBy: { none: { userId } },
      },
      data: { lu: false },
    })
  } else {
    if (message.expediteurRole !== 'patient') {
      throw new AppError(400, 'INVALID', 'Sélectionnez un message de la patiente.')
    }
    await prisma.message.updateMany({
      where: {
        patientId: message.patientId,
        expediteurRole: 'patient',
        deletedForAll: false,
        dateEnvoi: { gte: message.dateEnvoi },
      },
      data: { lu: false },
    })
  }

  publishChatToUser(userId, {
    type: 'chat:unread',
    patientId: message.patientId,
  })
  void publishThreadEvent(message.patientId, {
    type: 'chat:thread',
    patientId: message.patientId,
    messageId,
  })

  return { ok: true as const, patientId: message.patientId }
}
