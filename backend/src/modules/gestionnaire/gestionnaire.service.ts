import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/errorHandler.js'
import bcrypt from 'bcryptjs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  CreateUserByGestionnaireInput,
  LogistiqueInput,
  PlanningSejourInput,
  RefuseDevisInput,
  UpdateUserByGestionnaireInput,
  UpdateTemplateInput,
  UpsertDevisDraftInput,
} from './gestionnaire.schema.js'
import type { CreateAgendaEventInput, UpdateAgendaEventInput } from '../medecin/medecin.schema.js'
import * as googleCalendar from '../google-calendar/google-calendar.service.js'
import {
  formatDevisPdfFileName,
  generateNextDevisNumber,
  generateNextMcReference,
  resolvePatientReference,
  syncPatientDossierFromDevis,
} from '../../lib/devisNumber.js'
import { notifyStaff } from '../../lib/staffNotifications.js'
import { createUserNotification } from '../../lib/userNotifications.js'
import { buildPlanningSejourHtml, moisLabelFromDate } from '../../lib/planningSejourHtml.js'
import { buildPatientStatusWhere, countDossierBuckets } from '../../lib/dossierFilters.js'
import { renderHtmlToPdf } from '../../lib/htmlPdf.js'
import { sendDevisReadyEmail, sendDevisRappelEmail } from '../../lib/mailer.js'
import type { UpdatePatientStatusInput } from '../medecin/medecin.schema.js'
import { softDeleteDevisPdfMessages } from '../chat/chat.service.js'

const UPLOADS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../uploads')


/** Liste planning séjour : uniquement dossiers « devis accepté » (pas les étapes suivantes). */
const PLANNING_SEJOUR_STATUSES = ['devis_accepte'] as const

const patientListInclude = {
  user: { select: { id: true, fullName: true, email: true, createdAt: true } },
  formulaires: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  devis: { where: { deletedAt: null }, orderBy: { dateCreation: 'desc' as const }, take: 1 },
} as const

/** Devis visibles (non soft-supprimés). */
const devisActiveWhere = { deletedAt: null } as const

type TemplateKey = 'formulaireAck' | 'devisSent' | 'refus' | 'abstention' | 'devisRappel'
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

export const TEMPLATE_KEYS: TemplateKey[] = ['formulaireAck', 'devisSent', 'refus', 'abstention', 'devisRappel']

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
  abstention: {
    key: 'abstention',
    title: 'Décision d’abstention',
    content: `Chère Madame,
Merci encore pour votre intérêt et la confiance que vous témoignez envers le cabinet du Dr CHENNOUFI.
Après un examen attentif de vos photos et de votre dossier médical, nous sommes au regret de vous informer que le Dr CHENNOUFI a pris la décision de ne pas intervenir dans votre cas.
Cette décision relève d’une démarche éthique et professionnelle, guidée par son exigence de sécurité, de résultats cohérents et d’adéquation avec sa pratique chirurgicale.
Nous vous remercions de votre compréhension et vous souhaitons le meilleur dans la poursuite de votre démarche.
Je vous souhaite une excellente journée.
Bien cordialement,
Houda Chennoufi
Conciergerie & coordination patients
Cabinet du Dr Mehdi Chennoufi
Chirurgie Esthétique, Plastique et Réparatrice
SCULPTURE, SMOOTH & SMILE`,
    channel: 'chat',
    active: true,
  },
  devisRappel: {
    key: 'devisRappel',
    title: 'Rappel devis',
    content: `Bonjour Madame,
Je me permets de revenir vers vous suite à l’envoi du devis concernant votre projet chirurgical avec le Dr Chennoufi.
N’ayant pas encore eu de retour de votre part, je souhaitais savoir si le diagnostic proposé, l’intervention envisagée ainsi que le devis transmis correspondent à vos attentes, ou si certains points mériteraient d’être clarifiés.
Nous restons bien entendu entièrement disponibles pour répondre à vos questions, vous apporter des informations complémentaires et, si vous le souhaitez, organiser un échange téléphonique afin de discuter plus sereinement de votre projet et de l’organisation de votre séjour médical.
N’hésitez pas à me faire part de votre retour, même bref ; il nous est précieux pour vous accompagner au mieux.
Horaires de travail : Mardi, Mercredi & Jeudi de 09 à 15h (heure locale)
Au plaisir de vous lire,
Bien cordialement,
Houda CHENNOUFI
Conciergerie & coordination patients
Cabinet du Dr Mehdi Chennoufi
Chirurgie Esthétique, Plastique et Réparatrice
SCULPTURE, SMOOTH & SMILE`,
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

function notifyGestionnaires(input: {
  titre: string
  message: string
  type?: 'info' | 'warning' | 'success' | 'error'
  lienAction?: string | null
}) {
  // In-app seulement — email gestionnaire = rapport généré uniquement
  return notifyStaff({ role: 'gestionnaire', email: false, ...input })
}

function notifyMedecinsFormulaire(input: {
  titre: string
  message: string
  type?: 'info' | 'warning' | 'success' | 'error'
  lienAction?: string | null
}) {
  return notifyStaff({ role: 'medecin', ...input })
}

function mapPatientListRow<T extends {
  dossierNumber: string
  devis?: Array<{ numeroDevis?: string | null }>
}>(patient: T): T {
  const numeroDevis = patient.devis?.[0]?.numeroDevis
  return {
    ...patient,
    dossierNumber: resolvePatientReference(patient.dossierNumber, numeroDevis),
  }
}

async function assignNumeroDevisWithRetry(
  createData: Parameters<typeof prisma.devis.create>[0]['data'],
): Promise<Awaited<ReturnType<typeof prisma.devis.create>>> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const numeroDevis = await generateNextDevisNumber(prisma)
    try {
      return await prisma.devis.create({
        data: { ...createData, numeroDevis },
      })
    } catch (err) {
      const code = (err as { code?: string })?.code
      if (code === 'P2002' && attempt < 4) continue
      throw err
    }
  }
  throw new Error('Impossible de générer un numéro de devis unique.')
}

