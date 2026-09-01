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
  'des auto-massages',
  'des auto massages',
  'des automassages',
]

const FLUO_RE = /prévoir pour le retour en avion|prévoir 6 semaines de drainage/i

const DARK_HI_RE = /^n\.b\b/i

/** Saumon « AU NIVEAU… » — aligné sur DEVIS_REF_TITLE_STYLE (#FF7C80). */
export const DIAG_ZONE_SALMON = '#FF7C80'

/** Gris corps diagnostic visage (réf. Word Devis Type Visage — #595959). */
export const DIAG_VISAGE_GRAY = '#595959'

/** Espacement vertical entre deux diagnostics — exactement 2× Entrée. */
export const DIAGNOSTIC_BLOCK_GAP_HTML =
  '<p class="diag-block-gap devis-spacer"></p>\n<p class="diag-block-gap devis-spacer"></p>'

function isEmptySpacerParagraph(attrs: string, text: string): boolean {
  return !text && (/\bdiag-block-gap\b/.test(attrs) || /\bdevis-spacer\b/.test(attrs))
}

/** CSS — pas de marge supplémentaire (2 paragraphes vides standard). */
export function diagnosticBlockGapCss(..._scopes: string[]): string {
  return ''
}

/** Insère un espace avant chaque nouveau diagnostic (zone AU NIVEAU / Au niveau). */
export function normalizeDiagnosticBlockGapsInHtml(html: string): string {
  if (!html.trim()) return html
  const gapRun = new RegExp(
    String.raw`(?:<p\b[^>]*\b(?:diag-block-gap|devis-spacer)\b[^>]*>\s*(?:<br\b[^>]*\/?>)?\s*<\/p>\s*){3,}`,
    'gi',
  )
  let out = html.replace(gapRun, `${DIAGNOSTIC_BLOCK_GAP_HTML}\n`)
  let zoneIndex = 0
  let visageTitleIndex = 0
  let prevWasGap = false
  return out.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (full, attrs, inner) => {
    const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (isEmptySpacerParagraph(attrs, text)) {
      prevWasGap = true
      return full
    }
    if (!isDiagnosticZoneLine(text)) {
      if (/\bdiag-visage-op-title\b/.test(attrs)) {
        if (visageTitleIndex > 0 && !prevWasGap) {
          prevWasGap = false
          return `${DIAGNOSTIC_BLOCK_GAP_HTML}\n${full}`
        }
        visageTitleIndex++
        prevWasGap = false
        return full
      }
      prevWasGap = false
      return full
    }
    zoneIndex++
    if (zoneIndex > 1 && !prevWasGap) {
      prevWasGap = false
      return `${DIAGNOSTIC_BLOCK_GAP_HTML}\n${full}`
    }
    prevWasGap = false
    return full
  })
}

function isDiagnosticZoneLine(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim()
  return /^(AU NIVEAU|Au niveau)\b/i.test(t) && /vous présentez/i.test(t)
}

function isVisageOperationTitle(title: string): boolean {
  const t = title.replace(/\s+/g, ' ').trim()
  if (!t) return false
  return DIAGNOSTIC_OPERATIONS.some(
    (op) => op.category === 'visage' && !op.isAutre && op.label.replace(/\s+/g, ' ').trim() === t,
  )
}

function paraVisageOpTitle(title: string): string {
  const safe = escapeHtml(title.trim().toUpperCase())
  return `<p class="diag-visage-op-title"><strong><span style="color:${DIAG_VISAGE_GRAY};font-weight:700">${safe}</span></strong></p>`
}

function paraVisageBody(line: string): string {
  return `<p class="diag-visage-body"><span style="color:${DIAG_VISAGE_GRAY}">${applyBold(escapeHtml(line))}</span></p>`
}

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
  'Lipoaspiration assistée au Vaser et MICROAIRE HD 360 degrés (dos, flancs et abdomen)',
  'Lipofilling fessier (injection de graisse dans les fesses)',
  'Lipoaspiration assistée au Vaser et MICROAIRE HD avec lipofilling fessier',
  'aspirer la graisse en excédent',
  'augmenter et harmoniser leur volume',
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
  if (/^nécessité de porter un vêtement compressif/i.test(t)) return true
  if (/^n\.b\s*:/i.test(t) && /lipo/i.test(t)) return true
  return /^nécessité de porter/i.test(t) && /(panty|gaine|manchettes|soutien-gorge)/i.test(t)
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
  const safe = escapeHtml(text)
  return `<p><mark class="diag-dark-fluo" data-color="${bg}" style="background-color:${bg};color:#ffffff"><span style="color:#ffffff">${safe}</span></mark></p>`
}

