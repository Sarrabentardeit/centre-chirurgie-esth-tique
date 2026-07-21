import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/errorHandler.js'
import { sendNotificationEmail } from '../../lib/mailer.js'
import type { UserRole } from '../auth/auth.types.js'
import type { MarkReadInput, SendMessageInput } from './chat.schema.js'

function mapMessage(m: {
  id: string
  patientId: string
  expediteurId: string
  expediteurRole: string
  contenu: string
  lu: boolean
  dateEnvoi: Date
  expediteur?: { fullName: string } | null
}) {
  return {
    id: m.id,
    dossierPatientId: m.patientId,
    patientId: m.patientId,
    expediteurId: m.expediteurId,
    expediteurRole: m.expediteurRole as UserRole,
    expediteurNom: m.expediteur?.fullName ?? null,
    contenu: m.contenu,
    dateEnvoi: m.dateEnvoi.toISOString(),
    lu: m.lu,
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
      prisma.notification.create({
        data: {
          userId: u.id,
          type: 'info',
          titre,
          message,
          lienAction: u.role === 'medecin' ? '/medecin/chat' : '/gestionnaire/chat',
        },
      }).catch(() => undefined)
    ),
    sendNotificationEmail({
      titre,
      message,
      lienAction: '/gestionnaire/chat',
    }),
  ])
}

async function notifyPatientNewStaffMessage(input: {
  patientUserId: string
  senderRole: UserRole
  preview: string
}) {
  const titre = 'Nouveau message de l’équipe'
  const message = input.preview.slice(0, 160)
  await prisma.notification.create({
    data: {
      userId: input.patientUserId,
      type: 'info',
      titre,
      message,
      lienAction: '/patient/chat',
    },
  })
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
      },
      _count: { id: true },
    }),
    Promise.all(
      patientIds.map((id) =>
        prisma.message.findFirst({
          where: { patientId: id },
          orderBy: { dateEnvoi: 'desc' },
          select: { patientId: true, contenu: true, expediteurRole: true, dateEnvoi: true },
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
      return {
        patientId: p.id,
        dossierNumber: p.dossierNumber,
        fullName: p.user.fullName,
        email: p.user.email,
        unreadCount: unreadMap.get(p.id) ?? 0,
        lastMessageAt: (g._max.dateEnvoi ?? new Date()).toISOString(),
        lastMessagePreview: last?.contenu?.slice(0, 100) ?? '',
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

  const messages = await prisma.message.findMany({
    where: { patientId },
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
    include: { user: { select: { id: true, fullName: true } } },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')

  const message = await prisma.message.create({
    data: {
      patientId,
      expediteurId: userId,
      expediteurRole: role,
      contenu: input.contenu.trim(),
      lu: false,
    },
    include: { expediteur: { select: { fullName: true } } },
  })

  // Marquer comme lus les messages de l’autre partie dans ce fil
  if (role === 'patient') {
    await prisma.message.updateMany({
      where: {
        patientId,
        expediteurRole: { in: ['medecin', 'gestionnaire'] },
        lu: false,
      },
      data: { lu: true },
    })
    void notifyStaffNewPatientMessage({
      patientId,
      patientName: patient.user.fullName,
      dossierNumber: patient.dossierNumber,
      preview: input.contenu.trim(),
    })
  } else {
    await prisma.message.updateMany({
      where: {
        patientId,
        expediteurRole: 'patient',
        lu: false,
      },
      data: { lu: true },
    })
    void notifyPatientNewStaffMessage({
      patientUserId: patient.user.id,
      senderRole: role,
      preview: input.contenu.trim(),
    })
  }

  return { message: mapMessage(message) }
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
      },
      data: { lu: true },
    })
  } else {
    await prisma.message.updateMany({
      where: {
        patientId,
        expediteurRole: 'patient',
        lu: false,
      },
      data: { lu: true },
    })
  }

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
        expediteurRole: { in: ['medecin', 'gestionnaire'] },
      },
    })
    return { unread }
  }

  const unread = await prisma.message.count({
    where: {
      lu: false,
      expediteurRole: 'patient',
    },
  })
  return { unread }
}
