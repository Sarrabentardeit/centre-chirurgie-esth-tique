import { prisma } from '../lib/prisma.js'

/** Dossiers en attente d'action côté médecin. */
export const MEDECIN_NON_TRAITES = [
  'nouveau',
  'formulaire_en_cours',
  'formulaire_complete',
  'en_analyse',
] as const

/** Dossiers déjà traités côté médecin (rapport fait ou suite du parcours). */
export const MEDECIN_TRAITES = [
  'rapport_genere',
  'rapport_modifie',
  'devis_preparation',
  'devis_envoye',
  'devis_accepte',
  'date_reservee',
  'logistique',
  'intervention',
  'post_op',
  'suivi_termine',
] as const

/**
 * Dossiers non traités côté gestionnaire :
 * du nouveau patient jusqu'au devis non encore envoyé.
 * Passent en « traités » dès que le devis est envoyé.
 */
export const GESTIONNAIRE_NON_TRAITES = [
  'nouveau',
  'formulaire_en_cours',
  'formulaire_complete',
  'en_analyse',
  'rapport_genere',
  'rapport_modifie',
  'devis_preparation',
] as const

/** Dossiers déjà traités côté gestionnaire (devis envoyé ou suite). */
export const GESTIONNAIRE_TRAITES = [
  'devis_envoye',
  'devis_accepte',
  'date_reservee',
  'logistique',
  'intervention',
  'post_op',
  'suivi_termine',
] as const

const ALL_ACTIVE_STATUSES = [
  'nouveau', 'formulaire_en_cours', 'formulaire_complete', 'en_analyse',
  'rapport_genere', 'rapport_modifie', 'devis_preparation', 'devis_envoye', 'devis_accepte',
  'date_reservee', 'logistique', 'intervention', 'post_op', 'suivi_termine',
] as const

export type DossierListRole = 'medecin' | 'gestionnaire'

export type CompteCreeParFilter = 'patiente' | 'medecin' | 'gestionnaire'

export function parseCreePar(value: unknown): CompteCreeParFilter | undefined {
  if (value === 'patiente' || value === 'medecin' || value === 'gestionnaire') return value
  return undefined
}

export function buildPatientStatusWhere(
  status: string | undefined,
  role: DossierListRole,
) {
  if (!status || status === 'all') {
    return { status: { in: ALL_ACTIVE_STATUSES as unknown as never[] } }
  }
  if (status === 'non_traites') {
    const vals = role === 'medecin'
      ? (MEDECIN_NON_TRAITES as unknown as never[])
      : (GESTIONNAIRE_NON_TRAITES as unknown as never[])
    // Les dossiers créés par le Dr ne sont pas une file « à traiter ».
    return { status: { in: vals }, creePar: { not: 'medecin' as const } }
  }
  if (status === 'traites') {
    const vals = role === 'medecin'
      ? (MEDECIN_TRAITES as unknown as never[])
      : (GESTIONNAIRE_TRAITES as unknown as never[])
    return { status: { in: vals } }
  }
  if (status === 'abstention') {
    return { status: 'abstention' as never }
  }
  return { status: status as never }
}

export async function countDossierBuckets(
  role: DossierListRole,
  creePar?: 'patiente' | 'medecin' | 'gestionnaire',
) {
  const nonTraites = role === 'medecin'
    ? (MEDECIN_NON_TRAITES as unknown as never[])
    : (GESTIONNAIRE_NON_TRAITES as unknown as never[])
  const traites = role === 'medecin'
    ? (MEDECIN_TRAITES as unknown as never[])
    : (GESTIONNAIRE_TRAITES as unknown as never[])
  const origin = creePar ? { creePar } : {}

  const [nonTraitesCount, traitesCount, actifsCount, cabinetCount] = await Promise.all([
    prisma.patient.count({
      where: {
        status: { in: nonTraites },
        creePar: creePar && creePar !== 'medecin' ? creePar : { not: 'medecin' as const },
      },
    }),
    prisma.patient.count({ where: { status: { in: traites }, ...origin } }),
    prisma.patient.count({ where: { status: { in: ALL_ACTIVE_STATUSES as unknown as never[] }, ...origin } }),
    prisma.patient.count({
      where: {
        creePar: 'medecin',
        status: { in: ALL_ACTIVE_STATUSES as unknown as never[] },
      },
    }),
  ])

  // Compte les dossiers en abstention via SQL brut (enum non encore dans le client généré)
  let abstentionCount = 0
  try {
    const res = creePar
      ? await prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*) AS count FROM patients WHERE status = 'abstention' AND cree_par::text = ${creePar}
        `
      : await prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*) AS count FROM patients WHERE status = 'abstention'
        `
    abstentionCount = Number(res[0]?.count ?? 0)
  } catch {
    // Avant migration : ignore silencieusement
  }

  return {
    non_traites: nonTraitesCount,
    traites: traitesCount,
    abstention: abstentionCount,
    actifs: actifsCount,
    cabinet: cabinetCount,
  }
}
