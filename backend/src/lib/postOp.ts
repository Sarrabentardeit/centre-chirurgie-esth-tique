import { randomUUID } from 'node:crypto'
import type { SuiviPostOp } from '@prisma/client'
import { prisma } from './prisma.js'
import { AppError } from '../middleware/errorHandler.js'
import { createUserNotification } from './userNotifications.js'
import { notifyStaff } from './staffNotifications.js'
import { formatAgendaSlot } from './agendaTime.js'
import { buildWhatsAppClickToChatUrl, toWhatsAppDigits, publicAppBaseUrl } from './whatsappDevis.js'

export type StaffRole = 'medecin' | 'gestionnaire'

export type PostOpDemande = {
  id: string
  message: string
  createdAt: string
  reponse?: string | null
  reponseAt?: string | null
  reponseParRole?: StaffRole | null
  reponsePar?: string | null
}

export type PostOpNoteInterne = {
  id: string
  type: 'deroulement' | 'depense'
  texte: string
  /** Écart de coût en TND : positif = dépense supplémentaire, négatif = économie. */
  montant: number | null
  auteur: string
  auteurRole: StaffRole
  createdAt: string
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

/** Suivi tel que vu par la patiente : les notes internes du back-office ne sont jamais exposées. */
export function toPatientSuivi(suivi: SuiviPostOp | null) {
  if (!suivi) return null
  const { notesInternes: _notes, clotureRemarques: _remarques, cloturePar: _par, ...rest } = suivi
  return rest
}

async function buildRetourWhatsappUrl(phone: string | null | undefined, text: string) {
  const digits = toWhatsAppDigits(phone)
  if (!digits) return null
  return buildWhatsAppClickToChatUrl(digits, `${text}\n\nVotre suivi : ${publicAppBaseUrl()}/patient/post-op`)
}

/** Lien WhatsApp du message de retour (message par défaut ou texte fourni). */
export async function getRetourWhatsapp(patientId: string, message?: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { user: { select: { fullName: true } } },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')
  const text = message?.trim() || buildPostOpRetourMessage(patient.user.fullName)
  const whatsappUrl = await buildRetourWhatsappUrl(patient.phone, text)
  return { whatsappUrl, hasPhone: Boolean(whatsappUrl) }
}

export function buildPostOpRetourMessage(_patientFullName: string): string {
  return [
    'Bonjour Madame,',
    '',
    'J’espère que vous êtes bien rentrée chez vous et que votre retour s’est déroulé dans les meilleures conditions.',
    '',
    'Ce fut un réel plaisir de vous accueillir en Tunisie pour votre séjour médical avec le Dr CHENNOUFI. Toute l’équipe et moi-même vous remercions sincèrement pour votre confiance.',
    '',
    'Afin de poursuivre notre accompagnement après votre retour, nous souhaitons vous rappeler que vous bénéficiez d’un suivi post-opératoire à distance, entièrement gratuit pendant 6 mois.',
    '',
    '1. Votre suivi post-opératoire',
    '',
    'Ce suivi nous permet de rester à vos côtés tout au long de votre convalescence et de suivre l’évolution de votre résultat, en lien avec les recommandations du Dr CHENNOUFI.',
    '',
    'Nous vous invitons notamment à nous transmettre des photos de votre évolution à J+15 et J+30, puis selon les besoins et les indications qui vous seront communiqués.',
    '',
    'N’hésitez pas également à nous contacter durant cette période si vous avez des questions.',
    '',
    '2. Votre avis sur votre expérience',
    '',
    'Nous aimerions également prendre quelques instants pour recueillir votre retour d’expérience.',
    '',
    'Au-delà du résultat de votre intervention, nous serions heureux de connaître votre ressenti sur l’ensemble de votre parcours : la préparation de votre séjour, votre accueil en Tunisie, l’accompagnement et la coordination, votre prise en charge médicale, votre séjour ainsi que la qualité des prestations proposées.',
    '',
    'Votre retour nous permet de mieux comprendre l’expérience vécue par nos patientes et de continuer à faire évoluer notre accompagnement.',
    '',
    '3. Votre témoignage',
    '',
    'Si vous souhaitez aller plus loin et partager votre expérience, plusieurs possibilités s’offrent à vous, selon ce qui vous correspond le mieux.',
    '',
    '⭐ Vous pouvez laisser un avis Google afin de partager publiquement votre expérience avec le Dr CHENNOUFI et notre équipe.',
    '',
    '🎥 Vous pouvez également participer, si vous le souhaitez, à notre rubrique « Témoignages patients », publiée sur le compte Instagram du Dr CHENNOUFI.',
    '',
    'Le témoignage peut prendre différentes formes : vidéo, photo, texte écrit ou témoignage anonyme. Vous êtes naturellement libre de choisir le format avec lequel vous êtes le plus à l’aise.',
    '',
    'Que vous choisissiez simplement de nous faire part de votre retour en privé ou de partager votre expérience publiquement, nous vous remercions par avance pour le temps que vous nous accorderez.',
    '',
    'Nous restons bien entendu à votre disposition pendant toute la durée de votre suivi.',
    '',
    'Prenez bien soin de vous et nous vous souhaitons une excellente convalescence.',
    '',
    'Bien cordialement,',
    'Houda Chennoufi',
    'Conciergerie & Coordination Patients',
    'Cabinet du Dr Mehdi Chennoufi',
    'Chirurgie Esthétique, Plastique et Réparatrice',
    'SCULPTURE, SMOOTH & SMILE',
  ].join('\n')
}

async function loadSuiviOrThrow(patientId: string): Promise<SuiviPostOp> {
  const suivi = await prisma.suiviPostOp.findUnique({ where: { patientId } })
  if (!suivi) throw new AppError(404, 'SUIVI_NOT_FOUND', 'Suivi post-opératoire introuvable.')
  return suivi
}

async function actorDisplayName(actorId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: actorId }, select: { fullName: true } })
  return user?.fullName ?? 'Équipe'
}

