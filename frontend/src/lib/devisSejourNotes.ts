/** Lignes structurées dans `notesSejour` du devis (préfixes + texte libre). */

const LEGACY_TYPE_SEJOUR_PREFIX = 'TYPE_SEJOUR:'
export const SEJOUR_CLINIQUE_NOM_PREFIX = 'SEJOUR_CLINIQUE_NOM:'
export const SEJOUR_CLINIQUE_NUITS_PREFIX = 'SEJOUR_CLINIQUE_NUITS:'
export const SEJOUR_HOTEL_NOM_PREFIX = 'SEJOUR_HOTEL_NOM:'
export const SEJOUR_HOTEL_NUITS_PREFIX = 'SEJOUR_HOTEL_NUITS:'
export const DELAIS_CONVALESCENCE_PREFIX = 'DELAIS_CONVALESCENCE:'

const META_PREFIXES = [
  LEGACY_TYPE_SEJOUR_PREFIX,
  DELAIS_CONVALESCENCE_PREFIX,
  SEJOUR_CLINIQUE_NOM_PREFIX,
  SEJOUR_CLINIQUE_NUITS_PREFIX,
  SEJOUR_HOTEL_NOM_PREFIX,
  SEJOUR_HOTEL_NUITS_PREFIX,
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
  noteSejour: string
}

export const CLINIQUE_CHOIX = {
  didon: 'Didon Clinic La Soukra',
  amen: 'Clinique Amen La Marsa',
  autre: '__autre__',
} as const

export const HOTEL_CHOIX = {
  mouradi: 'Mouradi Gammarth',
  darMarsa: 'Hotel Dar Marsa La Soukra',
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
  if (n === HOTEL_CHOIX.darMarsa || /dar marsa|soukra/i.test(n)) return { choice: 'darMarsa', autre: '' }
  return { choice: 'autre', autre: n }
}

export function parseSejourMeta(notes: string | null | undefined): ParsedSejourMeta {
  const lines = (notes ?? '').split('\n')
  return {
    cliniqueNom: lineValue(lines, SEJOUR_CLINIQUE_NOM_PREFIX),
    cliniqueNuits: lineValue(lines, SEJOUR_CLINIQUE_NUITS_PREFIX),
    hotelNom: lineValue(lines, SEJOUR_HOTEL_NOM_PREFIX),
    hotelNuits: lineValue(lines, SEJOUR_HOTEL_NUITS_PREFIX),
    noteSejour: lines.filter((l) => !isMetaLine(l)).join('\n').trim(),
  }
}

export function buildSejourNotes(i: ParsedSejourMeta): string {
  return [
    i.cliniqueNom.trim() ? `${SEJOUR_CLINIQUE_NOM_PREFIX}${i.cliniqueNom.trim()}` : '',
    i.cliniqueNuits.trim() ? `${SEJOUR_CLINIQUE_NUITS_PREFIX}${i.cliniqueNuits.trim()}` : '',
    i.hotelNom.trim() ? `${SEJOUR_HOTEL_NOM_PREFIX}${i.hotelNom.trim()}` : '',
    i.hotelNuits.trim() ? `${SEJOUR_HOTEL_NUITS_PREFIX}${i.hotelNuits.trim()}` : '',
    i.noteSejour.trim(),
  ].filter(Boolean).join('\n')
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
      p.hotelNuits && `Nuits à l'hôtel : ${p.hotelNuits}`,
    ].filter(Boolean)
    if (bits.length) parts.push(bits.join('\n'))
  }
  if (legacyDelais) parts.push(`Délais de convalescence : ${legacyDelais}`)
  if (p.noteSejour) parts.push(p.noteSejour)
  const out = parts.filter(Boolean).join('\n\n').trim()
  if (out) return out
  return (notes ?? '').trim()
}
