import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/errorHandler.js'
import type {
  RapportInput,
  CreateAgendaEventInput,
  UpdateAgendaEventInput,
  UpdatePatientStatusInput,
  CreatePreDossierInput,
} from './medecin.schema.js'
import bcrypt from 'bcryptjs'

async function notifyGestionnaires(input: {
  titre: string
  message: string
  type?: 'info' | 'warning' | 'success' | 'error'
  lienAction?: string | null
}) {
  const gestionnaires = await prisma.user.findMany({
    where: { role: 'gestionnaire' },
    select: { id: true },
  })
  if (gestionnaires.length === 0) return

  for (const gestionnaire of gestionnaires) {
    const exists = await prisma.notification.findFirst({
      where: {
        userId: gestionnaire.id,
        titre: input.titre,
        message: input.message,
        lienAction: input.lienAction ?? null,
      },
      select: { id: true },
    })
    if (exists) continue

    await prisma.notification.create({
      data: {
        userId: gestionnaire.id,
        type: input.type ?? 'info',
        titre: input.titre,
        message: input.message,
        lienAction: input.lienAction ?? null,
      },
    })
  }
}

async function writeAuditLog(input: {
  actorId: string
  actorRole: 'medecin'
  action: 'create' | 'update' | 'delete' | 'status_change'
  entity: string
  entityId: string
  before?: unknown
  after?: unknown
}) {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      before: input.before as never,
      after: input.after as never,
    },
  })
}

async function syncPostOpReminders(userId: string, dateIntervention: Date) {
  const now = new Date()
  const daysSince = Math.floor((now.getTime() - new Date(dateIntervention).getTime()) / 86400000)
  const milestones = [7, 30, 90]

  for (const milestone of milestones) {
    if (daysSince < milestone) continue
    const titre = `Rappel post-op J+${milestone}`
    const message = `Il est temps de compléter votre suivi post-opératoire (J+${milestone}) et d'ajouter de nouvelles photos.`
    const exists = await prisma.notification.findFirst({
      where: { userId, titre, lienAction: '/patient/post-op' },
      select: { id: true },
    })
    if (!exists) {
      await prisma.notification.create({
        data: { userId, type: 'info', titre, message, lienAction: '/patient/post-op' },
      })
    }
  }
}

function generateDossierNumber(): string {
  const year = new Date().getFullYear()
  const suffix = Math.floor(100000 + Math.random() * 900000)
  return `DOS-${year}-${suffix}`
}

