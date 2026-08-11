/**
 * Cases à cocher « Votre devis inclut / Notre forfait exclut »
 * Persistées dans notesSejour (préfixes DEVIS_INCLUT / DEVIS_EXCLUT).
 */

export const DEVIS_INCLUT_PREFIX = 'DEVIS_INCLUT:'
export const DEVIS_EXCLUT_PREFIX = 'DEVIS_EXCLUT:'

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
    label: '2 Séances de drainage lymphatique : massages par un kinésithérapeute,',
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

export function toggleId(ids: string[], id: string, checked: boolean): string[] {
  if (checked) return ids.includes(id) ? ids : [...ids, id]
  return ids.filter((x) => x !== id)
}
