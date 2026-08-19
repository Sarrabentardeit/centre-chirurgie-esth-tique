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
import * as googleCalendar from '../google-calendar/google-calendar.service.js'
import {
  generateNextMcReference,
  resolvePatientReference,
  syncPatientDossierFromDevis,
} from '../../lib/devisNumber.js'
import { notifyStaff } from '../../lib/staffNotifications.js'
import { createUserNotification } from '../../lib/userNotifications.js'
import { buildPatientStatusWhere, countDossierBuckets } from '../../lib/dossierFilters.js'
import { sendStaffOnlyMessage } from '../chat/chat.service.js'

function notifyGestionnaires(input: {
  titre: string
  message: string
  type?: 'info' | 'warning' | 'success' | 'error'
  lienAction?: string | null
  /** true uniquement pour « Rapport médical généré » */
  email?: boolean
}) {
  return notifyStaff({ ...input, role: 'gestionnaire', email: input.email === true })
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
      await createUserNotification({
        userId,
        type: 'info',
        titre,
        message,
        lienAction: '/patient/post-op',
        kind: 'system',
      })
    }
  }
}

function mapPatientListRow<T extends {
  dossierNumber: string
  devis?: Array<{ numeroDevis?: string | null }>
  rapports?: unknown[]
  _count?: { rapports?: number }
}>(patient: T): T & { rapportsCount: number } {
  const numeroDevis = patient.devis?.[0]?.numeroDevis
  const rapportsCount = patient._count?.rapports ?? patient.rapports?.length ?? 0
  return {
    ...patient,
    dossierNumber: resolvePatientReference(patient.dossierNumber, numeroDevis),
    devis: patient.devis?.map((d) => ({
      ...d,
      numeroDevis: d.numeroDevis ?? undefined,
    })),
    rapportsCount,
  }
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
    prisma.patient.count({ where: { status: { not: 'abstention' } } }),
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
      where: { status: { not: 'abstention' } },
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
      select: {
        createdAt: true,
        sourceContact: true,
        formulaires: {
          where: { status: 'submitted' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { payload: true },
        },
      },
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

  const sourceLabel = (raw: string): string => {
    const k = raw
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    const map: Record<string, string> = {
      facebook: 'Facebook',
      instagram: 'Instagram',
      radio: 'Radio',
      tv: 'TV',
      amie: 'Amie / ami / entourage',
      'amie / ami / entourage': 'Amie / ami / entourage',
      autre: 'Autre',
      whatsapp: 'WhatsApp',
      google: 'Google',
      direct: 'Site web / direct',
      'site web': 'Site web / direct',
      'site web / direct': 'Site web / direct',
      medecin: 'Médecin adressant',
      'medecin adressant': 'Médecin adressant',
    }
    return map[k] ?? (raw.trim() || 'Autre')
  }

  const sourceRaw = new Map<string, number>()
  for (const p of patientsForAnalytics) {
    const latestPayload = p.formulaires?.[0]?.payload as Record<string, unknown> | undefined
    const sourceFromFormulaire = typeof latestPayload?.sourceContact === 'string'
      ? latestPayload.sourceContact
      : ''
    const sourceFinal = sourceFromFormulaire.trim() || (p.sourceContact ?? '').trim() || 'autre'
    const label = sourceLabel(sourceFinal)
    sourceRaw.set(label, (sourceRaw.get(label) ?? 0) + 1)
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
          in: ['formulaire_complete', 'en_analyse', 'rapport_genere', 'rapport_modifie', 'devis_preparation', 'devis_envoye', 'devis_accepte'],
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
  const statusWhere = buildPatientStatusWhere(status, 'medecin')
  const [patients, counts] = await Promise.all([
    prisma.patient.findMany({
      where: statusWhere,
      include: {
        user: { select: { fullName: true, email: true, createdAt: true } },
        formulaires: { orderBy: { createdAt: 'desc' }, take: 1 },
        devis: { where: { deletedAt: null }, orderBy: { dateCreation: 'desc' }, take: 1 },
        rapports: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { rapports: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    countDossierBuckets('medecin'),
  ])
  await Promise.all(
    patients
      .filter((p) => p.devis?.[0]?.numeroDevis)
      .map((p) => syncPatientDossierFromDevis(prisma, p.id, p.devis![0].numeroDevis!)),
  )

  const query = search?.trim().toLowerCase()
  if (!query) return { patients: patients.map(mapPatientListRow), counts }

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

    const ref = resolvePatientReference(p.dossierNumber, p.devis?.[0]?.numeroDevis)
    const haystack = [
      p.user.fullName,
      p.user.email,
      p.dossierNumber,
      ref,
      p.devis?.[0]?.numeroDevis ?? '',
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

  return { patients: filtered.map(mapPatientListRow), counts }
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
      const dossierNumber = await generateNextMcReference(prisma)
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
            dossierNumber,
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
  let patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      user: { select: { fullName: true, email: true, createdAt: true } },
      formulaires: { orderBy: { createdAt: 'desc' }, take: 1 },
      devis: { where: { deletedAt: null }, orderBy: { dateCreation: 'desc' } },
      agendaEvents: {
        where: { type: 'rdv' },
        orderBy: { dateDebut: 'asc' },
      },
      rapports: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')
  const numeroDevis = patient.devis[0]?.numeroDevis
  if (numeroDevis) {
    await syncPatientDossierFromDevis(prisma, patientId, numeroDevis)
  }
  // Passage automatique en "En analyse médicale" quand le médecin consulte un dossier formulaire complété
  if (patient.status === 'formulaire_complete') {
    await prisma.patient.update({
      where: { id: patientId },
      data: { status: 'en_analyse' },
    })
    patient = { ...patient, status: 'en_analyse' as typeof patient.status }
  }
  return {
    patient: mapPatientListRow({
      ...patient,
      dossierNumber: resolvePatientReference(patient.dossierNumber, numeroDevis),
    }),
  }
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

export async function updatePatientStatus(
  actorId: string,
  patientId: string,
  input: UpdatePatientStatusInput,
) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { user: { select: { fullName: true } } },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')

  const goingToAbstention = input.status === 'abstention' && patient.status !== 'abstention'
  const leavingAbstention = patient.status === 'abstention' && input.status !== 'abstention'

  const updated = await prisma.patient.update({
    where: { id: patientId },
    data: {
      status: input.status,
      ...(goingToAbstention
        ? { statusBeforeAbstention: patient.status }
        : leavingAbstention
          ? { statusBeforeAbstention: null }
          : {}),
    },
  })

  await writeAuditLog({
    actorId,
    actorRole: 'medecin',
    action: 'status_change',
    entity: 'patient',
    entityId: patientId,
    before: { status: patient.status },
    after: { status: updated.status },
  }).catch(() => undefined)

  if (goingToAbstention) {
    const fullName = patient.user.fullName
    const dossier = patient.dossierNumber
    const chatMessage =
      `Dossier classé en abstention.\n\n` +
      `Patiente : ${fullName} (${dossier}).\n\n` +
      `Merci de traiter cette décision : ouvrir le dossier et envoyer le message à la patiente si besoin. Les anciens rapports et devis restent en historique.`
    const lienDossier = `/gestionnaire/devis/${patientId}`

    await sendStaffOnlyMessage(actorId, patientId, chatMessage, 'medecin', { dossierLink: true }).catch((err) => {
      console.warn('[updatePatientStatus] Message interne abstention non envoyé', err)
    })

    await notifyGestionnaires({
      type: 'warning',
      titre: 'Dossier classé en abstention',
      message:
        `Le Dr Chennoufi a classé le dossier de ${fullName} (${dossier}) en abstention.\n\n` +
        `Ouvrez le dossier pour envoyer le message à la patiente.`,
      lienAction: lienDossier,
      email: true,
    }).catch((err) => {
      console.warn('[updatePatientStatus] Notification / email abstention gestionnaire non envoyés', err)
    })
  }

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
    examensDemandes:          input.examensDemandes ?? [],
    interventionsRecommandees: input.interventionsRecommandees ?? [],
    valeurMedicale:           input.valeurMedicale,
    forfaitPropose:           Math.round(Number(input.forfaitPropose.toFixed(2))),
    nuitsPreoperatoires:      input.nuitsPreoperatoires as never,
    nuitsClinique:            input.nuitsClinique,
    nuitsHotel:               input.nuitsHotel,
    vetementContention:       input.vetementContention,
    anesthesieGenerale:       input.anesthesieGenerale,
    drainage:                 input.drainage ?? null,
    nbSeancesDrainage:        input.drainage ? (input.nbSeancesDrainage ?? null) : null,
    dureeSejourTunisie:       input.dureeSejourTunisie,
    nbAdultesSejour:          input.nbAdultesSejour,
    nbEnfantsSejour:          input.nbEnfantsSejour,
    notes:                    input.notes,
  }

  /** Nouveau rapport = toujours créer une ligne ; ne pas écraser l’historique. */
  const forceNouveau = input.nouveauRapport === true
  const createNew = forceNouveau || !existing

  let rapport
  if (!createNew && existing) {
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
        nuitsPreoperatoires: (rapport as never as Record<string, unknown>)['nuitsPreoperatoires'],
        nuitsClinique: rapport.nuitsClinique,
        anesthesieGenerale: rapport.anesthesieGenerale,
        drainage: rapport.drainage,
        nbSeancesDrainage: rapport.nbSeancesDrainage,
        dureeSejourTunisie: rapport.dureeSejourTunisie,
        nbAdultesSejour: rapport.nbAdultesSejour,
        nbEnfantsSejour: rapport.nbEnfantsSejour,
        notes: rapport.notes,
        updatedAt: rapport.updatedAt,
      } as never,
    },
  })

  // 1ère génération → rapport_genere
  // Nouveau rapport (R2+) → rapport_genere (Houda doit créer un nouveau devis ; v1 intacte)
  // Correction du 1er rapport → rapport_modifie
  const PRE_RAPPORT_STATUSES = ['nouveau', 'formulaire_en_cours', 'formulaire_complete', 'en_analyse']
  const DEVIS_FLOW_STATUSES = [
    'rapport_genere',
    'rapport_modifie',
    'devis_preparation',
    'devis_envoye',
    'devis_accepte',
  ]
  const isAdditionalRapport = createNew && !!existing
  const rapportsCount = await prisma.rapport.count({ where: { patientId } })
  const needsNouveauDevis =
    isAdditionalRapport
    || (rapportsCount > 1 && ['devis_preparation', 'devis_envoye', 'devis_accepte'].includes(patient.status))

  if (PRE_RAPPORT_STATUSES.includes(patient.status) || needsNouveauDevis) {
    await prisma.patient.update({
      where: { id: patientId },
      data: { status: 'rapport_genere' },
    })
  } else if (!createNew && existing && DEVIS_FLOW_STATUSES.includes(patient.status)) {
    // Un 2e rapport déjà signalé : rester sur rapport_genere (liste « Non traités »).
    if (patient.status !== 'rapport_genere') {
      await prisma.patient.update({
        where: { id: patientId },
        data: { status: 'rapport_modifie' },
      })
      await syncBrouillonDevisFromRapport(patientId, rapport)
    }
  }

  const p = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { dossierNumber: true, user: { select: { fullName: true } } },
  })
  if (p) {
    const announceNouveau = isAdditionalRapport || needsNouveauDevis
    const titre = announceNouveau
      ? rapportsCount === 2
        ? '2e rapport médical généré'
        : 'Nouveau rapport médical généré'
      : createNew
        ? 'Rapport médical généré'
        : 'Rapport médical modifié'
    const message = announceNouveau
        ? `Un nouveau rapport (R${rapportsCount}) a été généré pour ${p.user.fullName} (${p.dossierNumber}). Merci de créer le devis R${rapportsCount} (prérempli depuis ce rapport) — les versions précédentes restent conservées.`
      : createNew
        ? `Le rapport médical de ${p.user.fullName} (${p.dossierNumber}) est prêt. Devis à préparer.`
        : `Le rapport médical de ${p.user.fullName} (${p.dossierNumber}) a été corrigé.`
    await notifyGestionnaires({
      type: 'info',
      titre,
      message,
      lienAction: `/gestionnaire/devis/${patientId}`,
      email: true,
    }).catch((err) => {
      console.warn('[upsertRapport] Notification / email gestionnaire non envoyés', err)
    })
    if (announceNouveau) {
      const chatMessage =
        `Nouveau rapport médical généré (R${rapportsCount}).\n\n` +
        `Patiente : ${p.user.fullName} (${p.dossierNumber}).\n\n` +
        `Merci de créer le devis R${rapportsCount} : il sera prérempli depuis ce rapport. Les anciens rapports et devis restent en historique.`
      await sendStaffOnlyMessage(medecinId, patientId, chatMessage, 'medecin').catch((err) => {
        console.warn('[upsertRapport] Message interne nouveau rapport non envoyé', err)
      })
    }
  }

  return { rapport }
}

export async function deleteRapport(medecinId: string, patientId: string, rapportId: string) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, status: true } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')

  const rapport = await prisma.rapport.findFirst({
    where: { id: rapportId, patientId },
  })
  if (!rapport) throw new AppError(404, 'RAPPORT_NOT_FOUND', 'Rapport introuvable.')

  await prisma.$transaction([
    prisma.devis.updateMany({
      where: { rapportId },
      data: { rapportId: null },
    }),
    prisma.rapportVersion.deleteMany({ where: { rapportId } }),
    prisma.rapport.delete({ where: { id: rapportId } }),
  ])

  await writeAuditLog({
    actorId: medecinId,
    actorRole: 'medecin',
    action: 'delete',
    entity: 'rapport',
    entityId: rapportId,
    before: rapport,
  })

  const remaining = await prisma.rapport.count({ where: { patientId } })
  if (
    remaining === 0 &&
    (patient.status === 'rapport_genere' || patient.status === 'rapport_modifie')
  ) {
    await prisma.patient.update({
      where: { id: patientId },
      data: { status: 'en_analyse' },
    })
  }

  return { deleted: true as const, rapportId }
}

