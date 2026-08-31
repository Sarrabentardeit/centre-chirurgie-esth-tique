/**
 * Charte graphique devis — réf. charte_graphique/Sans titre - 1-07.png
 * Accent principal unique : bronze. Teal réservé aux titres de structure.
 */
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

export type DevisLabelTone = 'bronze' | 'teal' | 'gray'

const LABEL_COLORS: Record<DevisLabelTone, string> = {
  bronze: DEVIS_CHARTE.bronze,
  teal: DEVIS_CHARTE.teal,
  gray: DEVIS_CHARTE.gray,
}

/** Libellé coloré — bronze par défaut (accent unique). */
export function devisLabel(text: string, tone: DevisLabelTone = 'bronze'): string {
  return `<span style="color:${LABEL_COLORS[tone]};font-weight:700">${text}</span>`
}

/** @deprecated Préférer devisLabel(..., 'bronze') */
export function devisEmphasis(text: string): string {
  return devisLabel(text, 'bronze')
}

export function devisValueSpan(value: string): string {
  return `<span style="color:${DEVIS_CHARTE.charcoal}">${value}</span>`
}

/** Titre de section — hiérarchie claire, sans soulignement. */
export function devisSectionHeading(text: string): string {
  const { bronze } = DEVIS_CHARTE
  return `<p class="devis-heading"><strong style="color:${bronze}">${text}</strong></p>`
}

/** Ligne label + valeur. */
export function devisFieldRow(
  label: string,
  value: string,
  labelTone: DevisLabelTone = 'bronze',
): string {
  return `<p>${devisLabel(label, labelTone)} ${devisValueSpan(value)}</p>`
}

