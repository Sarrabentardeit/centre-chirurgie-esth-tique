const DAY_MS = 86_400_000

export function daysBetween(from: string | Date, to: string | Date): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS)
}

export function daysSinceDate(date: string | Date): number {
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / DAY_MS))
}

export function photoDayOffset(suivi: { dateIntervention: string }, photo: { date: string }): number {
  return Math.max(0, daysBetween(suivi.dateIntervention, photo.date))
}