function buildPlaceholderEmail() {
  return `pre-${Date.now()}-${Math.floor(Math.random() * 10000)}@no-login.local`
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getDashboard(medecinId: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrowStart  = new Date(today.getTime() + 86400000)
  const weekEnd        = new Date(today.getTime() + 7 * 86400000)
  const monthStart = new Date(today.getFullYear(), today.getMonth() - 5, 1)

  const [
    totalPatients,
    aAnalyser,
    rdvAujourdhui,
    rdvCetteSemaine,
    derniersPatients,
    prochainRdvRaw,
    patientsForAnalytics,
  ] = await Promise.all([
    prisma.patient.count(),
    prisma.patient.count({ where: { status: 'formulaire_complete' } }),
    // Compter les AgendaEvent de type rdv pour aujourd'hui
    prisma.agendaEvent.count({
      where: {
        medecinId,
        type: 'rdv',
        dateDebut: { gte: today, lt: tomorrowStart },
      },
    }),
    // Compter les AgendaEvent de type rdv pour cette semaine
    prisma.agendaEvent.count({
      where: {
        medecinId,
        type: 'rdv',
        dateDebut: { gte: today, lt: weekEnd },
      },
    }),
    prisma.patient.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: { user: { select: { fullName: true, email: true } } },
    }),
    // Prochains RDV depuis AgendaEvent
    prisma.agendaEvent.findMany({
      where: {
        medecinId,
        type: 'rdv',
        dateDebut: { gte: today },
        statut: { not: 'annule' },
      },
      orderBy: { dateDebut: 'asc' },
      take: 4,
    }),
    prisma.patient.findMany({
      where: { createdAt: { gte: monthStart } },
      select: { createdAt: true, sourceContact: true },
    }),
  ])

  // Enrichir avec les infos patient
  const patientIds = prochainRdvRaw
    .map((e) => e.patientId)
    .filter((id): id is string => !!id)

  const patientsMap = patientIds.length > 0
    ? await prisma.patient.findMany({
        where: { id: { in: patientIds } },
        include: { user: { select: { fullName: true } } },
      })
    : []

  const pMap = new Map(patientsMap.map((p) => [p.id, p]))

  const prochainRdv = prochainRdvRaw.map((ev) => {
    const d     = new Date(ev.dateDebut)
    const heure = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    const pat   = ev.patientId ? pMap.get(ev.patientId) : undefined
    return {
      id:     ev.id,
      date:   ev.dateDebut.toISOString(),
      heure,
      type:   ev.motif ?? ev.title ?? 'RDV',
      motif:  ev.motif ?? null,
      statut: ev.statut ?? 'planifie',
      patient: pat
        ? { id: pat.id, dossierNumber: pat.dossierNumber, user: { fullName: pat.user.fullName } }
        : null,
    }
  })

  const months = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1)
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      mois: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
      patients: 0,
    }
  })
  const monthMap = new Map(months.map((m) => [m.key, m]))

  for (const p of patientsForAnalytics) {
    const d = new Date(p.createdAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const bucket = monthMap.get(key)
    if (bucket) bucket.patients += 1
  }

  const sourceRaw = new Map<string, number>()
  for (const p of patientsForAnalytics) {
    const src = (p.sourceContact ?? '').trim() || 'Autre'
    sourceRaw.set(src, (sourceRaw.get(src) ?? 0) + 1)
  }
  const totalSources = Array.from(sourceRaw.values()).reduce((a, b) => a + b, 0)
  const sourcesContact = Array.from(sourceRaw.entries())
    .map(([source, count]) => ({
      source,
      count: totalSources > 0 ? Math.round((count / totalSources) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  return {
    stats: { totalPatients, aAnalyser, rdvAujourdhui, rdvCetteSemaine },
    derniersPatients,
    prochainRdv,
    evolutionPatients: months,
    sourcesContact,
  }
}

export async function getDashboardAlertes(medecinId: string) {
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const blockedSince = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
  const noPhotoSince = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

  const [rdvNonConfirmes, rdvManques, postOpRows, dossiersBloques] = await Promise.all([
    prisma.agendaEvent.count({
      where: {
        medecinId,
        type: 'rdv',
        statut: 'planifie',
        dateDebut: { gte: now, lte: in24h },
      },
    }),
    prisma.agendaEvent.count({
      where: {
        medecinId,
        type: 'rdv',
        statut: { in: ['planifie', 'confirme'] },
        dateFin: { lt: now },
      },
    }),
    prisma.suiviPostOp.findMany({
      include: {
        patient: { include: { user: { select: { fullName: true } } } },
      },
    }),
    prisma.patient.count({
      where: {
        updatedAt: { lt: blockedSince },
        status: {
          in: ['formulaire_complete', 'en_analyse', 'rapport_genere', 'devis_preparation', 'devis_envoye', 'devis_accepte'],
        },
      },
    }),
  ])

  const postOpSansPhoto = postOpRows.filter((sp) => {
    const photos = (sp.photos as Array<{ date?: string }>) ?? []
    if (photos.length === 0) return true
    const latest = photos
      .map((p) => (p?.date ? new Date(p.date) : null))
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0]
    if (!latest) return true
    return latest < noPhotoSince
  }).length

  return {
    alertes: [
      {
        id: 'rdv_non_confirmes',
        severity: rdvNonConfirmes > 0 ? 'warning' : 'info',
        title: 'RDV non confirmés (24h)',
        count: rdvNonConfirmes,
      },
      {
        id: 'rdv_manques',
        severity: rdvManques > 0 ? 'error' : 'info',
        title: 'RDV passés non traités',
        count: rdvManques,
      },
      {
        id: 'postop_sans_photo',
        severity: postOpSansPhoto > 0 ? 'warning' : 'info',
        title: 'Patients post-op sans photo récente',
        count: postOpSansPhoto,
      },
      {
        id: 'dossiers_bloques',
        severity: dossiersBloques > 0 ? 'warning' : 'info',
        title: 'Dossiers bloqués (>10 jours)',
        count: dossiersBloques,
      },
    ],
  }
}

// ─── Patients ─────────────────────────────────────────────────────────────────

export async function getPatients(search?: string, status?: string) {
  const patients = await prisma.patient.findMany({
    where: {
      ...(status && status !== 'all' ? { status: status as never } : {}),
    },
    include: {
      user: { select: { fullName: true, email: true, createdAt: true } },
      formulaires: { orderBy: { createdAt: 'desc' }, take: 1 },
      devis: { orderBy: { dateCreation: 'desc' }, take: 1 },
    },
    orderBy: { updatedAt: 'desc' },
  })
  const query = search?.trim().toLowerCase()
  if (!query) return { patients }

  // Support recherche par date (YYYY-MM-DD ou DD/MM/YYYY)
  const normalizedDate = (() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(query)) return query
    const m = query.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/)
    if (m) return `${m[3]}-${m[2]}-${m[1]}`
    return null
  })()

  const filtered = patients.filter((p) => {
    const latestForm = p.formulaires?.[0]
    const payload = (latestForm?.payload ?? {}) as Record<string, unknown>
    const typeIntervention = Array.isArray(payload.typeIntervention)
      ? payload.typeIntervention.map((x) => String(x)).join(' ')
      : ''
    const description = typeof payload.descriptionDemande === 'string' ? payload.descriptionDemande : ''
    const attentes = typeof payload.attentes === 'string' ? payload.attentes : ''
    const dateSouhaitee = typeof payload.dateSouhaitee === 'string' ? payload.dateSouhaitee : ''

    const haystack = [
      p.user.fullName,
      p.user.email,
      p.dossierNumber,
      p.phone ?? '',
      p.ville ?? '',
      p.pays ?? '',
      p.nationalite ?? '',
      p.sourceContact ?? '',
      typeIntervention,
      description,
      attentes,
      dateSouhaitee,
      p.createdAt.toISOString().slice(0, 10),
      p.updatedAt.toISOString().slice(0, 10),
      latestForm?.submittedAt ? new Date(latestForm.submittedAt).toISOString().slice(0, 10) : '',
    ]
      .join(' ')
      .toLowerCase()

    if (haystack.includes(query)) return true
    if (normalizedDate && haystack.includes(normalizedDate)) return true
    return false
  })

  return { patients: filtered }
}