/** Détail du suivi pour le back-office (inclut les notes internes). */
export async function getPostOpForStaff(patientId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { user: { select: { fullName: true } } },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')
  const [suivi, logistique] = await Promise.all([
    prisma.suiviPostOp.findUnique({ where: { patientId } }),
    prisma.logistique.findUnique({ where: { patientId }, select: { dateIntervention: true } }),
  ])
  return {
    suivi,
    patient: { id: patient.id, status: patient.status, fullName: patient.user.fullName },
    dateInterventionLogistique: logistique?.dateIntervention?.toISOString() ?? null,
  }
}

/**
 * Message de retour à la maison : crée le suivi si besoin (date d'intervention de la logistique),
 * passe le dossier en post-op, poste le message dans le chat et prépare le lien WhatsApp.
 */
export async function sendRetourMessage(
  actor: { id: string; role: StaffRole },
  patientId: string,
  input: { message?: string; markOnly?: boolean },
) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { user: { select: { id: true, fullName: true } } },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')

  let suivi = await prisma.suiviPostOp.findUnique({ where: { patientId } })
  if (!suivi) {
    const logistique = await prisma.logistique.findUnique({
      where: { patientId },
      select: { dateIntervention: true },
    })
    const base = logistique?.dateIntervention ?? new Date()
    const day = formatAgendaSlot(base).date
    suivi = await prisma.suiviPostOp.create({
      data: { patientId, dateIntervention: new Date(`${day}T00:00:00.000Z`), photos: [] },
    })
  }

  if (!['post_op', 'suivi_termine'].includes(patient.status)) {
    await prisma.patient.update({ where: { id: patientId }, data: { status: 'post_op' } })
  }

  const text = input.message?.trim() || buildPostOpRetourMessage(patient.user.fullName)

  if (!input.markOnly) {
    await prisma.message.create({
      data: {
        patientId,
        expediteurId: actor.id,
        expediteurRole: actor.role,
        contenu: text,
        lu: false,
      },
    })

    await createUserNotification({
      userId: patient.user.id,
      type: 'info',
      titre: 'Votre suivi post-opératoire',
      message: 'Ajoutez vos photos et posez vos questions depuis votre suivi post-opératoire.',
      lienAction: '/patient/post-op',
      kind: 'chat',
    }).catch(() => undefined)
  }

  const updated = await prisma.suiviPostOp.update({
    where: { patientId },
    data: { retourMessageAt: new Date() },
  })

  const whatsappUrl = await buildRetourWhatsappUrl(patient.phone, text)

  await prisma.auditLog
    .create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'create',
        entity: 'post_op_retour',
        entityId: patientId,
        after: { channel: input.markOnly ? 'manuel' : 'chat' } as never,
      },
    })
    .catch(() => undefined)

  return { suivi: updated, whatsappUrl, hasPhone: Boolean(whatsappUrl) }
}

