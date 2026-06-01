/**
 * Charte graphique devis — réf. charte_graphique/Sans titre - 1-07.png
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

/** Rétrocompat — accent historique (bronze). */
export const DEVIS_ACCENT = DEVIS_CHARTE.bronze

export type DevisLabelTone = 'bronze' | 'teal' | 'gray'

const LABEL_COLORS: Record<DevisLabelTone, string> = {
  bronze: DEVIS_CHARTE.bronze,
  teal: DEVIS_CHARTE.teal,
  gray: DEVIS_CHARTE.gray,
}

/** Libellé coloré (bronze = identité / principal, teal = médical / séjour, gris = secondaire). */
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

/** Titre de bloc (bleu nuit + fond crème + filet teal). */
export function devisSectionHeading(text: string): string {
  const { teal, cream } = DEVIS_CHARTE
  return `<p style="margin-top:10px;margin-bottom:4px;padding:6px 10px;background:${cream};border-left:4px solid ${teal}"><strong><span style="color:${teal};text-decoration:underline">${text}</span></strong></p>`
}

/** Ligne label + valeur. */
export function devisFieldRow(
  label: string,
  value: string,
  labelTone: DevisLabelTone = 'bronze',
): string {
  return `<p>${devisLabel(label, labelTone)} ${devisValueSpan(value)}</p>`
}

/** Encadré rose (info importante). */
export function devisHighlightBox(label: string, value: string): string {
  const { rose, bronze, charcoal } = DEVIS_CHARTE
  return `<p style="margin:8px 0;padding:8px 12px;background:${rose};border-radius:4px"><strong style="color:${bronze}">${label}</strong> <span style="color:${charcoal};font-weight:700">${value}</span></p>`
}

export function devisSeparator(): string {
  return `<div style="height:0;margin:18px 0 14px;border-top:1px solid ${DEVIS_CHARTE.rose}" aria-hidden="true"></div>`
}

/** Palette TipTap (éditeur devis) — toutes les couleurs charte. */
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
      line-height: 1.55;
      color: ${C.charcoal};
      background: ${C.white};
      margin: 0; padding: 0;
    }
    .page-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .page-table > thead > tr > td {
      padding: 8mm 14mm 5mm;
      border-bottom: 1px solid ${C.rose};
    }
    .page-table > tbody > tr > td {
      padding: 6mm 14mm 0;
      vertical-align: top;
    }
    .page-table > tfoot > tr > td {
      height: 10mm;
      padding: 0 14mm;
    }
    p  { margin: 2px 0; }
    ul, ol { padding-left: 18px; margin: 4px 0; }
    li { margin: 1px 0; }
    strong { font-weight: 700; }
    em { font-style: italic; color: ${C.gray}; }
    u  { text-decoration: underline; }
    mark {
      background: ${C.cream};
      padding: 0 1px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .doc-header { display: flex; justify-content: space-between; align-items: center; }
    .doc-header img.logo { width: 52px; height: 52px; object-fit: contain; }
    .doc-header .header-right { text-align: right; font-size: 10px; color: ${C.gray}; line-height: 1.4; }
    .doc-header .header-ref  { font-weight: 700; color: ${C.bronze}; }
    .doc-header .header-sub  { color: ${C.gray}; }
    .doc-body p { margin: 2px 0; }
    .doc-body ul, .doc-body ol { padding-left: 18px; margin: 4px 0; }
    .doc-body li { margin: 1px 0; }
    .doc-body hr { border: none; border-top: 1px solid ${C.rose}; margin: 12px 0 10px; }
    .section-hr { border: none; border-top: 1px solid ${C.rose}; margin: 12px 0 10px; }
    .section-title {
      font-weight: 700;
      text-decoration: underline;
      font-size: 12.5px;
      margin-bottom: 8px;
      color: ${C.teal};
    }
    .offer-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
    .offer-table th, .offer-table td {
      border: 1.5px solid ${C.charcoal};
      padding: 7px 10px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .col-desc  { text-align: left; width: 72%; background: ${C.cream}; font-weight: 700; color: ${C.teal}; }
    .col-price { text-align: center; background: ${C.cream}; font-weight: 700; color: ${C.teal}; }
    .price-sub { display: block; font-size: 9px; font-weight: 500; color: ${C.gray}; }
    .desc-cell { vertical-align: top; }
    .price-cell { text-align: center; vertical-align: middle; font-weight: 700; font-size: 20px; letter-spacing: .02em; color: ${C.charcoal}; }
    .op-title  {
      font-weight: 700;
      color: ${C.bronze};
      background: ${C.cream};
      padding: 6px 10px;
      border-radius: 3px;
      border-left: 3px solid ${C.teal};
    }
    .sejour-badge {
      display: inline-block;
      margin-top: 6px;
      font-weight: 600;
      font-size: 11px;
      color: ${C.bronze};
      background: ${C.rose};
      padding: 4px 10px;
      border-radius: 3px;
    }
    .offer-block { break-inside: avoid; page-break-inside: avoid; }
    .signature-block {
      margin-top: 18px;
      text-align: right;
      break-inside: avoid;
      page-break-inside: avoid;
      break-before: avoid;
      page-break-before: avoid;
    }
    .signature-block .sig-name { font-weight: 700; font-size: 12.5px; color: ${C.charcoal}; }
    .signature-block .sig-sub  { font-size: 11px; color: ${C.gray}; margin-top: 1px; }
    .signature-block .sig-tagline { font-size: 11px; color: ${C.bronze}; font-weight: 600; margin-top: 3px; letter-spacing: 0.03em; }
    .signature-block img.sig-img { width: 90px; height: 46px; object-fit: contain; display: block; margin-left: auto; margin-top: 4px; }
    .signature-block .sig-line { width: 140px; height: 1px; border-bottom: 1px solid ${C.rose}; margin-left: auto; margin-top: 4px; }
  `
}
