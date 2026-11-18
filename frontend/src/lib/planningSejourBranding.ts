/** Couleurs et assets — fidèle au PDF/Word « Planning Séjour Type séjour ». */

/**
 * Version du modèle PDF. Incrémenter pour migrer auto tous les anciens plannings
 * (éditeur / dossier / envoi) sans clic « Réinitialiser ».
 */
export const PLANNING_TEMPLATE_VERSION = 4

export const PLANNING_DOC = {
  fontFamily: "Calibri, 'Segoe UI', Arial, Helvetica, sans-serif",
  /** Word Normal sz=22 → 11pt */
  baseSize: '11pt',
  /** Titres / contacts / nom sz=24 → 12pt */
  titleSize: '12pt',
  /** Word line=276 / 240 → 1.15 */
  lineHeight: '1.15',
  /** Word spacing after=200 twips → 10pt */
  paraAfter: '10pt',
  /** Titres rose pâle (Planning…, nom, CONSIGNES) */
  pink: '#FF9999',
  /** Saumon Word (#FF7C80 / #FF7C81) — clinique, hôtel, alertes surlignées */
  salmon: '#FF7C80',
  /** Corps gris */
  gray: '#7F7F7F',
  /** Séances drainage */
  gold: '#FFC000',
  /** Surlignage gris clair (Word lightGray) */
  hiLight: '#D9D9D9',
  /** Surlignage gris foncé (Word darkGray) — bandeau contacts */
  hiDark: '#808080',
  /** Texte clair sur bandeau contacts */
  contactText: '#F2F2F2',
  /** Alerte douane (rouge franc) */
  red: '#FF0000',
} as const

export const PLANNING_HEADER_LOGO = '/planning-header-logo.png'
export const PLANNING_FOOTER_IMAGE = '/planning-bon-sejour.png'

/** Couleurs de surlignage (fluo) — barre d’outils planning séjour (+ autre couleur au sélecteur). */
export const PLANNING_HIGHLIGHT_COLORS = [
  { label: 'Gris clair (Word)', value: '#D9D9D9' },
  { label: 'Gris foncé (contacts)', value: '#808080' },
  { label: 'Jaune', value: '#FFF59D' },
  { label: 'Saumon clair', value: '#FFE8E4' },
  { label: 'Rose pâle', value: '#FDEADA' },
  { label: 'Or pâle', value: '#FFF3CD' },
  { label: 'Vert clair', value: '#E8F5E9' },
  { label: 'Bleu clair', value: '#E3F2FD' },
  { label: 'Lavande', value: '#EDE7F6' },
] as const

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

/** Comme salmonHi, mais pour HTML déjà construit (ex. liens planning-field). */
export function salmonHiHtml(innerHtml: string): string {
  return `<strong><mark data-color="${C.hiLight}" style="background-color:${C.hiLight}"><span style="color:${C.salmon}">${innerHtml}</span></mark></strong>`
}

/** Texte saumon gras sans surlignage (noms clinique / hôtel). */
export function salmon(text: string): string {
  return `<strong><span style="color:${C.salmon}">${esc(text)}</span></strong>`
}

/* Paragraphes ─────────────────────────────────────────── */

/** Titre rose souligné centré 12pt (ex. « Planning de votre séjour… »). */
export function paraTitle(text: string): string {
  return `<p style="text-align:center;font-size:${C.titleSize};line-height:${C.lineHeight};margin:0 0 ${C.paraAfter}"><strong><u><span style="color:${C.pink}">${esc(text)}</span></u></strong></p>`
}

/** Nom patient rose + surlignage, souligné, centré 12pt. */
export function paraName(text: string): string {
  return `<p style="text-align:center;font-size:${C.titleSize};line-height:${C.lineHeight};margin:0 0 ${C.paraAfter}"><strong><u><mark data-color="${C.hiLight}" style="background-color:${C.hiLight}"><span style="color:${C.pink}">${esc(text)}</span></mark></u></strong></p>`
}

/** Intervention / dossier — saumon gras centré, interligne simple (Word after=0 line=240). */
export function paraSalmonCenter(text: string): string {
  return `<p style="text-align:center;line-height:1;margin:0"><strong><span style="color:${C.salmon}">${esc(text)}</span></strong></p>`
}

export function paraDay(text: string): string {
  return `<p style="line-height:${C.lineHeight};margin:0 0 ${C.paraAfter}"><strong><u><span style="color:${C.gray}">${esc(text)}</span></u></strong></p>`
}

export function paraGray(text: string): string {
  return `<p style="line-height:${C.lineHeight};margin:0 0 ${C.paraAfter}"><span style="color:${C.gray}">${esc(text)}</span></p>`
}

export function paraSalmonHi(text: string): string {
  return `<p style="line-height:${C.lineHeight};margin:0 0 ${C.paraAfter}">${salmonHi(text)}</p>`
}

/** Alerte rouge franc (déclaration douane). */
export function paraRed(text: string): string {
  return `<p style="line-height:${C.lineHeight};margin:0 0 ${C.paraAfter}"><strong><span style="color:${C.red}">${esc(text)}</span></strong></p>`
}

export function paraGold(text: string): string {
  return `<p style="line-height:${C.lineHeight};margin:0 0 ${C.paraAfter}"><strong><span style="color:${C.gold}">${esc(text)}</span></strong></p>`
}

/** Bandeau contacts : texte clair sur fond gris foncé, centré 12pt. */
export function paraContact(text: string): string {
  return `<p style="text-align:center;font-size:${C.titleSize};line-height:${C.lineHeight};margin:0 0 ${C.paraAfter}"><mark data-color="${C.hiDark}" style="background-color:${C.hiDark}"><span style="color:${C.contactText}">${esc(text)}</span></mark></p>`
}

/** CONSIGNES — rose + surlignage, gras souligné, aligné à gauche. */
export function paraConsignesTitle(text: string): string {
  return `<p style="font-size:${C.titleSize};line-height:${C.lineHeight};margin:0 0 ${C.paraAfter}"><strong><u><mark data-color="${C.hiLight}" style="background-color:${C.hiLight}"><span style="color:${C.pink}">${esc(text)}</span></mark></u></strong></p>`
}

/** Cadre noir PDF autour du titre + lignes de consignes. */
export function consignesBoxHtml(...innerParagraphs: string[]): string {
  return `<div class="planning-consignes-box">\n${innerParagraphs.filter(Boolean).join('\n')}\n</div>`
}

/** Paragraphe composé de plusieurs runs (HTML inline déjà construit). */
export function paraMixed(...runs: string[]): string {
  return `<p style="line-height:${C.lineHeight};margin:0 0 ${C.paraAfter}">${runs.join('')}</p>`
}

export function headerLogoHtml(url = PLANNING_HEADER_LOGO): string {
  return `<p style="text-align:left;margin:0 0 12pt;line-height:1"><img src="${url}" alt="Dr Mehdi Chennoufi" /></p>`
}

export function footerImageHtml(url = PLANNING_FOOTER_IMAGE): string {
  return `<p style="text-align:center;margin:14pt 0 8pt;line-height:1"><img src="${url}" alt="Bon séjour" /></p>`
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
  // Tampon de version (évite les doublons si déjà présent).
  if (!/data-planning-template=/i.test(body)) {
    body = body.replace(
      /(<div\b[^>]*\bclass=["'][^"']*\bplanning-doc\b[^"']*["'])/i,
      '$1 data-planning-template="0"',
    )
  }
  return body
}
