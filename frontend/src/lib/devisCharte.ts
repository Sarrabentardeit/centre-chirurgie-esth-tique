/**
 * Charte graphique devis — réf. charte_graphique/Sans titre - 1-07.png
 * Accent principal unique : bronze. Teal réservé aux titres de structure.
 */
import { diagnosticDarkFluoCss, diagnosticBlockGapCss, diagnosticZoneLeadCss, diagnosticVisageCss } from '@/lib/diagnosticFormat'

export const DEVIS_CHARTE = {
  white: '#ffffff',
  cream: '#fdeada',
  gray: '#929292',
  charcoal: '#282727',
  teal: '#062a30',
  rose: '#e4c8bd',
  bronze: '#81572d',
} as const

/** Accent principal (bronze). */
export const DEVIS_ACCENT = DEVIS_CHARTE.bronze

/** Police corps devis (réf. Word — Calibri). */
export const DEVIS_FONT_FAMILY = "Calibri, 'Segoe UI', Arial, Helvetica, sans-serif"

/** Hiérarchie typo : titre devis > titres section > sous-titres saumon > corps. */
export const DEVIS_BODY_FONT_SIZE = '14px'
export const DEVIS_OFFER_TABLE_FONT_SIZE = '13.5px'
export const DEVIS_OFFER_TARIF_HINT_FONT_SIZE = '12px'
export const DEVIS_OFFER_PRICE_FONT_SIZE = '15px'
export const DEVIS_OFFER_SEJOUR_FONT_SIZE = '13px'

/** Titre « Devis MC-… » — saumon sur fond gris (réf. document Word). */
export const DEVIS_REF_TITLE_STYLE = {
  color: '#FF7C80',
  highlight: '#D9D9D9',
  fontSize: '20px',
} as const

function escapeDevisTitleText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** HTML du titre devis centré (couleur + taille + surlignage gris). */
export function buildDevisRefTitleHtml(title: string): string {
  const { color, highlight, fontSize } = DEVIS_REF_TITLE_STYLE
  const safe = escapeDevisTitleText(title)
  return `<p class="devis-ref-title" style="text-align:center"><strong><mark data-color="${highlight}" style="background-color:${highlight}"><u><span style="color:${color};font-size:${fontSize}">${safe}</span></u></mark></strong></p>`
}

/** CSS partagé éditeur + PDF pour le titre devis. */
export function devisRefTitleCss(scope = ''): string {
  const p = scope ? `${scope} ` : ''
  const S = DEVIS_REF_TITLE_STYLE
  return `
${p}.devis-ref-title {
  text-align: center !important;
  margin: 12px 0 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
${p}.devis-ref-title mark {
  background-color: ${S.highlight};
  padding: 2px 10px;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
${p}.devis-ref-title strong { font-weight: 700; letter-spacing: 0.02em; }
${p}.devis-ref-title u {
  text-decoration: underline !important;
  border-bottom: none !important;
  text-underline-offset: 2px;
}
${p}.devis-ref-title strong mark span,
${p}.devis-ref-title mark span,
${p}.devis-ref-title mark u {
  color: ${S.color};
  font-size: ${S.fontSize};
  font-weight: 700;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
`
}

/** Titres de section (Récapitulatif, Diagnostic, Détails…) — gris souligné, gras. */
export const DEVIS_SECTION_HEADING_STYLE = {
  color: '#555555',
  fontSize: '18px',
  fontWeight: '700',
} as const

/** Sous-titres / libellés saumon (Intervention souhaitée :, etc.). */
export const DEVIS_FIELD_LABEL_STYLE = {
  fontSize: '15px',
  fontWeight: '700',
} as const

function escapeDevisInlineText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Espace uniforme : titre ↔ paragraphe, et bloc ↔ titre suivant. */
export const DEVIS_SECTION_GAP = {
  beforeTitle: '16px',
  afterTitle: '8px',
  block: '8px',
  listItem: '6px',
} as const

/** Sous-titres saumon — espacement compact (éviter cumul avec marges de listes / blocs). */
export const DEVIS_SALMON_HEADING_GAP = {
  beforeBlock: '4px',
  after: '2px',
} as const

function devisSalmonHeadingRhythmRules(p: string): string {
  const G = DEVIS_SALMON_HEADING_GAP
  return `
${p}.devis-salmon-heading {
  margin: 0 0 ${G.after};
  line-height: 1.55;
}
${p}ul + .devis-salmon-heading,
${p}ol + .devis-salmon-heading,
${p}ul:last-of-type + .devis-salmon-heading,
${p}ol:last-of-type + .devis-salmon-heading,
${p}ul + p.devis-spacer + .devis-salmon-heading,
${p}ol + p.devis-spacer + .devis-salmon-heading,
${p}ul + p:empty + .devis-salmon-heading,
${p}ol + p:empty + .devis-salmon-heading,
${p}p.devis-spacer + .devis-salmon-heading,
${p}p:empty + .devis-salmon-heading {
  margin-top: 0;
}
${p}ul:has(+ .devis-salmon-heading),
${p}ol:has(+ .devis-salmon-heading),
${p}ul:has(+ p.devis-spacer + .devis-salmon-heading),
${p}ol:has(+ p.devis-spacer + .devis-salmon-heading) {
  margin-bottom: 0;
}
${p}ul:has(+ .devis-salmon-heading) > li:last-child,
${p}ol:has(+ .devis-salmon-heading) > li:last-child,
${p}ul:has(+ p.devis-spacer + .devis-salmon-heading) > li:last-child,
${p}ol:has(+ p.devis-spacer + .devis-salmon-heading) > li:last-child {
  margin-bottom: 0;
}
${p}ul + p.devis-spacer:has(+ .devis-salmon-heading),
${p}ol + p.devis-spacer:has(+ .devis-salmon-heading),
${p}ul + p:empty:has(+ .devis-salmon-heading),
${p}ol + p:empty:has(+ .devis-salmon-heading) {
  display: none;
  margin: 0 !important;
  min-height: 0 !important;
  height: 0 !important;
  padding: 0 !important;
  line-height: 0 !important;
}
${p}table + .devis-salmon-heading,
${p}p:not(.devis-salmon-heading):not(.devis-spacer):not(:empty) + .devis-salmon-heading {
  margin-top: ${G.beforeBlock};
}
${p}.offer-subtitle {
  margin: 0 0 ${G.after};
}
${p}.devis-top > ul:last-child,
${p}.devis-top > ol:last-child,
${p}.devis-top > ul:last-of-type,
${p}.devis-top > ol:last-of-type,
${p}.doc-section-top .ProseMirror > ul:last-child,
${p}.doc-section-top .ProseMirror > ol:last-child,
${p}.doc-section-top .ProseMirror > ul:last-of-type,
${p}.doc-section-top .ProseMirror > ol:last-of-type {
  margin-bottom: 0;
}
${p}.doc-offer-zone > .offer-subtitle,
${p}.doc-offer-zone > .doc-section-offer-sub {
  margin: 0 0 ${G.after};
}
${p}.devis-closing > .offer-block,
${p}.devis-top + .devis-closing .offer-block,
${p}.doc-section-top + .doc-offer-preview,
${p}.doc-offer-zone .doc-offer-preview {
  margin-top: 0;
}
`
}

