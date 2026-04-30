import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/errorHandler.js'
import bcrypt from 'bcryptjs'
import type {
  CreateUserByGestionnaireInput,
  LogistiqueInput,
  RefuseDevisInput,
  UpdateTemplateInput,
  UpsertDevisDraftInput,
} from './gestionnaire.schema.js'
import type { CreateAgendaEventInput, UpdateAgendaEventInput } from '../medecin/medecin.schema.js'

const patientListInclude = {
  user: { select: { fullName: true, email: true, createdAt: true } },
  formulaires: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  devis: { orderBy: { dateCreation: 'desc' as const }, take: 1 },
} as const

type TemplateKey = 'formulaireAck' | 'devisSent' | 'refus'
type TemplateChannel = 'chat' | 'notification' | 'both'

type TemplateRecord = {
  key: TemplateKey
  title: string
  content: string
  channel: TemplateChannel
  active: boolean
  updatedAt: string
  updatedBy: string
}

const DEFAULT_TEMPLATES: Record<TemplateKey, Omit<TemplateRecord, 'updatedAt' | 'updatedBy'>> = {
  formulaireAck: {
    key: 'formulaireAck',
    title: 'Accusé réception formulaire',
    content: 'Bonjour {prenom} {nom}, nous avons bien reçu votre formulaire. Notre équipe vous recontacte rapidement.',
    channel: 'notification',
    active: true,
  },
  devisSent: {
    key: 'devisSent',
    title: 'Devis envoyé',
    content: 'Bonjour {prenom} {nom}, votre devis est disponible sur votre espace patient.',
    channel: 'both',
    active: true,
  },
  refus: {
    key: 'refus',
    title: 'Dossier non retenu',
    content: 'Bonjour {prenom} {nom}, une mise à jour a été faite sur votre dossier. {reason}',
    channel: 'chat',
    active: true,
  },
}

function parseLogistiqueMeta(raw?: string | null) {
  if (!raw) {
    return {
      checklist: {
        passport: false,
        billet: false,
        hebergementConfirme: false,
        transfertAeroport: false,
      },
      notes: '',
    }
  }
  try {
    const parsed = JSON.parse(raw) as {
      checklist?: Partial<Record<'passport' | 'billet' | 'hebergementConfirme' | 'transfertAeroport', boolean>>
      notes?: string
    }
    return {
      checklist: {
        passport: !!parsed.checklist?.passport,
        billet: !!parsed.checklist?.billet,
        hebergementConfirme: !!parsed.checklist?.hebergementConfirme,
        transfertAeroport: !!parsed.checklist?.transfertAeroport,
      },
      notes: parsed.notes ?? '',
    }
  } catch {
    return {
      checklist: {
        passport: false,
        billet: false,
        hebergementConfirme: false,
        transfertAeroport: false,
      },
      notes: raw,
    }
  }
}

function applyTemplate(content: string, vars: Record<string, string>) {
  return content
    .split('{prenom}').join(vars.prenom ?? '')
    .split('{nom}').join(vars.nom ?? '')
    .split('{reason}').join(vars.reason ?? '')
}

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

function generateDossierNumber(): string {
  const year = new Date().getFullYear()
  const suffix = Math.floor(100000 + Math.random() * 900000)
  return `DOS-${year}-${suffix}`
}

