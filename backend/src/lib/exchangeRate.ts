import { env } from '../config/env.js'

/** Repli si clé absente ou API indisponible (aligné sur moneyWords frontend). */
export const FALLBACK_TND_PER_EUR = 3.35

const CACHE_MS = 24 * 60 * 60 * 1000

export type TndEurRateSource = 'exchangerate-api' | 'fallback'

export interface TndEurRate {
  tndPerEur: number
  eurPerTnd: number
  date: string
  source: TndEurRateSource
}

let cache: (TndEurRate & { fetchedAt: number }) | null = null

interface ExchangeRateApiV6Response {
  result: string
  conversion_rates?: { EUR?: number }
}

function todayFr(): string {
  return new Date().toLocaleDateString('fr-FR', { timeZone: 'Africa/Tunis' })
}

function fallbackRate(): TndEurRate {
  return {
    tndPerEur: FALLBACK_TND_PER_EUR,
    eurPerTnd: 1 / FALLBACK_TND_PER_EUR,
    date: todayFr(),
    source: 'fallback',
  }
}

export async function getTndEurRate(): Promise<TndEurRate> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    const { fetchedAt: _f, ...rate } = cache
    return rate
  }

  const key = env.EXCHANGE_RATE_API_KEY?.trim()
  if (!key) {
    return fallbackRate()
  }

  try {
    const url = `https://v6.exchangerate-api.com/v6/${encodeURIComponent(key)}/latest/TND`
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as ExchangeRateApiV6Response
    const eurPerTnd = data.conversion_rates?.EUR
    if (data.result !== 'success' || !eurPerTnd || eurPerTnd <= 0) {
      throw new Error('Taux EUR/TND invalide')
    }
    const rate: TndEurRate = {
      tndPerEur: 1 / eurPerTnd,
      eurPerTnd,
      date: todayFr(),
      source: 'exchangerate-api',
    }
    cache = { ...rate, fetchedAt: Date.now() }
    return rate
  } catch (err) {
    console.warn('[exchangeRate] API indisponible, repli 3,35:', err)
    return fallbackRate()
  }
}
