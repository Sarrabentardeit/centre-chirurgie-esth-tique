import { DIAGNOSTIC_OPERATIONS, inferSelectedOperationIds } from '@/lib/diagnosticTemplates'
import { PLANNING_DOC, paraSalmonHi } from '@/lib/planningSejourBranding'

export type DiagnosticBlock = {
  index: number
  title: string
  body: string
}

const TITLE_RE = /^(\d+)\s*[-–.]\s+(.+)$/

const ITALIC_PREFIXES = [
  'le choix de la forme',
  'nécessité de porter',
  'des auto-massages',
  'des auto massages',
  'des automassages',
]

const FLUO_RE = /prévoir pour le retour en avion|prévoir 6 semaines de drainage/i

const DARK_HI_RE = /^n\.b\b/i

/** Expressions en gras dans le document Word (les plus longues d’abord). */
const BOLD_PHRASES = [
  'des seins tubéreux Grade  (anomalie de distribution de la base des seins avec un aspect allongé en tubercule, non arrondis et concentration de tout le volume du sein derrière l’aréole)',
  'hypotrophie mammaire (faible volume mammaire)',
  'hypotrophie mammaire (faible volume) avec asymétrie',
  'hypertrophie mammaire avec ptose (seins tombants)',
  'une ptose mammaire (seins tombants) avec un volume suffisant',
  'une ptose mammaire (seins tombants)',
  'ptose mammaire (seins tombants)',
  'une ptose (seins tombants)',
  'ptose (seins tombants)',
  'Augmentation Mammaire Hybride (par pose de prothèses + lipofilling)',
  'Augmentation Mammaire par pose de prothèses',
  'Lifting Mammaire avec augmentation de volume par prothèses',
  'Cure de Seins Tubéreux avec pose de prothèses',
  'Changement de Prothèses Mammaires avec Lifting',
  'Retrait de Prothèses Mammaires avec Lifting',
  'Lifting Mammaire sans pose de prothèses',
  'Changement de Prothèses Mammaires',
  'Augmentation Mammaire Hybride',
  'faible volume mammaire',
  'volume mammaire suffisant',
  'hypotrophie mammaire',
  'Réduction Mammaire',
  'écartement des muscles droits de l’abdomen : DIASTASIS',
  'Lipoaspiration assistée au Vaser et MICROAIRE HD avec lipofilling fessier',
  'Lipoaspiration assistée au Vaser et MICROAIRE HD',
  'Lipoaspiration de la graisse du cercle abdominal',
  'Abdominoplastie (lifting du ventre)',
  'technique VASER MICROAIRE HD',
  'technique PAL MICROAIRE',
  'LYMPHO SPARING liposuction',
  'lipoméries (localisations graisseuses)',
  'excédent graisseux et cutané',
  'un excédent graisseux',
  'relâchement cutané',
  'Cure de DIASTASIS',
  'Lifting des Bras',
  'une Lipoaspiration',
  ...DIAGNOSTIC_OPERATIONS.filter((op) => !op.isAutre).map((op) => op.label),
].sort((a, b) => b.length - a.length)

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function applyBold(escaped: string): string {
  let out = escaped
  const seen = new Set<string>()
  for (const phrase of BOLD_PHRASES) {
    const key = phrase.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const re = new RegExp(escapeRe(escapeHtml(phrase)), 'gi')
    out = out.replace(re, (m) => `<strong>${m}</strong>`)
  }
  return out
}

function isItalicLine(line: string): boolean {
  const t = line.trim().toLowerCase()
  return ITALIC_PREFIXES.some((p) => t.startsWith(p))
}

export function splitDiagnosticBlocks(text: string): DiagnosticBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: DiagnosticBlock[] = []
  let current: { index: number; title: string; lines: string[] } | null = null
  const preamble: string[] = []

  for (const line of lines) {
    const m = line.trim().match(TITLE_RE)
    if (m) {
      if (current) {
        blocks.push({
          index: current.index,
          title: current.title,
          body: current.lines.join('\n').trim(),
        })
      }
      current = { index: Number(m[1]), title: m[2].trim(), lines: [] }
    } else if (current) {
      current.lines.push(line)
    } else {
      preamble.push(line)
    }
  }
  if (current) {
    blocks.push({
      index: current.index,
      title: current.title,
      body: current.lines.join('\n').trim(),
    })
  }
  if (blocks.length === 0 && text.trim()) {
    return [{ index: 1, title: '', body: text.trim() }]
  }
  if (preamble.join('\n').trim() && blocks.length > 0) {
    blocks.unshift({ index: 0, title: '', body: preamble.join('\n').trim() })
  }
  return blocks
}

function isDarkHiLine(line: string): boolean {
  const t = line.trim()
  if (DARK_HI_RE.test(t)) return true
  return /^nécessité de porter/i.test(t) && /(panty|gaine|manchettes)/i.test(t)
}

