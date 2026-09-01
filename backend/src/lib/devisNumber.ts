import type { PrismaClient } from '@prisma/client'

/** Format : MC-MM-NNN-AAAA (ex. MC-05-001-2026) — compteur mensuel. */
export function formatDevisNumber(month: number, seq: number, year: number): string {
  const mm = String(month).padStart(2, '0')
  const nnn = String(seq).padStart(3, '0')
  return `MC-${mm}-${nnn}-${year}`
}

export function parseMcReference(numero: string): { month: number; seq: number; year: number; letter?: string } | null {
  const trimmed = numero.trim()
  let m = trimmed.match(/^MC-(\d{2})-(\d{3})-(\d{4})$/)
  if (m) {
    return { month: parseInt(m[1], 10), seq: parseInt(m[2], 10), year: parseInt(m[3], 10) }
  }
  m = trimmed.match(/^MC-(\d{2})-(\d{3})([A-Z])-(\d{4})$/)
  if (!m) return null
  return {
    month: parseInt(m[1], 10),
    seq: parseInt(m[2], 10),
    year: parseInt(m[4], 10),
    letter: m[3] || undefined,
  }
}

export function normalizeMcReferenceBase(numero: string): string {
  const parsed = parseMcReference(numero)
  if (!parsed) return numero.trim()
  const mm = String(parsed.month).padStart(2, '0')
  const nnn = String(parsed.seq).padStart(3, '0')
  return `MC-${mm}-${nnn}-${parsed.year}`
}

export function formatMcReferenceWithVersion(baseNumero: string, version: number): string {
  const base = normalizeMcReferenceBase(baseNumero)
  const parsed = parseMcReference(base)
  if (!parsed) return baseNumero.trim()
  const letter = getDevisVersionLetter(version)
  const mm = String(parsed.month).padStart(2, '0')
  const nnn = String(parsed.seq).padStart(3, '0')
  return letter ? `MC-${mm}-${nnn}${letter}-${parsed.year}` : `MC-${mm}-${nnn}-${parsed.year}`
}

export function isMcReference(numero: string | null | undefined): boolean {
  return !!numero?.trim() && parseMcReference(numero) !== null
}

/** Référence affichée : numéro devis MC prioritaire, sinon dossier MC, sinon ancien DOS. */
export function resolvePatientReference(
  dossierNumber: string,
  numeroDevis?: string | null,
): string {
  if (numeroDevis?.trim() && isMcReference(numeroDevis)) return numeroDevis.trim()
  if (isMcReference(dossierNumber)) return dossierNumber.trim()
  return dossierNumber
}

function maxSeqForMonth(nums: Array<string | null | undefined>, month: number, year: number): number {
  let maxSeq = 0
  for (const raw of nums) {
    if (!raw) continue
    const parsed = parseMcReference(raw)
    if (parsed && parsed.month === month && parsed.year === year) {
      maxSeq = Math.max(maxSeq, parsed.seq)
    }
  }
  return maxSeq
}

/** Prochain numéro MC (devis + dossiers patients, même compteur mensuel). */
export async function generateNextMcReference(prisma: PrismaClient): Promise<string> {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const prefix = `MC-${String(month).padStart(2, '0')}-`
  const suffix = `-${year}`

  const [devisRows, patientRows] = await Promise.all([
    prisma.devis.findMany({
      where: { numeroDevis: { startsWith: prefix, endsWith: suffix } },
      select: { numeroDevis: true },
    }),
    prisma.patient.findMany({
      where: { dossierNumber: { startsWith: prefix, endsWith: suffix } },
      select: { dossierNumber: true },
    }),
  ])

  const maxSeq = maxSeqForMonth(
    [
      ...devisRows.map((r) => r.numeroDevis),
      ...patientRows.map((r) => r.dossierNumber),
    ],
    month,
    year,
  )

  return formatDevisNumber(month, maxSeq + 1, year)
}

export async function generateNextDevisNumber(prisma: PrismaClient): Promise<string> {
  return generateNextMcReference(prisma)
}

/**
 * N° MC d’une famille de devis : le premier n° déjà attribué au patient,
 * sinon le n° de dossier s’il est déjà MC, sinon un nouveau compteur.
 * Les versions suivantes réutilisent ce n° (lettres -B, -C à l’affichage).
 */
export async function resolveSharedDevisNumber(
  prisma: PrismaClient,
  patientId: string,
  dossierNumber: string,
): Promise<string> {
  const existing = await prisma.devis.findFirst({
    where: { patientId, numeroDevis: { not: null } },
    orderBy: [{ version: 'asc' }, { dateCreation: 'asc' }],
    select: { numeroDevis: true },
  })
  const fromDevis = existing?.numeroDevis?.trim()
  if (fromDevis) return fromDevis
  if (isMcReference(dossierNumber)) return dossierNumber.trim()
  return generateNextDevisNumber(prisma)
}

/**
 * Lettre de version : v1 → aucune, v2 → B, v3 → C, …
 */
export function getDevisVersionLetter(version: number): string | null {
  if (!Number.isFinite(version) || version < 2) return null
  const code = 64 + Math.floor(version) // 2 → 'B'
  if (code < 66 || code > 90) return String(Math.floor(version))
  return String.fromCharCode(code)
}

/** Nom affiché : `MC-07-002B-2026 NOM PRENOM`. */
export function formatDevisListName(
  dossierNumber: string | null | undefined,
  patientFullName: string | null | undefined,
  version: number,
): string {
  const ref = formatMcReferenceWithVersion(dossierNumber?.trim() || 'Dossier', version)
  const name = patientFullName?.trim() || ''
  return name ? `${ref} ${name}` : ref
}

/** Nom de fichier PDF (export / pièce jointe chat). */
export function formatDevisPdfFileName(
  dossierNumber: string | null | undefined,
  patientFullName: string | null | undefined,
  version: number,
): string {
  const label = formatDevisListName(dossierNumber, patientFullName, version)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return `${label || 'Devis'}.pdf`
}

export async function syncPatientDossierFromDevis(
  prisma: PrismaClient,
  patientId: string,
  numeroDevis: string,
): Promise<void> {
  if (!isMcReference(numeroDevis)) return
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { dossierNumber: true },
  })
  if (!patient || patient.dossierNumber === numeroDevis) return
  if (isMcReference(patient.dossierNumber) && patient.dossierNumber !== numeroDevis) return
  await prisma.patient.update({
    where: { id: patientId },
    data: { dossierNumber: numeroDevis },
  })
}
