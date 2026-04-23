import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/errorHandler.js'
import type { FormulaireSubmitInput, UpdateProfilInput, RepondreDevisInput, RepondreRendezVousInput } from './patient.schema.js'

const RDV_PATIENT_ACCEPTED_TAG = 'PATIENT_DECISION:ACCEPTE'
const RDV_PATIENT_RESCHEDULE_TAG = 'PATIENT_DECISION:AUTRE_DATE'
const RDV_PATIENT_MESSAGE_TAG = 'PATIENT_MESSAGE:'

function stripPatientDecisionMeta(notes: string | null | undefined) {
  if (!notes) return ''
  return notes
    .split('\n')
    .filter((line) =>
      !line.startsWith(RDV_PATIENT_ACCEPTED_TAG) &&
      !line.startsWith(RDV_PATIENT_RESCHEDULE_TAG) &&
      !line.startsWith(RDV_PATIENT_MESSAGE_TAG)
    )
    .join('\n')
    .trim()
}

function buildRdvNotes(baseNotes: string, decision: RepondreRendezVousInput['decision'], message?: string) {
  const meta = decision === 'accepter' ? RDV_PATIENT_ACCEPTED_TAG : RDV_PATIENT_RESCHEDULE_TAG
  const lines = [baseNotes, meta]
  if (message?.trim()) lines.push(`${RDV_PATIENT_MESSAGE_TAG}${message.trim()}`)
  return lines.filter(Boolean).join('\n')
}

function extractPatientDecision(notes: string | null | undefined): {
  patientDecision: 'accepte' | 'autre_date' | null
  patientDecisionMessage: string | null
} {
  if (!notes) return { patientDecision: null, patientDecisionMessage: null }
  const patientDecision = notes.includes(RDV_PATIENT_ACCEPTED_TAG)
    ? 'accepte'
    : notes.includes(RDV_PATIENT_RESCHEDULE_TAG)
      ? 'autre_date'
      : null
  const messageLine = notes
    .split('\n')
    .find((line) => line.startsWith(RDV_PATIENT_MESSAGE_TAG))
  return {
    patientDecision,
    patientDecisionMessage: messageLine ? messageLine.replace(RDV_PATIENT_MESSAGE_TAG, '').trim() || null : null,
  }
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

async function syncPostOpReminders(patientId: string, userId: string, dateIntervention: Date) {
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
        data: {
          userId,
          type: 'info',
          titre,
          message,
          lienAction: '/patient/post-op',
        },
      })
    }
  }
}

// ─── Formulaire ───────────────────────────────────────────────────────────────

