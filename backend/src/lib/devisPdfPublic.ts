import { createHmac, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '../config/env.js'
import { prisma } from './prisma.js'
import { formatDevisPdfFileName, formatMcReferenceWithVersion } from './devisNumber.js'
import { publicAppBaseUrl } from './whatsappDevis.js'

export const UPLOADS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../uploads')

export function signDevisPdfToken(devisId: string): string {
  return createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(`devis-pdf:${devisId}`)
    .digest('hex')
    .slice(0, 32)
}

export function verifyDevisPdfToken(devisId: string, token: string | undefined): boolean {
  if (!token?.trim()) return false
  const expected = signDevisPdfToken(devisId)
  const a = Buffer.from(token.trim())
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Lien public cliquable (WhatsApp) — passe par /api/public, pas /uploads brut. */
export function publicDevisPdfUrl(devisId: string): string {
  return `${publicAppBaseUrl()}/api/public/devis/${encodeURIComponent(devisId)}/pdf?k=${signDevisPdfToken(devisId)}`
}

function filenameFromStoredUrl(url: string): string | null {
  const match = url.trim().match(/\/uploads\/([^/?#]+)/i)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export async function resolveDevisPdfPath(devisId: string): Promise<{
  filePath: string
  downloadName: string
} | null> {
  const devis = await prisma.devis.findFirst({
    where: { id: devisId, deletedAt: null },
    include: { patient: { include: { user: { select: { fullName: true } } } } },
  })
  if (!devis) return null

  const downloadName = formatDevisPdfFileName(
    devis.numeroDevis ?? devis.patient.dossierNumber,
    devis.patient.user.fullName,
    devis.version,
  )
  const ref = formatMcReferenceWithVersion(
    devis.numeroDevis?.trim() || devis.patient.dossierNumber,
    devis.version,
  )
  const refSlug = ref.replace(/[^\w.-]+/g, '_')

  const messages = await prisma.message.findMany({
    where: {
      patientId: devis.patientId,
      staffOnly: false,
      deletedForAll: false,
      pieceJointeUrl: { contains: '/uploads/' },
    },
    orderBy: { dateEnvoi: 'desc' },
    select: { pieceJointeUrl: true, pieceJointeNom: true },
  })

  const names: string[] = []
  const push = (fn: string | null | undefined) => {
    if (fn && !names.includes(fn)) names.push(fn)
  }

  for (const m of messages) {
    if (m.pieceJointeNom === downloadName) push(filenameFromStoredUrl(m.pieceJointeUrl ?? ''))
  }
  for (const m of messages) {
    const fn = filenameFromStoredUrl(m.pieceJointeUrl ?? '')
    if (!fn?.toLowerCase().endsWith('.pdf')) continue
    if (
      (m.pieceJointeNom && m.pieceJointeNom === downloadName)
      || fn.includes(refSlug)
      || (devis.numeroDevis && fn.includes(devis.numeroDevis.replace(/[^\w.-]+/g, '_')))
    ) {
      push(fn)
    }
  }
  for (const m of messages) {
    const fn = filenameFromStoredUrl(m.pieceJointeUrl ?? '')
    if (fn?.toLowerCase().endsWith('.pdf')) push(fn)
  }

  try {
    const files = await readdir(UPLOADS_DIR)
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.pdf')) continue
      if (f.includes(refSlug) || f === downloadName.replace(/\s+/g, '_')) push(f)
    }
  } catch {
    /* dossier vide */
  }

  for (const fn of names) {
    const filePath = path.join(UPLOADS_DIR, fn)
    if (existsSync(filePath)) return { filePath, downloadName }
  }
  return null
}