/**
 * Clôture du suivi : le dossier est classé « suivi terminé » avec les remarques de fin de séjour.
 * Les remarques sont internes (jamais exposées à la patiente).
 */
export async function cloturerSuivi(
  actor: { id: string; role: StaffRole },
  patientId: string,
  input: { remarques?: string },
) {
  await loadSuiviOrThrow(patientId)
  const name = await actorDisplayName(actor.id)

  const [updated] = await prisma.$transaction([
    prisma.suiviPostOp.update({
      where: { patientId },
      data: {
        clotureAt: new Date(),
        clotureRemarques: input.remarques?.trim() || null,
        cloturePar: name,
      },
    }),
    prisma.patient.update({ where: { id: patientId }, data: { status: 'suivi_termine' } }),
  ])

  await prisma.auditLog
    .create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'update',
        entity: 'post_op_cloture',
        entityId: patientId,
        after: { cloture: true } as never,
      },
    })
    .catch(() => undefined)

  return { suivi: updated, status: 'suivi_termine' as const }
}

export async function rouvrirSuivi(actor: { id: string; role: StaffRole }, patientId: string) {
  await loadSuiviOrThrow(patientId)

  const [updated] = await prisma.$transaction([
    prisma.suiviPostOp.update({
      where: { patientId },
      data: { clotureAt: null, cloturePar: null },
    }),
    prisma.patient.update({ where: { id: patientId }, data: { status: 'post_op' } }),
  ])

  await prisma.auditLog
    .create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'update',
        entity: 'post_op_cloture',
        entityId: patientId,
        after: { cloture: false } as never,
      },
    })
    .catch(() => undefined)

  return { suivi: updated, status: 'post_op' as const }
}

export async function answerDemande(
  actor: { id: string; role: StaffRole },
  patientId: string,
  demandeId: string,
  reponse: string,
) {
  const text = reponse.trim()
  if (!text) throw new AppError(400, 'EMPTY_REPONSE', 'La réponse ne peut pas être vide.')

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { userId: true },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient introuvable.')

  const suivi = await loadSuiviOrThrow(patientId)
  const demandes = asArray<PostOpDemande>(suivi.demandes)
  const idx = demandes.findIndex((d) => d.id === demandeId)
  if (idx < 0) throw new AppError(404, 'DEMANDE_NOT_FOUND', 'Demande introuvable.')

  const name = await actorDisplayName(actor.id)
  demandes[idx] = {
    ...demandes[idx],
    reponse: text,
    reponseAt: new Date().toISOString(),
    reponseParRole: actor.role,
    reponsePar: name,
  }

  const updated = await prisma.suiviPostOp.update({
    where: { patientId },
    data: { demandes: demandes as never },
  })

  await createUserNotification({
    userId: patient.userId,
    type: 'success',
    titre: 'Réponse à votre demande',
    message: 'L’équipe du cabinet a répondu à votre demande post-opératoire.',
    lienAction: '/patient/post-op',
    kind: 'system',
  }).catch(() => undefined)

  return { suivi: updated }
}

