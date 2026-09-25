import { createHmac, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { env } from '../config/env.js'
import { UPLOADS_DIR } from './devisPdfPublic.js'
import { publicAppBaseUrl } from './whatsappDevis.js'

export function planningPdfFileName(patientId: string): string {
  return `planning-sejour-${patientId}.pdf`
}

export function planningPdfDiskPath(patientId: string): string {
  return path.join(UPLOADS_DIR, planningPdfFileName(patientId))
}

export function signPlanningPdfToken(patientId: string): string {
  return createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(`planning-pdf:${patientId}`)
    .digest('hex')
    .slice(0, 32)
}

export function verifyPlanningPdfToken(patientId: string, token: string | undefined): boolean {
  if (!token?.trim()) return false
  const expected = signPlanningPdfToken(patientId)
  const a = Buffer.from(token.trim())
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function publicPlanningPdfUrl(patientId: string): string {
  return `${publicAppBaseUrl()}/api/public/planning/${encodeURIComponent(patientId)}/pdf?k=${signPlanningPdfToken(patientId)}`
}

export function resolvePlanningPdfPath(patientId: string): { filePath: string; downloadName: string } | null {
  const filePath = planningPdfDiskPath(patientId)
  if (!existsSync(filePath)) return null
  return { filePath, downloadName: 'Planning-sejour.pdf' }
}
