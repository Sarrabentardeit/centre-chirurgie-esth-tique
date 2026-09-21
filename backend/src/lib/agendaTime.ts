/** Fuseau du cabinet (Tunisie) — indépendant du fuseau du serveur (souvent UTC). */
export const CLINIC_TIMEZONE = 'Africa/Tunis'

function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00'
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    heure: `${get('hour')}:${get('minute')}`,
  }
}

/** Date YYYY-MM-DD + heure HH:mm dans le fuseau cabinet. */
export function formatAgendaSlot(date: Date, timeZone = CLINIC_TIMEZONE) {
  return partsInZone(date, timeZone)
}