export async function addNoteInterne(
  actor: { id: string; role: StaffRole },
  patientId: string,
  input: { type: 'deroulement' | 'depense'; texte: string; montant?: number | null },
) {
  const suivi = await loadSuiviOrThrow(patientId)
  const notes = asArray<PostOpNoteInterne>(suivi.notesInternes)
  const name = await actorDisplayName(actor.id)

  notes.push({
    id: randomUUID(),
    type: input.type,
    texte: input.texte.trim(),
    montant: input.type === 'depense' && typeof input.montant === 'number' ? input.montant : null,
    auteur: name,
    auteurRole: actor.role,
    createdAt: new Date().toISOString(),
  })

  const updated = await prisma.suiviPostOp.update({
    where: { patientId },
    data: { notesInternes: notes as never },
  })
  return { suivi: updated }
}

export async function deleteNoteInterne(patientId: string, noteId: string) {
  const suivi = await loadSuiviOrThrow(patientId)
  const notes = asArray<PostOpNoteInterne>(suivi.notesInternes)
  if (!notes.some((n) => n.id === noteId)) {
    throw new AppError(404, 'NOTE_NOT_FOUND', 'Note introuvable.')
  }
  const updated = await prisma.suiviPostOp.update({
    where: { patientId },
    data: { notesInternes: notes.filter((n) => n.id !== noteId) as never },
  })
  return { suivi: updated }
}

// ─── Côté patiente ────────────────────────────────────────────────────────────

export async function addPatientDemande(userId: string, message: string) {
  const text = message.trim()
  if (!text) throw new AppError(400, 'EMPTY_MESSAGE', 'Votre message est vide.')

  const patient = await prisma.patient.findUnique({
    where: { userId },
    include: { user: { select: { fullName: true } } },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Profil patient introuvable.')

  const suivi = await loadSuiviOrThrow(patient.id)
  const demandes = asArray<PostOpDemande>(suivi.demandes)
  demandes.push({ id: randomUUID(), message: text, createdAt: new Date().toISOString() })

  const updated = await prisma.suiviPostOp.update({
    where: { patientId: patient.id },
    data: { demandes: demandes as never, ...(suivi.clotureAt ? { clotureAt: null, cloturePar: null } : {}) },
  })
  if (suivi.clotureAt) {
    await prisma.patient.update({ where: { id: patient.id }, data: { status: 'post_op' } })
  }

  const preview = text.length > 140 ? `${text.slice(0, 140)}…` : text
  await Promise.all([
    notifyStaff({
      role: 'medecin',
      email: false,
      type: 'info',
      titre: 'Demande post-op de la patiente',
      message: `${patient.user.fullName} (${patient.dossierNumber}) : ${preview}`,
      lienAction: '/medecin/post-op',
    }),
    notifyStaff({
      role: 'gestionnaire',
      email: false,
      type: 'info',
      titre: 'Demande post-op de la patiente',
      message: `${patient.user.fullName} (${patient.dossierNumber}) : ${preview}`,
      lienAction: `/gestionnaire/devis/${patient.id}`,
    }),
  ]).catch(() => undefined)

  return { suivi: updated }
}

export async function requestCompteRendu(userId: string) {
  const patient = await prisma.patient.findUnique({
    where: { userId },
    include: { user: { select: { fullName: true } } },
  })
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Profil patient introuvable.')

  const suivi = await loadSuiviOrThrow(patient.id)
  if (suivi.compteRenduDemandeAt) return { suivi }

  const updated = await prisma.suiviPostOp.update({
    where: { patientId: patient.id },
    data: { compteRenduDemandeAt: new Date(), ...(suivi.clotureAt ? { clotureAt: null, cloturePar: null } : {}) },
  })
  if (suivi.clotureAt) {
    await prisma.patient.update({ where: { id: patient.id }, data: { status: 'post_op' } })
  }

  await notifyStaff({
    role: 'medecin',
    email: false,
    type: 'info',
    titre: 'Compte rendu opératoire demandé',
    message: `${patient.user.fullName} (${patient.dossierNumber}) demande son compte rendu opératoire.`,
    lienAction: '/medecin/post-op',
  }).catch(() => undefined)

  return { suivi: updated }
}
