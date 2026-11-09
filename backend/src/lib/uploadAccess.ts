import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'

const GUEST_TTL_SEC = 48 * 60 * 60 // aperçu formulaire public avant compte

function hmac(payload: string): string {
  return createHmac('sha256', env.JWT_ACCESS_SECRET).update(payload).digest('hex').slice(0, 32)
}

/** Jeton signé pour ouvrir un fichier guest sans session (formulaire public). */
export function signGuestUploadToken(filename: string, ttlSec = GUEST_TTL_SEC): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec
  const sig = hmac(`guest-upload:${filename}:${exp}`)
  return `${exp}.${sig}`
}

export function verifyGuestUploadToken(filename: string, token: string | undefined): boolean {
  if (!token?.trim()) return false
  const [expRaw, sig] = token.trim().split('.')
  const exp = Number(expRaw)
  if (!expRaw || !sig || !Number.isFinite(exp)) return false
  if (exp < Math.floor(Date.now() / 1000)) return false
  const expected = hmac(`guest-upload:${filename}:${exp}`)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function isGuestUploadFilename(filename: string): boolean {
  return filename.startsWith('guest-')
}
