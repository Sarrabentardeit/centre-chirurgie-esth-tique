/** Lignes structurées dans `notesSejour` du devis (préfixes + texte libre). */

import {
  DEVIS_CONTENTION_PREFIX,
  DEVIS_DRAINAGE_NB_PREFIX,
  DEVIS_EXCLUT_PREFIX,
  DEVIS_INCLUT_PREFIX,
  parseContentionDetailFromNotes,
  parseDrainageNbFromNotes,
  parseExclutIdsFromNotes,
  parseInclutIdsFromNotes,
} from '@/lib/devisOfferInclus'

const LEGACY_TYPE_SEJOUR_PREFIX = 'TYPE_SEJOUR:'
export const SEJOUR_CLINIQUE_NOM_PREFIX = 'SEJOUR_CLINIQUE_NOM:'
export const SEJOUR_CLINIQUE_NUITS_PREFIX = 'SEJOUR_CLINIQUE_NUITS:'
export const SEJOUR_HOTEL_NOM_PREFIX = 'SEJOUR_HOTEL_NOM:'
export const SEJOUR_HOTEL_NUITS_PREFIX = 'SEJOUR_HOTEL_NUITS:'
export const SEJOUR_NB_ADULTES_PREFIX = 'SEJOUR_NB_ADULTES:'
/** 1 = SEJOUR_NB_ADULTES compte déjà la patiente (nouveau format devis). */
export const SEJOUR_ADULTES_INCLUT_PATIENTE_PREFIX = 'SEJOUR_ADULTES_INCLUT_PATIENTE:'
export const SEJOUR_NB_ENFANTS_PREFIX = 'SEJOUR_NB_ENFANTS:'
export const SEJOUR_DUREE_TOTALE_PREFIX = 'SEJOUR_DUREE_TOTALE:'
export const DELAIS_CONVALESCENCE_PREFIX = 'DELAIS_CONVALESCENCE:'

const META_PREFIXES = [
  LEGACY_TYPE_SEJOUR_PREFIX,
  DELAIS_CONVALESCENCE_PREFIX,
  SEJOUR_CLINIQUE_NOM_PREFIX,
  SEJOUR_CLINIQUE_NUITS_PREFIX,
  SEJOUR_HOTEL_NOM_PREFIX,
  SEJOUR_HOTEL_NUITS_PREFIX,
  SEJOUR_NB_ADULTES_PREFIX,
  SEJOUR_ADULTES_INCLUT_PATIENTE_PREFIX,
  SEJOUR_NB_ENFANTS_PREFIX,
  SEJOUR_DUREE_TOTALE_PREFIX,
  DEVIS_INCLUT_PREFIX,
  DEVIS_EXCLUT_PREFIX,
  DEVIS_DRAINAGE_NB_PREFIX,
  DEVIS_CONTENTION_PREFIX,
] as const

function lineValue(lines: string[], prefix: string): string {
  const line = lines.find((l) => l.startsWith(prefix))
  return line ? line.slice(prefix.length).trim() : ''
}

function isMetaLine(l: string): boolean {
  return META_PREFIXES.some((p) => l.startsWith(p))
}

export interface ParsedSejourMeta {
  cliniqueNom: string
  cliniqueNuits: string
  hotelNom: string
  hotelNuits: string
  nbAdultes: string
  nbEnfants: string
  dureeSejourTotale: string
  noteSejour: string
  /** null = non renseigné (défaut = tout coché à l’affichage). */
  inclutIds: string[] | null
  exclutIds: string[] | null
  /** null = non renseigné → défaut = séances du rapport. */
  drainageNb: number | null
  /** Détail du vêtement de contention (texte libre). */
  contentionDetail: string
}

export const CLINIQUE_CHOIX = {
  didon: 'Didon Clinic La Soukra',
  amen: 'Clinique Amen La Marsa',
  autre: '__autre__',
} as const

export const HOTEL_CHOIX = {
  mouradi: 'Mouradi Gammarth',
  darMarsa: 'Hotel Dar Marsa La Marsa',
  /** Patiente gère elle-même sa convalescence (pas d’hôtel cabinet). */
  aucun: 'Aucun',
  autre: '__autre__',
} as const

