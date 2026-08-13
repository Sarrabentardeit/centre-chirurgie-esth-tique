/** Sons courts via Web Audio API (aucun fichier audio requis). */

let audioCtx: AudioContext | null = null
let lastMessageAt = 0
let lastNotifAt = 0

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new Ctx()
    }
    return audioCtx
  } catch {
    return null
  }
}

/** À appeler après une interaction utilisateur pour autoriser le son (politique navigateurs). */
export function unlockNotificationAudio() {
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()
}

function playTone(
  ctx: AudioContext,
  opts: {
    freq: number
    start: number
    duration: number
    type: OscillatorType
    volume: number
    /** Léger glissando (Messenger-like) */
    freqEnd?: number
  },
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = opts.type
  const t0 = ctx.currentTime + opts.start
  osc.frequency.setValueAtTime(opts.freq, t0)
  if (opts.freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, opts.freqEnd), t0 + opts.duration)
  }
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(opts.volume, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + opts.duration + 0.03)
}

/**
 * Son message — style Messenger / chat classique :
 * double « pop » doux, clair, court (pas une alarme).
 */
export function playMessageSound() {
  const now = Date.now()
  if (now - lastMessageAt < 450) return
  lastMessageAt = now

  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()

  // Pop 1 (plus grave) + Pop 2 (plus aigu) — signature type Messenger
  playTone(ctx, { freq: 920, freqEnd: 1100, start: 0, duration: 0.09, type: 'sine', volume: 0.11 })
  playTone(ctx, { freq: 1240, freqEnd: 1480, start: 0.1, duration: 0.11, type: 'sine', volume: 0.1 })
  // Harmonique légère pour le « bubble »
  playTone(ctx, { freq: 1840, start: 0.1, duration: 0.07, type: 'triangle', volume: 0.035 })
}

/**
 * Son notification — distinct du chat : carillon plus grave / « ding » app.
 */
export function playNotificationSound() {
  const now = Date.now()
  if (now - lastNotifAt < 600) return
  lastNotifAt = now

  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()

  playTone(ctx, { freq: 520, start: 0, duration: 0.14, type: 'triangle', volume: 0.1 })
  playTone(ctx, { freq: 690, start: 0.12, duration: 0.16, type: 'triangle', volume: 0.09 })
  playTone(ctx, { freq: 520, start: 0.28, duration: 0.18, type: 'sine', volume: 0.06 })
}
