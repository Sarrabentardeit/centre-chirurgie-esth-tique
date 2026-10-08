import { prisma } from './prisma.js'
import { formatAgendaSlot } from './agendaTime.js'
import { notifyStaff } from './staffNotifications.js'
import { logger } from './logger.js'

const DAY_MS = 24 * 60 * 60 * 1000

function calendarDaysUntil(arrival: Date, now = new Date()): number {
  const today = formatAgendaSlot(now).date
  const target = formatAgendaSlot(arrival).date
  const a = Date.parse(`${today}T12:00:00Z`)
  const b = Date.parse(`${target}T12:00:00Z`)
  return Math.round((b - a) / DAY_MS)
}

function formatArrivalFr(arrival: Date): string {
  return arrival.toLocaleDateString('fr-FR', {
    timeZone: 'Africa/Tunis',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function whenLabel(daysUntil: number): string {
  if (daysUntil <= 0) return 'aujourd’hui'
  if (daysUntil === 1) return 'demain'
  return `dans ${daysUntil} jours`
}

/**
 * Une fois, entre J-7 et le jour de l’arrivée : email + notification
 * à la gestionnaire pour envoyer le planning, si ce n’est pas déjà fait.
 */
export async function processPlanningJ7Rappels(): Promise<{ checked: number; sent: number }> {
  const now = new Date()
  const rows = await prisma.logistique.findMany({
    where: {
      dateArrivee: {
        not: null,
        gte: new Date(now.getTime() - 2 * DAY_MS),
        lte: new Date(now.getTime() + 8 * DAY_MS),
      },
      rappelPlanningJ7At: null,
    },
    take: 40,
    orderBy: { dateArrivee: 'asc' },
  })

  if (rows.length === 0) return { checked: 0, sent: 0 }

  const due = rows.filter((row) => {
    if (!row.dateArrivee) return false
    const days = calendarDaysUntil(row.dateArrivee, now)
    return days >= 0 && days <= 7
  })
  if (due.length === 0) return { checked: rows.length, sent: 0 }

  const patients = await prisma.patient.findMany({
    where: {
      id: { in: due.map((r) => r.patientId) },
      status: { not: 'abstention' },
    },
    include: { user: { select: { fullName: true } } },
  })
  const byId = new Map(patients.map((p) => [p.id, p]))

  let sent = 0
  for (const row of due) {
    const patient = byId.get(row.patientId)
    if (!patient || !row.dateArrivee) {
      await prisma.logistique.updateMany({
        where: { id: row.id, rappelPlanningJ7At: null },
        data: { rappelPlanningJ7At: now },
      })
      continue
    }

    const alreadySent = await prisma.message.findFirst({
      where: {
        patientId: row.patientId,
        expediteurRole: 'gestionnaire',
        pieceJointeNom: { contains: 'Planning séjour' },
      },
      select: { id: true },
    })

    const claimed = await prisma.logistique.updateMany({
      where: { id: row.id, rappelPlanningJ7At: null },
      data: { rappelPlanningJ7At: new Date() },
    })
    if (claimed.count === 0) continue
    if (alreadySent) continue

    const daysUntil = calendarDaysUntil(row.dateArrivee, now)
    const fullName = patient.user.fullName
    const dateFr = formatArrivalFr(row.dateArrivee)
    const titre = `Planning à envoyer — ${fullName}`
    const message = [
      `L’arrivée de ${fullName} (dossier ${patient.dossierNumber}) est prévue le ${dateFr} (${whenLabel(daysUntil)}).`,
      '',
      'Merci d’envoyer son planning de séjour.',
    ].join('\n')

    try {
      await notifyStaff({
        role: 'gestionnaire',
        titre,
        message,
        type: 'warning',
        lienAction: `/gestionnaire/devis/${patient.id}`,
      })
      sent += 1
    } catch (err) {
      logger.warn({ err, patientId: patient.id }, '[planning-j7] envoi échoué')
      await prisma.logistique.update({
        where: { id: row.id },
        data: { rappelPlanningJ7At: null },
      })
    }
  }

  return { checked: due.length, sent }
}
