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

const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'] as const

function under100(n: number): string {
  if (n < 20) return UNITS[n] ?? ''
  if (n < 70) {
    const tens = Math.floor(n / 10)
    const u = n % 10
    const tensWord = TENS[tens] ?? ''
    if (u === 0) return tensWord
    if (u === 1) return `${tensWord}-et-un`
    return `${tensWord}-${UNITS[u]}`
  }
  if (n < 80) {
    const u = n - 70
    if (u === 0) return 'soixante-dix'
    return `soixante-${UNITS[10 + u]}`
  }
  const u = n - 80
  if (u === 0) return 'quatre-vingts'
  if (u === 10) return 'quatre-vingt-dix'
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
export function replaceDevisAmountPlaceholders(
  html: string,
  totalTnd: number,
  tndPerEur = DEFAULT_TND_PER_EUR,
): string {
  if (!html.includes('[montant en lettres]') && !html.includes('[montant en euros]')) {
    return refreshDevisAmountSentenceInHtml(html, totalTnd, tndPerEur)
  }
  const letters = amountTndInWords(totalTnd)
  const euroLetters = amountEuroInWords(totalTnd, tndPerEur)
  const withPlaceholders = html
    .replace(/\[montant en lettres\]/gi, letters)
    .replace(/\[montant en euros\]/gi, euroLetters)
  return refreshDevisAmountSentenceInHtml(withPlaceholders, totalTnd, tndPerEur)
}

export function buildDevisAmountSentence(
  totalTnd: number,
  tndPerEur = DEFAULT_TND_PER_EUR,
): string {
  const totalStr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(totalTnd)
  const letters = amountTndInWords(totalTnd)
  const euroStr = formatEuroApprox(totalTnd, tndPerEur)

  return `La totalité des frais de votre séjour médical s'élève à ${letters} Dinars Tunisiens (${totalStr} dt ≈ ${euroStr}).`
}

/** Met à jour la phrase de total (avec € approx.) dans un HTML déjà sauvegardé. */
export function refreshDevisAmountSentenceInHtml(
  html: string,
  totalTnd: number,
  tndPerEur = DEFAULT_TND_PER_EUR,
): string {
  if (!html || !Number.isFinite(totalTnd)) return html
  const fresh = buildDevisAmountSentence(totalTnd, tndPerEur)
  const re =
    /La totalité des frais de votre séjour médical s['’]élève à[\s\S]*?Dinars Tunisiens\s*\([^)]*\)\.?/gi

  if (re.test(html)) {
    return html.replace(re, fresh)
  }

  if (typeof window === 'undefined') return html
  try {
    const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html')
    const root = doc.getElementById('__root')
    if (!root) return html
    for (const p of Array.from(root.querySelectorAll('p'))) {
      const t = (p.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (/totalité des frais de votre séjour médical/i.test(t)) {
        p.textContent = fresh
        return root.innerHTML
      }
    }
  } catch {
    /* ignore */
  }
  return html
}