export async function upsertFormulaire(userId: string, input: FormulaireSubmitInput) {
  const patient = await prisma.patient.findUnique({ where: { userId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Profil patient introuvable.')

  // S'il existe un formulaire draft, on le met à jour — sinon on en crée un
  const existing = await prisma.formulaire.findFirst({
    where: { patientId: patient.id, status: 'draft' },
    orderBy: { createdAt: 'desc' },
  })

  const data = {
    status: input.status,
    payload: input.payload as never,
    submittedAt: input.status === 'submitted' ? new Date() : null,
  }

  let formulaire
  if (existing) {
    formulaire = await prisma.formulaire.update({
      where: { id: existing.id },
      data,
    })
  } else {
    formulaire = await prisma.formulaire.create({
      data: { patientId: patient.id, ...data },
    })
  }

  // Mettre à jour le statut du dossier patient si soumis
  if (input.status === 'submitted') {
    const payloadObj = input.payload as Record<string, unknown>
    const rawSrc = payloadObj.sourceContact
    const allowed = new Set(['facebook', 'instagram', 'radio', 'tv', 'amie', 'autre'])
    const t = typeof rawSrc === 'string' ? rawSrc.trim() : ''
    const src = t && allowed.has(t) ? t : undefined

    await prisma.patient.update({
      where: { id: patient.id },
      data: {
        status: 'formulaire_complete',
        ...(src ? { sourceContact: src } : {}),
      },
    })
    const patientProfile = await prisma.patient.findUnique({
      where: { id: patient.id },
      select: { dossierNumber: true, user: { select: { fullName: true } } },
    })
    if (patientProfile) {
      await notifyGestionnaires({
        type: 'info',
        titre: 'Nouveau formulaire patient soumis',
        message: `${patientProfile.user.fullName} (${patientProfile.dossierNumber}) a soumis son formulaire médical.`,
        lienAction: '/gestionnaire/patients',
      })
    }
  } else if (patient.status === 'nouveau') {
    await prisma.patient.update({
      where: { id: patient.id },
      data: { status: 'formulaire_en_cours' },
    })
  }

  return { formulaire }
}

export async function getLatestFormulaire(userId: string) {
  const patient = await prisma.patient.findUnique({ where: { userId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Profil patient introuvable.')

  const formulaire = await prisma.formulaire.findFirst({
    where: { patientId: patient.id },
    orderBy: { createdAt: 'desc' },
  })

  return { formulaire }
}

// ─── Profil ───────────────────────────────────────────────────────────────────

export async function updateProfil(userId: string, input: UpdateProfilInput) {
  const patient = await prisma.patient.findUnique({ where: { userId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Profil patient introuvable.')

  const updated = await prisma.patient.update({
    where: { id: patient.id },
    data: {
      ...(input.phone      !== undefined && { phone: input.phone }),
      ...(input.nationalite !== undefined && { nationalite: input.nationalite }),
      ...(input.ville      !== undefined && { ville: input.ville }),
      ...(input.pays       !== undefined && { pays: input.pays }),
    },
  })
  return { patient: updated }
}

// ─── Devis ────────────────────────────────────────────────────────────────────

export async function getDevis(userId: string) {
  const patient = await prisma.patient.findUnique({ where: { userId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Profil patient introuvable.')

  const devis = await prisma.devis.findMany({
    where: { patientId: patient.id },
    orderBy: { dateCreation: 'desc' },
  })
  return { devis }
}

export async function enregistrerConsultationDevis(userId: string, devisId: string) {
  const patient = await prisma.patient.findUnique({ where: { userId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Profil patient introuvable.')

  const devis = await prisma.devis.findFirst({
    where: { id: devisId, patientId: patient.id },
  })
  if (!devis) throw new AppError(404, 'DEVIS_NOT_FOUND', 'Devis introuvable.')
  if (devis.statut !== 'envoye' || devis.vuParPatientAt) {
    return { devis }
  }

  const updated = await prisma.devis.update({
    where: { id: devisId },
    data: { vuParPatientAt: new Date() },
  })

  const patientProfile = await prisma.patient.findUnique({
    where: { id: patient.id },
    select: { dossierNumber: true, user: { select: { fullName: true } } },
  })
  if (patientProfile) {
    await notifyGestionnaires({
      type: 'info',
      titre: 'Devis consulté par le patient',
      message: `${patientProfile.user.fullName} (${patientProfile.dossierNumber}) a consulté son devis (id ${devisId}).`,
      lienAction: '/gestionnaire/devis',
    })
  }

  return { devis: updated }
}

export async function repondreDevis(userId: string, devisId: string, input: RepondreDevisInput) {
  const patient = await prisma.patient.findUnique({ where: { userId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Profil patient introuvable.')

  const devis = await prisma.devis.findFirst({
    where: { id: devisId, patientId: patient.id },
  })
  if (!devis) throw new AppError(404, 'DEVIS_NOT_FOUND', 'Devis introuvable.')
  if (devis.statut !== 'envoye') {
    throw new AppError(400, 'DEVIS_NOT_PENDING', 'Ce devis ne peut plus être modifié.')
  }

  const updated = await prisma.devis.update({
    where: { id: devisId },
    data: { statut: input.reponse },
  })

  // Mettre à jour le statut du dossier
  await prisma.patient.update({
    where: { id: patient.id },
    data: { status: input.reponse === 'accepte' ? 'devis_accepte' : 'formulaire_complete' },
  })

  const patientProfile = await prisma.patient.findUnique({
    where: { id: patient.id },
    select: { dossierNumber: true, user: { select: { fullName: true } } },
  })
  if (patientProfile) {
    const accepted = input.reponse === 'accepte'
    await notifyGestionnaires({
      type: accepted ? 'success' : 'warning',
      titre: accepted ? 'Devis accepté par le patient' : 'Devis refusé par le patient',
      message: `${patientProfile.user.fullName} (${patientProfile.dossierNumber}) a ${accepted ? 'accepté' : 'refusé'} son devis.`,
      lienAction: '/gestionnaire/devis',
    })
  }

  return { devis: updated }
}

// ─── Rendez-vous ──────────────────────────────────────────────────────────────

export async function getRendezVous(userId: string) {
  const patient = await prisma.patient.findUnique({ where: { userId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Profil patient introuvable.')

  const events = await prisma.agendaEvent.findMany({
    where: { patientId: patient.id, type: 'rdv' },
    orderBy: { dateDebut: 'asc' },
  })

  // Transformer en format normalisé attendu côté frontend
  const rendezvous = events.map((e) => ({
    ...extractPatientDecision(e.notes),
    id:     e.id,
    date:   e.dateDebut.toISOString(),
    heure:  `${e.dateDebut.getHours().toString().padStart(2, '0')}:${e.dateDebut.getMinutes().toString().padStart(2, '0')}`,
    type:   e.title ?? 'RDV',
    motif:  e.motif ?? null,
    notes:  e.notes ?? null,
    statut: (e.statut ?? 'planifie') as 'planifie' | 'confirme' | 'annule',
    createdAt: e.createdAt.toISOString(),
  }))

  return { rendezvous }
}

export async function getAvailableSlots(userId: string) {
  const patient = await prisma.patient.findUnique({ where: { userId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Profil patient introuvable.')

  // Politique clinique: la patiente ne réserve pas elle-même les RDV de chirurgie.
  // La planification est effectuée par la gestionnaire / le médecin.
  return {
    slots: [] as Array<{ date: string; slots: string[] }>,
    canBook: false,
    reason: 'La prise de rendez-vous chirurgie est planifiée par la clinique. Notre gestionnaire vous contactera avec une proposition.',
  }
}

export async function reserveRendezVous(userId: string, input: { date: string; heure: string }) {
  const patient = await prisma.patient.findUnique({ where: { userId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Profil patient introuvable.')
  throw new AppError(
    403,
    'BOOKING_MANAGED_BY_CLINIC',
    'La prise de rendez-vous chirurgie est gérée par la clinique. Merci de contacter la gestionnaire.'
  )
}

export async function repondreRendezVous(userId: string, rdvId: string, input: RepondreRendezVousInput) {
  const patient = await prisma.patient.findUnique({
    where: { userId },
    include: { user: { select: { fullName: true } } },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Profil patient introuvable.')

  const rdv = await prisma.agendaEvent.findFirst({
    where: { id: rdvId, patientId: patient.id, type: 'rdv' },
  })
  if (!rdv) throw new AppError(404, 'RDV_NOT_FOUND', 'Rendez-vous introuvable.')
  if (rdv.statut === 'annule') throw new AppError(400, 'RDV_CANCELLED', 'Ce rendez-vous est annulé.')

  const baseNotes = stripPatientDecisionMeta(rdv.notes)
  const nextNotes = buildRdvNotes(baseNotes, input.decision, input.message)

  const updated = await prisma.agendaEvent.update({
    where: { id: rdv.id },
    data: { notes: nextNotes },
  })

  if (input.decision === 'accepter') {
    await prisma.patient.update({
      where: { id: patient.id },
      data: { status: 'date_reservee' },
    })
    await notifyGestionnaires({
      type: 'success',
      titre: 'Date de RDV acceptée par le patient',
      message: `${patient.user.fullName} (${patient.dossierNumber}) a accepté la date proposée. Merci de confirmer dans l'agenda.`,
      lienAction: '/gestionnaire/agenda',
    })
  } else {
    await notifyGestionnaires({
      type: 'warning',
      titre: 'Demande de nouvelle date de RDV',
      message: `${patient.user.fullName} (${patient.dossierNumber}) demande une autre date.${input.message?.trim() ? ` Motif: ${input.message.trim()}` : ''}`,
      lienAction: '/gestionnaire/agenda',
    })
  }

  return {
    rdv: {
      ...extractPatientDecision(updated.notes),
      id: updated.id,
      date: updated.dateDebut.toISOString(),
      heure: `${updated.dateDebut.getHours().toString().padStart(2, '0')}:${updated.dateDebut.getMinutes().toString().padStart(2, '0')}`,
      type: updated.title ?? 'RDV',
      motif: updated.motif ?? null,
      notes: updated.notes ?? null,
      statut: (updated.statut ?? 'planifie') as 'planifie' | 'confirme' | 'annule',
      createdAt: updated.createdAt.toISOString(),
    },
  }
}

// ─── Suivi Post-Op ────────────────────────────────────────────────────────────

export async function getMyPostOp(userId: string) {
  const patient = await prisma.patient.findUnique({ where: { userId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Profil patient introuvable.')
  const suivi = await prisma.suiviPostOp.findUnique({ where: { patientId: patient.id } })
  if (suivi) {
    await syncPostOpReminders(patient.id, patient.userId, suivi.dateIntervention)
  }
  return { suivi, patient: { id: patient.id, status: patient.status } }
}

export async function submitQuestionnaire(userId: string, input: { note: number; commentaire?: string }) {
  const patient = await prisma.patient.findUnique({ where: { userId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Profil patient introuvable.')

  const suivi = await prisma.suiviPostOp.findUnique({ where: { patientId: patient.id } })
  if (!suivi) throw new AppError(404, 'SUIVI_NOT_FOUND', 'Suivi post-opératoire introuvable.')

  const questionnaire = {
    note: input.note,
    commentaire: input.commentaire ?? null,
    reponduAt: new Date().toISOString(),
  }
  const updated = await prisma.suiviPostOp.update({
    where: { patientId: patient.id },
    data: { questionnaire },
  })
  return { suivi: updated }
}

export async function addMyPostOpPhoto(userId: string, photo: { url: string; note?: string }) {
  const patient = await prisma.patient.findUnique({ where: { userId } })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Profil patient introuvable.')

  const suivi = await prisma.suiviPostOp.findUnique({ where: { patientId: patient.id } })
  if (!suivi) throw new AppError(404, 'SUIVI_NOT_FOUND', 'Suivi post-opératoire introuvable.')

  type Photo = { url: string; note?: string; date: string }
  const photos = (suivi.photos as Photo[]) ?? []
  photos.push({ url: photo.url, note: photo.note, date: new Date().toISOString() })

  const updated = await prisma.suiviPostOp.update({
    where: { patientId: patient.id },
    data: { photos },
  })
  return { suivi: updated }
}

// ─── Dossier complet ──────────────────────────────────────────────────────────

export async function getMyDossier(userId: string) {
  const patient = await prisma.patient.findUnique({
    where: { userId },
    include: {
      formulaires: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      devis: {
        orderBy: { dateCreation: 'desc' },
        take: 1,
      },
      agendaEvents: {
        where: { type: 'rdv', dateDebut: { gte: new Date() } },
        orderBy: { dateDebut: 'asc' },
        take: 3,
      },
    },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Profil patient introuvable.')

  return { patient }
}