export async function createPreDossier(medecinId: string, input: CreatePreDossierInput) {
  const email = input.email?.trim().toLowerCase() || buildPlaceholderEmail()
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) throw new AppError(409, 'EMAIL_TAKEN', 'Un compte existe déjà avec cet email.')

  const passwordHash = await bcrypt.hash(`pre-dossier-${Date.now()}-${Math.random()}`, 12)

  let createdPatient:
    | null
    | {
        id: string
        dossierNumber: string
        user: { fullName: string; email: string }
      } = null

  for (let i = 0; i < 6; i += 1) {
    try {
      createdPatient = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            fullName: input.fullName.trim(),
            email,
            passwordHash,
            role: 'patient',
          },
        })
        return tx.patient.create({
          data: {
            userId: user.id,
            dossierNumber: generateDossierNumber(),
            phone: input.phone?.trim() || null,
            ville: input.ville?.trim() || null,
            pays: input.pays?.trim() || null,
            nationalite: input.nationalite?.trim() || null,
            sourceContact: input.sourceContact?.trim() || 'medecin',
            status: 'nouveau',
          },
          include: { user: { select: { fullName: true, email: true } } },
        })
      })
      break
    } catch (e: unknown) {
      const err = e as { code?: string }
      if (err?.code === 'P2002') continue
      throw e
    }
  }

  if (!createdPatient) throw new AppError(500, 'PRE_DOSSIER_FAILED', 'Impossible de créer le pré-dossier.')

  if (input.noteMedicale?.trim()) {
    await prisma.auditLog.create({
      data: {
        actorId: medecinId,
        actorRole: 'medecin',
        action: 'create',
        entity: 'pre_dossier_note',
        entityId: createdPatient.id,
        after: { noteMedicale: input.noteMedicale.trim() } as never,
      },
    })
  }

  await notifyGestionnaires({
    type: 'info',
    titre: 'Pré-dossier patient créé par le médecin',
    message: `${createdPatient.user.fullName} (${createdPatient.dossierNumber}) a été ajouté par le médecin. Activation compte patient à finaliser.`,
    lienAction: '/gestionnaire/patients',
  })

  return { patient: createdPatient }
}