export type CliniqueChoiceKey = keyof typeof CLINIQUE_CHOIX | ''
export type HotelChoiceKey = keyof typeof HOTEL_CHOIX | ''

export function cliniqueNomFromChoice(choice: string, autre: string): string {
  if (choice === 'didon') return CLINIQUE_CHOIX.didon
  if (choice === 'amen') return CLINIQUE_CHOIX.amen
  if (choice === 'autre') return autre.trim()
  return ''
}

export function hotelNomFromChoice(choice: string, autre: string): string {
  if (choice === 'mouradi') return HOTEL_CHOIX.mouradi
  if (choice === 'darMarsa') return HOTEL_CHOIX.darMarsa
  if (choice === 'aucun') return HOTEL_CHOIX.aucun
  if (choice === 'autre') return autre.trim()
  return ''
}

/** Restaure le choix liste / autre à partir d’un nom enregistré. */
export function resolveCliniqueFromNom(nom: string): { choice: string; autre: string } {
  const n = nom.trim()
  if (!n) return { choice: '', autre: '' }
  if (n === CLINIQUE_CHOIX.didon || /didon/i.test(n)) return { choice: 'didon', autre: '' }
  if (n === CLINIQUE_CHOIX.amen || /amen/i.test(n)) return { choice: 'amen', autre: '' }
  return { choice: 'autre', autre: n }
}

export function resolveHotelFromNom(nom: string): { choice: string; autre: string } {
  const n = nom.trim()
  if (!n) return { choice: '', autre: '' }
  if (n === HOTEL_CHOIX.mouradi || /mouradi/i.test(n)) return { choice: 'mouradi', autre: '' }
  if (n === HOTEL_CHOIX.darMarsa || /dar\s*marsa/i.test(n)) return { choice: 'darMarsa', autre: '' }
  if (n === HOTEL_CHOIX.aucun || /^aucun$/i.test(n) || /sans\s*h[oô]tel/i.test(n)) {
    return { choice: 'aucun', autre: '' }
  }
  return { choice: 'autre', autre: n }
}