/** Encadré info importante. */
export function devisHighlightBox(label: string, value: string): string {
  const { bronze, charcoal } = DEVIS_CHARTE
  return `<p class="devis-highlight"><strong style="color:${bronze}">${label}</strong> <span style="color:${charcoal};font-weight:700">${value}</span></p>`
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

/** Bloc « Notre meilleure offre » — tableau + ligne total distincte. */
export function buildDevisOfferBlockHtml(opts: {
  operationTitle: string
  sejourLine?: string
  totalFormatted: string
}): string {
  const { sejourLine = '', totalFormatted } = opts
  const operationTitle = escapeDevisHtml(opts.operationTitle)
  const sejourSafe = escapeDevisHtml(sejourLine)
  return `
<div class="offer-block">
  <p class="section-title">Notre meilleure offre</p>
  <table class="offer-table">
    <thead>
      <tr>
        <th class="col-desc">Description</th>
        <th class="col-price">Tarif</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="desc-cell" colspan="2">
          <div class="op-title">${operationTitle}</div>
          ${sejourSafe ? `<div class="sejour-badge">${sejourSafe}</div>` : ''}
        </td>
      </tr>
    </tbody>
    <tfoot>
      <tr class="offer-total-row">
        <td class="total-label">Total <span class="total-hint">(ferme et définitif)</span></td>
        <td class="total-price">
          <span class="price-amount">${escapeDevisHtml(totalFormatted)}</span>
          <span class="price-currency">dt</span>
        </td>
      </tr>
    </tfoot>
  </table>
</div>`
}

/** Styles aperçu écran du bloc offre (médecin / éditeur). */
export const DEVIS_OFFER_PREVIEW_CSS = `
.doc-offer-preview .section-title {
  font-weight: 700;
  font-size: 14px;
  margin: 0 0 12px;
  color: ${DEVIS_CHARTE.bronze};
  border-bottom: 2px solid ${DEVIS_CHARTE.bronze};
  padding-bottom: 6px;
  display: inline-block;
}
.doc-offer-preview .offer-table {
  width: 100%;
  border-collapse: collapse;
  border: 1.5px solid ${DEVIS_CHARTE.charcoal};
  font-size: 12.5px;
}
.doc-offer-preview .offer-table th {
  background: ${DEVIS_CHARTE.cream};
  color: ${DEVIS_CHARTE.teal};
  font-weight: 700;
  padding: 8px 12px;
  border-bottom: 1.5px solid ${DEVIS_CHARTE.charcoal};
  text-align: left;
}
.doc-offer-preview .offer-table th.col-price { text-align: right; }
.doc-offer-preview .offer-table td { padding: 12px; }
.doc-offer-preview .op-title { font-weight: 700; color: ${DEVIS_CHARTE.charcoal}; font-size: 13px; }
.doc-offer-preview .sejour-badge {
  margin-top: 8px; font-size: 11px; font-weight: 500; color: ${DEVIS_CHARTE.gray};
}
.doc-offer-preview .offer-total-row td {
  border-top: 1.5px solid ${DEVIS_CHARTE.charcoal};
  background: ${DEVIS_CHARTE.cream};
  padding: 10px 12px;
}
.doc-offer-preview .total-label { font-weight: 700; color: ${DEVIS_CHARTE.teal}; }
.doc-offer-preview .total-hint { font-weight: 500; font-size: 10.5px; color: ${DEVIS_CHARTE.gray}; }
.doc-offer-preview .total-price { text-align: right; white-space: nowrap; }
.doc-offer-preview .price-amount {
  font-weight: 700; font-size: 22px; color: ${DEVIS_CHARTE.bronze}; letter-spacing: 0.02em;
}
.doc-offer-preview .price-currency {
  margin-left: 6px; font-weight: 700; font-size: 12px; color: ${DEVIS_CHARTE.bronze};
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
.devis-sheet-body mark {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
`

/** Palette TipTap (éditeur devis). */
export const DEVIS_TOOLBAR_COLORS = [
  { label: 'Blanc', value: DEVIS_CHARTE.white },
  { label: 'Crème', value: DEVIS_CHARTE.cream },
  { label: 'Gris', value: DEVIS_CHARTE.gray },
  { label: 'Charbon', value: DEVIS_CHARTE.charcoal },
  { label: 'Bleu nuit', value: DEVIS_CHARTE.teal },
  { label: 'Rose', value: DEVIS_CHARTE.rose },
  { label: 'Bronze', value: DEVIS_CHARTE.bronze },
] as const

/** Styles impression / export PDF devis (A4). */
export function buildDevisPrintStyles(): string {
  const C = DEVIS_CHARTE
  return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4 portrait; margin: 0mm; }
    html, body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      line-height: 1.65;
      color: ${C.charcoal};
      background: ${C.white};
      margin: 0; padding: 0;
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
    ul, ol { padding-left: 20px; margin: 0 0 6px; }
    ol { list-style-type: decimal; }
    ol > li {
      margin: 0 0 10px;
    }
    ul > li {
      margin: 0 0 5px;
    }
    ol ul { list-style-type: disc; margin-top: 6px; margin-bottom: 0; }
    .devis-heading {
      margin: 10px 0 6px;
      padding: 0;
      background: transparent;
      border: none;
      font-weight: 700;
      break-after: avoid;
      page-break-after: avoid;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    ul + .devis-heading { margin-top: 6px; }
    /* Défauts charte uniquement si pas de style inline (couleur/taille éditeur prioritaire). */
    .devis-heading:not([style*="color"]):not([style*="font-size"]) {
      font-size: 13px;
      color: ${C.bronze};
    }
    .devis-ref-title {
      text-align: center !important;
      margin: 12px 0 10px;
      font-weight: 700;
      letter-spacing: 0.02em;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .devis-ref-title:not([style*="color"]) {
      color: ${C.bronze};
    }
    .devis-ref-title:not([style*="font-size"]) {
      font-size: 18px;
    }
    .devis-ref-title strong { font-weight: 700; letter-spacing: 0.02em; }
    .devis-highlight {
      margin: 10px 0;
      padding: 8px 12px;
      background: ${C.rose};
      border-radius: 4px;
    }
    .devis-top { display: block; }
    .devis-closing { display: block; }
    .devis-bot { margin-top: 14px; }
    .devis-bot p { margin: 0 0 9px; }

    strong { font-weight: 700; }
    em { font-style: italic; color: ${C.charcoal}; }
    u  { text-decoration: none; border-bottom: 1px solid ${C.rose}; }
    mark {
      /* Ne pas écraser le fluo inline (saumon planning) */
      padding: 0 1px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
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

    .doc-body p { margin: 0 0 8px; }
    .doc-body ul, .doc-body ol { padding-left: 20px; margin: 0 0 10px; }
    .doc-body ol { list-style-type: decimal; }
    .doc-body ol > li { margin: 0 0 10px; }
    .doc-body ul > li { margin: 0 0 5px; }
    .doc-body ol ul { list-style-type: disc; margin-top: 6px; }
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
    .section-title {
      font-weight: 700;
      font-size: 14px;
      margin: 0 0 12px;
      color: ${C.bronze};
      letter-spacing: 0.01em;
      text-decoration: none;
      border-bottom: 2px solid ${C.bronze};
      padding-bottom: 6px;
      display: inline-block;
    }
    .offer-block {
      break-inside: avoid;
      page-break-inside: avoid;
      margin-top: 4px;
    }
    .offer-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      border: 1.5px solid ${C.charcoal};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .offer-table th {
      border-bottom: 1.5px solid ${C.charcoal};
      padding: 8px 12px;
      background: ${C.cream};
      font-weight: 700;
      color: ${C.teal};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .offer-table td {
      padding: 12px;
      border: none;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .col-desc  { text-align: left; width: 68%; }
    .col-price { text-align: right; width: 32%; }
    .desc-cell { vertical-align: top; }
    .op-title  {
      font-weight: 700;
      color: ${C.charcoal};
      font-size: 12.5px;
      line-height: 1.45;
    }
    .sejour-badge {
      display: inline-block;
      margin-top: 8px;
      font-weight: 500;
      font-size: 10.5px;
      color: ${C.gray};
      background: transparent;
      padding: 0;
      border-radius: 0;
      letter-spacing: 0.01em;
    }
    .offer-total-row td {
      border-top: 1.5px solid ${C.charcoal};
      background: ${C.cream};
      padding: 10px 12px;
      vertical-align: middle;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .total-label {
      font-weight: 700;
      font-size: 12px;
      color: ${C.teal};
    }
    .total-hint {
      font-weight: 500;
      font-size: 10px;
      color: ${C.gray};
    }
    .total-price {
      text-align: right;
      white-space: nowrap;
    }
    .price-amount {
      font-weight: 700;
      font-size: 22px;
      letter-spacing: 0.02em;
      color: ${C.bronze};
    }
    .price-currency {
      display: inline-block;
      margin-left: 6px;
      font-weight: 700;
      font-size: 12px;
      color: ${C.bronze};
      vertical-align: 2px;
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
    .signature-block .sig-name { font-weight: 700; font-size: 11.5px; color: ${C.charcoal}; }
    .signature-block .sig-sub  { font-size: 10px; color: ${C.gray}; margin-top: 1px; }
    .signature-block img.sig-img {
      width: 72px;
      height: 38px;
      object-fit: contain;
      display: block;
      margin-left: auto;
      margin-top: 3px;
    }
    .signature-block .sig-line {
      width: 110px;
      height: 1px;
      border-bottom: 1px solid ${C.rose};
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