export async function getPatientById(patientId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      user: { select: { fullName: true, email: true, createdAt: true } },
      formulaires: { orderBy: { createdAt: 'desc' }, take: 1 },
      devis: { orderBy: { dateCreation: 'desc' } },
      agendaEvents: {
        where: { type: 'rdv' },
        orderBy: { dateDebut: 'asc' },
      },
      rapports: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')
  return { patient }
}

export async function updatePatient(patientId: string, input: {
  fullName?: string
  email?: string
  phone?: string
  ville?: string
  pays?: string
  nationalite?: string
  sourceContact?: string
}) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { user: true },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')

  // Mise à jour User (fullName, email)
  if (input.fullName !== undefined || input.email !== undefined) {
    await prisma.user.update({
      where: { id: patient.userId },
      data: {
        ...(input.fullName !== undefined && { fullName: input.fullName }),
        ...(input.email    !== undefined && { email:    input.email }),
      },
    })
  }

  // Mise à jour Patient
  const updated = await prisma.patient.update({
    where: { id: patientId },
    data: {
      ...(input.phone         !== undefined && { phone:         input.phone }),
      ...(input.ville         !== undefined && { ville:         input.ville }),
      ...(input.pays          !== undefined && { pays:          input.pays }),
      ...(input.nationalite   !== undefined && { nationalite:   input.nationalite }),
      ...(input.sourceContact !== undefined && { sourceContact: input.sourceContact }),
    },
    include: { user: { select: { fullName: true, email: true, createdAt: true } } },
  })
  return { patient: updated }
}

export async function deletePatient(patientId: string) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')

  // Supprime en cascade (User → Patient grâce aux contraintes Prisma)
  await prisma.user.delete({ where: { id: patient.userId } })
  return { deleted: true }
}

export async function updatePatientStatus(patientId: string, input: UpdatePatientStatusInput) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')
  const updated = await prisma.patient.update({
    where: { id: patientId },
    data: { status: input.status },
  })
  return { patient: updated }
}

// ─── Rapport médical ──────────────────────────────────────────────────────────

export async function upsertRapport(medecinId: string, patientId: string, input: RapportInput) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')

  const existing = await prisma.rapport.findFirst({
    where: { patientId, medecinId },
    orderBy: { createdAt: 'desc' },
  })

  const data = {
    diagnostic:               input.diagnostic,
    interventionsRecommandees: input.interventionsRecommandees ?? [],
    valeurMedicale:           input.valeurMedicale,
    forfaitPropose:           input.forfaitPropose,
    notes:                    input.notes,
  }

  let rapport
  if (existing) {
    rapport = await prisma.rapport.update({ where: { id: existing.id }, data })
    await writeAuditLog({
      actorId: medecinId,
      actorRole: 'medecin',
      action: 'update',
      entity: 'rapport',
      entityId: rapport.id,
      before: existing,
      after: rapport,
    })
  } else {
    rapport = await prisma.rapport.create({ data: { ...data, patientId, medecinId } })
    await writeAuditLog({
      actorId: medecinId,
      actorRole: 'medecin',
      action: 'create',
      entity: 'rapport',
      entityId: rapport.id,
      after: rapport,
    })
  }

  await prisma.rapportVersion.create({
    data: {
      rapportId: rapport.id,
      patientId,
      medecinId,
      snapshot: {
        diagnostic: rapport.diagnostic,
        interventionsRecommandees: rapport.interventionsRecommandees,
        valeurMedicale: rapport.valeurMedicale,
        forfaitPropose: rapport.forfaitPropose,
        notes: rapport.notes,
        updatedAt: rapport.updatedAt,
      } as never,
    },
  })

  // Mettre à jour le statut dossier si encore en analyse
  if (['formulaire_complete', 'en_analyse'].includes(patient.status)) {
    await prisma.patient.update({
      where: { id: patientId },
      data: { status: 'rapport_genere' },
    })
  }

  const p = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { dossierNumber: true, user: { select: { fullName: true } } },
  })
  if (p) {
    await notifyGestionnaires({
      type: 'info',
      titre: existing ? 'Rapport médical mis à jour' : 'Rapport médical généré',
      message: `Le rapport médical de ${p.user.fullName} (${p.dossierNumber}) est ${existing ? 'mis à jour' : 'prêt'}. Devis à préparer.`,
      lienAction: `/gestionnaire/devis/${patientId}`,
    })
  }

  return { rapport }
}

