import type { PrismaClient } from '@prisma/client'
import { formatAgendaSlot } from './agendaTime.js'

export type DashboardInterventionItem = {
  patientId: string
  dossierNumber: string
  fullName: string
  status: string
  dateIntervention: string
  intervention: string | null
}

/** Interventions planifiées via logistique.dateIntervention — à venir vs déjà faites (fuseau Tunisie). */
export async function getDashboardInterventions(
  prisma: PrismaClient,
  limit = 8,
): Promise<{ aProgrammer: DashboardInterventionItem[]; realisees: DashboardInterventionItem[] }> {
  const logs = await prisma.logistique.findMany({
    where: { dateIntervention: { not: null } },
    select: { patientId: true, dateIntervention: true },
  })
  if (logs.length === 0) return { aProgrammer: [], realisees: [] }

  const patientIds = [...new Set(logs.map((l) => l.patientId))]
  const patients = await prisma.patient.findMany({
    where: { id: { in: patientIds }, status: { not: 'abstention' } },
    select: {
      id: true,
      dossierNumber: true,
      status: true,
      user: { select: { fullName: true } },
      rapports: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { interventionsRecommandees: true },
      },
    },
  })
  const pMap = new Map(patients.map((p) => [p.id, p]))
  const todayStr = formatAgendaSlot(new Date()).date

  const aProgrammer: DashboardInterventionItem[] = []
  const realisees: DashboardInterventionItem[] = []

  for (const log of logs) {
    if (!log.dateIntervention) continue
    const patient = pMap.get(log.patientId)
    if (!patient) continue
    const day = formatAgendaSlot(log.dateIntervention).date
    const interventions = patient.rapports[0]?.interventionsRecommandees ?? []
    const item: DashboardInterventionItem = {
      patientId: patient.id,
      dossierNumber: patient.dossierNumber,
      fullName: patient.user.fullName,
      status: patient.status,
      dateIntervention: log.dateIntervention.toISOString(),
      intervention: interventions[0]?.trim() || null,
    }
    if (day >= todayStr) aProgrammer.push(item)
    else realisees.push(item)
  }

  aProgrammer.sort(
    (a, b) => new Date(a.dateIntervention).getTime() - new Date(b.dateIntervention).getTime(),
  )
  realisees.sort(
    (a, b) => new Date(b.dateIntervention).getTime() - new Date(a.dateIntervention).getTime(),
  )

  return {
    aProgrammer: aProgrammer.slice(0, limit),
    realisees: realisees.slice(0, limit),
  }
}
