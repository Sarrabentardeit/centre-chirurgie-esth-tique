/** Taux indicatif TND → EUR (repli si API indisponible). */
export const DEFAULT_TND_PER_EUR = 3.35

const UNITS = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
  'dix-sept',
  'dix-huit',
  'dix-neuf',
] as const

function under100(n: number): string {
  if (n < 20) return UNITS[n] ?? ''
  if (n < 70) {
    const u = n % 10
    if (n === 60) return 'soixante'
    return `soixante-${UNITS[u]}`
  }
  if (n < 80) {
    const u = n - 70
    if (u === 0) return 'soixante-dix'
    return `soixante-${UNITS[10 + u]}`
  }
  const u = n - 80
  if (u === 0) return 'quatre-vingts'
  return `quatre-vingt-${UNITS[u]}`
}

function under1000(n: number): string {
  if (n < 100) return under100(n)
  const h = Math.floor(n / 100)
  const r = n % 100
  const cent =
    h === 1 ? 'cent' : h > 1 ? `${UNITS[h]} cent${r === 0 ? 's' : ''}` : ''
  if (r === 0) return cent
  return `${cent} ${under100(r)}`.trim()
}

function under1_000_000(n: number): string {
  if (n < 1000) return under1000(n)
  const t = Math.floor(n / 1000)
  const r = n % 1000
  const mille = t === 1 ? 'mille' : `${numberToFrenchWords(t)} mille`
  if (r === 0) return mille
  return `${mille} ${under1000(r)}`.trim()
}

/** Montant entier en toutes lettres (français). */
export function numberToFrenchWords(n: number): string {
  if (!Number.isFinite(n)) return ''
  const value = Math.round(Math.abs(n))
  if (value === 0) return 'zéro'
  if (value >= 1_000_000) {
    const m = Math.floor(value / 1_000_000)
    const r = value % 1_000_000
    const million = m === 1 ? 'un million' : `${numberToFrenchWords(m)} millions`
    if (r === 0) return million
    return `${million} ${under1_000_000(r)}`.trim()
  }
  return under1_000_000(value)
}

/** Ex. : « onze mille sept cents » pour 11 700 TND. */
export function amountTndInWords(totalTnd: number): string {
  const words = numberToFrenchWords(totalTnd)
  if (!words) return ''
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Conversion indicative TND → EUR (arrondi à l’unité). */
export function tndToEuroApprox(totalTnd: number, tndPerEur = DEFAULT_TND_PER_EUR): number {
  if (!Number.isFinite(totalTnd) || tndPerEur <= 0) return 0
  return Math.round(totalTnd / tndPerEur)
}

export function formatEuroApprox(totalTnd: number, tndPerEur = DEFAULT_TND_PER_EUR): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(tndToEuroApprox(totalTnd, tndPerEur))
}

export function amountEuroInWords(totalTnd: number, tndPerEur = DEFAULT_TND_PER_EUR): string {
  return amountTndInWords(tndToEuroApprox(totalTnd, tndPerEur))
}

/** Remplace les anciens placeholders dans un HTML déjà sauvegardé. */
export function replaceDevisAmountPlaceholders(html: string, totalTnd: number): string {
  if (!html.includes('[montant en lettres]') && !html.includes('[montant en euros]')) return html
  const letters = amountTndInWords(totalTnd)
  const euroLetters = amountEuroInWords(totalTnd)
  return html
    .replace(/\[montant en lettres\]/gi, letters)
    .replace(/\[montant en euros\]/gi, euroLetters)
}

export function buildDevisAmountSentence(totalTnd: number): string {
  const totalStr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(totalTnd)
  const letters = amountTndInWords(totalTnd)

  return `La totalité des frais de votre séjour médical s'élève à ${letters} Dinars Tunisiens (${totalStr} dt).`
}