// ─── Agenda ───────────────────────────────────────────────────────────────────

export async function getAgenda(medecinId: string, from?: string, to?: string) {
  const events = await prisma.agendaEvent.findMany({
    where: {
      medecinId,
      ...(from || to
        ? {
            dateDebut: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    orderBy: { dateDebut: 'asc' },
    include: {
      medecin: { select: { fullName: true } },
      patient: { include: { user: { select: { fullName: true } } } },
    },
  })

  // Les rdvs sont maintenant dans AgendaEvent (type='rdv') — compatibilité frontend
  const rdvs = events
    .filter((e) => e.type === 'rdv')
    .map((e) => ({
      id:     e.id,
      // L'agenda frontend attend YYYY-MM-DD (pas un datetime ISO complet)
      date:   e.dateDebut.toISOString().slice(0, 10),
      heure:  `${e.dateDebut.getHours().toString().padStart(2, '0')}:${e.dateDebut.getMinutes().toString().padStart(2, '0')}`,
      type:   e.title ?? 'RDV',
      motif:  e.motif ?? null,
      statut: e.statut ?? 'planifie',
      patient: e.patient
        ? { id: e.patient.id, dossierNumber: e.patient.dossierNumber, user: { fullName: e.patient.user.fullName } }
        : null,
    }))

  return { events, rdvs }
}

export async function createAgendaEvent(medecinId: string, input: CreateAgendaEventInput) {
  const event = await prisma.agendaEvent.create({
    data: {
      medecinId,
      type: input.type,
      title: input.title,
      motif: input.motif,
      dateDebut: new Date(input.dateDebut),
      dateFin: new Date(input.dateFin),
      allDay: input.allDay ?? false,
      patientId: input.patientId,
      statut: input.statut ?? 'planifie',
      notes: input.notes,
    },
  })
  await writeAuditLog({
    actorId: medecinId,
    actorRole: 'medecin',
    action: 'create',
    entity: 'agenda_event',
    entityId: event.id,
    after: event,
  })
  return { event }
}

export async function updateAgendaEvent(
  medecinId: string,
  eventId: string,
  input: UpdateAgendaEventInput,
) {
  const existing = await prisma.agendaEvent.findFirst({ where: { id: eventId, medecinId } })
  if (!existing) throw new AppError(404, 'EVENT_NOT_FOUND', 'Événement introuvable.')

  const event = await prisma.agendaEvent.update({
    where: { id: eventId },
    data: {
      ...(input.type      !== undefined && { type: input.type }),
      ...(input.title     !== undefined && { title: input.title }),
      ...(input.motif     !== undefined && { motif: input.motif }),
      ...(input.dateDebut !== undefined && { dateDebut: new Date(input.dateDebut) }),
      ...(input.dateFin   !== undefined && { dateFin: new Date(input.dateFin) }),
      ...(input.allDay    !== undefined && { allDay: input.allDay }),
      ...(input.statut    !== undefined && { statut: input.statut }),
      ...(input.notes     !== undefined && { notes: input.notes }),
    },
  })
  await writeAuditLog({
    actorId: medecinId,
    actorRole: 'medecin',
    action: 'update',
    entity: 'agenda_event',
    entityId: event.id,
    before: existing,
    after: event,
  })
  return { event }
}

export async function deleteAgendaEvent(medecinId: string, eventId: string) {
  const existing = await prisma.agendaEvent.findFirst({ where: { id: eventId, medecinId } })
  if (!existing) throw new AppError(404, 'EVENT_NOT_FOUND', 'Événement introuvable.')
  await prisma.agendaEvent.delete({ where: { id: eventId } })
  await writeAuditLog({
    actorId: medecinId,
    actorRole: 'medecin',
    action: 'delete',
    entity: 'agenda_event',
    entityId: eventId,
    before: existing,
  })
  return { deleted: true }
}

// ─── Suivi Post-Op ────────────────────────────────────────────────────────────

export async function getPostOpPatients() {
  const patients = await prisma.patient.findMany({
    where: { status: { in: ['intervention', 'post_op', 'suivi_termine'] } },
    include: {
      user: { select: { fullName: true, email: true, createdAt: true } },
      suiviPostOp: true,
    },
    orderBy: { updatedAt: 'desc' },
  })
  await Promise.all(
    patients
      .filter((p) => !!p.suiviPostOp)
      .map((p) => syncPostOpReminders(p.userId, p.suiviPostOp!.dateIntervention))
  )
  return { patients }
}

export async function getPostOp(patientId: string) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')
  const suivi = await prisma.suiviPostOp.findUnique({ where: { patientId } })
  if (suivi) await syncPostOpReminders(patient.userId, suivi.dateIntervention)
  return { suivi }
}

export async function upsertPostOp(
  patientId: string,
  input: { dateIntervention: string; compteRendu?: string },
) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')

  const existing = await prisma.suiviPostOp.findUnique({ where: { patientId } })

  let suivi
  if (existing) {
    suivi = await prisma.suiviPostOp.update({
      where: { patientId },
      data: {
        dateIntervention: new Date(input.dateIntervention),
        ...(input.compteRendu !== undefined && { compteRendu: input.compteRendu }),
      },
    })
  } else {
    suivi = await prisma.suiviPostOp.create({
      data: {
        patientId,
        dateIntervention: new Date(input.dateIntervention),
        compteRendu: input.compteRendu,
        photos: [],
      },
    })
    // Passer le patient en status post_op si besoin
    if (!['post_op', 'suivi_termine'].includes(patient.status)) {
      await prisma.patient.update({
        where: { id: patientId },
        data: { status: 'post_op' },
      })
    }
  }
  return { suivi }
}

export async function addPostOpPhoto(
  patientId: string,
  photo: { url: string; note?: string },
) {
  const suivi = await prisma.suiviPostOp.findUnique({ where: { patientId } })
  if (!suivi) throw new AppError(404, 'SUIVI_NOT_FOUND', 'Suivi post-opératoire introuvable.')

  type Photo = { url: string; note?: string; date: string }
  const photos = (suivi.photos as Photo[]) ?? []
  photos.push({ url: photo.url, note: photo.note, date: new Date().toISOString() })

  const updated = await prisma.suiviPostOp.update({
    where: { patientId },
    data: { photos },
  })
  return { suivi: updated }
}

// ─── RDV patient ──────────────────────────────────────────────────────────────

export async function createRendezVous(
  medecinId: string,
  patientId: string,
  data: { date: string; heure: string; type: string; motif?: string; notes?: string },
) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')

  // Construire les datetimes depuis date + heure (format HH:MM)
  const dateDebut = new Date(`${data.date}T${data.heure}:00`)
  const dateFin   = new Date(dateDebut.getTime() + 60 * 60 * 1000) // +1h par défaut

  const rdv = await prisma.agendaEvent.create({
    data: {
      medecinId,
      patientId,
      type: 'rdv',
      title: data.type,
      motif: data.motif,
      notes: data.notes,
      dateDebut,
      dateFin,
      allDay: false,
      statut: 'planifie',
    },
  })

  await prisma.patient.update({
    where: { id: patientId },
    data: { status: 'date_reservee' },
  })

  // Retourner dans le format attendu côté frontend
  return {
    rdv: {
      id:     rdv.id,
      date:   rdv.dateDebut.toISOString(),
      heure:  data.heure,
      type:   data.type,
      motif:  rdv.motif ?? null,
      notes:  rdv.notes ?? null,
      statut: rdv.statut ?? 'planifie',
    },
  }
}

