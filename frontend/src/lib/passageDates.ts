/** Date de passage : intervention prioritaire, sinon arrivée. */
export function passageDateRaw(p: {
  logistique?: { dateIntervention?: string | null; dateArrivee?: string | null } | null
}): { kind: 'intervention' | 'arrivee'; value: string } | null {
  const intervention = p.logistique?.dateIntervention?.trim()
  if (intervention) return { kind: 'intervention', value: intervention }
  const arrivee = p.logistique?.dateArrivee?.trim()
  if (arrivee) return { kind: 'arrivee', value: arrivee }
  return null
}

export type PassageBucket = 'upcoming' | 'past' | 'undated'

const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const

/** Jour calendaire local (évite les décalages UTC sur YYYY-MM-DD). */
export function passageDayLocal(raw: string): Date | null {
  const m = raw.trim().slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function passageBucket(
  p: {
    status: string
    logistique?: { dateIntervention?: string | null; dateArrivee?: string | null } | null
  },
  startOfToday: Date,
): PassageBucket {
  if (p.status === 'post_op' || p.status === 'suivi_termine') return 'past'
  const raw = passageDateRaw(p)?.value
  if (!raw) return 'undated'
  const d = passageDayLocal(raw)
  if (!d) return 'undated'
  return d.getTime() < startOfToday.getTime() ? 'past' : 'upcoming'
}

export function passageMonthMeta(raw: string | null | undefined): { key: string; label: string } | null {
  if (!raw) return null
  const d = passageDayLocal(raw)
  if (!d) return null
  const label = `${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`
  return {
    key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    label: label.charAt(0).toUpperCase() + label.slice(1),
  }
}

export const PASSAGE_BUCKET_ORDER: Record<PassageBucket, number> = {
  upcoming: 0,
  past: 1,
  undated: 2,
}

export const PASSAGE_BUCKET_LABEL: Record<PassageBucket, string> = {
  upcoming: 'À venir',
  past: 'Opérées',
  undated: 'Sans date',
}

export function startOfTodayLocal(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function passageTimestamp(p: {
  logistique?: { dateIntervention?: string | null; dateArrivee?: string | null } | null
}): number | null {
  const raw = passageDateRaw(p)?.value
  if (!raw) return null
  const d = passageDayLocal(raw)
  return d ? d.getTime() : null
}
