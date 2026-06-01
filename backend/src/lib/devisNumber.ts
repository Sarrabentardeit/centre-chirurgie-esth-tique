import type { PrismaClient } from '@prisma/client'

/** Format : MC-MM-NNN-AAAA (ex. MC-05-001-2026) — compteur mensuel. */
export function formatDevisNumber(month: number, seq: number, year: number): string {
  const mm = String(month).padStart(2, '0')
  const nnn = String(seq).padStart(3, '0')
  return `MC-${mm}-${nnn}-${year}`
}

function parseDevisNumber(numero: string): { month: number; seq: number; year: number } | null {
  const m = numero.match(/^MC-(\d{2})-(\d{3})-(\d{4})$/)
  if (!m) return null
  return { month: parseInt(m[1], 10), seq: parseInt(m[2], 10), year: parseInt(m[3], 10) }
}

export async function generateNextDevisNumber(prisma: PrismaClient): Promise<string> {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const prefix = `MC-${String(month).padStart(2, '0')}-`
  const suffix = `-${year}`

  const rows = await prisma.devis.findMany({
    where: {
      numeroDevis: { startsWith: prefix, endsWith: suffix },
    },
    select: { numeroDevis: true },
  })

  let maxSeq = 0
  for (const row of rows) {
    if (!row.numeroDevis) continue
    const parsed = parseDevisNumber(row.numeroDevis)
    if (parsed && parsed.month === month && parsed.year === year) {
      maxSeq = Math.max(maxSeq, parsed.seq)
    }
  }

  return formatDevisNumber(month, maxSeq + 1, year)
}