/** CSS partagé — fluo gris foncé diagnostic (texte blanc). */
export function diagnosticDarkFluoCss(
  ...args: Array<string | { editable?: boolean }>
): string {
  const opts = args.find((a): a is { editable?: boolean } => typeof a === 'object' && a !== null)
  const scopes = args.filter((a): a is string => typeof a === 'string')
  const editable = opts?.editable === true
  const selectors = scopes.flatMap((s) => [
    `${s} mark.diag-dark-fluo`,
    `${s} .diag-dark-fluo`,
    `${s} mark[data-color="${PLANNING_DOC.hiDark}"]`,
    `${s} mark[data-color="#808080"]`,
  ]).join(',\n')
  const spanSelectors = scopes.flatMap((s) => [
    `${s} mark.diag-dark-fluo span`,
    `${s} .diag-dark-fluo span`,
  ]).join(',\n')
  if (editable) {
    return `
${selectors} {
  background-color: ${PLANNING_DOC.hiDark};
  color: #ffffff;
  padding: 1px 4px;
  border-radius: 0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
`
  }
  return `
${selectors} {
  background-color: ${PLANNING_DOC.hiDark} !important;
  color: #ffffff !important;
  padding: 1px 4px;
  border-radius: 0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
${spanSelectors} {
  color: #ffffff !important;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
`
}

/** Corrige le HTML sauvegardé (fluo gris foncé → texte blanc). */
export function normalizeDiagnosticDarkFluoInHtml(html: string): string {
  if (!html.trim()) return html
  let out = html.replace(
    /<p>\s*<mark([^>]*class="[^"]*diag-dark-fluo[^"]*"[^>]*)>([\s\S]*?)<\/mark>\s*<\/p>/gi,
    (_full, _attrs, inner) => {
      const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      return text ? paraDarkHi(text) : _full
    },
  )
  out = out.replace(
    /<p>\s*<mark([^>]*(?:background-color:\s*#808080|data-color="#808080")[^>]*)>([\s\S]*?)<\/mark>\s*<\/p>/gi,
    (full, _attrs, inner) => {
      const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      if (!text) return full
      if (!/^(nécessité de porter|n\.b\s*:)/i.test(text)) return full
      return paraDarkHi(text)
    },
  )
  out = out.replace(
    /<p>\s*((?:Nécessité de porter|N\.B\s*:)[\s\S]*?)<\/p>/gi,
    (full, inner) => {
      const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      if (!isDarkHiLine(text)) return full
      return paraDarkHi(text)
    },
  )
  return out
}

/**
 * Ajoute zone-lead / fluo seulement là où la structure charte manque.
 * Ne reformate pas le HTML déjà stylé (couleurs / polices modifiées dans l’éditeur).
 */
export function upgradeDiagnosticMissingLayoutInHtml(html: string): string {
  if (!html.trim()) return html
  return html.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (full, _attrs, inner) => {
    const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text) return full
    if (isDiagnosticZoneLine(text) && !/\bdiag-zone-lead\b/.test(inner)) {
      const zone = splitZoneLine(text)
      if (zone) return paraPinkLead(zone.lead, zone.rest)
    }
    if (/<mark\b/i.test(inner)) return full
    if (isDarkHiLine(text)) return paraDarkHi(text)
    if (FLUO_RE.test(text)) return paraSalmonHi(text)
    return full
  })
}

/** CSS — libellé zone diagnostic (AU NIVEAU…) en saumon, visible en PDF. */
export function diagnosticZoneLeadCss(
  ...args: Array<string | { editable?: boolean }>
): string {
  const scopes = args.filter((a): a is string => typeof a === 'string')
  const selectors = scopes
    .flatMap((s) => [
      `${s} .diag-zone-lead`,
      `${s} span.diag-zone-lead`,
      `${s} strong.diag-zone-lead`,
      `${s} strong.diag-zone-lead span`,
    ])
    .join(',\n')
  return `
${selectors} {
  color: ${DIAG_ZONE_SALMON} !important;
  font-weight: 700 !important;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
`
}

