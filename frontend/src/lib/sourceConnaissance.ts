/** Valeurs stockées en base (`patient.sourceContact` + payload formulaire). */
export const SOURCE_CONNAISSANCE_VALUES = ['facebook', 'instagram', 'radio', 'tv', 'amie', 'autre'] as const

export type SourceConnaissance = (typeof SOURCE_CONNAISSANCE_VALUES)[number]

export const SOURCE_CONNAISSANCE_OPTIONS: { value: SourceConnaissance; label: string }[] = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'radio', label: 'Radio' },
  { value: 'tv', label: 'TV' },
  { value: 'amie', label: 'Amie / ami / entourage' },
  { value: 'autre', label: 'Autre' },
]

const LEGACY_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  google: 'Google',
  direct: 'Site web / direct',
  medecin: 'Médecin adressant',
}

export function isSourceConnaissance(v: string): v is SourceConnaissance {
  return (SOURCE_CONNAISSANCE_VALUES as readonly string[]).includes(v)
}

/** Libellé affichage (formulaire récap, liste patients, dashboard). */
export function formatSourceConnaissanceLabel(v: string | null | undefined): string {
  const k = (v ?? '').trim().toLowerCase()
  if (!k) return '—'
  const opt = SOURCE_CONNAISSANCE_OPTIONS.find((o) => o.value === k)
  if (opt) return opt.label
  return LEGACY_LABELS[k] ?? (v ?? '').trim()
}