export async function getDashboard(gestionnaireUserId: string) {
  const [
    totalPatients,
    devisEnFlux,
    logistiqueCount,
    notifUnread,
    devisATraiter,
    patientsLogistique,
    funnel,
  ] = await Promise.all([
    prisma.patient.count(),
    prisma.devis.count({ where: { statut: { in: ['brouillon', 'envoye'] } } }),
    prisma.patient.count({ where: { status: { in: ['date_reservee', 'logistique'] } } }),
    prisma.notification.count({ where: { userId: gestionnaireUserId, lu: false } }),
    prisma.patient.findMany({
      where: { status: { in: ['rapport_genere', 'devis_preparation'] } },
      include: { user: { select: { fullName: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
    prisma.patient.findMany({
      where: { status: { in: ['date_reservee', 'logistique'] } },
      select: {
        id: true,
        dossierNumber: true,
        status: true,
        updatedAt: true,
        ville: true,
        pays: true,
        user: { select: { fullName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    }),
    Promise.all([
      prisma.patient.count(),
      prisma.formulaire.count({ where: { status: 'submitted' } }),
      prisma.devis.count({ where: { statut: { in: ['envoye', 'accepte', 'refuse'] } } }),
      prisma.agendaEvent.count({ where: { type: 'rdv', statut: { not: 'annule' } } }),
      prisma.patient.count({ where: { status: { in: ['intervention', 'post_op'] } } }),
    ]),
  ])

  const [leads, forms, devisTotal, rdvCount, interventions] = funnel
  const funnelData = [
    { step: 'Leads', count: leads },
    { step: 'Formulaires', count: forms },
    { step: 'Devis', count: devisTotal },
    { step: 'RDV', count: rdvCount },
    { step: 'Interventions', count: interventions },
  ]

  return {
    stats: {
      totalPatients,
      devisEnCours: devisEnFlux,
      logistique: logistiqueCount,
      notifications: notifUnread,
    },
    devisATraiter,
    patientsLogistique,
    funnel: funnelData,
  }
}

export async function getPatients(search?: string, status?: string) {
  const patients = await prisma.patient.findMany({
    where: {
      ...(status && status !== 'all' ? { status: status as never } : {}),
      ...(search
        ? {
            OR: [
              { user: { fullName: { contains: search, mode: 'insensitive' } } },
              { user: { email: { contains: search, mode: 'insensitive' } } },
              { dossierNumber: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: patientListInclude,
    orderBy: { updatedAt: 'desc' },
  })
  return { patients }
}

export async function getPatientById(patientId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      user: { select: { fullName: true, email: true, createdAt: true } },
      formulaires: { orderBy: { createdAt: 'desc' } },
      devis: { orderBy: { dateCreation: 'desc' } },
      rapports: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')
  return { patient }
}

function assertPatientReadyForDevis(status: string) {
  const ok = ['rapport_genere', 'devis_preparation', 'devis_envoye', 'devis_accepte'].includes(status)
  if (!ok) {
    throw new AppError(400, 'PATIENT_NOT_READY', 'Le dossier patient n’est pas prêt pour un devis.')
  }
}

async function getTemplateMap() {
  const logs = await prisma.auditLog.findMany({
    where: { entity: 'communication_template' },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const map: Record<TemplateKey, TemplateRecord> = {
    formulaireAck: {
      ...DEFAULT_TEMPLATES.formulaireAck,
      updatedAt: new Date(0).toISOString(),
      updatedBy: 'Système',
    },
    devisSent: {
      ...DEFAULT_TEMPLATES.devisSent,
      updatedAt: new Date(0).toISOString(),
      updatedBy: 'Système',
    },
    refus: {
      ...DEFAULT_TEMPLATES.refus,
      updatedAt: new Date(0).toISOString(),
      updatedBy: 'Système',
    },
  }

  for (const l of logs) {
    const key = l.entityId as TemplateKey
    if (!(key in map)) continue
    if (map[key].updatedAt !== new Date(0).toISOString()) continue
    const after = (l.after ?? {}) as Partial<TemplateRecord>
    map[key] = {
      key,
      title: after.title ?? map[key].title,
      content: after.content ?? map[key].content,
      channel: (after.channel as TemplateChannel) ?? map[key].channel,
      active: typeof after.active === 'boolean' ? after.active : map[key].active,
      updatedAt: l.createdAt.toISOString(),
      updatedBy: (after.updatedBy as string) ?? 'Gestionnaire',
    }
  }

  return map
}

async function dispatchTemplateMessage(input: {
  template: TemplateRecord
  patientId: string
  patientUserId: string
  patientFullName: string
  gestionnaireId: string
  vars?: Record<string, string>
  notifTitle: string
  notifLink: string
}) {
  if (!input.template.active) return
  const [prenom, ...rest] = input.patientFullName.split(' ')
  const nom = rest.join(' ')
  const content = applyTemplate(input.template.content, {
    prenom: prenom ?? '',
    nom: nom ?? '',
    reason: input.vars?.reason ?? '',
  }).trim()

  if (input.template.channel === 'notification' || input.template.channel === 'both') {
    await prisma.notification.create({
      data: {
        userId: input.patientUserId,
        type: 'info',
        titre: input.notifTitle,
        message: content,
        lienAction: input.notifLink,
      },
    })
  }

  if (input.template.channel === 'chat' || input.template.channel === 'both') {
    await prisma.message.create({
      data: {
        patientId: input.patientId,
        expediteurId: input.gestionnaireId,
        expediteurRole: 'gestionnaire',
        contenu: content,
        lu: false,
      },
    })
  }
}

export async function upsertDevisDraft(gestionnaireId: string, patientId: string, input: UpsertDevisDraftInput) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')
  assertPatientReadyForDevis(patient.status)

  const lignesJson = input.lignes as never
  const dateValidite = input.dateValidite ? new Date(input.dateValidite) : null

  const draft = await prisma.devis.findFirst({
    where: { patientId, statut: 'brouillon' },
    orderBy: { dateCreation: 'desc' },
  })

  let devis
  if (draft) {
    devis = await prisma.devis.update({
      where: { id: draft.id },
      data: {
        gestionnaireId,
        lignes: lignesJson,
        total: input.total,
        planningMedical: input.planningMedical ?? null,
        notesSejour: input.notesSejour ?? null,
        currency: input.currency ?? 'EUR',
        ...(dateValidite ? { dateValidite } : {}),
      },
    })
  } else {
    const last = await prisma.devis.findFirst({
      where: { patientId },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    const version = (last?.version ?? 0) + 1
    devis = await prisma.devis.create({
      data: {
        patientId,
        gestionnaireId,
        statut: 'brouillon',
        version,
        lignes: lignesJson,
        total: input.total,
        planningMedical: input.planningMedical ?? null,
        notesSejour: input.notesSejour ?? null,
        currency: input.currency ?? 'EUR',
        dateValidite,
      },
    })
  }

  if (['rapport_genere', 'devis_preparation'].includes(patient.status)) {
    await prisma.patient.update({
      where: { id: patientId },
      data: { status: 'devis_preparation' },
    })
  }

  return { devis }
}

export async function saveDevisCustomContent(gestionnaireId: string, devisId: string, content: string) {
  const devis = await prisma.devis.findUnique({ where: { id: devisId } })
  if (!devis) throw new AppError(404, 'DEVIS_NOT_FOUND', 'Devis introuvable.')
  if (devis.gestionnaireId !== gestionnaireId) throw new AppError(403, 'FORBIDDEN', 'Accès refusé.')
  // Prisma generate bloqué sur Windows (EPERM), on utilise SQL raw
  await prisma.$executeRaw`UPDATE "devis" SET "custom_content" = ${content} WHERE "id" = ${devisId}`
  return { ok: true }
}

export async function sendDevis(gestionnaireId: string, devisId: string) {
  const devis = await prisma.devis.findUnique({ where: { id: devisId } })
  if (!devis) throw new AppError(404, 'DEVIS_NOT_FOUND', 'Devis introuvable.')
  if (devis.gestionnaireId !== gestionnaireId) {
    throw new AppError(403, 'FORBIDDEN', 'Ce devis ne vous appartient pas.')
  }
  if (devis.statut !== 'brouillon') {
    throw new AppError(400, 'DEVIS_NOT_DRAFT', 'Seul un brouillon peut être envoyé.')
  }

  const patient = await prisma.patient.findUnique({
    where: { id: devis.patientId },
    include: { user: { select: { fullName: true, id: true } } },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')

  const updated = await prisma.devis.update({
    where: { id: devisId },
    data: { statut: 'envoye' },
  })

  await prisma.patient.update({
    where: { id: patient.id },
    data: { status: 'devis_envoye' },
  })

  const templates = await getTemplateMap()
  await dispatchTemplateMessage({
    template: templates.devisSent,
    patientId: patient.id,
    patientUserId: patient.userId,
    patientFullName: patient.user.fullName,
    gestionnaireId,
    notifTitle: 'Votre devis est disponible',
    notifLink: '/patient/devis',
  })

  return { devis: updated }
}

export async function refuseDevis(gestionnaireId: string, devisId: string, input: RefuseDevisInput) {
  const devis = await prisma.devis.findUnique({
    where: { id: devisId },
    include: { patient: { include: { user: { select: { fullName: true, id: true } } } } },
  })
  if (!devis) throw new AppError(404, 'DEVIS_NOT_FOUND', 'Devis introuvable.')
  if (devis.gestionnaireId !== gestionnaireId) {
    throw new AppError(403, 'FORBIDDEN', 'Ce devis ne vous appartient pas.')
  }
  if (!['brouillon', 'envoye'].includes(devis.statut)) {
    throw new AppError(400, 'DEVIS_FINAL', 'Ce devis ne peut plus être refusé.')
  }

  const updated = await prisma.devis.update({
    where: { id: devisId },
    data: { statut: 'refuse' },
  })

  const reasonText = input.reason?.trim() ?? ''
  const templates = await getTemplateMap()
  await dispatchTemplateMessage({
    template: templates.refus,
    patientId: devis.patient.id,
    patientUserId: devis.patient.userId,
    patientFullName: devis.patient.user.fullName,
    gestionnaireId,
    vars: { reason: reasonText ? `Motif transmis: ${reasonText}.` : '' },
    notifTitle: 'Mise à jour concernant votre devis',
    notifLink: '/patient/chat',
  })

  return { devis: updated }
}

export async function deleteDevis(gestionnaireId: string, devisId: string) {
  const devis = await prisma.devis.findUnique({
    where: { id: devisId },
    include: { patient: true },
  })
  if (!devis) throw new AppError(404, 'DEVIS_NOT_FOUND', 'Devis introuvable.')
  if (devis.gestionnaireId !== gestionnaireId) {
    throw new AppError(403, 'FORBIDDEN', 'Ce devis ne vous appartient pas.')
  }
  if (devis.statut === 'accepte') {
    throw new AppError(400, 'DEVIS_ACCEPTED', 'Un devis accepté ne peut pas être supprimé.')
  }

  await prisma.$transaction(async (tx) => {
    await tx.devis.delete({ where: { id: devisId } })

    const [remaining, rapportsCount] = await Promise.all([
      tx.devis.findMany({
        where: { patientId: devis.patientId },
        select: { statut: true, dateCreation: true },
        orderBy: { dateCreation: 'desc' },
      }),
      tx.rapport.count({ where: { patientId: devis.patientId } }),
    ])

    let nextStatus = devis.patient.status
    if (remaining.some((d) => d.statut === 'accepte')) nextStatus = 'devis_accepte'
    else if (remaining.some((d) => d.statut === 'envoye')) nextStatus = 'devis_envoye'
    else if (remaining.some((d) => d.statut === 'brouillon')) nextStatus = 'devis_preparation'
    else if (rapportsCount > 0) nextStatus = 'rapport_genere'

    if (nextStatus !== devis.patient.status) {
      await tx.patient.update({
        where: { id: devis.patientId },
        data: { status: nextStatus },
      })
    }
  })

  return { deleted: true as const }
}

export async function getLogistiquePatients() {
  const patients = await prisma.patient.findMany({
    where: { status: { in: ['date_reservee', 'logistique', 'intervention', 'post_op', 'suivi_termine'] } },
    include: { user: { select: { fullName: true, email: true } } },
    orderBy: { updatedAt: 'desc' },
  })

  const rows = await prisma.logistique.findMany({
    where: { patientId: { in: patients.map((p) => p.id) } },
  })
  const map = new Map(rows.map((l) => [l.patientId, l]))

  return {
    patients: patients.map((p) => {
      const log = map.get(p.id)
      const parsed = parseLogistiqueMeta(log?.notesLogistiques)
      return {
        id: p.id,
        dossierNumber: p.dossierNumber,
        status: p.status,
        ville: p.ville,
        pays: p.pays,
        user: p.user,
        logistique: log
          ? {
              dateArrivee: log.dateArrivee?.toISOString().slice(0, 10) ?? null,
              dateDepart: log.dateDepart?.toISOString().slice(0, 10) ?? null,
              hebergement: log.hebergement ?? null,
              transport: log.transport ?? null,
              accompagnateur: log.accompagnateur ?? null,
              checklist: parsed.checklist,
              notes: parsed.notes,
            }
          : null,
      }
    }),
  }
}

export async function upsertLogistique(gestionnaireId: string, patientId: string, input: LogistiqueInput) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { user: { select: { fullName: true } } },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')

  const notesLogistiques = JSON.stringify({
    checklist: {
      passport: input.passport,
      billet: input.billet,
      hebergementConfirme: input.hebergementConfirme,
      transfertAeroport: input.transfertAeroport,
    },
    notes: input.notes ?? '',
  })

  const row = await prisma.logistique.upsert({
    where: { patientId },
    update: {
      dateArrivee: input.dateArrivee ? new Date(input.dateArrivee) : null,
      dateDepart: input.dateDepart ? new Date(input.dateDepart) : null,
      hebergement: input.hebergement ?? null,
      transport: input.transport ?? null,
      accompagnateur: input.accompagnateur ?? null,
      notesLogistiques,
    },
    create: {
      patientId,
      dateArrivee: input.dateArrivee ? new Date(input.dateArrivee) : null,
      dateDepart: input.dateDepart ? new Date(input.dateDepart) : null,
      hebergement: input.hebergement ?? null,
      transport: input.transport ?? null,
      accompagnateur: input.accompagnateur ?? null,
      notesLogistiques,
    },
  })

  const complete = input.passport && input.billet && input.hebergementConfirme && input.transfertAeroport

  if (complete) {
    // Quand la checklist est complète, le dossier passe à l'étape intervention.
    if (patient.status !== 'intervention') {
      await prisma.patient.update({
        where: { id: patientId },
        data: { status: 'intervention' },
      })

      const med = await prisma.user.findFirst({ where: { role: 'medecin' }, select: { id: true } })
      if (med) {
        await prisma.notification.create({
          data: {
            userId: med.id,
            type: 'info',
            titre: 'Logistique prête',
            message: `La logistique de ${patient.user.fullName} est prête. Le dossier est prêt pour l'étape intervention.`,
            lienAction: `/medecin/patients/${patientId}`,
          },
        })
      }
    }
  } else if (patient.status === 'date_reservee') {
    // Si la logistique est en cours, on explicite l'étape "logistique".
    await prisma.patient.update({
      where: { id: patientId },
      data: { status: 'logistique' },
    })
  }

  await prisma.auditLog.create({
    data: {
      actorId: gestionnaireId,
      actorRole: 'gestionnaire',
      action: 'update',
      entity: 'logistique',
      entityId: row.id,
      after: {
        patientId,
        checklist: {
          passport: input.passport,
          billet: input.billet,
          hebergementConfirme: input.hebergementConfirme,
          transfertAeroport: input.transfertAeroport,
        },
      } as never,
    },
  })

  return { ok: true as const }
}

export async function getCommunicationTemplates() {
  const map = await getTemplateMap()
  return { templates: Object.values(map) }
}

export async function updateCommunicationTemplate(userId: string, key: TemplateKey, input: UpdateTemplateInput) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } })
  await prisma.auditLog.create({
    data: {
      actorId: userId,
      actorRole: 'gestionnaire',
      action: 'update',
      entity: 'communication_template',
      entityId: key,
      after: {
        key,
        title: DEFAULT_TEMPLATES[key].title,
        content: input.content,
        channel: input.channel,
        active: input.active,
        updatedBy: user?.fullName ?? 'Gestionnaire',
      } as never,
    },
  })
  return { ok: true as const }
}

export async function resetCommunicationTemplate(userId: string, key: TemplateKey) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } })
  await prisma.auditLog.create({
    data: {
      actorId: userId,
      actorRole: 'gestionnaire',
      action: 'update',
      entity: 'communication_template',
      entityId: key,
      after: {
        ...DEFAULT_TEMPLATES[key],
        updatedBy: user?.fullName ?? 'Gestionnaire',
      } as never,
    },
  })
  return { ok: true as const }
}

export async function getAnalytics() {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const [statusRows, devisRows, agendaRows, patientsRows] = await Promise.all([
    prisma.patient.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.devis.findMany({
      where: { dateCreation: { gte: monthStart } },
      select: { statut: true, dateCreation: true, total: true },
    }),
    prisma.agendaEvent.count({
      where: { type: 'rdv', statut: { not: 'annule' } },
    }),
    prisma.patient.findMany({
      where: { createdAt: { gte: monthStart } },
      select: { createdAt: true },
    }),
  ])

  const funnel = [
    { step: 'Leads', count: await prisma.patient.count() },
    { step: 'Formulaires', count: await prisma.formulaire.count({ where: { status: 'submitted' } }) },
    { step: 'Devis', count: await prisma.devis.count({ where: { statut: { in: ['envoye', 'accepte', 'refuse'] } } }) },
    { step: 'RDV', count: agendaRows },
    { step: 'Interventions', count: await prisma.patient.count({ where: { status: { in: ['intervention', 'post_op'] } } }) },
  ]

  const statusDistribution = statusRows.map((s) => ({
    status: s.status,
    count: s._count._all,
  }))

  const monthlyDevis: Array<{ key: string; mois: string; total: number; envoye: number; accepte: number }> = []
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const mois = d.toLocaleDateString('fr-FR', { month: 'short' })
    const rows = devisRows.filter((r) => r.dateCreation.toISOString().slice(0, 7) === key)
    monthlyDevis.push({
      key,
      mois,
      total: rows.reduce((sum, r) => sum + r.total, 0),
      envoye: rows.filter((r) => r.statut === 'envoye').length,
      accepte: rows.filter((r) => r.statut === 'accepte').length,
    })
  }

  const accepted = devisRows.filter((d) => d.statut === 'accepte').length
  const sent = devisRows.filter((d) => d.statut === 'envoye' || d.statut === 'accepte' || d.statut === 'refuse').length
  const acceptanceRate = sent > 0 ? Math.round((accepted / sent) * 100) : 0
  const leads = patientsRows.length
  const rdvRate = leads > 0 ? Math.round((agendaRows / leads) * 100) : 0

  return {
    funnel,
    statusDistribution,
    monthlyDevis,
    kpis: {
      acceptanceRate,
      rdvRate,
    },
  }
}

export async function listUsers(input?: {
  search?: string
  role?: 'patient' | 'medecin' | 'gestionnaire'
  page?: number
  pageSize?: number
}) {
  const search = input?.search?.trim()
  const role = input?.role
  const page = Math.max(1, input?.page ?? 1)
  const pageSize = Math.min(50, Math.max(5, input?.pageSize ?? 12))

  const where = {
    ...(role ? { role } : {}),
    ...(search
      ? {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { patient: { is: { dossierNumber: { contains: search, mode: 'insensitive' as const } } } },
          ],
        }
      : {}),
  }

  const [total, users, totalAll, totalPatients, totalMedecins, totalGestionnaires] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            dossierNumber: true,
            phone: true,
            status: true,
            ville: true,
            pays: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count(),
    prisma.user.count({ where: { role: 'patient' } }),
    prisma.user.count({ where: { role: 'medecin' } }),
    prisma.user.count({ where: { role: 'gestionnaire' } }),
  ])

  return {
    users: users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
      patient: u.patient
        ? {
            id: u.patient.id,
            dossierNumber: u.patient.dossierNumber,
            phone: u.patient.phone,
            status: u.patient.status,
            ville: u.patient.ville,
            pays: u.patient.pays,
            createdAt: u.patient.createdAt.toISOString(),
          }
        : null,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
    stats: {
      all: totalAll,
      patients: totalPatients,
      medecins: totalMedecins,
      gestionnaires: totalGestionnaires,
    },
  }
}

export async function createUserByGestionnaire(actorId: string, input: CreateUserByGestionnaireInput) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    select: { id: true },
  })
  if (existing) throw new AppError(409, 'EMAIL_TAKEN', 'Un compte existe déjà avec cet email.')

  const passwordHash = await bcrypt.hash(input.password, 12)
  const user = await prisma.user.create({
    data: {
      fullName: input.fullName,
      email: input.email.toLowerCase(),
      passwordHash,
      role: input.role,
    },
  })

  let patient = null as null | { id: string; dossierNumber: string }
  if (input.role === 'patient') {
    let dossierNumber = generateDossierNumber()
    for (let i = 0; i < 6; i += 1) {
      try {
        patient = await prisma.patient.create({
          data: {
            userId: user.id,
            dossierNumber,
            phone: input.phone ?? null,
            dateNaissance: input.dateNaissance ? new Date(input.dateNaissance) : null,
            nationalite: input.nationalite ?? null,
            ville: input.ville ?? null,
            pays: input.pays ?? null,
            sourceContact: input.sourceContact ?? 'direct',
          },
          select: { id: true, dossierNumber: true },
        })
        break
      } catch (e: unknown) {
        const err = e as { code?: string }
        if (err?.code === 'P2002') {
          dossierNumber = generateDossierNumber()
          continue
        }
        throw e
      }
    }
    if (!patient) throw new AppError(500, 'DOSSIER_NUMBER_FAILED', 'Impossible de générer le dossier patient.')

    await notifyGestionnaires({
      type: 'info',
      titre: 'Nouveau patient créé',
      message: `${user.fullName} (${patient.dossierNumber}) a été ajouté au CRM.`,
      lienAction: '/gestionnaire/patients',
    })

    // Si un formulaire médical a été fourni, le créer et marquer le dossier comme complet
    if (input.formulairePayload) {
      await prisma.formulaire.create({
        data: {
          patientId: patient.id,
          status: 'submitted',
          submittedAt: new Date(),
          payload: input.formulairePayload as never,
        },
      })
      await prisma.patient.update({
        where: { id: patient.id },
        data: { status: 'formulaire_complete' },
      })
      await notifyGestionnaires({
        type: 'info',
        titre: 'Formulaire patient soumis',
        message: `${user.fullName} (${patient.dossierNumber}) a un formulaire médical prêt à traiter.`,
        lienAction: '/gestionnaire/patients',
      })
    }
  }

  await prisma.auditLog.create({
    data: {
      actorId,
      actorRole: 'gestionnaire',
      action: 'create',
      entity: 'user',
      entityId: user.id,
      after: {
        role: user.role,
        email: user.email,
        fullName: user.fullName,
        dossierNumber: patient?.dossierNumber ?? null,
      } as never,
    },
  })

  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      dossierNumber: patient?.dossierNumber ?? null,
    },
  }
}

