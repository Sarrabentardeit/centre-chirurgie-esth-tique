/** Couleurs et assets — fidèle au .docx « Planning Séjour SEGONNE Laurine (Mai 26) ». */

export const PLANNING_DOC = {
  fontFamily: "Calibri, 'Segoe UI', Arial, Helvetica, sans-serif",
  baseSize: '11pt',
  titleSize: '12pt',
  pink: '#FF9999',
  salmon: '#FF7C80',
  gray: '#7F7F7F',
  gold: '#FFC000',
  hiLight: '#D9D9D9',
  hiDark: '#808080',
  contactText: '#F2F2F2',
} as const

export const PLANNING_HEADER_LOGO = '/planning-header-logo.png'
export const PLANNING_FOOTER_IMAGE = '/planning-bon-sejour.png'

const C = PLANNING_DOC

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/* Runs ───────────────────────────────────────────────── */

/** Texte gris normal (corps). */
export function gray(text: string): string {
  return `<span style="color:${C.gray}">${esc(text)}</span>`
}

/** Texte saumon gras + surlignage gris clair (lignes importantes). */
export function salmonHi(text: string): string {
  return `<strong><mark data-color="${C.hiLight}" style="background-color:${C.hiLight}"><span style="color:${C.salmon}">${esc(text)}</span></mark></strong>`
}

/** Texte saumon gras sans surlignage (noms clinique / hôtel). */
export function salmon(text: string): string {
  return `<strong><span style="color:${C.salmon}">${esc(text)}</span></strong>`
}

/* Paragraphes ─────────────────────────────────────────── */

export function paraTitle(text: string): string {
  return `<p style="text-align:center"><strong><u><span style="color:${C.pink}">${esc(text)}</span></u></strong></p>`
}

export function paraName(text: string): string {
  return `<p style="text-align:center"><strong><u><mark data-color="${C.hiLight}" style="background-color:${C.hiLight}"><span style="color:${C.pink}">${esc(text)}</span></mark></u></strong></p>`
}

export function paraDay(text: string): string {
  return `<p><strong><u><span style="color:${C.gray}">${esc(text)}</span></u></strong></p>`
}

export function paraGray(text: string): string {
  return `<p><span style="color:${C.gray}">${esc(text)}</span></p>`
}

export function paraSalmonHi(text: string): string {
  return `<p>${salmonHi(text)}</p>`
}

export function paraGold(text: string): string {
  return `<p><strong><span style="color:${C.gold}">${esc(text)}</span></strong></p>`
}

export function paraContact(text: string): string {
  return `<p style="text-align:center"><span style="color:${C.gray}">${esc(text)}</span></p>`
}

/** Paragraphe composé de plusieurs runs (HTML inline déjà construit). */
export function paraMixed(...runs: string[]): string {
  return `<p>${runs.join('')}</p>`
}

export function headerLogoHtml(url = PLANNING_HEADER_LOGO): string {
  return `<p style="text-align:left"><img src="${url}" alt="Dr Mehdi Chennoufi" /></p>`
}

export function footerImageHtml(url = PLANNING_FOOTER_IMAGE): string {
  return `<p style="text-align:center"><img src="${url}" alt="Bon séjour" /></p>`
}

/** Garantit logo en tête et image « Bon séjour » en fin (contenu sauvegardé ancien). */
export function ensurePlanningDocShell(html: string, origin = ''): string {
  const logo = origin ? `${origin}${PLANNING_HEADER_LOGO}` : PLANNING_HEADER_LOGO
  const footer = origin ? `${origin}${PLANNING_FOOTER_IMAGE}` : PLANNING_FOOTER_IMAGE
  let body = html.trim()
  if (origin) {
    body = body.replace(
      /src="\/(planning-header-logo|planning-bon-sejour)\.png"/g,
      `src="${origin}/$1.png"`,
    )
  }
  if (!body.includes('planning-header-logo')) {
    body = headerLogoHtml(logo) + body
  }
  if (!body.includes('planning-bon-sejour')) {
    body = body + footerImageHtml(footer)
  }
  if (!body.includes('planning-doc')) {
    body = `<div class="planning-doc">\n${body}\n</div>`
  }
  return body
}