function splitZoneLine(line: string): { lead: string; rest: string } | null {
  const t = line.trim()
  if (!/^(AU NIVEAU|Au niveau)/.test(t)) return null
  const idx = t.search(/,\s*vous présentez/i)
  if (idx < 0) return { lead: t, rest: '' }
  return { lead: t.slice(0, idx + 1), rest: t.slice(idx + 1).trim() }
}

function paraDarkHi(text: string): string {
  const bg = PLANNING_DOC.hiDark
  return `<p><mark data-color="${bg}" style="background-color:${bg};color:#ffffff;-webkit-print-color-adjust:exact;print-color-adjust:exact">${escapeHtml(text)}</mark></p>`
}

function paraPinkLead(lead: string, rest: string): string {
  const leadHtml = `<strong style="color:${PLANNING_DOC.pink}">${escapeHtml(lead)}</strong>`
  const restHtml = rest ? ` ${applyBold(escapeHtml(rest))}` : ''
  return `<p>${leadHtml}${restHtml}</p>`
}

function formatBodyLineHtml(line: string): string {
  const t = line.trim()
  if (!t) return '<p></p>'
  if (FLUO_RE.test(t)) return paraSalmonHi(t)
  if (isDarkHiLine(t)) return paraDarkHi(t)
  const zone = splitZoneLine(t)
  if (zone) return paraPinkLead(zone.lead, zone.rest)
  if (isItalicLine(t)) {
    return `<p><em class="diag-italic" style="color:#282727">${escapeHtml(t)}</em></p>`
  }
  return `<p>${applyBold(escapeHtml(t))}</p>`
}

function titleForChunk(chunk: string, fallback?: string): string {
  const ids = inferSelectedOperationIds(chunk)
  if (ids[0]) {
    const op = DIAGNOSTIC_OPERATIONS.find((item) => item.id === ids[0])
    if (op?.label) return op.label
  }
  return fallback?.trim() || ''
}

function splitBodyIntoOperations(body: string): string[] {
  const t = body.trim()
  if (!t) return []
  const byExam = t.split(/\n+(?=À l['’]examen des photos)/i).map((s) => s.trim()).filter(Boolean)
  if (byExam.length > 1) return byExam
  const byFluo = t.split(/(?<=anti-varices\.)\s*\n+(?=\S)/i).map((s) => s.trim()).filter(Boolean)
  if (byFluo.length > 1) return byFluo
  return [t]
}

/** Ajoute 1 -, 2 -, … et le nom d’opération si le texte n’a pas encore de titres. */
export function titledDiagnosticBlocks(text: string, interventionLabels: string[] = []): DiagnosticBlock[] {
  const raw = splitDiagnosticBlocks(text)
  if (raw.some((b) => b.title.trim())) {
    return raw.map((b, i) => ({
      ...b,
      index: b.index > 0 ? b.index : i + 1,
    }))
  }

  const blob = raw.map((b) => b.body).join('\n\n').trim()
  const ids = inferSelectedOperationIds(blob)
  const ops = ids
    .map((id) => DIAGNOSTIC_OPERATIONS.find((item) => item.id === id))
    .filter((op): op is NonNullable<typeof op> => Boolean(op?.template))

  if (ops.length > 0) {
    const positions = ops
      .map((op) => ({ op, idx: blob.indexOf(op.template.trim()) }))
      .filter((p) => p.idx >= 0)
      .sort((a, b) => a.idx - b.idx)
    if (positions.length > 0) {
      return positions.map((p, i) => {
        const start = p.idx
        const end = i + 1 < positions.length ? positions[i + 1].idx : blob.length
        return {
          index: i + 1,
          title: p.op.label,
          body: blob.slice(start, end).trim(),
        }
      })
    }
  }

  const chunks = splitBodyIntoOperations(blob)
  const labels = interventionLabels.map((l) => l.trim()).filter(Boolean)
  return chunks.map((chunk, i) => ({
    index: i + 1,
    title: titleForChunk(chunk, labels[i] || (chunks.length === 1 && labels.length === 1 ? labels[0] : '')),
    body: chunk,
  }))
}

function formatBlockHtml(block: DiagnosticBlock): string {
  const parts: string[] = []
  if (block.title) {
    const n = block.index > 0 ? `${block.index} - ` : ''
    parts.push(
      `<p class="diagnostic-op-title"><strong>${escapeHtml(`${n}${block.title}`)}</strong></p>`,
    )
  }
  const bodyLines = block.body ? block.body.split('\n') : []
  for (const line of bodyLines) parts.push(formatBodyLineHtml(line))
  return parts.join('\n')
}

/** HTML lettre devis / PDF / fiche gestionnaire — titres numérotés, gras et fluo. */
export function formatDiagnosticLetterHtml(text: string, interventionLabels: string[] = []): string {
  const raw = text.trim()
  if (!raw) return '<p>—</p>'
  return titledDiagnosticBlocks(raw, interventionLabels).map(formatBlockHtml).join('\n<p></p>\n')
}