async function resolveMedecinId(inputMedecinId?: string) {
  if (inputMedecinId) {
    const med = await prisma.user.findFirst({
      where: { id: inputMedecinId, role: 'medecin' },
      select: { id: true },
    })
    if (!med) throw new AppError(404, 'MEDECIN_NOT_FOUND', 'Médecin introuvable.')
    return med.id
  }
  const first = await prisma.user.findFirst({
    where: { role: 'medecin' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!first) throw new AppError(404, 'MEDECIN_NOT_FOUND', 'Aucun médecin disponible.')
  return first.id
}

export async function getAgendaForGestionnaire(from?: string, to?: string, medecinId?: string) {
  const targetMedecinId = await resolveMedecinId(medecinId)
  const events = await prisma.agendaEvent.findMany({
    where: {
      medecinId: targetMedecinId,
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

  const rdvs = events
    .filter((e) => e.type === 'rdv')
    .map((e) => ({
      id: e.id,
      date: e.dateDebut.toISOString().slice(0, 10),
      heure: `${e.dateDebut.getHours().toString().padStart(2, '0')}:${e.dateDebut.getMinutes().toString().padStart(2, '0')}`,
      type: e.title ?? 'RDV',
      motif: e.motif ?? null,
      statut: e.statut ?? 'planifie',
      patient: e.patient
        ? { id: e.patient.id, dossierNumber: e.patient.dossierNumber, user: { fullName: e.patient.user.fullName } }
        : null,
    }))

  return { medecinId: targetMedecinId, events, rdvs }
}

export async function createAgendaEventByGestionnaire(actorId: string, input: CreateAgendaEventInput, medecinId?: string) {
  const targetMedecinId = await resolveMedecinId(medecinId)
  const event = await prisma.agendaEvent.create({
    data: {
      medecinId: targetMedecinId,
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
  await prisma.auditLog.create({
    data: {
      actorId,
      actorRole: 'gestionnaire',
      action: 'create',
      entity: 'agenda_event',
      entityId: event.id,
      after: event as never,
    },
  })
  return { event }
}

export async function updateAgendaEventByGestionnaire(actorId: string, eventId: string, input: UpdateAgendaEventInput) {
  const existing = await prisma.agendaEvent.findUnique({ where: { id: eventId } })
  if (!existing) throw new AppError(404, 'EVENT_NOT_FOUND', 'Événement introuvable.')

  const event = await prisma.agendaEvent.update({
    where: { id: eventId },
    data: {
      ...(input.type !== undefined && { type: input.type }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.motif !== undefined && { motif: input.motif }),
      ...(input.dateDebut !== undefined && { dateDebut: new Date(input.dateDebut) }),
      ...(input.dateFin !== undefined && { dateFin: new Date(input.dateFin) }),
      ...(input.allDay !== undefined && { allDay: input.allDay }),
      ...(input.statut !== undefined && { statut: input.statut }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  })
  await prisma.auditLog.create({
    data: {
      actorId,
      actorRole: 'gestionnaire',
      action: 'update',
      entity: 'agenda_event',
      entityId: event.id,
      before: existing as never,
      after: event as never,
    },
  })
  return { event }
}

export async function deleteAgendaEventByGestionnaire(actorId: string, eventId: string) {
  const existing = await prisma.agendaEvent.findUnique({ where: { id: eventId } })
  if (!existing) throw new AppError(404, 'EVENT_NOT_FOUND', 'Événement introuvable.')
  await prisma.agendaEvent.delete({ where: { id: eventId } })
  await prisma.auditLog.create({
    data: {
      actorId,
      actorRole: 'gestionnaire',
      action: 'delete',
      entity: 'agenda_event',
      entityId: eventId,
      before: existing as never,
    },
  })
  return { deleted: true as const }
}

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