function devisSectionRhythmRules(p: string): string {
  const G = DEVIS_SECTION_GAP
  return `
${devisSalmonHeadingRhythmRules(p)}
${p}.devis-heading {
  margin: ${G.beforeTitle} 0 ${G.afterTitle};
}
${p}.devis-heading-tight-top {
  margin-top: ${G.beforeTitle};
}
${p}.devis-heading + p,
${p}.devis-heading + ul,
${p}.devis-heading + ol,
${p}.devis-heading + .devis-salmon-heading {
  margin-top: 0;
}
${p}.devis-heading:has(+ .devis-salmon-heading) {
  margin-bottom: ${DEVIS_SALMON_HEADING_GAP.after};
}
${p}p + .devis-heading,
${p}ul + .devis-heading,
${p}ol + .devis-heading {
  margin-top: ${G.beforeTitle};
}
${p}.devis-field-row {
  margin: 0 0 ${G.block};
  line-height: 1.55;
}
${p}ul,
${p}ol {
  margin: 0 0 ${G.block};
  padding-left: 22px;
}
${p}ol > li,
${p}ul > li {
  margin: 0 0 ${G.listItem};
}
${p}ol ul {
  margin-top: 4px;
  margin-bottom: 0;
}
`
}
export function devisSectionHeadingCss(scope = '', opts?: { editable?: boolean }): string {
  const p = scope ? `${scope} ` : ''
  const S = DEVIS_SECTION_HEADING_STYLE
  const editable = opts?.editable === true
  const imp = editable ? '' : ' !important'
  const headingLayout = `
${p}.devis-heading {
  padding: 0;
  background: transparent;
  border: none;
  break-after: avoid;
  page-break-after: avoid;
  break-inside: avoid;
  page-break-inside: avoid;
}
${devisSectionRhythmRules(p)}
${p}.devis-heading u {
  text-decoration: underline${editable ? '' : ' !important'};
  border-bottom: none${editable ? '' : ' !important'};
  text-underline-offset: 2px;
}
`
  if (editable) {
    return `
${headingLayout}
${p}.devis-heading:not([style*="color"]) {
  color: ${S.color};
  font-size: ${S.fontSize};
  font-weight: 700;
}
${p}.devis-field-label,
${p}.devis-field-label--salmon {
  color: ${DEVIS_REF_TITLE_STYLE.color};
  font-size: ${DEVIS_FIELD_LABEL_STYLE.fontSize};
  font-weight: 700;
}
${p}.devis-field-label--bronze {
  color: ${DEVIS_CHARTE.bronze};
  font-size: ${DEVIS_FIELD_LABEL_STYLE.fontSize};
  font-weight: 700;
}
${p}.devis-examens-list,
${p}.devis-examens-list > li,
${p}.devis-examen-item {
  color: ${DEVIS_CHARTE.charcoal};
  font-weight: 400;
}
${p}.devis-examen-salmon-hi mark,
${p}.devis-examen-salmon-hi mark span {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
${p}.devis-examen-salmon-hi mark span {
  color: #FF7C80 !important;
}
`
  }
  return `
${headingLayout}
${p}.devis-heading {
  font-weight: 700 !important;
  font-size: ${S.fontSize};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
${p}.devis-heading mark,
${p}.devis-heading span[style],
${p}.devis-heading strong[style],
${p}.devis-heading u[style] {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
/* Gris charte par défaut — seulement si aucune couleur / surlignage inline */
${p}.devis-heading:not(:has([style*="color"])):not(:has(mark)) {
  color: ${S.color}${imp};
}
${p}.devis-field-label,
${p}.devis-field-label--bronze {
  font-size: ${DEVIS_FIELD_LABEL_STYLE.fontSize};
  font-weight: 700 !important;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
${p}.devis-field-label--salmon:not([style*="color"]),
${p}.devis-field-label:not([style*="color"]):not(:has(mark)) {
  color: ${DEVIS_REF_TITLE_STYLE.color}${imp};
}
${p}.devis-field-row span[style*="81572d"],
${p}.devis-field-row span[style*="129, 87, 45"],
${p}.devis-field-row span[style*="129,87,45"],
${p}.devis-field-row strong[style*="81572d"],
${p}.devis-field-row strong[style*="129, 87, 45"],
${p}.devis-field-row strong[style*="129,87,45"] {
  color: ${DEVIS_REF_TITLE_STYLE.color}${imp};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
${p}.devis-examens-list,
${p}.devis-examens-list > li,
${p}.devis-examen-item,
${p}.devis-examens-list span,
${p}.devis-examen-item span {
  color: ${DEVIS_CHARTE.charcoal}${imp};
  font-weight: 400;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
`
}

/**
 * Retire les styles inline charte (sans !important) pour que TipTap puisse
 * changer couleur / taille / gras. Conserve les styles déjà choisis par le gestionnaire.
 */
const DEVIS_SALMON_COLOR_RE = /#ff7c80|rgb\(\s*255\s*,\s*124\s*,\s*128\s*\)/i

function unwrapElement(el: Element): void {
  const parent = el.parentNode
  if (!parent) return
  while (el.firstChild) parent.insertBefore(el.firstChild, el)
  parent.removeChild(el)
}

const PRESERVE_COLOR_SPAN_RE =
  /\b(?:diag-zone-lead|devis-field-label|devis-examen-salmon-hi|tarif-hint|diag-italic|diag-visage-op-title|diag-visage-body|devis-ref-title|devis-heading|devis-salmon-heading|offer-fluo-)\b/i

const PRESERVE_COLOR_CLOSEST =
  '.devis-ref-title, .devis-heading, .devis-salmon-heading, .devis-examen-salmon-hi, .diag-zone-lead, .diag-visage-op-title, .diag-visage-body, .diag-italic, mark, [class*="offer-fluo-"]'