/** CSS — titres opération visage (gras, capitales, gris Word). */
export function diagnosticVisageCss(...scopes: string[]): string {
  const titleSelectors = scopes.flatMap((s) => [
    `${s} .diag-visage-op-title`,
    `${s} .diag-visage-op-title span`,
  ]).join(',\n')
  const bodySelectors = scopes.flatMap((s) => [
    `${s} .diag-visage-body`,
    `${s} .diag-visage-body span`,
  ]).join(',\n')
  return `
${titleSelectors} {
  color: ${DIAG_VISAGE_GRAY} !important;
  font-weight: 700 !important;
  font-size: 15px;
  margin: 0 0 8px;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
${bodySelectors} {
  color: ${DIAG_VISAGE_GRAY} !important;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
`
}

/** Corrige le HTML sauvegardé (zone AU NIVEAU → saumon + MAJ). */
export function normalizeDiagnosticZoneLeadInHtml(html: string): string {
  if (!html.trim()) return html
  return html.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (full, _attrs, inner) => {
    const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!isDiagnosticZoneLine(text)) return full
    const zone = splitZoneLine(text)
    if (!zone) return full
    return paraPinkLead(zone.lead, zone.rest)
  })
}

function paraPinkLead(lead: string, rest: string): string {
  const leadUpper = lead.trim().toUpperCase()
  const leadHtml = `<span class="diag-zone-lead" style="color:${DIAG_ZONE_SALMON} !important;font-weight:700">${escapeHtml(leadUpper)}</span>`
  const restHtml = rest ? ` ${applyBold(escapeHtml(rest))}` : ''
  return `<p>${leadHtml}${restHtml}</p>`
}

function formatBodyLineHtml(line: string, opts?: { visage?: boolean }): string {
  const t = line.trim()
  if (!t) return '<p></p>'
  if (FLUO_RE.test(t)) return paraSalmonHi(t)
  if (isDarkHiLine(t)) return paraDarkHi(t)
  const zone = splitZoneLine(t)
  if (zone) return paraPinkLead(zone.lead, zone.rest)
  if (isItalicLine(t)) {
    return `<p><em class="diag-italic" style="color:#282727">${escapeHtml(t)}</em></p>`
  }
  if (opts?.visage) return paraVisageBody(t)
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
  const byZone = t
    .split(/\n+(?=(?:AU NIVEAU|Au niveau)\b[^\n]*vous présentez)/i)
    .map((s) => s.trim())
    .filter(Boolean)
  if (byZone.length > 1) return byZone
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
  const visage = isVisageOperationTitle(block.title)
  const parts: string[] = []
  if (visage && block.title.trim()) {
    parts.push(paraVisageOpTitle(block.title))
  }
  const bodyLines = block.body ? block.body.split('\n') : []
  for (const line of bodyLines) parts.push(formatBodyLineHtml(line, { visage }))
  return parts.join('\n')
}

/** Retire les titres d’intervention (numérotés, visage, etc.) du corps diagnostic devis. */
export function stripDiagnosticOpTitlesFromHtml(html: string): string {
  if (!html.trim()) return html
  let out = html.replace(
    /<p[^>]*class="[^"]*(?:diagnostic-op-title|diag-visage-op-title)[^"]*"[^>]*>[\s\S]*?<\/p>\s*/gi,
    '',
  )
  out = out.replace(/<p>\s*<strong>\s*\d+\s*[-–.]\s+[\s\S]*?<\/strong>\s*<\/p>\s*/gi, '')
  return out
}

/** HTML lettre devis / PDF / fiche gestionnaire — gras et fluo (sans titres d’intervention). */
export function formatDiagnosticLetterHtml(text: string, interventionLabels: string[] = []): string {
  const raw = text.trim()
  if (!raw) return '<p>—</p>'
  const blocksHtml = titledDiagnosticBlocks(raw, interventionLabels).map(formatBlockHtml)
  const joined =
    blocksHtml.length > 1
      ? blocksHtml.join(`\n${DIAGNOSTIC_BLOCK_GAP_HTML}\n`)
      : blocksHtml[0] ?? '<p>—</p>'
  return stripDiagnosticOpTitlesFromHtml(
    normalizeDiagnosticZoneLeadInHtml(
      normalizeDiagnosticBlockGapsInHtml(
        normalizeDiagnosticDarkFluoInHtml(joined),
      ),
    ),
  )
}