/** Parse un entier ≥ 0 ; NaN si vide / invalide. */
export function parseNuitsField(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = Number.parseInt(t, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * Séjour total en nuits = nuits clinique + nuits hôtel (sans +1).
 * Ex. : 3 + 4 → 7 nuits.
 */
export function joursSejourFromNuits(cliniqueNuits: string, hotelNuits: string): string {
  const c = parseNuitsField(cliniqueNuits)
  const h = parseNuitsField(hotelNuits)
  if (c == null && h == null) return ''
  return String((c ?? 0) + (h ?? 0))
}

export function parseSejourMeta(notes: string | null | undefined): ParsedSejourMeta {
  const lines = (notes ?? '').split('\n')
  const rawAdultes = lineValue(lines, SEJOUR_NB_ADULTES_PREFIX)
  const dejaInclutPatiente = lineValue(lines, SEJOUR_ADULTES_INCLUT_PATIENTE_PREFIX) === '1'
  return {
    cliniqueNom: lineValue(lines, SEJOUR_CLINIQUE_NOM_PREFIX),
    cliniqueNuits: lineValue(lines, SEJOUR_CLINIQUE_NUITS_PREFIX),
    hotelNom: lineValue(lines, SEJOUR_HOTEL_NOM_PREFIX),
    hotelNuits: lineValue(lines, SEJOUR_HOTEL_NUITS_PREFIX),
    nbAdultes: rawAdultes === ''
      ? ''
      : (dejaInclutPatiente
          ? String(Math.max(0, Math.floor(Number(rawAdultes)) - 1) || 0)
          : rawAdultes),
    nbEnfants: lineValue(lines, SEJOUR_NB_ENFANTS_PREFIX),
    dureeSejourTotale: lineValue(lines, SEJOUR_DUREE_TOTALE_PREFIX),
    noteSejour: lines.filter((l) => !isMetaLine(l)).join('\n').trim(),
    inclutIds: parseInclutIdsFromNotes(notes),
    exclutIds: parseExclutIdsFromNotes(notes),
    drainageNb: parseDrainageNbFromNotes(notes),
    contentionDetail: parseContentionDetailFromNotes(notes),
  }
}

export function buildSejourNotes(i: ParsedSejourMeta): string {
  return [
    i.cliniqueNom.trim() ? `${SEJOUR_CLINIQUE_NOM_PREFIX}${i.cliniqueNom.trim()}` : '',
    i.cliniqueNuits.trim() ? `${SEJOUR_CLINIQUE_NUITS_PREFIX}${i.cliniqueNuits.trim()}` : '',
    i.hotelNom.trim() ? `${SEJOUR_HOTEL_NOM_PREFIX}${i.hotelNom.trim()}` : '',
    i.hotelNuits.trim() ? `${SEJOUR_HOTEL_NUITS_PREFIX}${i.hotelNuits.trim()}` : '',
    i.nbAdultes.trim() !== '' ? `${SEJOUR_NB_ADULTES_PREFIX}${i.nbAdultes.trim()}` : '',
    i.nbEnfants.trim() !== '' ? `${SEJOUR_NB_ENFANTS_PREFIX}${i.nbEnfants.trim()}` : '',
    i.dureeSejourTotale.trim() !== '' ? `${SEJOUR_DUREE_TOTALE_PREFIX}${i.dureeSejourTotale.trim()}` : '',
    i.inclutIds != null ? `${DEVIS_INCLUT_PREFIX}${i.inclutIds.join(',')}` : '',
    i.exclutIds != null ? `${DEVIS_EXCLUT_PREFIX}${i.exclutIds.join(',')}` : '',
    i.drainageNb != null && Number.isFinite(i.drainageNb)
      ? `${DEVIS_DRAINAGE_NB_PREFIX}${Math.max(0, Math.floor(i.drainageNb))}`
      : '',
    i.contentionDetail.trim()
      ? `${DEVIS_CONTENTION_PREFIX}${i.contentionDetail.replace(/\s+/g, ' ').trim()}`
      : '',
    i.noteSejour.trim(),
  ].filter(Boolean).join('\n')
}

/**
 * Préremplit adultes/enfants depuis le formulaire patient.
 * Adultes = uniquement les adultes accompagnants (sans la patiente).
 * Enfants = enfants accompagnants.
 */
export function accompagnantsFromFormulairePayload(
  payload: Record<string, unknown> | null | undefined,
): { nbAdultes: string; nbEnfants: string } {
  if (!payload || payload.accompagnant !== true) {
    return { nbAdultes: '0', nbEnfants: '0' }
  }
  const nAdultesAcc = Number(payload.nbAdultesAccompagnement)
  const nEnfants = Number(payload.nbEnfantsAccompagnement)
  const adultesAcc = Number.isFinite(nAdultesAcc) && nAdultesAcc >= 0 ? Math.floor(nAdultesAcc) : 0
  const enfants = Number.isFinite(nEnfants) && nEnfants >= 0 ? Math.floor(nEnfants) : 0
  return {
    nbAdultes: String(adultesAcc),
    nbEnfants: String(enfants),
  }
}

/** Nb d'adultes au devis / PDF = accompagnants adultes + la patiente (minimum 1). */
export function nbAdultesDevisFromAccompagnants(accompagnantsAdultes: number | string): string {
  const n = Number(accompagnantsAdultes)
  const acc = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
  return String(acc + 1)
}

export function typeChambreFromNbAdultesDevis(nbAdultesIncluantPatiente: number | string): 'Single' | 'Double' {
  const n = Number(nbAdultesIncluantPatiente)
  const total = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 1
  return total >= 2 ? 'Double' : 'Single'
}

/** Adultes accompagnants (hors patiente) à partir du champ devis. */
export function accompagnantsAdultesFromNbAdultesDevis(nbAdultesIncluantPatiente: number | string): number {
  const n = Number(nbAdultesIncluantPatiente)
  const total = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
  return Math.max(0, total - 1)
}

export type RapportSejourDefaults = {
  nuitsPreoperatoires?: number | null
  nuitsClinique?: number | null
  nuitsHotel?: number | null
  dureeSejourTunisie?: number | null
  nbAdultesSejour?: number | null
  nbEnfantsSejour?: number | null
}

/**
 * Valeurs devis préremplies depuis le rapport médecin (+ repli formulaire pour accompagnants).
 */
export function devisSejourDefaultsFromRapport(
  rap: RapportSejourDefaults | null | undefined,
  formPayload?: Record<string, unknown> | null,
): {
  cliniqueNuits: string
  dureeSejourTotale: string
  hotelNuits: string
  nbAdultes: string
  nbEnfants: string
} {
  const accForm = accompagnantsFromFormulairePayload(formPayload)
  // Nuits clinique = pré-opératoires + postopératoires
  const preop  = rap?.nuitsPreoperatoires != null && Number.isFinite(rap.nuitsPreoperatoires) ? rap.nuitsPreoperatoires : 0
  const postop = rap?.nuitsClinique != null && Number.isFinite(rap.nuitsClinique) ? rap.nuitsClinique : 0
  const totalClin = preop + postop
  const cliniqueNuits = (totalClin > 0 || (rap?.nuitsClinique != null || rap?.nuitsPreoperatoires != null))
    ? String(totalClin)
    : ''
  const dureeSejourTotale =
    rap?.dureeSejourTunisie != null && Number.isFinite(rap.dureeSejourTunisie)
      ? String(rap.dureeSejourTunisie)
      : ''

  let hotelNuits = ''
  // Priorité : nuitsHotel saisi explicitement par le médecin
  if (rap?.nuitsHotel != null && Number.isFinite(rap.nuitsHotel)) {
    hotelNuits = String(rap.nuitsHotel)
  } else {
    // Repli : séjour total - nuits clinique
    const clin = cliniqueNuits !== '' ? Number(cliniqueNuits) : NaN
    const totalNuits = dureeSejourTotale !== '' ? Number(dureeSejourTotale) : NaN
    if (Number.isFinite(clin) && Number.isFinite(totalNuits) && totalNuits >= 0) {
      hotelNuits = String(Math.max(0, totalNuits - clin))
    }
  }

  const nbAdultes =
    rap?.nbAdultesSejour != null && Number.isFinite(rap.nbAdultesSejour)
      ? String(rap.nbAdultesSejour)
      : accForm.nbAdultes
  const nbEnfants =
    rap?.nbEnfantsSejour != null && Number.isFinite(rap.nbEnfantsSejour)
      ? String(rap.nbEnfantsSejour)
      : accForm.nbEnfants

  return { cliniqueNuits, dureeSejourTotale, hotelNuits, nbAdultes, nbEnfants }
}

/** Affichage patient / PDF : texte lisible sans préfixes techniques. */
export function formatDevisSejourNotesForDisplay(notes: string | null | undefined): string {
  const lines = (notes ?? '').split('\n')
  const legacyDelais = lineValue(lines, DELAIS_CONVALESCENCE_PREFIX)
  const p = parseSejourMeta(notes)
  const parts: string[] = []
  if (p.cliniqueNom || p.cliniqueNuits) {
    const bits = [
      p.cliniqueNom && `Clinique : ${p.cliniqueNom}`,
      p.cliniqueNuits && `Nuits à la clinique : ${p.cliniqueNuits}`,
    ].filter(Boolean)
    if (bits.length) parts.push(bits.join('\n'))
  }
  if (p.hotelNom || p.hotelNuits) {
    const bits = [
      p.hotelNom && `Hôtel : ${p.hotelNom}`,
      p.hotelNuits && `Nuit de convalescence à l'hôtel : ${p.hotelNuits}`,
    ].filter(Boolean)
    if (bits.length) parts.push(bits.join('\n'))
  }
  if (p.dureeSejourTotale) {
    parts.push(`Durée séjour total : ${p.dureeSejourTotale} nuit(s)`)
  }
  if (p.nbAdultes || p.nbEnfants) {
    const bits = [
      p.nbAdultes !== '' && `Nombre d'adultes : ${nbAdultesDevisFromAccompagnants(p.nbAdultes)}`,
      p.nbEnfants !== '' && `Nbr enfants (2 – 12 ans) : ${p.nbEnfants}`,
    ].filter(Boolean)
    if (bits.length) parts.push(bits.join('\n'))
  }
  if (legacyDelais) parts.push(`Délais de convalescence : ${legacyDelais}`)
  if (p.noteSejour) parts.push(p.noteSejour)
  const out = parts.filter(Boolean).join('\n\n').trim()
  if (out) return out
  return (notes ?? '').trim()
}