export function prepareDevisHtmlForEditor(html: string): string {
  if (!html?.trim()) return html
  if (typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(`<div id="devis-prep">${html}</div>`, 'text/html')
  const root = doc.getElementById('devis-prep')
  if (!root) return html
  const spans = Array.from(root.querySelectorAll('span[style], span[class]'))
  for (const span of spans) {
    const style = span.getAttribute('style') ?? ''
    const cls = span.getAttribute('class') ?? ''
    if (span.closest(PRESERVE_COLOR_CLOSEST)) continue
    if (PRESERVE_COLOR_SPAN_RE.test(cls)) continue
    if (DEVIS_SALMON_COLOR_RE.test(style)) continue
    if (span.querySelector('mark')) continue
    if (!style) continue
    if (/!important/i.test(style)) continue
    if (
      /(?:^|;)\s*color\s*:/i.test(style)
      || /font-size\s*:/i.test(style)
    ) {
      unwrapElement(span)
    }
  }
  const isEmptyP = (el: Element | null): el is HTMLParagraphElement => {
    if (!el || el.tagName !== 'P') return false
    if (el.classList.contains('devis-spacer') || el.classList.contains('diag-block-gap')) return false
    const text = (el.textContent ?? '').replace(/\u00a0/g, '').trim()
    return text === '' && !el.querySelector('img')
  }
  for (const heading of Array.from(root.querySelectorAll('p.devis-heading'))) {
    let prev = heading.previousElementSibling
    while (isEmptyP(prev)) {
      const remove = prev
      prev = prev.previousElementSibling
      remove.remove()
    }
    let next = heading.nextElementSibling
    while (isEmptyP(next)) {
      const remove = next
      next = next.nextElementSibling
      remove.remove()
    }
  }
  return root.innerHTML
}

export type DevisLabelTone = 'bronze' | 'teal' | 'gray' | 'salmon'

const LABEL_COLORS: Record<DevisLabelTone, string> = {
  bronze: DEVIS_CHARTE.bronze,
  teal: DEVIS_CHARTE.teal,
  gray: DEVIS_CHARTE.gray,
  salmon: DEVIS_REF_TITLE_STYLE.color,
}

function devisFieldLabelStyleAttr(tone: DevisLabelTone = 'salmon'): string {
  return `color:${LABEL_COLORS[tone]} !important;font-weight:${DEVIS_FIELD_LABEL_STYLE.fontWeight};font-size:${DEVIS_FIELD_LABEL_STYLE.fontSize}`
}

/** Style inline des libellés saumon (migrations HTML lettre). */
export function devisSalmonLabelStyleAttr(): string {
  return devisFieldLabelStyleAttr('salmon')
}

/** Libellé coloré — saumon par défaut (sous-titres devis). */
export function devisLabel(text: string, tone: DevisLabelTone = 'salmon'): string {
  return `<span class="devis-field-label devis-field-label--${tone}" style="${devisFieldLabelStyleAttr(tone)}">${text}</span>`
}

/** Sous-titre saumon seul (Votre devis inclut, Modalités de paiement…). */
export function devisSalmonHeading(text: string): string {
  return `<p class="devis-salmon-heading">${devisLabel(text)}</p>`
}

/** @deprecated Préférer devisLabel(..., 'salmon') */
export function devisEmphasis(text: string): string {
  return devisLabel(text, 'salmon')
}

export function devisValueSpan(value: string): string {
  return `<span style="color:${DEVIS_CHARTE.charcoal}">${value}</span>`
}

/** Titre de section — gris, souligné, gras (réf. Word). */
export function devisSectionHeading(text: string, opts?: { tightTop?: boolean }): string {
  const safe = escapeDevisInlineText(text)
  const { color, fontSize, fontWeight } = DEVIS_SECTION_HEADING_STYLE
  const cls = opts?.tightTop ? 'devis-heading devis-heading-tight-top' : 'devis-heading'
  return `<p class="${cls}"><strong><u><span style="color:${color};font-size:${fontSize};font-weight:${fontWeight}">${safe}</span></u></strong></p>`
}

/** Ligne label + valeur (libellé saumon par défaut). */
export function devisFieldRow(
  label: string,
  value: string,
  labelTone: DevisLabelTone = 'salmon',
): string {
  return `<p class="devis-field-row">${devisLabel(label, labelTone)} ${devisValueSpan(value)}</p>`
}

/** Encadré info importante. */
export function devisHighlightBox(label: string, value: string): string {
  const { charcoal } = DEVIS_CHARTE
  return `<p class="devis-highlight devis-field-row">${devisLabel(label, 'salmon')} <span style="color:${charcoal};font-weight:700">${value}</span></p>`
}

export function devisSeparator(): string {
  return `<div class="section-hr" aria-hidden="true"></div>`
}

function escapeDevisHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Fluo gris Word (réf. palette surlignage). */
export const DEVIS_FLUO_GRAY = {
  /** Gris -25 % (clair) */
  gray25: '#D9D9D9',
  /** Gris -50 % (foncé) */
  gray50: '#808080',
} as const

/** Fluo tableau offre (réf. Word — texte saumon/jaune sur fond gris). */
export const DEVIS_OFFER_FLUO = {
  interventionBg: DEVIS_FLUO_GRAY.gray25,
  sejourBg: DEVIS_FLUO_GRAY.gray50,
  interventionText: DEVIS_REF_TITLE_STYLE.color,
  sejourText: '#FFFF00',
  disclaimerBg: DEVIS_FLUO_GRAY.gray50,
  disclaimerText: '#FFFFFF',
} as const

const OFFER_DESC_PREFIX = 'Montant de votre séjour médical pour une '
const OFFER_EXCHANGE_DISCLAIMER =
  'selon le cours de change du jour amené à évoluer d\u2019ici votre arrivée.'
const PAYMENT_METHOD_FLUO_PHRASE = 'réglée en dinars tunisiens et en espèces'
const VALIDITY_DURATION_FLUO_PHRASE = 'valable pour une durée de trois (3) mois'
const VALIDITY_SEASON_FLUO_PHRASE = 'hors saison pour les hôtels (hors juillet/août et décembre).'

/** Fluo texte blanc sur gris foncé (-50 %) — bas de lettre devis. */
function devisWhiteGrayFluoHtml(text: string, className: string): string {
  const { disclaimerBg, disclaimerText } = DEVIS_OFFER_FLUO
  const safe = escapeDevisHtml(text)
  return `<mark class="${className}" data-color="${disclaimerBg}" style="background-color:${disclaimerBg};color:${disclaimerText}"><span style="color:${disclaimerText}">${safe}</span></mark>`
}

/** Intervention : texte saumon + fluo gris clair (-25 %). */
export function offerInterventionFluoHtml(text: string): string {
  const safe = escapeDevisHtml(text)
  const { interventionBg, interventionText } = DEVIS_OFFER_FLUO
  return `<mark class="offer-fluo-intervention" data-color="${interventionBg}" style="background-color:${interventionBg};color:${interventionText}"><strong><span style="color:${interventionText}">${safe}</span></strong></mark>`
}

/** Séjour : texte jaune + fluo gris foncé (-50 %). */
export function offerSejourFluoHtml(text: string): string {
  const safe = escapeDevisHtml(text)
  const { sejourBg, sejourText } = DEVIS_OFFER_FLUO
  return `<mark class="offer-fluo-sejour" data-color="${sejourBg}" style="background-color:${sejourBg};color:${sejourText}"><span style="color:${sejourText}">${safe}</span></mark>`
}

/** Durée TOTALE du séjour — même rendu visuel, classe distincte (évite sync badge offre). */
export function offerDureeTotaleFluoHtml(text: string): string {
  const safe = escapeDevisHtml(text)
  const { sejourBg, sejourText } = DEVIS_OFFER_FLUO
  return `<mark class="offer-fluo-duree-totale" data-color="${sejourBg}" style="background-color:${sejourBg};color:${sejourText}"><span style="color:${sejourText}">${safe}</span></mark>`
}

/** CSS fluo séjour — texte jaune sur gris -50 % (TipTap retire sinon la couleur du mark). */
export function devisOfferSejourFluoCss(scope = ''): string {
  const p = scope ? `${scope} ` : ''
  const { sejourBg, sejourText } = DEVIS_OFFER_FLUO
  return `
${p}.offer-fluo-sejour,
${p}mark.offer-fluo-sejour,
${p}.offer-fluo-duree-totale,
${p}mark.offer-fluo-duree-totale {
  background-color: ${sejourBg} !important;
  color: ${sejourText} !important;
  padding: 1px 4px;
  border-radius: 0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
${p}.offer-fluo-sejour span,
${p}mark.offer-fluo-sejour span,
${p}.offer-fluo-sejour strong,
${p}mark.offer-fluo-sejour strong,
${p}.offer-fluo-duree-totale span,
${p}mark.offer-fluo-duree-totale span,
${p}.offer-fluo-duree-totale strong,
${p}mark.offer-fluo-duree-totale strong {
  color: ${sejourText} !important;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
`
}

/** Rétablit le fluo jaune du badge séjour (TipTap ne conserve que le fond du mark). */
export function restoreOfferSejourFluoInHtml(html: string): string {
  if (!html || !/<mark/i.test(html)) return html
  const { sejourBg } = DEVIS_OFFER_FLUO
  const bgRe = sejourBg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return html.replace(/<mark\b([^>]*)>([\s\S]*?)<\/mark>/gi, (full, attrs, inner) => {
    const isSejourClass = /\boffer-fluo-sejour\b/i.test(attrs)
    const isDureeTotaleClass = /\boffer-fluo-duree-totale\b/i.test(attrs)
    const isGray50 = new RegExp(bgRe, 'i').test(attrs)
    const text = String(inner).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const looksSejour = /^S[ée]jour\s+\d+\s+nuits/i.test(text)
    const looksDureeTotale = /Durée\s+TOTALE\s+du\s+s[ée]jour/i.test(text)
    if (isDureeTotaleClass || looksDureeTotale) {
      return offerDureeTotaleFluoHtml(text)
    }
    if (!isSejourClass && !(isGray50 && looksSejour)) return full
    return offerSejourFluoHtml(text)
  })
}

/** Libellé type de chambre pour le badge séjour (ex. « Chambre Double »). */
export function formatOfferTypeChambreLabel(typeChambre = ''): string {
  const room = typeChambre.trim()
  if (!room) return ''
  if (/^chambre\b/i.test(room)) {
    const label = room.replace(/^chambre\s*/i, '').trim()
    return label ? `Chambre ${label.charAt(0).toUpperCase()}${label.slice(1).toLowerCase()}` : ''
  }
  return `Chambre ${room.charAt(0).toUpperCase()}${room.slice(1).toLowerCase()}`
}

/** Ligne badge séjour tableau offre : « Séjour X nuits » + « Chambre Double ». */
export function buildOfferSejourBadgeLine(sejourLine: string, typeChambre = ''): string {
  const stay = sejourLine.trim()
  const roomLabel = formatOfferTypeChambreLabel(typeChambre)
  if (!stay) return ''
  return roomLabel ? `${stay} ${roomLabel}` : stay
}

/** Mention cours de change : texte blanc + fluo gris foncé (-50 %). */
export function offerExchangeDisclaimerFluoHtml(): string {
  return devisWhiteGrayFluoHtml(OFFER_EXCHANGE_DISCLAIMER, 'offer-fluo-disclaimer')
}

/** Assure le fluo blanc sur gris pour la mention cours de change (HTML sauvegardé / TipTap). */
export function normalizeExchangeDisclaimerFluoInHtml(html: string): string {
  if (!html || !/selon le cours de change du jour/i.test(html)) return html
  const disclaimerHtml = offerExchangeDisclaimerFluoHtml()
  return html.replace(
    /(?:<mark[^>]*>)?\s*selon le cours de change du jour amené à évoluer d['\u2019]ici votre arrivée\.\s*(?:<\/mark>)?/gi,
    ` ${disclaimerHtml}`,
  )
}

/** Modalités de paiement : texte blanc + fluo gris foncé (-50 %). */
export function offerPaymentMethodFluoHtml(): string {
  return devisWhiteGrayFluoHtml(PAYMENT_METHOD_FLUO_PHRASE, 'offer-fluo-payment')
}

/** Corps des modalités de paiement (2 phrases sans espace entre elles). */
export function buildPaymentModalitiesBodyHtml(): string {
  const fluo = offerPaymentMethodFluoHtml()
  return `Elle devra être ${fluo} et ce au moment de votre admission à la clinique en Tunisie.<br>Les cartes de crédit ne sont pas acceptées.`
}

/** Met à jour le fluo et fusionne les 2 phrases des modalités de paiement. */
export function normalizePaymentMethodFluoInHtml(html: string): string {
  if (!html || !/Modalités de paiement/i.test(html)) return html
  const body = buildPaymentModalitiesBodyHtml()
  return html.replace(
    /<p>\s*Elle devra être[\s\S]*?Tunisie\.\s*<\/p>(?:\s*<p>\s*Les cartes de crédit ne sont pas acceptées\.\s*<\/p>)?/gi,
    `<p>${body}</p>`,
  )
}

/** Corps de la validité de l'offre (2 passages en fluo gris foncé). */
export function buildOfferValidityBodyHtml(): string {
  const durationFluo = devisWhiteGrayFluoHtml(VALIDITY_DURATION_FLUO_PHRASE, 'offer-fluo-validity')
  const seasonFluo = devisWhiteGrayFluoHtml(VALIDITY_SEASON_FLUO_PHRASE, 'offer-fluo-validity')
  return `La présente offre de prix sera ${durationFluo} à compter de ce jour et seulement en période ${seasonFluo}`
}

const OFFER_VALIDITY_CLOSING =
  'Nous espérons que notre offre de prix vous agréera et nous tenons à votre entière disposition pour vous conseiller au mieux pour réussir votre séjour.'

/** Validité + phrase de clôture (une seule ligne entre les deux). */
export function buildOfferValidityBlockHtml(): string {
  return `${buildOfferValidityBodyHtml()}<br>${OFFER_VALIDITY_CLOSING}`
}

/** Met à jour le fluo et fusionne validité + phrase de clôture. */
export function normalizeOfferValidityFluoInHtml(html: string): string {
  if (!html || !/Validité de l['\u2019]offre/i.test(html)) return html
  const block = buildOfferValidityBlockHtml()
  const splitRe =
    /<p>\s*La présente offre de prix sera[\s\S]*?décembre\)\.\s*<\/p>\s*(?:<p>\s*<\/p>\s*)?<p>\s*Nous espérons que notre offre de prix[\s\S]*?réussir votre séjour\.?\s*<\/p>/gi
  const mergedRe =
    /<p>\s*La présente offre de prix sera[\s\S]*?décembre\)\.\s*<br\s*\/?>\s*Nous espérons que notre offre de prix[\s\S]*?réussir votre séjour\.?\s*<\/p>/gi
  let out = html.replace(splitRe, `<p>${block}</p>`)
  if (out !== html) return out
  out = out.replace(mergedRe, `<p>${block}</p>`)
  if (out !== html) return out
  return out.replace(
    /<p>\s*La présente offre de prix sera[\s\S]*?décembre\)\.\s*<\/p>/gi,
    `<p>${block}</p>`,
  )
}

/** Normalise tous les fluo du bas de lettre (cours de change + modalités + validité). */
export function normalizeDevisBottomFluoInHtml(html: string): string {
  return normalizeOfferValidityFluoInHtml(
    normalizePaymentMethodFluoInHtml(normalizeExchangeDisclaimerFluoInHtml(html)),
  )
}

export function looksLikeOfferDescHtml(html: string): boolean {
  const t = html.trim()
  return /Montant de votre séjour médical/i.test(t) || /offer-fluo-sejour|sejour-badge/i.test(t)
}

export function defaultOfferSubtitleHtml(): string {
  return devisLabel('Notre meilleure offre :')
}

export function defaultOfferHeadDescHtml(): string {
  return '<p>Description</p>'
}

export function defaultOfferHeadPriceHtml(): string {
  const c = DEVIS_REF_TITLE_STYLE.color
  return `<p>Tarif en dt<br><span class="tarif-hint" style="color:${c}">(Ferme et définitif)</span></p>`
}

/** Garde « (Ferme et définitif) » en saumon (classe + couleur). */
export function ensureTarifHintSalmonHtml(html: string): string {
  const raw = html?.trim() || defaultOfferHeadPriceHtml()
  const c = DEVIS_REF_TITLE_STYLE.color
  const hint = `<span class="tarif-hint" style="color:${c}">(Ferme et définitif)</span>`
  if (/\btarif-hint\b/.test(raw)) return raw
  if (/\(Ferme et d[ée]finitif\)/i.test(raw)) {
    return raw.replace(/\(Ferme et d[ée]finitif\)/gi, hint)
  }
  return raw
}

/** HTML éditeur : préfixe + fluo intervention + badge séjour (paragraphes TipTap). */
export function buildOfferDescEditorHtml(
  operationTitle: string,
  sejourLine = '',
  typeChambre = '',
): string {
  const raw = operationTitle.trim()
  if (looksLikeOfferDescHtml(raw) && raw.startsWith('<')) return restoreOfferSejourFluoInHtml(raw)
  const op = raw.startsWith('<')
    ? unwrapSingleParagraphHtml(raw)
    : offerInterventionFluoHtml(raw || 'Séjour médical personnalisé')
  const badgeLine = buildOfferSejourBadgeLine(sejourLine, typeChambre)
  const sejour = badgeLine ? `<p>${offerSejourFluoHtml(badgeLine)}</p>` : ''
  return `<p>${OFFER_DESC_PREFIX}${op}</p>${sejour}`
}

/** Cellule description du tableau offre (préfixe + fluo intervention + fluo séjour). */
export function buildOfferDescCellHtml(
  operationTitle: string,
  sejourLine = '',
  typeChambre = '',
): string {
  const raw = operationTitle.trim() || 'Séjour médical personnalisé'
  if (looksLikeOfferDescHtml(raw) && raw.startsWith('<')) {
    const restored = restoreOfferSejourFluoInHtml(raw)
    if (/\bop-title\b/.test(restored) || /\bsejour-badge\b/.test(restored)) return restored
    return `<div class="op-title">${restored}</div>`
  }
  const op = raw.startsWith('<')
    ? unwrapSingleParagraphHtml(raw)
    : offerInterventionFluoHtml(raw)
  const badgeLine = buildOfferSejourBadgeLine(sejourLine, typeChambre)
  const sejour = badgeLine
    ? `<div class="sejour-badge">${offerSejourFluoHtml(badgeLine)}</div>`
    : ''
  return `<div class="op-title">${OFFER_DESC_PREFIX}${op}</div>${sejour}`
}

function unwrapSingleParagraphHtml(html: string): string {
  const t = html.trim()
  const m = t.match(/^<p\b[^>]*>([\s\S]*)<\/p>$/i)
  return m ? m[1] : t
}

function offerCellHtml(stored: string | null | undefined, fallback: string): string {
  const raw = stored?.trim() ?? ''
  if (!raw) return fallback
  if (raw.startsWith('<')) return unwrapSingleParagraphHtml(raw)
  return raw
}

/** Bloc « Notre meilleure offre » — tableau + tarif (réf. Word). */
export function buildDevisOfferBlockHtml(opts: {
  operationTitle: string
  sejourLine?: string
  typeChambre?: string
  totalFormatted: string
  subtitleHtml?: string | null
  headDescHtml?: string | null
  headPriceHtml?: string | null
}): string {
  const { sejourLine = '', typeChambre = '', totalFormatted } = opts
  const descHtml = buildOfferDescCellHtml(opts.operationTitle, sejourLine, typeChambre)
  const totalRaw = totalFormatted.trim()
  const totalHtml = totalRaw.startsWith('<')
    ? unwrapSingleParagraphHtml(totalRaw)
    : escapeDevisHtml(totalRaw)
  const subtitle = offerCellHtml(opts.subtitleHtml, devisLabel('Notre meilleure offre :'))
  const headDesc = offerCellHtml(opts.headDescHtml, 'Description')
  const headPrice = offerCellHtml(
    opts.headPriceHtml,
    'Tarif en dt<br><span class="tarif-hint" style="color:' + DEVIS_REF_TITLE_STYLE.color + '">(Ferme et définitif)</span>',
  )
  return `
<div class="offer-block">
  <p class="offer-subtitle devis-salmon-heading">${subtitle}</p>
  <table class="offer-table">
    <thead>
      <tr>
        <th class="col-desc">${headDesc}</th>
        <th class="col-price">${headPrice}</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="desc-cell">${descHtml}</td>
        <td class="price-cell"><span class="price-amount">${totalHtml}</span></td>
      </tr>
    </tbody>
  </table>
</div>`
}

/** Styles aperçu écran du bloc offre (médecin / éditeur). */
export const DEVIS_OFFER_PREVIEW_CSS = `
.doc-offer-preview {
  font-family: ${DEVIS_FONT_FAMILY};
}
.doc-offer-zone > .offer-subtitle,
.doc-offer-zone > .doc-section-offer-sub {
  margin: 0 0 ${DEVIS_SALMON_HEADING_GAP.after};
}
.doc-offer-preview .offer-subtitle {
  margin: 0 0 ${DEVIS_SALMON_HEADING_GAP.after};
}
.doc-offer-preview .offer-subtitle .devis-field-label {
  font-size: ${DEVIS_FIELD_LABEL_STYLE.fontSize};
  font-weight: ${DEVIS_FIELD_LABEL_STYLE.fontWeight};
}
.doc-offer-preview .offer-subtitle .ProseMirror,
.doc-offer-preview .offer-subtitle .tiptap,
.doc-offer-preview th .ProseMirror,
.doc-offer-preview th .tiptap {
  min-height: 1.2em;
  outline: none;
}
.doc-offer-preview .offer-subtitle .ProseMirror p,
.doc-offer-preview th .ProseMirror p {
  margin: 0;
}
.doc-offer-preview .offer-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid ${DEVIS_CHARTE.charcoal};
  font-size: ${DEVIS_OFFER_TABLE_FONT_SIZE};
}
.doc-offer-preview .offer-table th {
  background: ${DEVIS_CHARTE.white};
  color: ${DEVIS_CHARTE.charcoal};
  font-weight: 700;
  padding: 8px 12px;
  border: 1px solid ${DEVIS_CHARTE.charcoal};
  text-align: left;
  vertical-align: top;
}
.doc-offer-preview .offer-table th.col-price {
  text-align: center;
  line-height: 1.35;
}
.doc-offer-preview .offer-table .tarif-hint {
  display: block;
  margin-top: 2px;
  font-weight: ${DEVIS_FIELD_LABEL_STYLE.fontWeight};
  font-size: ${DEVIS_OFFER_TARIF_HINT_FONT_SIZE};
  color: ${DEVIS_REF_TITLE_STYLE.color} !important;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.doc-offer-preview .offer-table td {
  padding: 10px 12px;
  border: 1px solid ${DEVIS_CHARTE.charcoal};
  vertical-align: top;
}
.doc-offer-preview .col-desc { width: 68%; }
.doc-offer-preview .col-price { width: 32%; }
.doc-offer-preview .desc-cell { text-align: left; }
.doc-offer-preview .price-cell {
  text-align: center;
  vertical-align: middle;
}
.doc-offer-preview .op-title {
  font-weight: 400;
  color: ${DEVIS_CHARTE.charcoal};
  font-size: ${DEVIS_OFFER_TABLE_FONT_SIZE};
  line-height: 1.5;
}
.doc-offer-preview .offer-fluo-intervention,
.doc-offer-preview mark.offer-fluo-intervention {
  background-color: ${DEVIS_FLUO_GRAY.gray25} !important;
  color: ${DEVIS_REF_TITLE_STYLE.color} !important;
  padding: 1px 4px;
  border-radius: 0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.doc-offer-preview .offer-fluo-intervention strong,
.doc-offer-preview .offer-fluo-intervention span,
.doc-offer-preview mark.offer-fluo-intervention strong,
.doc-offer-preview mark.offer-fluo-intervention span {
  color: ${DEVIS_REF_TITLE_STYLE.color} !important;
}
.doc-offer-preview .op-title.doc-section-offer,
.doc-offer-preview .op-title.doc-section-offer > div,
.doc-offer-preview .op-title.doc-section-offer .ProseMirror,
.doc-offer-preview .op-title.doc-section-offer .tiptap {
  display: block;
  min-height: 1.4em;
  font-weight: 400;
  font-size: inherit;
  line-height: 1.5;
  color: ${DEVIS_CHARTE.charcoal};
}
.doc-offer-preview .op-title .ProseMirror p,
.doc-offer-preview .op-title > p {
  margin: 0 0 6px;
  display: block;
}
.doc-offer-preview .op-title .ProseMirror p:last-child,
.doc-offer-preview .op-title > p:last-child {
  margin-bottom: 0;
}
.doc-offer-preview .op-title .ProseMirror p:has(.offer-fluo-sejour),
.doc-offer-preview .op-title > p:has(.offer-fluo-sejour) {
  margin-top: 8px;
  font-size: ${DEVIS_OFFER_SEJOUR_FONT_SIZE};
  font-weight: 500;
  line-height: 1.45;
}
.doc-offer-preview .sejour-badge {
  display: block;
  margin-top: 8px;
  font-size: ${DEVIS_OFFER_SEJOUR_FONT_SIZE};
  font-weight: 500;
  line-height: 1.45;
}
.doc-offer-preview .offer-fluo-disclaimer,
.doc-offer-preview mark.offer-fluo-disclaimer,
.devis-bot .offer-fluo-disclaimer,
.devis-bot mark.offer-fluo-disclaimer,
.doc-offer-preview .offer-fluo-payment,
.doc-offer-preview mark.offer-fluo-payment,
.devis-bot .offer-fluo-payment,
.devis-bot mark.offer-fluo-payment,
.doc-offer-preview .offer-fluo-validity,
.doc-offer-preview mark.offer-fluo-validity,
.devis-bot .offer-fluo-validity,
.devis-bot mark.offer-fluo-validity {
  background-color: ${DEVIS_FLUO_GRAY.gray50} !important;
  color: ${DEVIS_OFFER_FLUO.disclaimerText} !important;
  padding: 1px 4px;
  border-radius: 0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.doc-offer-preview .offer-fluo-disclaimer span,
.doc-offer-preview mark.offer-fluo-disclaimer span,
.devis-bot .offer-fluo-disclaimer span,
.devis-bot mark.offer-fluo-disclaimer span,
.doc-offer-preview .offer-fluo-payment span,
.doc-offer-preview mark.offer-fluo-payment span,
.devis-bot .offer-fluo-payment span,
.devis-bot mark.offer-fluo-payment span,
.doc-offer-preview .offer-fluo-validity span,
.doc-offer-preview mark.offer-fluo-validity span,
.devis-bot .offer-fluo-validity span,
.devis-bot mark.offer-fluo-validity span {
  color: ${DEVIS_OFFER_FLUO.disclaimerText} !important;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
${devisOfferSejourFluoCss('.doc-offer-preview')}
.doc-offer-preview .price-amount,
.doc-offer-preview .price-cell .doc-section-offer-total,
.doc-offer-preview .price-cell .doc-section-offer-total .ProseMirror,
.doc-offer-preview .price-cell .doc-section-offer-total .tiptap {
  font-weight: 700;
  font-size: ${DEVIS_OFFER_PRICE_FONT_SIZE};
  color: ${DEVIS_CHARTE.charcoal};
  letter-spacing: 0.02em;
  text-align: center;
}
.doc-offer-preview .price-cell .doc-section-offer-total .ProseMirror p {
  margin: 0;
  text-align: center;
}
`

/**
 * Paragraphes vides TipTap — une ligne par Entrée (éditeur + PDF identiques).
 * @param scopes Préfixes CSS (ex. `.ProseMirror`). Vide = règle globale (PDF paginé).
 */
export function devisEmptyParagraphCss(...scopes: string[]): string {
  const block = `
  margin: 0 0 8px;
  min-height: 1.65em;
  height: auto;
  line-height: 1.65;
  padding: 0;
  overflow: visible;
`
  if (scopes.length === 0) {
    return `
p:empty,
p:has(> br:only-child),
p.devis-spacer {
${block}}
`
  }
  const selectors = scopes.flatMap((s) => [
    `${s} p:empty`,
    `${s} p:has(> br:only-child)`,
    `${s} p.devis-spacer`,
  ]).join(',\n')
  return `
${selectors} {${block}}
`
}

/** Marque les paragraphes vides pour un espacement fiable en PDF paginé. */
export function markDevisSpacerParagraphs(html: string): string {
  if (!html.trim()) return html
  if (typeof window === 'undefined') {
    return html.replace(
      /<p\b([^>]*)>\s*(?:(?:<br\b[^>]*\/?>|&nbsp;|\u00a0|\s)*)\s*<\/p>/gi,
      (full, attrs) => {
        if (/\bdevis-spacer\b/.test(attrs)) return full
        if (/\bclass="/i.test(attrs)) {
          return full.replace(/\bclass="/i, 'class="devis-spacer ')
        }
        return full.replace(/<p\b/i, '<p class="devis-spacer"')
      },
    )
  }
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__root')
  if (!root) return html
  for (const p of Array.from(root.querySelectorAll('p'))) {
    const text = (p.textContent ?? '').replace(/\u00a0/g, ' ').trim()
    if (!text) p.classList.add('devis-spacer')
  }
  return root.innerHTML
}

/** Styles inline éditeur → fidèles à l’impression PDF. */
export const DEVIS_WYSIWYG_INLINE_PRINT_CSS = `
.doc-body [style*="color"],
.doc-body [style*="font-size"],
.doc-body [style*="background"],
.doc-body [style*="margin"],
.doc-body [style*="padding"],
.doc-body [style*="line-height"],
.doc-body [style*="text-align"],
.devis-sheet-body [style*="color"],
.devis-sheet-body [style*="font-size"],
.devis-sheet-body [style*="background"],
.devis-sheet-body [style*="margin"],
.devis-sheet-body [style*="padding"],
.devis-sheet-body [style*="line-height"],
.devis-sheet-body [style*="text-align"],
.doc-body mark,
.devis-sheet-body mark,
.doc-body .diag-zone-lead,
.devis-sheet-body .diag-zone-lead {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
`

/** Palette TipTap — couleur du texte (éditeur devis). */
export const DEVIS_TOOLBAR_COLORS = [
  { label: 'Blanc', value: DEVIS_CHARTE.white },
  { label: 'Crème', value: DEVIS_CHARTE.cream },
  { label: 'Gris', value: DEVIS_CHARTE.gray },
  { label: 'Charbon', value: DEVIS_CHARTE.charcoal },
  { label: 'Bleu nuit', value: DEVIS_CHARTE.teal },
  { label: 'Rose', value: DEVIS_CHARTE.rose },
  { label: 'Saumon', value: DEVIS_REF_TITLE_STYLE.color },
  { label: 'Jaune', value: DEVIS_OFFER_FLUO.sejourText },
  { label: 'Bronze', value: DEVIS_CHARTE.bronze },
] as const

/** Palette TipTap — surlignage fluo (réf. Word). */
export const DEVIS_HIGHLIGHT_COLORS = [
  { label: 'Gris -25 %', value: DEVIS_FLUO_GRAY.gray25 },
  { label: 'Gris -50 %', value: DEVIS_FLUO_GRAY.gray50 },
  { label: 'Jaune', value: '#FFFF00' },
  { label: 'Crème', value: DEVIS_CHARTE.cream },
  { label: 'Rose', value: DEVIS_CHARTE.rose },
  { label: 'Saumon clair', value: '#FFE8E4' },
  { label: 'Vert clair', value: '#E8F5E9' },
] as const

/** Styles impression / export PDF devis (A4). */
export function buildDevisPrintStyles(): string {
  const C = DEVIS_CHARTE
  return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4 portrait; margin: 0mm; }
    html, body {
      font-family: ${DEVIS_FONT_FAMILY};
      font-size: ${DEVIS_BODY_FONT_SIZE};
      line-height: 1.65;
      color: ${C.charcoal};
      background: ${C.white};
      margin: 0; padding: 0;
    }
    .devis-top, .devis-bot, .doc-body, .devis-sheet, .offer-table, table, th, td, p, li, span, mark, strong, em {
      font-family: ${DEVIS_FONT_FAMILY};
    }
    .page-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .page-table > thead > tr > td {
      padding: 7mm 14mm 4mm;
      border-bottom: 1px solid ${C.rose};
    }
    .page-table > tbody > tr > td {
      padding: 5mm 14mm 0;
      vertical-align: top;
    }
    .page-table > tfoot > tr > td { padding: 0; vertical-align: bottom; }

    .devis-sheet {
      display: block;
      width: 210mm;
      height: 297mm;
      min-height: 297mm;
      max-height: 297mm;
      position: relative;
      overflow: visible;
      box-sizing: border-box;
      background: ${C.white};
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .devis-sheet:last-child { page-break-after: auto; break-after: auto; }
    .devis-sheet-header {
      padding: 7mm 14mm 4mm;
      border-bottom: 1px solid ${C.rose};
    }
    .devis-sheet-body { padding: 5mm 14mm 0; }
    .devis-sheet-last .devis-footer-group {
      position: absolute;
      left: 14mm;
      right: 14mm;
      bottom: 7mm;
      margin-top: 0 !important;
    }

    /* Rythme vertical régulier */
    p  { margin: 0 0 8px; }
    ${devisEmptyParagraphCss()}
    ${devisEmptyParagraphCss('.doc-body', '.devis-sheet-body', '.devis-top')}
    ul, ol { padding-left: 22px; margin: 0 0 8px; }
    ol { list-style-type: decimal; }
    ol > li,
    ul > li {
      margin: 0 0 6px;
    }
    ol ul { list-style-type: disc; margin-top: 4px; margin-bottom: 0; }
    ${devisSectionHeadingCss()}
    ${devisRefTitleCss()}
    .devis-highlight {
      margin: 0 0 8px;
      padding: 8px 12px;
      background: ${C.rose};
      border-radius: 4px;
    }
    .devis-top { display: block; }
    ${diagnosticDarkFluoCss('.devis-top')}
    ${diagnosticBlockGapCss('.devis-top', '.doc-body')}
    ${diagnosticZoneLeadCss('.devis-top', '.doc-body')}
    ${diagnosticVisageCss('.devis-top', '.doc-body')}
    .devis-closing { display: block; }
    .devis-bot { margin-top: ${DEVIS_SALMON_HEADING_GAP.beforeBlock}; }
    .devis-bot p:not(.devis-salmon-heading) { margin: 0 0 ${DEVIS_SECTION_GAP.block}; }

    strong { font-weight: 700; }
    em { font-style: italic; color: ${C.charcoal}; }
    .devis-letter-intro,
    .devis-letter-intro em { font-style: italic; }
    u  { text-decoration: none; border-bottom: 1px solid ${C.rose}; }
    mark {
      /* Ne pas écraser le fluo inline (saumon planning) */
      padding: 0 1px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .devis-heading mark,
    .devis-heading [style*="background"],
    .devis-heading [style*="color"] {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .devis-field-row [style*="color"],
    .devis-field-row mark {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .doc-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .devis-logo-block { display: flex; flex-direction: column; align-items: center; max-width: 132px; }
    .devis-logo-block .logo-img {
      width: 118px;
      height: auto;
      display: block;
      object-fit: contain;
      border-radius: 4px;
    }
    .devis-logo-block .logo-slogan {
      margin: 6px 0 0;
      padding-top: 5px;
      width: 100%;
      text-align: center;
      font-size: 8px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: ${C.bronze};
      border-top: 1px solid ${C.rose};
      line-height: 1.3;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .doc-header .header-right { text-align: right; font-size: 11px; color: ${C.gray}; line-height: 1.35; }
    .doc-header .header-ref  { font-weight: 700; font-size: 13px; color: ${C.bronze}; letter-spacing: 0.02em; }
    .doc-header .header-sub  { margin-top: 3px; color: ${C.gray}; font-size: 10px; }

    .doc-body p:not(.devis-salmon-heading) { margin: 0 0 8px; }
    .doc-body ul, .doc-body ol { padding-left: 22px; margin: 0 0 8px; }
    .doc-body ol { list-style-type: decimal; }
    .doc-body ol > li, .doc-body ul > li { margin: 0 0 6px; }
    .doc-body ol ul { list-style-type: disc; margin-top: 4px; margin-bottom: 0; }
    .doc-body strong {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    ${DEVIS_WYSIWYG_INLINE_PRINT_CSS}
    .doc-body hr, .section-hr {
      border: none;
      border-top: 1px solid ${C.rose};
      margin: 14px 0 12px;
      height: 0;
    }

    /* Page offre */
    .offer-subtitle {
      margin: 0 0 ${DEVIS_SALMON_HEADING_GAP.after};
    }
    .offer-subtitle .devis-field-label {
      font-size: ${DEVIS_FIELD_LABEL_STYLE.fontSize};
      font-weight: ${DEVIS_FIELD_LABEL_STYLE.fontWeight};
    }
    .offer-block {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .devis-closing > .offer-block,
    .devis-top + .devis-closing .offer-block {
      margin-top: 0;
    }
    .offer-table {
      width: 100%;
      border-collapse: collapse;
      font-size: ${DEVIS_BODY_FONT_SIZE};
      border: 1px solid ${C.charcoal};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .offer-table th {
      border: 1px solid ${C.charcoal};
      padding: 8px 12px;
      background: ${C.white};
      font-weight: 700;
      color: ${C.charcoal};
      text-align: left;
      vertical-align: top;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .offer-table th.col-price {
      text-align: center;
      line-height: 1.35;
    }
    .offer-table .tarif-hint {
      display: block;
      margin-top: 2px;
      font-weight: ${DEVIS_FIELD_LABEL_STYLE.fontWeight};
      font-size: ${DEVIS_OFFER_TARIF_HINT_FONT_SIZE};
      color: ${DEVIS_REF_TITLE_STYLE.color} !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .offer-table td {
      padding: 10px 12px;
      border: 1px solid ${C.charcoal};
      vertical-align: top;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .col-desc  { text-align: left; width: 68%; }
    .col-price { text-align: center; width: 32%; }
    .desc-cell { vertical-align: top; }
    .price-cell {
      text-align: center;
      vertical-align: middle;
    }
    .op-title  {
      font-weight: 400;
      color: ${C.charcoal};
      font-size: ${DEVIS_OFFER_TABLE_FONT_SIZE};
      line-height: 1.5;
    }
    .op-title > p { margin: 0 0 6px; }
    .op-title > p:last-child { margin-bottom: 0; }
    .op-title > p:has(.offer-fluo-sejour) {
      margin-top: 8px;
      font-weight: 500;
      font-size: ${DEVIS_OFFER_SEJOUR_FONT_SIZE};
      line-height: 1.45;
    }
    .sejour-badge {
      display: block;
      margin-top: 8px;
      font-weight: 500;
      font-size: ${DEVIS_OFFER_SEJOUR_FONT_SIZE};
      line-height: 1.45;
    }
    .offer-fluo-intervention,
    mark.offer-fluo-intervention {
      background-color: ${DEVIS_FLUO_GRAY.gray25};
      color: ${DEVIS_REF_TITLE_STYLE.color};
      padding: 1px 4px;
      border-radius: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .offer-fluo-intervention strong,
    .offer-fluo-intervention span,
    mark.offer-fluo-intervention strong,
    mark.offer-fluo-intervention span {
      color: ${DEVIS_REF_TITLE_STYLE.color};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .offer-fluo-disclaimer,
    mark.offer-fluo-disclaimer,
    .offer-fluo-payment,
    mark.offer-fluo-payment,
    .offer-fluo-validity,
    mark.offer-fluo-validity {
      background-color: ${DEVIS_FLUO_GRAY.gray50};
      color: ${DEVIS_OFFER_FLUO.disclaimerText};
      padding: 1px 4px;
      border-radius: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .offer-fluo-disclaimer span,
    mark.offer-fluo-disclaimer span,
    .offer-fluo-payment span,
    mark.offer-fluo-payment span,
    .offer-fluo-validity span,
    mark.offer-fluo-validity span {
      color: ${DEVIS_OFFER_FLUO.disclaimerText};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    ${devisOfferSejourFluoCss()}
    .price-amount {
      font-weight: 700;
      font-size: ${DEVIS_OFFER_PRICE_FONT_SIZE};
      letter-spacing: 0.02em;
      color: ${C.charcoal};
    }

    /* Signature compacte + footer bas de page */
    .devis-footer-group {
      margin-top: auto;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .signature-block {
      margin-top: 0;
      margin-bottom: 6px;
      text-align: right;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .signature-block .sig-name {
      font-weight: ${DEVIS_FIELD_LABEL_STYLE.fontWeight};
      font-size: 13px;
      color: #777777;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .signature-block .sig-sub {
      font-weight: ${DEVIS_FIELD_LABEL_STYLE.fontWeight};
      font-size: 12px;
      color: #777777;
      margin-top: 1px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .signature-block img.sig-img {
      width: 72px;
      height: 38px;
      object-fit: contain;
      display: block;
      margin-left: auto;
      margin-top: 3px;
    }
    .devis-contact-footer {
      margin-top: 6px;
      padding: 8px 0 0;
      border-top: 1px solid ${C.rose};
      background: transparent;
      color: ${C.gray};
      text-align: center;
      font-size: 10px;
      line-height: 1.5;
      letter-spacing: 0.02em;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .devis-contact-footer .contact-line {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin: 2px 0;
      color: ${C.charcoal};
      text-decoration: none;
    }
    .devis-contact-footer a.contact-line:hover { color: ${C.bronze}; }
    .devis-contact-footer svg {
      width: 12px;
      height: 12px;
      flex-shrink: 0;
      stroke: ${C.bronze};
      fill: none;
      stroke-width: 1.6;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .devis-contact-footer svg path,
    .devis-contact-footer svg polyline,
    .devis-contact-footer svg circle { stroke: inherit; fill: none; }
    .devis-contact-footer svg.icon-whatsapp {
      stroke: none;
      fill: ${C.bronze};
    }
    .devis-contact-footer svg.icon-whatsapp path {
      stroke: none;
      fill: inherit;
    }
  `
}
