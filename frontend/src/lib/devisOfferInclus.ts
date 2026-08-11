/**
 * Cases à cocher « Votre devis inclut / Notre forfait exclut »
 * Persistées dans notesSejour (préfixes DEVIS_INCLUT / DEVIS_EXCLUT / DEVIS_DRAINAGE_NB).
 */

export const DEVIS_INCLUT_PREFIX = 'DEVIS_INCLUT:'
export const DEVIS_EXCLUT_PREFIX = 'DEVIS_EXCLUT:'
export const DEVIS_DRAINAGE_NB_PREFIX = 'DEVIS_DRAINAGE_NB:'

export type DevisOfferItem = { id: string; label: string }

export const DEVIS_INCLUT_ITEMS: readonly DevisOfferItem[] = [
  {
    id: 'assistance',
    label: "Assistance depuis votre arrivée à l'aéroport de Tunis-Carthage et jusqu'à votre départ,",
  },
  {
    id: 'transferts',
    label: 'Transferts multiples aéroport/hôtel et hôtel/clinique,',
  },
  {
    id: 'consult_preop',
    label: 'Consultation préopératoire à Tunis,',
  },
  {
    id: 'honoraires',
    label: "Honoraires du chirurgien et de l'anesthésiste,",
  },
  {
    id: 'frais_clinique',
    label: 'Frais de la clinique et séjour (bloc opératoire, consommables, pharmacie, médication…),',
  },
  {
    id: 'pharma_postop',
    label: 'Les produits pharmaceutiques pour votre traitement postopératoire,',
  },
  {
    id: 'convalescence_hotel',
    label: 'Convalescence dans un hôtel,',
  },
  {
    id: 'drainage',
    /** Libellé dynamique via drainageLabel(n) */
    label: 'Séances de drainage lymphatique : massages par un kinésithérapeute,',
  },
  {
    id: 'vetement_contention',
    label: 'Vêtement de contention à préciser,',
  },
  {
    id: 'consult_postop',
    label: 'Consultation post opératoire en Tunisie avant votre départ,',
  },
  {
    id: 'suivi_6mois',
    label: 'Suivi post-opératoire gratuit avec votre chirurgien ou son équipe pendant 6 mois.',
  },
] as const

/** Libellé PDF / éditeur pour le drainage (nb séances ajustable). */
export function drainageLabel(nb: number): string {
  const n = Math.max(0, Math.floor(Number(nb) || 0))
  const word = n > 1 ? 'Séances' : 'Séance'
  return `${n} ${word} de drainage lymphatique : massages par un kinésithérapeute,`
}

/** Défaut = séances rapport médecin, sinon 2. */
export function defaultDrainageNbFromRapport(rap?: {
  drainage?: boolean | null
  nbSeancesDrainage?: number | null
} | null): number {
  if (rap?.drainage === false) return 0
  if (rap?.nbSeancesDrainage != null && Number.isFinite(Number(rap.nbSeancesDrainage))) {
    return Math.max(0, Math.floor(Number(rap.nbSeancesDrainage)))
  }
  return 2
}

export const DEVIS_EXCLUT_ITEMS: readonly DevisOfferItem[] = [
  { id: 'vols', label: 'Les vols aller-retour,' },
  {
    id: 'depenses',
    label:
      "Les dépenses personnelles (extras à l'hôtel ou à la clinique tels que les boissons, téléphone, etc…),",
  },
  {
    id: 'sang',
    label: 'Les poches de sang en cas de besoin de transfusion,',
  },
  {
    id: 'prolongement',
    label: 'Le prolongement de votre séjour initial en cas de nécessité,',
  },
  {
    id: 'bilans',
    label: 'Les bilans sanguins préopératoires.',
  },
] as const

export function defaultInclutIds(): string[] {
  return DEVIS_INCLUT_ITEMS.map((i) => i.id)
}

export function defaultExclutIds(): string[] {
  return DEVIS_EXCLUT_ITEMS.map((i) => i.id)
}

function parseIdsLine(lines: string[], prefix: string): string[] | null {
  const line = lines.find((l) => l.startsWith(prefix))
  if (line == null) return null
  const raw = line.slice(prefix.length).trim()
  if (!raw) return []
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

/** null = préfixe absent → tous cochés par défaut (anciens devis). */
export function parseInclutIdsFromNotes(notes: string | null | undefined): string[] | null {
  return parseIdsLine((notes ?? '').split('\n'), DEVIS_INCLUT_PREFIX)
}

export function parseExclutIdsFromNotes(notes: string | null | undefined): string[] | null {
  return parseIdsLine((notes ?? '').split('\n'), DEVIS_EXCLUT_PREFIX)
}

export function resolveInclutIds(notes: string | null | undefined): string[] {
  return parseInclutIdsFromNotes(notes) ?? defaultInclutIds()
}

export function resolveExclutIds(notes: string | null | undefined): string[] {
  return parseExclutIdsFromNotes(notes) ?? defaultExclutIds()
}

export function labelsForIds(
  items: readonly DevisOfferItem[],
  ids: string[],
): string[] {
  const set = new Set(ids)
  return items.filter((i) => set.has(i.id)).map((i) => i.label)
}

/** Libellés « inclut » avec nb de séances drainage dynamique. */
export function labelsForInclut(ids: string[], drainageNb: number): string[] {
  const set = new Set(ids)
  return DEVIS_INCLUT_ITEMS.filter((i) => set.has(i.id)).map((i) =>
    i.id === 'drainage' ? drainageLabel(drainageNb) : i.label,
  )
}

export function parseDrainageNbFromNotes(notes: string | null | undefined): number | null {
  const line = (notes ?? '').split('\n').find((l) => l.startsWith(DEVIS_DRAINAGE_NB_PREFIX))
  if (line == null) return null
  const n = Number.parseInt(line.slice(DEVIS_DRAINAGE_NB_PREFIX.length).trim(), 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function resolveDrainageNb(
  notes: string | null | undefined,
  rap?: { drainage?: boolean | null; nbSeancesDrainage?: number | null } | null,
): number {
  return parseDrainageNbFromNotes(notes) ?? defaultDrainageNbFromRapport(rap)
}

export function toggleId(ids: string[], id: string, checked: boolean): string[] {
  if (checked) return ids.includes(id) ? ids : [...ids, id]
  return ids.filter((x) => x !== id)
}
