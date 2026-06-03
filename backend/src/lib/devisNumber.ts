import type { PrismaClient } from '@prisma/client'

/** Format : MC-MM-NNN-AAAA (ex. MC-05-001-2026) — compteur mensuel. */
export function formatDevisNumber(month: number, seq: number, year: number): string {
  const mm = String(month).padStart(2, '0')
  const nnn = String(seq).padStart(3, '0')
  return `MC-${mm}-${nnn}-${year}`
}

export function parseMcReference(numero: string): { month: number; seq: number; year: number } | null {
  const m = numero.trim().match(/^MC-(\d{2})-(\d{3})-(\d{4})$/)
  if (!m) return null
  return { month: parseInt(m[1], 10), seq: parseInt(m[2], 10), year: parseInt(m[3], 10) }
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
