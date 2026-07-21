/** Sons courts via Web Audio API (aucun fichier audio requis). */

let audioCtx: AudioContext | null = null

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

function playToneSequence(
  notes: Array<{ freq: number; start: number; duration: number }>,
  type: OscillatorType,
  volume: number,
) {
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()

  const now = ctx.currentTime
  for (const note of notes) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = note.freq
    const t0 = now + note.start
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + note.duration + 0.02)
  }
}

/** Son « nouveau message chat » — double bip clair. */
export function playMessageSound() {
  playToneSequence(
    [
      { freq: 880, start: 0, duration: 0.12 },
      { freq: 1174, start: 0.13, duration: 0.14 },
    ],
    'sine',
    0.12,
  )
}

/** Son « nouvelle notification » — triple bip plus grave. */
export function playNotificationSound() {
  playToneSequence(
    [
      { freq: 523, start: 0, duration: 0.1 },
      { freq: 659, start: 0.11, duration: 0.1 },
      { freq: 784, start: 0.22, duration: 0.14 },
    ],
    'triangle',
    0.1,
  )
}