export async function getDashboard(gestionnaireUserId: string) {
  const now = new Date()
  const [
    totalPatients,
    devisEnFlux,
    devisSansReponseCount,
    rdvAConfirmerCount,
    logistiqueCount,
    notifUnread,
    devisATraiter,
    devisSansReponse,
    rdvAConfirmer,
    patientsLogistique,
    funnel,
  ] = await Promise.all([
    prisma.patient.count({ where: { status: { not: 'abstention' } } }),
    prisma.devis.count({ where: { statut: { in: ['brouillon', 'envoye'] } } }),
    prisma.devis.count({ where: { statut: 'envoye' } }),
    prisma.agendaEvent.count({
      where: { type: 'rdv', statut: 'planifie', dateDebut: { gte: now } },
    }),
    prisma.patient.count({ where: { status: { in: ['date_reservee', 'logistique'] } } }),
    prisma.notification.count({ where: { userId: gestionnaireUserId, lu: false } }),
    prisma.patient.findMany({
      where: { status: { in: ['rapport_genere', 'rapport_modifie', 'devis_preparation'] } },
      include: { user: { select: { fullName: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
    prisma.devis.findMany({
      where: { statut: 'envoye' },
      select: {
        id: true,
        numeroDevis: true,
        updatedAt: true,
        patient: {
          select: {
            id: true,
            dossierNumber: true,
            user: { select: { fullName: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
    prisma.agendaEvent.findMany({
      where: { type: 'rdv', statut: 'planifie', dateDebut: { gte: now } },
      select: {
        id: true,
        dateDebut: true,
        title: true,
        motif: true,
        patient: {
          select: {
            id: true,
            dossierNumber: true,
            user: { select: { fullName: true } },
          },
        },
      },
      orderBy: { dateDebut: 'asc' },
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
      devisSansReponse: devisSansReponseCount,
      rdvAConfirmer: rdvAConfirmerCount,
      logistique: logistiqueCount,
      notifications: notifUnread,
    },
    devisATraiter,
    devisSansReponse: devisSansReponse.map((d) => ({
      id: d.id,
      numeroDevis: d.numeroDevis,
      updatedAt: d.updatedAt.toISOString(),
      patientId: d.patient.id,
      dossierNumber: d.patient.dossierNumber,
      fullName: d.patient.user.fullName,
    })),
    rdvAConfirmer: rdvAConfirmer.map((e) => ({
      id: e.id,
      dateDebut: e.dateDebut.toISOString(),
      title: e.title ?? e.motif ?? 'RDV',
      patientId: e.patient?.id ?? null,
      dossierNumber: e.patient?.dossierNumber ?? null,
      fullName: e.patient?.user.fullName ?? 'Patient',
    })),
    patientsLogistique,
    funnel: funnelData,
  }
}

export async function getPatients(search?: string, status?: string) {
  const statusWhere = buildPatientStatusWhere(status, 'gestionnaire')
  const [patients, counts] = await Promise.all([
    prisma.patient.findMany({
      where: {
        ...statusWhere,
        ...(search
          ? {
              OR: [
                { user: { fullName: { contains: search, mode: 'insensitive' } } },
                { user: { email: { contains: search, mode: 'insensitive' } } },
                { dossierNumber: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { devis: { some: { deletedAt: null, numeroDevis: { contains: search, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      include: patientListInclude,
      orderBy: { updatedAt: 'desc' },
    }),
    countDossierBuckets('gestionnaire'),
  ])

  await Promise.all(
    patients
      .filter((p) => p.devis?.[0]?.numeroDevis)
      .map((p) => syncPatientDossierFromDevis(prisma, p.id, p.devis![0].numeroDevis!)),
  )

  return { patients: patients.map(mapPatientListRow), counts }
}

export async function getPatientById(patientId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      user: { select: { id: true, fullName: true, email: true, createdAt: true } },
      formulaires: { orderBy: { createdAt: 'desc' } },
      devis: { where: devisActiveWhere, orderBy: { dateCreation: 'desc' } },
      rapports: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')
  const numeroDevis = patient.devis[0]?.numeroDevis
  if (numeroDevis) {
    await syncPatientDossierFromDevis(prisma, patientId, numeroDevis)
  }
  return {
    patient: mapPatientListRow({
      ...patient,
      dossierNumber: resolvePatientReference(patient.dossierNumber, numeroDevis),
    }),
  }
}

function assertPatientReadyForDevis(status: string) {
  const ok = ['rapport_genere', 'rapport_modifie', 'devis_preparation', 'devis_envoye', 'devis_accepte'].includes(status)
  if (!ok) {
    throw new AppError(400, 'PATIENT_NOT_READY', 'Le dossier patient n’est pas prêt pour un devis.')
  }
}

async function getTemplateMap() {
  const logs = await prisma.auditLog.findMany({
    where: { entity: 'communication_template' },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const map = {} as Record<TemplateKey, TemplateRecord>
  for (const key of TEMPLATE_KEYS) {
    map[key] = {
      ...DEFAULT_TEMPLATES[key],
      updatedAt: new Date(0).toISOString(),
      updatedBy: 'Système',
    }
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

/** Accusé de réception formulaire — applique le template Communication. */
export async function dispatchFormulaireAck(input: {
  patientId: string
  patientUserId: string
  patientFullName: string
}) {
  const templates = await getTemplateMap()
  const template = templates.formulaireAck
  if (!template.active) return

  let gestionnaireId: string | undefined
  if (template.channel === 'chat' || template.channel === 'both') {
    const g = await prisma.user.findFirst({
      where: { role: 'gestionnaire' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    gestionnaireId = g?.id
  }

  const effective: TemplateRecord =
    (template.channel === 'chat' || template.channel === 'both') && !gestionnaireId
      ? { ...template, channel: 'notification' }
      : template

  if (effective.channel === 'chat' && !gestionnaireId) return

  await dispatchTemplateMessage({
    template: effective,
    patientId: input.patientId,
    patientUserId: input.patientUserId,
    patientFullName: input.patientFullName,
    gestionnaireId: gestionnaireId ?? input.patientUserId,
    notifTitle: 'Formulaire bien reçu',
    notifLink: '/patient/dossier',
  })
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
    await createUserNotification({
      userId: input.patientUserId,
      type: 'info',
      titre: input.notifTitle,
      message: content,
      lienAction: input.notifLink,
      kind: 'system',
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
    where: { patientId, statut: 'brouillon', ...devisActiveWhere },
    orderBy: { dateCreation: 'desc' },
  })

  let devis
  if (draft) {
    const updateData: Parameters<typeof prisma.devis.update>[0]['data'] = {
      gestionnaireId,
      lignes: lignesJson,
      total: input.total,
      planningMedical: input.planningMedical ?? null,
      notesSejour: input.notesSejour ?? null,
      currency: input.currency ?? 'EUR',
      ...(dateValidite ? { dateValidite } : {}),
    }
    if (!draft.numeroDevis) {
      updateData.numeroDevis = await generateNextDevisNumber(prisma)
    }
    devis = await prisma.devis.update({
      where: { id: draft.id },
      data: updateData,
    })
    if (updateData.numeroDevis && typeof updateData.numeroDevis === 'string') {
      await syncPatientDossierFromDevis(prisma, patientId, updateData.numeroDevis)
    }
  } else {
    const last = await prisma.devis.findFirst({
      where: { patientId, ...devisActiveWhere },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    const version = (last?.version ?? 0) + 1
    devis = await assignNumeroDevisWithRetry({
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
    })

    const patientProfile = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { dossierNumber: true, user: { select: { fullName: true } } },
    })
    if (patientProfile) {
      const ref = devis.numeroDevis ?? patientProfile.dossierNumber
      await notifyGestionnaires({
        type: 'success',
        titre: 'Devis généré',
        message: `Un devis a été généré pour ${patientProfile.user.fullName} (${ref}) — total ${input.total} ${input.currency ?? 'EUR'}.`,
        lienAction: `/gestionnaire/devis/${patientId}`,
      })
    }
  }

  if (['rapport_genere', 'rapport_modifie', 'devis_preparation'].includes(patient.status)) {
    await prisma.patient.update({
      where: { id: patientId },
      data: { status: 'devis_preparation' },
    })
  }

  if (devis.numeroDevis) {
    await syncPatientDossierFromDevis(prisma, patientId, devis.numeroDevis)
  }

  return { devis }
}

export async function saveDevisCustomContent(gestionnaireId: string, devisId: string, content: string) {
  const devis = await prisma.devis.findFirst({
    where: { id: devisId, deletedAt: null },
  })
  if (!devis) throw new AppError(404, 'DEVIS_NOT_FOUND', 'Devis introuvable.')

  // Tout gestionnaire peut personnaliser (plusieurs comptes sur le même cabinet)
  await prisma.devis.update({
    where: { id: devisId },
    data: {
      customContent: content,
      gestionnaireId,
    },
  })

  await prisma.auditLog.create({
    data: {
      actorId: gestionnaireId,
      actorRole: 'gestionnaire',
      action: 'update',
      entity: 'devis',
      entityId: devisId,
      after: { customContentSaved: true, length: content.length } as never,
    },
  }).catch(() => undefined)

  return { ok: true }
}

export async function sendDevis(gestionnaireId: string, devisId: string, html?: string) {
  const devis = await prisma.devis.findFirst({ where: { id: devisId, deletedAt: null } })
  if (!devis) throw new AppError(404, 'DEVIS_NOT_FOUND', 'Devis introuvable.')
  if (devis.gestionnaireId !== gestionnaireId) {
    throw new AppError(403, 'FORBIDDEN', 'Ce devis ne vous appartient pas.')
  }
  if (devis.statut !== 'brouillon') {
    throw new AppError(400, 'DEVIS_NOT_DRAFT', 'Seul un brouillon peut être envoyé.')
  }

  const patient = await prisma.patient.findUnique({
    where: { id: devis.patientId },
    include: { user: { select: { fullName: true, id: true, email: true } } },
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

  await notifyGestionnaires({
    type: 'success',
    titre: 'Devis envoyé au patient',
    message: `Le devis de ${patient.user.fullName} (${devis.numeroDevis ?? patient.dossierNumber}) a été envoyé.`,
    lienAction: `/gestionnaire/devis/${patient.id}`,
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

  // Email patient personnalisé (charte Centre Est) + lien espace
  if (patient.user.email?.trim()) {
    await sendDevisReadyEmail({
      to: patient.user.email,
      patientFullName: patient.user.fullName,
    })
  } else {
    console.warn('[sendDevis] Pas d’email patient — notification email ignorée', {
      patientId: patient.id,
    })
  }

  // PDF personnalisé (même HTML que « Exporter PDF ») → pièce jointe chat
  if (html?.trim()) {
    try {
      const pdfBuffer = await renderHtmlToPdf(html)
      const pieceJointeNom = formatDevisPdfFileName(
        devis.numeroDevis ?? patient.dossierNumber,
        patient.user.fullName,
        devis.version,
      )
      const diskSlug = pieceJointeNom
        .replace(/\.pdf$/i, '')
        .replace(/[^\w.-]+/g, '_')
        .slice(0, 80)
      const filename = `chat-${Date.now()}-${diskSlug || 'Devis'}.pdf`
      await mkdir(UPLOADS_DIR, { recursive: true })
      await writeFile(path.join(UPLOADS_DIR, filename), pdfBuffer)

      const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:4000'
      const pieceJointeUrl = `${baseUrl.replace(/\/$/, '')}/uploads/${filename}`

      await prisma.message.create({
        data: {
          patientId: patient.id,
          expediteurId: gestionnaireId,
          expediteurRole: 'gestionnaire',
          contenu: `Pièce jointe : ${pieceJointeNom}`,
          pieceJointeUrl,
          pieceJointeNom,
          lu: false,
        },
      })
    } catch (err) {
      console.error('[sendDevis] Échec génération PDF personnalisé:', err)
    }
  }

  await prisma.auditLog.create({
    data: {
      actorId: gestionnaireId,
      actorRole: 'gestionnaire',
      action: 'status_change',
      entity: 'devis',
      entityId: devisId,
      before: {
        statut: devis.statut,
        patientId: patient.id,
        patientStatus: patient.status,
        numeroDevis: devis.numeroDevis,
      } as never,
      after: {
        statut: updated.statut,
        patientId: patient.id,
        patientStatus: 'devis_envoye',
        numeroDevis: devis.numeroDevis,
      } as never,
    },
  }).catch(() => undefined)

  return { devis: updated }
}

/** Rappel chat + PDF de la dernière version envoyée (sans changer le statut devis). */
export async function sendDevisRappel(
  gestionnaireId: string,
  devisId: string,
  input: { contenu: string; html?: string },
) {
  const devis = await prisma.devis.findFirst({
    where: { id: devisId, deletedAt: null },
  })
  if (!devis) throw new AppError(404, 'DEVIS_NOT_FOUND', 'Devis introuvable.')
  if (devis.statut !== 'envoye' && devis.statut !== 'accepte') {
    throw new AppError(400, 'DEVIS_NOT_SENT', 'Le rappel n’est possible que pour un devis déjà envoyé.')
  }

  const contenu = input.contenu.trim()
  if (!contenu) throw new AppError(400, 'EMPTY_MESSAGE', 'Le message de rappel ne peut pas être vide.')

  const patient = await prisma.patient.findUnique({
    where: { id: devis.patientId },
    include: { user: { select: { fullName: true, id: true, email: true } } },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')

  await prisma.message.create({
    data: {
      patientId: patient.id,
      expediteurId: gestionnaireId,
      expediteurRole: 'gestionnaire',
      contenu,
      lu: false,
    },
  })

  let pdfAttached = false
  if (input.html?.trim()) {
    try {
      const pdfBuffer = await renderHtmlToPdf(input.html)
      const pieceJointeNom = formatDevisPdfFileName(
        devis.numeroDevis ?? patient.dossierNumber,
        patient.user.fullName,
        devis.version,
      )
      const diskSlug = pieceJointeNom
        .replace(/\.pdf$/i, '')
        .replace(/[^\w.-]+/g, '_')
        .slice(0, 80)
      const filename = `chat-${Date.now()}-${diskSlug || 'Devis'}.pdf`
      await mkdir(UPLOADS_DIR, { recursive: true })
      await writeFile(path.join(UPLOADS_DIR, filename), pdfBuffer)

      const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:4000'
      const pieceJointeUrl = `${baseUrl.replace(/\/$/, '')}/uploads/${filename}`

      await prisma.message.create({
        data: {
          patientId: patient.id,
          expediteurId: gestionnaireId,
          expediteurRole: 'gestionnaire',
          contenu: `Pièce jointe : ${pieceJointeNom}`,
          pieceJointeUrl,
          pieceJointeNom,
          lu: false,
        },
      })
      pdfAttached = true
    } catch (err) {
      console.error('[sendDevisRappel] Échec génération PDF:', err)
    }
  }

  await createUserNotification({
    userId: patient.userId,
    titre: 'Rappel concernant votre devis',
    message: 'L’équipe vous a renvoyé un message avec votre devis. Consultez la discussion.',
    type: 'info',
    lienAction: '/patient/chat',
  }).catch(() => undefined)

  if (patient.user.email?.trim()) {
    await sendDevisRappelEmail({
      to: patient.user.email,
      patientFullName: patient.user.fullName,
    })
  } else {
    console.warn('[sendDevisRappel] Pas d’email patient — notification email ignorée', {
      patientId: patient.id,
    })
  }

  return {
    ok: true as const,
    devisId: devis.id,
    numeroDevis: devis.numeroDevis,
    version: devis.version,
    pdfAttached,
  }
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

  await prisma.auditLog.create({
    data: {
      actorId: gestionnaireId,
      actorRole: 'gestionnaire',
      action: 'status_change',
      entity: 'devis',
      entityId: devisId,
      before: {
        statut: devis.statut,
        patientId: devis.patientId,
        numeroDevis: devis.numeroDevis,
      } as never,
      after: {
        statut: updated.statut,
        patientId: devis.patientId,
        numeroDevis: devis.numeroDevis,
        reason: reasonText || null,
      } as never,
    },
  }).catch(() => undefined)

  return { devis: updated }
}

export async function deleteDevis(gestionnaireId: string, devisId: string) {
  const devis = await prisma.devis.findFirst({
    where: { id: devisId, deletedAt: null },
    include: {
      patient: {
        include: { user: { select: { fullName: true } } },
      },
    },
  })
  if (!devis) throw new AppError(404, 'DEVIS_NOT_FOUND', 'Devis introuvable.')

  const pieceJointeNom = formatDevisPdfFileName(
    devis.numeroDevis ?? devis.patient.dossierNumber,
    devis.patient.user.fullName,
    devis.version,
  )

  await prisma.$transaction(async (tx) => {
    // Uniquement la version sélectionnée
    await tx.devis.update({
      where: { id: devisId },
      data: { deletedAt: new Date() },
    })

    const [remaining, rapportsCount] = await Promise.all([
      tx.devis.findMany({
        where: { patientId: devis.patientId, deletedAt: null },
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
    else nextStatus = 'en_analyse'

    if (nextStatus !== devis.patient.status) {
      await tx.patient.update({
        where: { id: devis.patientId },
        data: { status: nextStatus },
      })
    }
  })

  // Chat : uniquement le PDF de CETTE version → « Message supprimé »
  await softDeleteDevisPdfMessages(devis.patientId, {
    numeroDevis: devis.numeroDevis,
    dossierNumber: devis.patient.dossierNumber,
    pieceJointeNom,
    version: devis.version,
    patientFullName: devis.patient.user.fullName,
  }).catch((err) => {
    console.error('[deleteDevis] Échec retrait PDF chat:', err)
  })

  await prisma.auditLog.create({
    data: {
      actorId: gestionnaireId,
      actorRole: 'gestionnaire',
      action: 'delete',
      entity: 'devis',
      entityId: devisId,
      before: {
        patientId: devis.patientId,
        statut: devis.statut,
        numeroDevis: devis.numeroDevis,
        version: devis.version,
        total: devis.total,
        softDelete: true,
        chatPdfRemoved: true,
      } as never,
    },
  }).catch(() => undefined)

  return { deleted: true as const, softDeleted: true as const }
}

/** Liste des devis soft-supprimés (archivage gestionnaire). */
export async function listDeletedDevis() {
  const rows = await prisma.devis.findMany({
    where: { deletedAt: { not: null } },
    include: {
      patient: {
        select: {
          id: true,
          dossierNumber: true,
          user: { select: { fullName: true, email: true } },
        },
      },
    },
    orderBy: { deletedAt: 'desc' },
  })

  return {
    devis: rows.map((d) => ({
      id: d.id,
      numeroDevis: d.numeroDevis,
      statut: d.statut,
      version: d.version,
      total: d.total,
      currency: d.currency,
      dateCreation: d.dateCreation.toISOString(),
      deletedAt: d.deletedAt!.toISOString(),
      patient: {
        id: d.patient.id,
        dossierNumber: d.patient.dossierNumber,
        fullName: d.patient.user.fullName,
        email: d.patient.user.email,
      },
    })),
  }
}

export async function deletePatientByGestionnaire(actorId: string, patientId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      user: { select: { id: true, fullName: true, email: true } },
    },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')

  await prisma.user.delete({ where: { id: patient.userId } })

  await prisma.auditLog.create({
    data: {
      actorId,
      actorRole: 'gestionnaire',
      action: 'delete',
      entity: 'patient',
      entityId: patientId,
      before: {
        dossierNumber: patient.dossierNumber,
        fullName: patient.user.fullName,
        email: patient.user.email,
      } as never,
    },
  }).catch(() => undefined)

  return { deleted: true as const }
}

export async function updatePatientStatus(actorId: string, patientId: string, input: UpdatePatientStatusInput) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } })
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

  await prisma.auditLog.create({
    data: {
      actorId,
      actorRole: 'gestionnaire',
      action: 'status_change',
      entity: 'patient',
      entityId: patientId,
      before: { status: patient.status } as never,
      after: { status: updated.status } as never,
    },
  }).catch(() => undefined)

  return { patient: updated }
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
        await createUserNotification({
          userId: med.id,
          type: 'info',
          titre: 'Logistique prête',
          message: `La logistique de ${patient.user.fullName} est prête. Le dossier est prêt pour l'étape intervention.`,
          lienAction: `/medecin/patients/${patientId}`,
          kind: 'system',
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

async function loadPlanningSejourContext(patientId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      user: { select: { fullName: true, email: true } },
      rapports: { orderBy: { createdAt: 'desc' }, take: 1 },
      devis: {
        where: { statut: { in: ['envoye', 'accepte'] }, deletedAt: null },
        orderBy: { dateCreation: 'desc' },
        take: 1,
      },
    },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')

  const log = await prisma.logistique.findUnique({ where: { patientId } })
  const rapport = patient.rapports[0] ?? null
  const devis = patient.devis[0] ?? null

  return {
    patient,
    rapport,
    devis,
    log,
    source: {
      fullName: patient.user.fullName,
      dossierNumber: patient.dossierNumber,
      ville: patient.ville,
      pays: patient.pays,
      phone: patient.phone,
      dateNaissance: patient.dateNaissance,
      rapport: rapport
        ? {
            interventionsRecommandees: rapport.interventionsRecommandees,
            nuitsClinique: rapport.nuitsClinique,
            notes: rapport.notes,
          }
        : null,
      devis: devis
        ? {
            numeroDevis: devis.numeroDevis,
            planningMedical: devis.planningMedical,
            notesSejour: devis.notesSejour,
          }
        : null,
      logistique: log
        ? {
            dateArrivee: log.dateArrivee,
            dateDepart: log.dateDepart,
            hebergement: log.hebergement,
            transport: log.transport,
            accompagnateur: log.accompagnateur,
            notesClinique: log.notesClinique,
          }
        : null,
    },
  }
}

export async function getPlanningSejourPatients() {
  const patients = await prisma.patient.findMany({
    where: { status: { in: [...PLANNING_SEJOUR_STATUSES] } },
    include: { user: { select: { fullName: true, email: true } } },
    orderBy: { updatedAt: 'desc' },
  })

  const rows = await prisma.planningSejour.findMany({
    where: { patientId: { in: patients.map((p) => p.id) } },
  })
  const map = new Map(rows.map((r) => [r.patientId, r]))

  return {
    patients: patients.map((p) => {
      const pl = map.get(p.id)
      return {
        id: p.id,
        dossierNumber: p.dossierNumber,
        status: p.status,
        ville: p.ville,
        pays: p.pays,
        user: p.user,
        planning: pl
          ? {
              id: pl.id,
              moisLabel: pl.moisLabel,
              statut: pl.statut,
              updatedAt: pl.updatedAt.toISOString(),
              hasContent: Boolean(pl.content?.trim()),
            }
          : null,
      }
    }),
  }
}

export async function getPlanningSejourDetail(patientId: string) {
  const ctx = await loadPlanningSejourContext(patientId)
  const row = await prisma.planningSejour.findUnique({ where: { patientId } })
  const moisDefault = moisLabelFromDate(ctx.log?.dateArrivee ?? null)

  return {
    patient: {
      id: ctx.patient.id,
      dossierNumber: ctx.patient.dossierNumber,
      status: ctx.patient.status,
      ville: ctx.patient.ville,
      pays: ctx.patient.pays,
      user: ctx.patient.user,
    },
    planning: row
      ? {
          id: row.id,
          content: row.content,
          moisLabel: row.moisLabel ?? moisDefault,
          statut: row.statut,
          updatedAt: row.updatedAt.toISOString(),
        }
      : null,
    moisLabelDefault: moisDefault,
    logistique: ctx.log
      ? {
          dateArrivee: ctx.log.dateArrivee?.toISOString().slice(0, 10) ?? null,
          dateDepart: ctx.log.dateDepart?.toISOString().slice(0, 10) ?? null,
          hebergement: ctx.log.hebergement ?? null,
          transport: ctx.log.transport ?? null,
          accompagnateur: ctx.log.accompagnateur ?? null,
        }
      : null,
  }
}

export async function generatePlanningSejour(gestionnaireId: string, patientId: string) {
  const ctx = await loadPlanningSejourContext(patientId)
  if (!PLANNING_SEJOUR_STATUSES.includes(ctx.patient.status as (typeof PLANNING_SEJOUR_STATUSES)[number])) {
    throw new AppError(400, 'PATIENT_STATUS', 'Le planning séjour est disponible après acceptation du devis.')
  }

  const moisLabel = moisLabelFromDate(ctx.log?.dateArrivee ?? null)
  const content = buildPlanningSejourHtml({ ...ctx.source, moisLabel })

  const row = await prisma.planningSejour.upsert({
    where: { patientId },
    update: { content, moisLabel, statut: 'brouillon' },
    create: { patientId, content, moisLabel, statut: 'brouillon' },
  })

  await prisma.auditLog.create({
    data: {
      actorId: gestionnaireId,
      actorRole: 'gestionnaire',
      action: 'create',
      entity: 'planning_sejour',
      entityId: row.id,
      after: { patientId, moisLabel } as never,
    },
  })

  return {
    planning: {
      id: row.id,
      content: row.content,
      moisLabel: row.moisLabel,
      statut: row.statut,
      updatedAt: row.updatedAt.toISOString(),
    },
  }
}

export async function upsertPlanningSejour(
  gestionnaireId: string,
  patientId: string,
  input: PlanningSejourInput
) {
  const ctx = await loadPlanningSejourContext(patientId)
  if (!PLANNING_SEJOUR_STATUSES.includes(ctx.patient.status as (typeof PLANNING_SEJOUR_STATUSES)[number])) {
    throw new AppError(400, 'PATIENT_STATUS', 'Le planning séjour est disponible après acceptation du devis.')
  }

  const existing = await prisma.planningSejour.findUnique({ where: { patientId } })
  const moisLabel =
    input.moisLabel !== undefined && input.moisLabel !== null
      ? input.moisLabel
      : (existing?.moisLabel ?? moisLabelFromDate(ctx.log?.dateArrivee ?? null))

  const row = await prisma.planningSejour.upsert({
    where: { patientId },
    update: {
      ...(input.content !== undefined ? { content: input.content } : {}),
      moisLabel,
      ...(input.statut ? { statut: input.statut } : {}),
    },
    create: {
      patientId,
      content: input.content ?? '',
      moisLabel,
      statut: input.statut ?? 'brouillon',
    },
  })

  await prisma.auditLog.create({
    data: {
      actorId: gestionnaireId,
      actorRole: 'gestionnaire',
      action: 'update',
      entity: 'planning_sejour',
      entityId: row.id,
      after: { patientId, statut: row.statut } as never,
    },
  })

  // Publier vers la patiente quand le planning passe en finalisé
  const justFinalised = row.statut === 'finalise' && existing?.statut !== 'finalise'
  if (justFinalised) {
    await createUserNotification({
      userId: ctx.patient.userId,
      type: 'success',
      titre: 'Votre planning de séjour est prêt',
      message: 'Consultez le détail de votre séjour (itinéraire, hébergement, dates).',
      lienAction: '/patient/planning-sejour',
      kind: 'system',
    }).catch(() => undefined)
  }

  return {
    planning: {
      id: row.id,
      content: row.content,
      moisLabel: row.moisLabel,
      statut: row.statut,
      updatedAt: row.updatedAt.toISOString(),
    },
  }
}

export async function deletePlanningSejour(gestionnaireId: string, patientId: string) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')

  const existing = await prisma.planningSejour.findUnique({ where: { patientId } })
  if (!existing) {
    throw new AppError(404, 'PLANNING_NOT_FOUND', 'Aucun planning séjour enregistré pour cette patiente.')
  }

  await prisma.planningSejour.delete({ where: { patientId } })

  await prisma.auditLog.create({
    data: {
      actorId: gestionnaireId,
      actorRole: 'gestionnaire',
      action: 'delete',
      entity: 'planning_sejour',
      entityId: existing.id,
      before: { patientId, moisLabel: existing.moisLabel, statut: existing.statut } as never,
    },
  })

  return { ok: true as const }
}

export async function getCommunicationTemplates() {
  const map = await getTemplateMap()
  return { templates: TEMPLATE_KEYS.map((key) => map[key]) }
}

export async function updateCommunicationTemplate(userId: string, key: TemplateKey, input: UpdateTemplateInput) {
  if (!TEMPLATE_KEYS.includes(key)) {
    throw new AppError(400, 'INVALID_TEMPLATE', 'Template inconnu.')
  }
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
    let dossierNumber = await generateNextMcReference(prisma)
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
          dossierNumber = await generateNextMcReference(prisma)
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
      await notifyMedecinsFormulaire({
        type: 'info',
        titre: 'Formulaire patient soumis',
        message: `${user.fullName} (${patient.dossierNumber}) a un formulaire médical prêt à traiter.`,
        lienAction: '/medecin/patients',
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

export async function updateUserByGestionnaire(actorId: string, userId: string, input: UpdateUserByGestionnaireInput) {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, email: true, role: true },
  })
  if (!existing) throw new AppError(404, 'USER_NOT_FOUND', 'Compte introuvable.')
  if (existing.id === actorId) {
    throw new AppError(400, 'SELF_UPDATE_FORBIDDEN', 'Utilisez votre espace profil pour modifier votre propre compte.')
  }

  if (input.email && input.email.toLowerCase() !== existing.email.toLowerCase()) {
    const emailTaken = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      select: { id: true },
    })
    if (emailTaken) throw new AppError(409, 'EMAIL_TAKEN', 'Un compte existe déjà avec cet email.')
  }

  const data: { fullName?: string; email?: string; passwordHash?: string } = {}
  if (input.fullName) data.fullName = input.fullName.trim()
  if (input.email) data.email = input.email.trim().toLowerCase()
  if (input.password) data.passwordHash = await bcrypt.hash(input.password, 12)

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, fullName: true, email: true, role: true },
  })

  await prisma.auditLog.create({
    data: {
      actorId,
      actorRole: 'gestionnaire',
      action: 'update',
      entity: 'user',
      entityId: updated.id,
      before: { fullName: existing.fullName, email: existing.email, role: existing.role } as never,
      after: { fullName: updated.fullName, email: updated.email, role: updated.role } as never,
    },
  })

  return { user: updated }
}

export async function deleteUserByGestionnaire(actorId: string, userId: string) {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    include: { patient: { select: { dossierNumber: true } } },
  })
  if (!existing) throw new AppError(404, 'USER_NOT_FOUND', 'Compte introuvable.')
  if (existing.id === actorId) {
    throw new AppError(400, 'SELF_DELETE_FORBIDDEN', 'Vous ne pouvez pas supprimer votre propre compte.')
  }

  if (existing.role === 'gestionnaire') {
    const totalGestionnaires = await prisma.user.count({ where: { role: 'gestionnaire' } })
    if (totalGestionnaires <= 1) {
      throw new AppError(400, 'LAST_GESTIONNAIRE', 'Impossible de supprimer le dernier compte gestionnaire.')
    }
  }

  if (existing.role === 'medecin') {
    const totalMedecins = await prisma.user.count({ where: { role: 'medecin' } })
    if (totalMedecins <= 1) {
      throw new AppError(400, 'LAST_MEDECIN', 'Impossible de supprimer le dernier compte médecin.')
    }
  }

  await prisma.user.delete({ where: { id: userId } })

  await prisma.auditLog.create({
    data: {
      actorId,
      actorRole: 'gestionnaire',
      action: 'delete',
      entity: 'user',
      entityId: userId,
      before: {
        fullName: existing.fullName,
        email: existing.email,
        role: existing.role,
        dossierNumber: existing.patient?.dossierNumber ?? null,
      } as never,
    },
  })

  return { deleted: true as const }
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
      heureFin: `${e.dateFin.getHours().toString().padStart(2, '0')}:${e.dateFin.getMinutes().toString().padStart(2, '0')}`,
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
  void googleCalendar.pushEventToGoogle(event.id)
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
  void googleCalendar.pushEventToGoogle(event.id)
  return { event }
}

export async function deleteAgendaEventByGestionnaire(actorId: string, eventId: string) {
  const existing = await prisma.agendaEvent.findUnique({ where: { id: eventId } })
  if (!existing) throw new AppError(404, 'EVENT_NOT_FOUND', 'Événement introuvable.')
  void googleCalendar.deleteEventFromGoogle(existing.medecinId, existing.googleEventId)
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

const AUDIT_ENTITIES = ['devis', 'patient', 'message'] as const

export async function listAuditLogs(input?: {
  entity?: string
  action?: string
  limit?: number
}) {
  const limit = Math.min(Math.max(input?.limit ?? 80, 1), 200)
  const entity = input?.entity?.trim()
  const action = input?.action?.trim()

  const logs = await prisma.auditLog.findMany({
    where: {
      entity: entity && AUDIT_ENTITIES.includes(entity as (typeof AUDIT_ENTITIES)[number])
        ? entity
        : { in: [...AUDIT_ENTITIES] },
      ...(action
        ? { action: action as 'create' | 'update' | 'delete' | 'status_change' }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  const actorIds = [...new Set(logs.map((l) => l.actorId))]
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, fullName: true, role: true },
      })
    : []
  const actorMap = new Map(actors.map((a) => [a.id, a]))

  return {
    logs: logs.map((l) => {
      const actor = actorMap.get(l.actorId)
      return {
        id: l.id,
        action: l.action,
        entity: l.entity,
        entityId: l.entityId,
        before: l.before,
        after: l.after,
        createdAt: l.createdAt.toISOString(),
        actor: {
          id: l.actorId,
          role: l.actorRole,
          fullName: actor?.fullName ?? 'Utilisateur inconnu',
        },
      }
    }),
  }
}