const LIGNE_SUPP_CLINIQUE = 'Supp Clinique accompagnateur'
const LIGNE_SUPP_HOTEL = 'Supp Hôtel Accompagnateur'
const LIGNE_HOTEL = 'Hôtel (nbr de nuitées)'
const LIGNE_DRAINAGE = 'Drainage (nbr de séances)'

type DevisLigneJson = {
  description?: string
  quantite?: number
  prixUnitaire?: number
  total?: number
}

/** Met à jour le brouillon devis existant avec les nouvelles données médecin (sans créer de nouvelle version). */
async function syncBrouillonDevisFromRapport(
  patientId: string,
  rapport: {
    id: string
    forfaitPropose?: number | null
    nuitsPreoperatoires?: number | null
    nuitsClinique?: number | null
    nuitsHotel?: number | null
    dureeSejourTunisie?: number | null
    nbAdultesSejour?: number | null
    nbEnfantsSejour?: number | null
    drainage?: boolean | null
    nbSeancesDrainage?: number | null
  },
) {
  const draft = await prisma.devis.findFirst({
    where: {
      patientId,
      statut: 'brouillon',
      deletedAt: null,
      OR: [{ rapportId: rapport.id }, { rapportId: null }],
    },
    orderBy: { dateCreation: 'desc' },
  })
  if (!draft) return

  const form = await prisma.formulaire.findFirst({
    where: { patientId },
    orderBy: { createdAt: 'desc' },
    select: { payload: true },
  })
  const payload = (form?.payload ?? {}) as Record<string, unknown>

  const preop = Number(rapport.nuitsPreoperatoires) || 0
  const postop = Number(rapport.nuitsClinique) || 0
  const cliniqueNuits = preop + postop
  const hotelNuits =
    rapport.nuitsHotel != null && Number.isFinite(Number(rapport.nuitsHotel))
      ? Math.max(0, Math.floor(Number(rapport.nuitsHotel)))
      : rapport.dureeSejourTunisie != null
        ? Math.max(0, Math.floor(Number(rapport.dureeSejourTunisie)) - cliniqueNuits)
        : null
  const dureeTotale =
    rapport.dureeSejourTunisie != null && Number.isFinite(Number(rapport.dureeSejourTunisie))
      ? Math.max(0, Math.floor(Number(rapport.dureeSejourTunisie)))
      : null

  let nbAdultes =
    rapport.nbAdultesSejour != null && Number.isFinite(Number(rapport.nbAdultesSejour))
      ? Math.floor(Number(rapport.nbAdultesSejour))
      : null
  let nbEnfants =
    rapport.nbEnfantsSejour != null && Number.isFinite(Number(rapport.nbEnfantsSejour))
      ? Math.floor(Number(rapport.nbEnfantsSejour))
      : null

  const accFlag = payload.accompagnant
  let qteSupp = 0
  if (accFlag === true || accFlag === 'Oui' || accFlag === 'oui') {
    const a = Number(payload.nbAdultesAccompagnement)
    const e = Number(payload.nbEnfantsAccompagnement)
    qteSupp =
      (Number.isFinite(a) && a >= 0 ? Math.floor(a) : 0) +
      (Number.isFinite(e) && e >= 0 ? Math.floor(e) : 0)
  } else if (accFlag !== false && accFlag !== 'Non' && accFlag !== 'non') {
    const a = nbAdultes ?? 0
    const e = nbEnfants ?? 0
    qteSupp = Math.max(0, a + e - (a >= 1 ? 1 : 0))
  }

  const qteDrainage =
    rapport.drainage === false
      ? 0
      : rapport.nbSeancesDrainage != null && Number.isFinite(Number(rapport.nbSeancesDrainage))
        ? Math.max(0, Math.floor(Number(rapport.nbSeancesDrainage)))
        : null

  const forfait =
    rapport.forfaitPropose != null && Number.isFinite(Number(rapport.forfaitPropose)) && Number(rapport.forfaitPropose) > 0
      ? Math.round(Number(rapport.forfaitPropose))
      : null

  const rawLignes = Array.isArray(draft.lignes) ? (draft.lignes as DevisLigneJson[]) : []
  if (rawLignes.length === 0) return

  const updatedLignes = rawLignes.map((l, i) => {
    const description = String(l.description ?? '')
    let quantite = Math.max(0, Math.round(Number(l.quantite) || 0))
    let prixUnitaire = Number(l.prixUnitaire) || 0
    if (i === 0 && forfait != null) prixUnitaire = forfait
    if (description === LIGNE_SUPP_CLINIQUE || description === LIGNE_SUPP_HOTEL) quantite = qteSupp
    if (description === LIGNE_HOTEL && hotelNuits != null) quantite = hotelNuits
    if (description === LIGNE_DRAINAGE && qteDrainage != null) quantite = qteDrainage
    return {
      description,
      quantite,
      prixUnitaire,
      total: quantite * prixUnitaire,
    }
  })
  const total = updatedLignes.reduce((s, l) => s + l.total, 0)

  let notesSejour = draft.notesSejour ?? null
  if (notesSejour) {
    const patch = (prefix: string, value: string | null) => {
      if (value == null) return
      const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*$`, 'm')
      if (re.test(notesSejour!)) {
        notesSejour = notesSejour!.replace(re, `${prefix}${value}`)
      } else {
        notesSejour = `${notesSejour!.trimEnd()}\n${prefix}${value}`
      }
    }
    if (cliniqueNuits > 0 || rapport.nuitsClinique != null || rapport.nuitsPreoperatoires != null) {
      patch('SEJOUR_CLINIQUE_NUITS:', String(cliniqueNuits))
    }
    if (hotelNuits != null) patch('SEJOUR_HOTEL_NUITS:', String(hotelNuits))
    if (dureeTotale != null) patch('SEJOUR_DUREE_TOTALE:', String(dureeTotale))
    if (nbAdultes != null) patch('SEJOUR_NB_ADULTES:', String(nbAdultes))
    if (nbEnfants != null) patch('SEJOUR_NB_ENFANTS:', String(nbEnfants))
    if (qteDrainage != null) patch('DEVIS_DRAINAGE_NB:', String(qteDrainage))
  }

  await prisma.devis.update({
    where: { id: draft.id },
    data: {
      lignes: updatedLignes as never,
      total,
      ...(notesSejour != null ? { notesSejour } : {}),
    },
  })
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
      heureFin: `${e.dateFin.getHours().toString().padStart(2, '0')}:${e.dateFin.getMinutes().toString().padStart(2, '0')}`,
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
  void googleCalendar.pushEventToGoogle(event.id)
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
  void googleCalendar.pushEventToGoogle(event.id)
  return { event }
}

export async function deleteAgendaEvent(medecinId: string, eventId: string) {
  const existing = await prisma.agendaEvent.findFirst({ where: { id: eventId, medecinId } })
  if (!existing) throw new AppError(404, 'EVENT_NOT_FOUND', 'Événement introuvable.')
  void googleCalendar.deleteEventFromGoogle(medecinId, existing.googleEventId)
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

export async function getAllDevis() {
  const devisList = await prisma.devis.findMany({
    where: { statut: { in: ['envoye', 'accepte', 'refuse'] }, deletedAt: null },
    include: {
      patient: {
        select: {
          id: true,
          dossierNumber: true,
          user: { select: { fullName: true } },
        },
      },
    },
    orderBy: { dateCreation: 'desc' },
  })

  return {
    devis: devisList.map((d) => ({
      id: d.id,
      numeroDevis: d.numeroDevis,
      statut: d.statut,
      version: d.version,
      lignes: d.lignes,
      total: d.total,
      currency: d.currency,
      planningMedical: d.planningMedical,
      notesSejour: d.notesSejour,
      customContent: d.customContent,
      dateValidite: d.dateValidite?.toISOString() ?? null,
      dateCreation: d.dateCreation.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      vuParPatientAt: d.vuParPatientAt?.toISOString() ?? null,
      patient: {
        id: d.patient.id,
        dossierNumber: d.patient.dossierNumber,
        fullName: d.patient.user.fullName,
      },
    })),
  }
}

// ─── Notifications in-app ─────────────────────────────────────────────────────

export async function listNotifications(userId: string) {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return {
    notifications: rows.map((n) => ({
      id: n.id,
      userId: n.userId,
      titre: n.titre,
      message: n.message,
      type: n.type,
      lu: n.lu,
      dateCreation: n.createdAt.toISOString(),
      lienAction: n.lienAction,
    })),
  }
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const n = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  })
  if (!n) throw new AppError(404, 'NOTIF_NOT_FOUND', 'Notification introuvable.')
  await prisma.notification.update({
    where: { id: notificationId },
    data: { lu: true },
  })
  return { ok: true as const }
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, lu: false },
    data: { lu: true },
  })
  return { ok: true as const }
}

