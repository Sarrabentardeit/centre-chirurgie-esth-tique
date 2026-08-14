import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/errorHandler.js'
import { sendPatientChatMessageEmail } from '../../lib/mailer.js'
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
) {
  const [patient, staff] = await Promise.all([
    prisma.patient.findUnique({ where: { id: patientId }, select: { userId: true } }),
    prisma.user.findMany({
      where: { role: { in: ['medecin', 'gestionnaire'] } },
      select: { id: true },
    }),
  ])
  const userIds = [
    ...(patient ? [patient.userId] : []),
    ...staff.map((s) => s.id),
  ]
  publishChatToUsers(userIds, event)
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
  expediteur?: { fullName: string } | null
}) {
  const deletedForAll = Boolean(m.deletedForAll)
  return {
    id: m.id,
    dossierPatientId: m.patientId,
    patientId: m.patientId,
    expediteurId: m.expediteurId,
    expediteurRole: m.expediteurRole as UserRole,
    expediteurNom: m.expediteur?.fullName ?? null,
    contenu: deletedForAll ? '' : m.contenu,
    pieceJointeUrl: deletedForAll ? null : (m.pieceJointeUrl ?? null),
    pieceJointeNom: deletedForAll ? null : (m.pieceJointeNom ?? null),
    dateEnvoi: m.dateEnvoi.toISOString(),
    lu: m.lu,
    deletedForAll,
    pinned: Boolean(m.pinned),
    pinnedAt: m.pinnedAt?.toISOString() ?? null,
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
  }

  const hidden = await prisma.messageHidden.findUnique({
    where: { messageId_userId: { messageId, userId } },
    select: { id: true },
  })
  if (hidden) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message introuvable.')

  return message
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

  await Promise.all([
    ...staff.map((u) =>
      createUserNotification({
        userId: u.id,
        type: 'info',
        titre,
        message,
        lienAction: u.role === 'medecin' ? '/medecin/chat' : '/gestionnaire/chat',
        kind: 'chat',
      }).catch(() => undefined)
    ),
  ])
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

export async function listConversations(role: UserRole) {
  if (role === 'patient') {
    throw new AppError(403, 'FORBIDDEN', 'Réservé à l’équipe.')
  }

  const grouped = await prisma.message.groupBy({
    by: ['patientId'],
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
        expediteurRole: 'patient',
        deletedForAll: false,
      },
      _count: { id: true },
    }),
    Promise.all(
      patientIds.map((id) =>
        prisma.message.findFirst({
          where: { patientId: id, deletedForAll: false },
          orderBy: { dateEnvoi: 'desc' },
          select: {
            patientId: true,
            contenu: true,
            expediteurRole: true,
            dateEnvoi: true,
            pieceJointeNom: true,
          },
        })
      )
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
        ? (last.contenu?.trim() || (last.pieceJointeNom ? `📎 ${last.pieceJointeNom}` : ''))
        : 'Message supprimé'
      return {
        patientId: p.id,
        dossierNumber: p.dossierNumber,
        fullName: p.user.fullName,
        email: p.user.email,
        unreadCount: unreadMap.get(p.id) ?? 0,
        lastMessageAt: (last?.dateEnvoi ?? g._max.dateEnvoi ?? new Date()).toISOString(),
        lastMessagePreview: preview.slice(0, 100),
        lastExpediteurRole: last?.expediteurRole ?? null,
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
) {
  const patientId = await resolvePatientIdForUser(userId, role, patientIdQuery)

  // Filet : PDF d’un devis soft-supprimé → « Message supprimé »
  await syncHiddenDevisPdfsForPatient(patientId).catch(() => undefined)

  const messages = await prisma.message.findMany({
    where: {
      patientId,
      hiddenBy: { none: { userId } },
    },
    orderBy: { dateEnvoi: 'asc' },
    include: { expediteur: { select: { fullName: true } } },
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
    },
    include: { expediteur: { select: { fullName: true } } },
  })

  if (role === 'patient') {
    await prisma.message.updateMany({
      where: {
        patientId,
        expediteurRole: { in: ['medecin', 'gestionnaire'] },
        lu: false,
        deletedForAll: false,
      },
      data: { lu: true },
    })
    void notifyStaffNewPatientMessage({
      patientId,
      patientName: patient.user.fullName,
      dossierNumber: patient.dossierNumber,
      preview,
    })
  } else {
    await prisma.message.updateMany({
      where: {
        patientId,
        expediteurRole: 'patient',
        lu: false,
        deletedForAll: false,
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
  void publishThreadEvent(patientId, {
    type: 'chat:message',
    patientId,
    messageId: mapped.id,
  })
  publishChatToStaff({ type: 'chat:unread', patientId })
  if (role !== 'patient') {
    publishChatToUser(patient.user.id, { type: 'chat:unread', patientId })
  }

  return { message: mapped }
}

export async function markMessagesRead(
  userId: string,
  role: UserRole,
  input: MarkReadInput,
) {
  const patientId = await resolvePatientIdForUser(userId, role, input.patientId)

  if (role === 'patient') {
    await prisma.message.updateMany({
      where: {
        patientId,
        expediteurRole: { in: ['medecin', 'gestionnaire'] },
        lu: false,
        deletedForAll: false,
      },
      data: { lu: true },
    })
  } else {
    await prisma.message.updateMany({
      where: {
        patientId,
        expediteurRole: 'patient',
        lu: false,
        deletedForAll: false,
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
        expediteurRole: { in: ['medecin', 'gestionnaire'] },
        hiddenBy: { none: { userId } },
      },
    })
    return { unread }
  }

  const unread = await prisma.message.count({
    where: {
      lu: false,
      deletedForAll: false,
      expediteurRole: 'patient',
    },
  })
  return { unread }
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
