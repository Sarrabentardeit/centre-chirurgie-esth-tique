/**
 * Rafraîchissement commun du corps de lettre devis (éditeur + tous les PDF).
 * Applique les règles actuelles : titre bronze, examens, séjour, chambre, etc.
 */
import {
  DEVIS_CHARTE,
  DEVIS_FIELD_LABEL_STYLE,
  DEVIS_REF_TITLE_STYLE,
  DEVIS_SECTION_HEADING_STYLE,
  buildDevisRefTitleHtml,
  devisFieldRow,
  devisLabel,
  devisSalmonHeading,
  devisSalmonLabelStyleAttr,
  devisSectionHeading,
  buildPaymentModalitiesBodyHtml,
  buildOfferValidityBlockHtml,
  buildOfferSejourBadgeLine,
  offerDureeTotaleFluoHtml,
  offerSejourFluoHtml,
} from '@/lib/devisCharte'
import {
  DEVIS_EXCLUT_ITEMS,
  labelsForIds,
  labelsForInclut,
  parseContentionDetailFromNotes,
  resolveDrainageNb,
  resolveExclutIds,
  resolveInclutIds,
} from '@/lib/devisOfferInclus'
import { devisSejourDefaultsFromRapport, nbAdultesDevisFromAccompagnants, parseSejourMeta, typeChambreFromNbAdultesDevis } from '@/lib/devisSejourNotes'
import { buildDevisAmountSentenceHtml, DEFAULT_TND_PER_EUR } from '@/lib/moneyWords'
import { paraSalmonHi } from '@/lib/planningSejourBranding'
import { formatDevisTitle } from '@/lib/utils'
import { formatDiagnosticLetterHtml, normalizeDiagnosticBlockGapsInHtml, normalizeDiagnosticDarkFluoInHtml, normalizeDiagnosticZoneLeadInHtml, stripDiagnosticOpTitlesFromHtml, upgradeDiagnosticMissingLayoutInHtml } from '@/lib/diagnosticFormat'

export type DevisLetterDevis = {
  statut?: string
  numeroDevis?: string | null
  notesSejour?: string | null
  version?: number | null
  rapportId?: string | null
  dateCreation?: string
  envoyeAt?: string | null
}

export type DevisLetterRapportVersion = {
  createdAt: string
  diagnostic?: string | null
  interventionsRecommandees?: string[]
  examensDemandes?: string[]
}

export type DevisLetterRapport = {
  id?: string
  createdAt?: string
  diagnostic?: string | null
  examensDemandes?: string[]
  interventionsRecommandees?: string[]
  anesthesieGenerale?: boolean | null
  nuitsClinique?: number | null
  nuitsPreoperatoires?: number | null
  dureeSejourTunisie?: number | null
  nbAdultesSejour?: number | null
  nbEnfantsSejour?: number | null
  drainage?: boolean | null
  nbSeancesDrainage?: number | null
  versions?: DevisLetterRapportVersion[]
}

/** Contexte minimal pour synchroniser / générer le HTML avant PDF / éditeur. */
export type DevisLetterContext = {
  dossierNumber: string
  devis?: DevisLetterDevis[] | null
  /** Devis exporté / édité — prioritaire pour notes + titre. */
  activeDevis?: DevisLetterDevis | null
  rapports?: DevisLetterRapport[] | null
  formulaires?: Array<{ payload?: Record<string, unknown> }> | null
  /** Identité patient (génération lettre initiale). */
  patient?: {
    fullName: string
    phone?: string | null
    ville?: string | null
    pays?: string | null
  } | null
}

function parseNights(value: string): number | null {
  const m = value.match(/(\d+)\s*(nuit|nuits)/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function parseGestNights(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = Number.parseInt(t, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function pickDevis(ctx: DevisLetterContext): DevisLetterDevis | null {
  if (ctx.activeDevis) return ctx.activeDevis
  const list = ctx.devis ?? []
  return (
    list.find((d) => d.statut === 'brouillon')
    ?? list.find((d) => d.statut && ['envoye', 'accepte'].includes(d.statut))
    ?? list[0]
    ?? null
  )
}

function devisAsOfMs(dv: DevisLetterDevis | null): number | null {
  const raw = dv?.envoyeAt || dv?.dateCreation
  if (!raw) return null
  const t = new Date(raw).getTime()
  return Number.isFinite(t) ? t : null
}

function applyRapportSnapshot(
  rap: DevisLetterRapport,
  atMs: number | null,
): DevisLetterRapport {
  const versions = rap.versions ?? []
  if (versions.length === 0) return rap
  const sorted = [...versions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
  const snap =
    atMs == null
      ? sorted[sorted.length - 1]
      : [...sorted].reverse().find((v) => new Date(v.createdAt).getTime() <= atMs + 60_000)
        ?? sorted[0]
  if (!snap) return rap
  return {
    ...rap,
    diagnostic: snap.diagnostic ?? rap.diagnostic,
    interventionsRecommandees: snap.interventionsRecommandees?.length
      ? snap.interventionsRecommandees
      : rap.interventionsRecommandees,
    examensDemandes: Array.isArray(snap.examensDemandes) && snap.examensDemandes.length
      ? snap.examensDemandes.map(String)
      : rap.examensDemandes,
  }
}

/**
 * Rapport de CE devis.
 * - Lié par rapportId : texte actuel de CE rapport (une correction du même R est reprise ;
 *   un nouveau R3 n’est pas injecté).
 * - Brouillon sans lien : dernier rapport du dossier.
 * - Devis envoyé sans lien (ancien) : rapport déjà existant à la date d’envoi, figé.
 */
export function pickRapport(ctx: DevisLetterContext): DevisLetterRapport | null {
  const list = ctx.rapports ?? []
  const dv = pickDevis(ctx)
  if (dv?.rapportId) {
    const linked = list.find((r) => r.id === dv.rapportId)
    if (linked) return linked
  }
  if (!isFrozenDevis(dv)) {
    const latest = list[0]
    return latest ?? null
  }
  const at = devisAsOfMs(dv)
  if (at == null) {
    const latest = list[0]
    return latest ?? null
  }
  const existing = list
    .filter((r) => r.createdAt && new Date(r.createdAt).getTime() <= at + 60_000)
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
  const rap = existing[0]
  return rap ? applyRapportSnapshot(rap, at) : null
}

function isFrozenDevis(dv: DevisLetterDevis | null): boolean {
  return dv?.statut === 'envoye' || dv?.statut === 'accepte'
}

function formatNightsAndDays(nights: number): string {
  const n = Math.round(nights)
  if (!Number.isFinite(n) || n <= 0) return '—'
  const days = n + 1
  return `${n} nuit${n > 1 ? 's' : ''} / ${days} jour${days > 1 ? 's' : ''}`
}

/** Textes séjour / clinique / hôtel pour le PDF. */
export function sejourPdfFromContext(ctx: DevisLetterContext) {
  const rap = pickRapport(ctx)
  const dv = pickDevis(ctx)
  const sej = parseSejourMeta(dv?.notesSejour ?? '')
  const nGestClin = parseGestNights(sej.cliniqueNuits)
  const nGestHotel = parseGestNights(sej.hotelNuits)
  const nuitsClinRap = (rap?.nuitsClinique ?? 0) + (rap?.nuitsPreoperatoires ?? 0)

  const noteLines = (dv?.notesSejour ?? '').split('\n')
  const convStr =
    noteLines.find((l) => l.startsWith('DELAIS_CONVALESCENCE:'))?.replace('DELAIS_CONVALESCENCE:', '').trim() ?? ''
  const convNightsLegacy = parseNights(convStr) ?? 0

  const nPreop = rap?.nuitsPreoperatoires ?? 1
  const nPostop = rap?.nuitsClinique ?? 0
  const nClinForHosp = nGestClin ?? (nuitsClinRap > 0 ? nPostop : null)

  const dureeHosp =
    nPreop > 0 && nPostop > 0
      ? `${nPreop} nuit${nPreop > 1 ? 's' : ''} préparatoire${nPreop > 1 ? 's' : ''} et ${nPostop} nuit${nPostop > 1 ? 's' : ''} postopératoire${nPostop > 1 ? 's' : ''} en clinique`
      : nPreop > 0
        ? `${nPreop} nuit${nPreop > 1 ? 's' : ''} préparatoire${nPreop > 1 ? 's' : ''} en clinique`
        : nClinForHosp != null && nClinForHosp > 0
          ? `${nClinForHosp} nuit${nClinForHosp > 1 ? 's' : ''} en clinique`
          : '—'

  const cliniqueRetenue = sej.cliniqueNom.trim() || '—'

  const postHospLabel =
    nGestHotel != null
      ? `${nGestHotel} nuit${nGestHotel > 1 ? 's' : ''} à l'hôtel en Tunisie`
      : convNightsLegacy > 0
        ? `${convNightsLegacy} nuit${convNightsLegacy > 1 ? 's' : ''} de convalescence à l'hôtel`
        : (convStr || '—')

  const hotelSejour = sej.hotelNom.trim() || '—'

  const nClinTot = nGestClin ?? nuitsClinRap
  const nHotelTot = nGestHotel != null ? nGestHotel : convNightsLegacy
  const totalNights = Math.max(0, nClinTot) + Math.max(0, nHotelTot)

  const hasNuitsSaisies = nGestClin != null || nGestHotel != null || totalNights > 0
  const nuitsFromTotal = hasNuitsSaisies && totalNights >= 0 ? totalNights : NaN

  const dureeFromDevis = sej.dureeSejourTotale.trim() !== '' ? Number(sej.dureeSejourTotale) : NaN
  const dureeFromRapport = rap?.dureeSejourTunisie != null && rap.dureeSejourTunisie > 0 ? rap.dureeSejourTunisie : NaN
  const dureeNuits = Number.isFinite(nuitsFromTotal)
    ? nuitsFromTotal
    : Number.isFinite(dureeFromDevis) && dureeFromDevis > 0
      ? dureeFromDevis
      : Number.isFinite(dureeFromRapport)
        ? dureeFromRapport
        : NaN

  const dureeTotale =
    Number.isFinite(dureeNuits) && dureeNuits > 0
      ? formatNightsAndDays(dureeNuits)
      : '—'
  const sejourLine =
    Number.isFinite(dureeNuits) && dureeNuits > 0
      ? `Séjour ${dureeNuits} nuit${dureeNuits > 1 ? 's' : ''}`
      : ''

  const formPayload = (ctx.formulaires?.[0]?.payload ?? {}) as Record<string, unknown>
  const fromRapport = devisSejourDefaultsFromRapport(rap, formPayload)
  const accompagnantsAdultes = sej.nbAdultes.trim() !== '' ? sej.nbAdultes.trim() : fromRapport.nbAdultes
  const nbAdultes = nbAdultesDevisFromAccompagnants(accompagnantsAdultes)
  const nbEnfants = sej.nbEnfants.trim() !== '' ? sej.nbEnfants.trim() : fromRapport.nbEnfants
  const typeChambre = typeChambreFromNbAdultesDevis(nbAdultes)

  return {
    dureeHosp,
    cliniqueRetenue,
    postHospLabel,
    hotelSejour,
    dureeTotale,
    sejourLine,
    nbAdultes,
    nbEnfants,
    typeChambre,
  }
}

const SEJOUR_CONV_START = '<!-- DEVIS_SEJOUR_CONV -->'
const SEJOUR_CONV_END = '<!-- /DEVIS_SEJOUR_CONV -->'
const EXAMENS_START = '<!-- DEVIS_EXAMENS -->'
const EXAMENS_END = '<!-- /DEVIS_EXAMENS -->'

type SejourPdfValues = ReturnType<typeof sejourPdfFromContext>

export function buildSejourConvalescenceHtml(sv: SejourPdfValues): string {
  return `${SEJOUR_CONV_START}
${devisSectionHeading('Détails de votre séjour de convalescence :')}
${devisFieldRow('Durée de séjour post hospitalisation en Tunisie :', sv.postHospLabel)}
${devisFieldRow('Hôtel de séjour sélectionné :', sv.hotelSejour)}
${devisFieldRow("Nombre d'adultes :", sv.nbAdultes)}
${devisFieldRow('Nbr Enfants (2 – 12 ans) :', sv.nbEnfants)}
${devisFieldRow('Type de chambre :', sv.typeChambre)}
${devisFieldRow('Arrangement :', "Pension Complète (la pension n'inclut pas les dépenses personnelles tel que téléphone, boissons, les soins de beauté, les excursions…)")}
${SEJOUR_CONV_END}`
}

function refreshConvalescenceInTopHtml(html: string, ctx: DevisLetterContext): string {
  const sv = sejourPdfFromContext(ctx)
  const fresh = buildSejourConvalescenceHtml(sv)
  const blockRe = new RegExp(`${SEJOUR_CONV_START}[\\s\\S]*?${SEJOUR_CONV_END}`)
  let out = blockRe.test(html) ? html.replace(blockRe, fresh) : html
  out = out.replace(/<p>[^<]*Nbr Bébés[^<]*<\/p>\s*/gi, '')
  if (!blockRe.test(html) && sv.hotelSejour !== '—') {
    out = out.replace(
      /(Hôtel de séjour sélectionné\s*:\s*<\/span>\s*<span[^>]*>)([^<]*)(<\/span>)/i,
      `$1${sv.hotelSejour}$3`,
    )
  }
  return out
}

function normalizeFieldLabel(s: string): string {
  return s.replace(/\s+/g, ' ').trim().replace(/[\u2018\u2019`´]/g, "'")
}

function fieldValueFromParagraph(p: Element, label: string): string {
  const target = normalizeFieldLabel(label)
  const full = normalizeFieldLabel(p.textContent ?? '')
  if (!full.startsWith(target)) return ''
  return full.slice(target.length).trim()
}

function removeNodesAfter(node: ChildNode): void {
  while (node.nextSibling) node.nextSibling.remove()
}

function appendFieldValueSpan(p: Element, value: string): void {
  const doc = p.ownerDocument
  if (!doc) return
  p.appendChild(doc.createTextNode(' '))
  const span = doc.createElement('span')
  span.setAttribute('style', `color:${DEVIS_CHARTE.charcoal}`)
  span.textContent = value
  p.appendChild(span)
}

/** Met à jour uniquement la valeur — conserve couleurs / surlignages du libellé. */
function updateFieldParagraphValue(p: Element, value: string): boolean {
  const labelEl = p.querySelector('.devis-field-label')
  if (labelEl) {
    removeNodesAfter(labelEl)
    appendFieldValueSpan(p, value)
    return true
  }
  const children = Array.from(p.childNodes)
  let labelEndIdx = -1
  for (let i = 0; i < children.length; i++) {
    if ((children[i].textContent ?? '').includes(':')) {
      labelEndIdx = i
      break
    }
  }
  if (labelEndIdx < 0) return false
  while (p.childNodes.length > labelEndIdx + 1) {
    p.lastChild?.remove()
  }
  appendFieldValueSpan(p, value)
  return true
}

function refreshDevisFieldByLabel(html: string, label: string, value: string): string {
  if (value == null) return html
  const target = normalizeFieldLabel(label)
  if (typeof window === 'undefined') return html
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__root')
  if (!root) return html
  for (const p of Array.from(root.querySelectorAll('p'))) {
    if (!normalizeFieldLabel(p.textContent ?? '').startsWith(target)) continue
    const current = fieldValueFromParagraph(p, label)
    if (normalizeFieldLabel(current) === normalizeFieldLabel(value)) return html
    if (updateFieldParagraphValue(p, value)) return root.innerHTML
    break
  }
  return html
}

const DUREE_TOTALE_SEJOUR_LABEL = 'Durée TOTALE du séjour :'

/** Ligne « Durée TOTALE du séjour » — texte jaune + fluo gris foncé (identique badge séjour). */
function paraDureeTotaleSejourFluo(dureeTotale: string): string {
  return `<p>${offerDureeTotaleFluoHtml(`${DUREE_TOTALE_SEJOUR_LABEL} ${dureeTotale}`)}</p>`
}

function refreshHighlightByLabel(html: string, label: string, value: string): string {
  if (value == null) return html
  const fresh =
    label === DUREE_TOTALE_SEJOUR_LABEL
      ? `${paraDureeTotaleSejourFluo(value)}\n<p></p>`
      : `${paraSalmonHi(`${label} ${value}`)}\n<p></p>`
  // Uniquement via DOM : un seul <p> (jamais de regex multi-paragraphes —
  // sinon on écrase tout le début de la lettre jusqu’à « Durée TOTALE »).
  if (typeof window === 'undefined') {
    // Fallback Node / SSR : paragraphe isolé seulement
    const re =
      /<p\b[^>]*>(?:(?!<\/p>)[\s\S])*Durée\s+TOTALE\s+du\s+séjour\s*:(?:(?!<\/p>)[\s\S])*<\/p>(?:\s*<p(?:\s[^>]*)?>\s*<\/p>)?/i
    return re.test(html) ? html.replace(re, fresh) : html
  }

  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__root')
  if (!root) return html
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
  const target = normalize(label)

  for (const p of Array.from(root.querySelectorAll('p'))) {
    if (!normalize(p.textContent ?? '').startsWith(target)) continue
    const next = p.nextElementSibling
    if (next?.tagName === 'P' && normalize(next.textContent ?? '') === '') {
      next.remove()
    }
    const tmp = doc.createElement('div')
    tmp.innerHTML = fresh
    const frag = doc.createDocumentFragment()
    while (tmp.firstChild) frag.appendChild(tmp.firstChild)
    p.replaceWith(frag)
    return root.innerHTML
  }
  return html
}

/** Met à jour la ligne « Durée TOTALE du séjour » (nuits + jours). */
export function syncDureeTotaleSejourInHtml(html: string, dureeTotale: string): string {
  let out = refreshHighlightByLabel(html, DUREE_TOTALE_SEJOUR_LABEL, dureeTotale)
  if (/Durée\s+TOTALE\s+du\s+s[ée]jour/i.test(out)) {
    return out.replace(
      /<mark\b([^>]*)\boffer-fluo-sejour\b([^>]*)>([\s\S]*?Durée\s+TOTALE\s+du\s+s[ée]jour[\s\S]*?)<\/mark>/gi,
      (_full, _a, _b, inner: string) => {
        const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        return offerDureeTotaleFluoHtml(text)
      },
    )
  }
  // Répare badge tableau « Séjour X nuits Chambre… » injecté par erreur avant « Détails de l'intervention »
  const detailsHeadingRe =
    /(<p\b[^>]*class="[^"]*\bdevis-heading\b[^"]*"[^>]*>[\s\S]*?D[ée]tails de l['']intervention[\s\S]*?<\/p>)/i
  const wrongLineRe =
    /<p\b[^>]*>\s*<mark\b[^>]*\boffer-fluo-sejour\b[^>]*>[\s\S]*?<\/mark>\s*<\/p>\s*(?=<p\b[^>]*class="[^"]*\bdevis-heading\b)/i
  if (wrongLineRe.test(out)) {
    out = out.replace(wrongLineRe, `${paraDureeTotaleSejourFluo(dureeTotale)}\n`)
    return out
  }
  const m = out.match(detailsHeadingRe)
  if (m && m.index != null && !/Durée\s+TOTALE\s+du\s+s[ée]jour/i.test(out.slice(0, m.index))) {
    out = `${out.slice(0, m.index)}${paraDureeTotaleSejourFluo(dureeTotale)}\n${out.slice(m.index)}`
  }
  return out
}

/** Met à jour le badge séjour dans le HTML (lettre ou cellule offre éditeur). */
export function syncOfferSejourInHtml(html: string, sejourLine: string, typeChambre = ''): string {
  const badgeLine = buildOfferSejourBadgeLine(sejourLine, typeChambre)
  if (!html?.trim() || !badgeLine.trim()) return html
  const badgeHtml = offerSejourFluoHtml(badgeLine)
  let out = html.replace(
    /<mark\b[^>]*\boffer-fluo-sejour\b[^>]*>[\s\S]*?<\/mark>/gi,
    (mark) => (/Durée\s+TOTALE\s+du\s+s[ée]jour/i.test(mark) ? mark : badgeHtml),
  )
  out = out.replace(
    /(<div class="sejour-badge">)[\s\S]*?(<\/div>)/gi,
    `$1${badgeHtml}$2`,
  )
  if (out === html) {
    out = html.replace(
      /S[ée]jour\s+\d+\s+nuits?(?:\s+Chambre\s+[A-Za-zÀ-ÿ]+)?/gi,
      badgeLine,
    )
  }
  return out
}

function normalizeSejourJoursToNuits(html: string): string {
  let out = html
  out = out.replace(
    /(Durée\s+TOTALE\s+du\s+séjour\s*:\s*<\/(?:strong|span)>\s*<span[^>]*>)\s*(\d+)\s+jours?\s*(<\/span>)/gi,
    (_, a: string, n: string, c: string) => `${a}${n} nuit${Number(n) > 1 ? 's' : ''}${c}`,
  )
  out = out.replace(
    /(Durée\s+TOTALE\s+du\s+séjour\s*:\s*)(\d+)\s+jours?\b/gi,
    (_, a: string, n: string) => `${a}${n} nuit${Number(n) > 1 ? 's' : ''}`,
  )
  return out
}

/** Phrases saumon + surlignage gris (bloc examens médicaux). */
function paraExamensSalmonHi(text: string): string {
  return paraSalmonHi(text).replace(/^<p>/, '<p class="devis-examen-salmon-hi">')
}

export function buildExamensMedicauxHtml(ctx: DevisLetterContext): string {
  const examens = pickRapport(ctx)?.examensDemandes ?? []
  const hasBilan = examens.some((e) => e.toLowerCase().includes('bilan sanguin'))
  const otherExamens = examens.filter((e) => !e.toLowerCase().includes('bilan sanguin'))
  const ink = DEVIS_CHARTE.charcoal
  const examTitle = (label: string) =>
    `<span class="devis-examen-item" style="color:${ink}">${label}</span>`
  const examSubItem = (label: string) =>
    `<li class="devis-examen-item"><span style="color:${ink}">${label}</span></li>`

  let body = paraExamensSalmonHi(
    "Les examens doivent avoir une validité maximum de 3 mois — À envoyer à J-10 de la date d'intervention",
  )
  const examItems: string[] = []
  if (hasBilan) {
    examItems.push(
      `${examTitle('Bilan sanguin préopératoire complet')} — à effectuer avant la date d'intervention, afin de s'assurer de la faisabilité de l'intervention, qui comprend :
<ul style="padding-left:22px;list-style-type:disc">
${examSubItem('Bilan biologique (groupe sanguin, NFS, plaquettes, TP, TCA, CRP)')}
${examSubItem('Bilan virologique HIV, Hépatite B et C.')}
${examSubItem('URÉE CRÉÂT GLYCÉMIE. IONO ASAT ALAT')}
</ul>`,
    )
  }
  for (const e of otherExamens) {
    const label = e.trim()
    if (!label) continue
    examItems.push(examTitle(label))
  }
  if (examItems.length === 0) {
    examItems.push(examTitle('À compléter par le médecin'))
  }
  body += `<ol class="devis-examens-list" style="padding-left:22px;list-style-type:decimal">
${examItems.map((item) => `<li class="devis-examen-item" style="color:${ink}">${item}</li>`).join('\n')}
</ol>`
  body += paraExamensSalmonHi(
    "Prévoir une copie papier des rapports médicaux pour la constitution de votre dossier médical à l'entrée de la clinique.",
  )

  return `${EXAMENS_START}
${devisSectionHeading('Examens médicaux nécessaires avant votre arrivée en Tunisie : (Validité Maximum 3 mois)')}
${body}
${EXAMENS_END}`
}

const EXAMEN_PHRASE_1 =
  "Les examens doivent avoir une validité maximum de 3 mois — À envoyer à J-10 de la date d'intervention"
const EXAMEN_PHRASE_2 =
  "Prévoir une copie papier des rapports médicaux pour la constitution de votre dossier médical à l'entrée de la clinique."

const EXAMEN_SALMON_PHRASES = [EXAMEN_PHRASE_1, EXAMEN_PHRASE_2] as const

function paragraphMatchesExamenSalmonPhrase(text: string, phrase: string): boolean {
  const norm = text.replace(/\s+/g, ' ').trim()
  const target = phrase.replace(/\s+/g, ' ').trim()
  return norm === target || norm.includes(target)
}

/** Rétablit le fluo saumon/gris des 2 phrases du bloc examens (HTML éditeur ou sauvegardé). */
export function refreshExamensSalmonPhrasesInTopHtml(html: string): string {
  if (!html?.trim()) return html

  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html')
    const root = doc.getElementById('__root')
    if (!root) return html
    for (const p of Array.from(root.querySelectorAll('p'))) {
      const text = (p.textContent ?? '').replace(/\s+/g, ' ').trim()
      for (const phrase of EXAMEN_SALMON_PHRASES) {
        if (!paragraphMatchesExamenSalmonPhrase(text, phrase)) continue
        if (
          p.classList.contains('devis-examen-salmon-hi')
          && p.querySelector('mark span[style*="color"]')
        ) {
          break
        }
        const wrapper = doc.createElement('div')
        wrapper.innerHTML = paraExamensSalmonHi(phrase)
        const fresh = wrapper.firstElementChild
        if (fresh) p.replaceWith(fresh)
        break
      }
    }
    return root.innerHTML
  }

  let out = html
  for (const phrase of EXAMEN_SALMON_PHRASES) {
    const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(
      new RegExp(`<p\\b[^>]*>(?:(?!</p>)[\\s\\S])*?${esc}(?:(?!</p>)[\\s\\S])*?</p>`, 'gi'),
      paraExamensSalmonHi(phrase),
    )
  }
  return out
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Zone HTML « Examens… » → juste avant « Offre de prix ». */
function sliceExamensRegion(html: string): string {
  const m = html.match(
    /Examens médicaux nécessaires[\s\S]*?(?=<p\b[^>]*>[\s\S]*?Offre de prix\s*:)/i,
  )
  if (m) return m[0]
  const marked = html.match(new RegExp(`${EXAMENS_START}[\\s\\S]*?${EXAMENS_END}`, 'i'))
  return marked?.[0] ?? ''
}

/** Extrait tous les libellés d’examens (dédupliqués) depuis le HTML sauvegardé. */
function extractExamensLabelsFromHtml(html: string): string[] {
  const labels: string[] = []
  const push = (raw: string) => {
    const t = stripTags(raw)
      .replace(/^[\d]+[.)]\s*/, '')
      .replace(/\s*—[\s\S]*$/, '')
      .trim()
    if (!t) return
    if (/validité maximum de 3 mois/i.test(t)) return
    if (/copie papier des rapports/i.test(t)) return
    if (/examens médicaux nécessaires/i.test(t)) return
    if (/à compléter/i.test(t)) return
    if (/offre de prix/i.test(t)) return
    if (t.length < 3 || t.length > 180) return
    if (!labels.some((x) => x.toLowerCase() === t.toLowerCase())) labels.push(t)
  }

  const region = sliceExamensRegion(html) || html

  // Toutes les listes numérotées de la zone (évite de ne lire que le 1er <ol> dupliqué)
  for (const ol of region.matchAll(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi)) {
    for (const m of ol[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
      const head = m[1].split(/<ul\b/i)[0] ?? m[1]
      push(head)
    }
  }

  if (labels.length === 0) {
    for (const m of region.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
      push(m[1])
    }
    for (const m of region.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
      push(m[1].split(/<ul\b/i)[0] ?? m[1])
    }
  }

  return labels
}

const PREVENTIF_HEADING_RE = /traitement préventif,\s*prenez 2 semaines avant/i

/** Insère le bloc examens juste après la liste du traitement préventif. */
function insertExamensAfterPreventiveBlock(html: string, fresh: string): string | null {
  const idx = html.search(PREVENTIF_HEADING_RE)
  if (idx < 0) return null
  const tail = html.slice(idx)
  const ulMatch = tail.match(/<ul\b[^>]*>[\s\S]*?<\/ul>/i)
  if (!ulMatch || ulMatch.index == null) return null
  const insertPos = idx + ulMatch.index + ulMatch[0].length
  const head = stripTrailingEmptyParagraphs(html.slice(0, insertPos))
  return `${head}\n${fresh}\n${html.slice(insertPos)}`
}

/**
 * Supprime TOUTES les copies du bloc examens, puis insère un seul bloc frais.
 * Approche par index (fiable avec le HTML TipTap).
 */
function replaceExamensSection(html: string, fresh: string): string {
  let out = html.replace(new RegExp(`${EXAMENS_START}[\\s\\S]*?${EXAMENS_END}\\s*`, 'gi'), '')

  // Tant qu’il reste un titre examens avant « Offre de prix », on coupe ce segment
  for (let guard = 0; guard < 8; guard++) {
    const examensIdx = out.search(/Examens médicaux nécessaires/i)
    const offreIdx = out.search(/Offre de prix\s*:/i)
    if (examensIdx < 0) break
    if (offreIdx > examensIdx) {
      const headStart = out.lastIndexOf('<p', examensIdx)
      const offrePStart = out.lastIndexOf('<p', offreIdx)
      if (headStart < 0 || offrePStart <= headStart) break
      out = `${out.slice(0, headStart).replace(/\s+$/, '\n')}${out.slice(offrePStart)}`
      continue
    }
    // Titre examens sans offre ensuite : tronquer jusqu’à la fin
    const headStart = out.lastIndexOf('<p', examensIdx)
    if (headStart >= 0) out = out.slice(0, headStart).replace(/\s+$/, '\n')
    break
  }

  // Listes / phrases orphelines éventuelles juste avant l’offre
  const offreIdx = out.search(/Offre de prix\s*:/i)
  if (offreIdx > 0) {
    const offrePStart = out.lastIndexOf('<p', offreIdx)
    if (offrePStart > 0) {
      let before = out.slice(0, offrePStart)
      const after = out.slice(offrePStart)
      before = before.replace(/(?:<ol\b[^>]*>[\s\S]*?<\/ol>\s*)+$/i, '')
      before = before.replace(
        new RegExp(
          `<p\\b[^>]*>[\\s\\S]*?${EXAMEN_PHRASE_2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?<\\/p>\\s*$`,
          'i',
        ),
        '',
      )
      before = before.replace(
        new RegExp(
          `<p\\b[^>]*>[\\s\\S]*?${EXAMEN_PHRASE_1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?<\\/p>\\s*$`,
          'i',
        ),
        '',
      )
      out = `${before.replace(/\s+$/, '\n')}${after}`
    }
  }

  const offreTextIdx = out.search(/Offre de prix\s*:/i)
  if (offreTextIdx >= 0) {
    const offrePStart = out.lastIndexOf('<p', offreTextIdx)
    if (offrePStart >= 0) {
      const head = stripTrailingEmptyParagraphs(out.slice(0, offrePStart))
      return `${head}${fresh}\n${out.slice(offrePStart)}`
    }
  }
  const inclutIdx = out.search(/Votre devis inclut\s*:/i)
  if (inclutIdx >= 0) {
    const inclutPStart = out.lastIndexOf('<p', inclutIdx)
    if (inclutPStart >= 0) {
      const head = stripTrailingEmptyParagraphs(out.slice(0, inclutPStart))
      return `${head}${fresh}\n${out.slice(inclutPStart)}`
    }
  }
  const afterPreventive = insertExamensAfterPreventiveBlock(out, fresh)
  if (afterPreventive) return afterPreventive
  return `${stripTrailingEmptyParagraphs(out)}\n${fresh}`
}

/** Paragraphe TipTap vide (`<p></p>`, `<p><br></p>`, `&nbsp;`) — sauf espacements manuels. */
const EMPTY_P_RE = String.raw`<p\b(?![^>]*\bdevis-spacer\b)[^>]*>\s*(?:(?:<br\b[^>]*/?>|&nbsp;|\u00a0|\s)*)\s*</p>`
const SECTION_HR_RE = String.raw`<div\b[^>]*\bsection-hr\b[^>]*>\s*</div>`

/** Même espace autour de chaque titre de section (pas de lignes vides en trop). */
function normalizeHeadingRhythmInHtml(html: string): string {
  const headingOpen = String.raw`<p\b[^>]*class="[^"]*devis-heading[^"]*"[^>]*>[\s\S]*?</p>`
  let out = html.replace(
    new RegExp(`(${headingOpen})\\s*(?:${EMPTY_P_RE}\\s*)+`, 'gi'),
    '$1\n',
  )
  out = out.replace(
    new RegExp(`(?:${EMPTY_P_RE}\\s*)+(?=${headingOpen})`, 'gi'),
    '',
  )
  return out
}

/** Plus de ligne vide forcée ni tight-top : même rythme que les autres titres. */
function normalizeGapBeforeDetailsIntervention(html: string): string {
  if (!/Durée\s+TOTALE/i.test(html) || !/Détails de l['’]intervention/i.test(html)) return html
  let out = html.replace(
    new RegExp(
      String.raw`(<p\b[^>]*>[\s\S]*?Durée\s+TOTALE\s+du\s+séjour\s*:[\s\S]*?</p>)\s*(?:(?:${EMPTY_P_RE})|(?:${SECTION_HR_RE})|\s*)+(?=<p\b[^>]*class="[^"]*devis-heading)`,
      'gi',
    ),
    '$1\n',
  )
  out = out.replace(/\sdevis-heading-tight-top\b/g, '')
  return out
}

const TRAILING_EMPTY_P_RE = String.raw`<p\b[^>]*>\s*(?:(?:<br\b[^>]*/?>|&nbsp;|\u00a0|\s)*)\s*</p>`

function stripTrailingEmptyParagraphs(html: string): string {
  return html.replace(new RegExp(`(?:\\s*${TRAILING_EMPTY_P_RE})+$`, 'gi'), '\n')
}

/** Réduit les trous verticaux autour des titres de section. */
function collapseExcessEmptyParagraphs(html: string): string {
  let out = html.replace(new RegExp(`(?:${EMPTY_P_RE}\\s*){7,}`, 'gi'), '<p></p>\n<p></p>\n<p></p>\n<p></p>\n<p></p>\n<p></p>\n')
  out = normalizeHeadingRhythmInHtml(out)
  return out
}

function refreshExamensInTopHtml(html: string, ctx: DevisLetterContext): string {
  const rap = pickRapport(ctx)
  const fromRapport = (rap?.examensDemandes ?? [])
    .map((e) => e.trim())
    .filter(Boolean)
  const fromHtml = extractExamensLabelsFromHtml(html)
  const examensLabels = fromRapport.length > 0 ? fromRapport : fromHtml

  const fresh = buildExamensMedicauxHtml({
    ...ctx,
    activeDevis: rap?.id
      ? { ...(pickDevis(ctx) ?? {}), rapportId: rap.id }
      : { rapportId: null, dateCreation: undefined, envoyeAt: undefined },
    rapports: [
      {
        ...(rap ?? { interventionsRecommandees: [], diagnostic: null }),
        examensDemandes: examensLabels,
      },
    ],
  })
  return replaceExamensSection(html, fresh)
}

function stripDureeInterventionLine(html: string): string {
  return html.replace(
    /<p>[^<]*(?:Durée\s+d['’]Intervention\s*:)[\s\S]*?<\/p>\s*/gi,
    '',
  )
}

function normalizeInclutExclutLabels(html: string): string {
  return html
    .replace(
      /<(?:strong|span)[^>]*>\s*Votre devis inclut\s*:\s*<\/(?:strong|span)>/gi,
      devisLabel('Votre devis inclut :'),
    )
    .replace(
      /<(?:strong|span)[^>]*>\s*Notre forfait exclut\s*:\s*<\/(?:strong|span)>/gi,
      devisLabel('Notre forfait exclut :'),
    )
}

export function devisRefTitleHtml(title: string): string {
  return buildDevisRefTitleHtml(title)
}

function titleParagraphHasCustomStyle(el: Element): boolean {
  if (el.getAttribute('style')?.match(/(?:^|;)\s*(?:color|font-size|background)\s*:/i)) return true
  if (el.querySelector('mark[style], mark[data-color]')) return true
  return Boolean(
    el.querySelector(
      'span[style*="color"], span[style*="font-size"], mark[style], strong[style*="color"], strong[style*="font-size"]',
    ),
  )
}

function refreshDevisTitleInTopHtml(html: string, title: string): string {
  const target = title.trim()
  if (!target) return html

  if (typeof window === 'undefined') {
    const styled = devisRefTitleHtml(target)
    let out = html
    out = out.replace(/<p[^>]*class="[^"]*devis-ref-title[^"]*"[^>]*>[\s\S]*?<\/p>/gi, styled)
    out = out.replace(
      /<p[^>]*(?:style="[^"]*text-align:\s*center[^"]*")[^>]*>\s*(?:<strong[^>]*>)?\s*(?:<span[^>]*>)?\s*Devis\s+MC-\d{2}-\d{3}[A-Z]?-\d{4}\s*(?:<\/span>)?\s*(?:<\/strong>)?\s*<\/p>/gi,
      styled,
    )
    out = out.replace(
      /<p[^>]*>\s*(?:<strong[^>]*>)?\s*(?:<span[^>]*>)?\s*Devis\s+MC-\d{2}-\d{3}[A-Z]?-\d{4}\s*(?:<\/span>)?\s*(?:<\/strong>)?\s*<\/p>/gi,
      styled,
    )
    if (!out.includes('devis-ref-title')) {
      const recapIdx = out.search(/Récapitulatif de votre demande/i)
      if (recapIdx >= 0) {
        const recapP = out.lastIndexOf('<p', recapIdx)
        if (recapP >= 0) {
          out = `${out.slice(0, recapP)}${styled}\n<p></p>\n${out.slice(recapP)}`
        }
      }
    }
    return out
  }

  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__root')
  if (!root) return html

  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
  const findTitleP = () =>
    (root.querySelector('p.devis-ref-title') as HTMLElement | null)
    ?? Array.from(root.querySelectorAll('p')).find((p) => /^Devis\b/i.test(normalize(p.textContent ?? '')))
    ?? null

  let el = findTitleP()
  if (!el) {
    const styled = devisRefTitleHtml(target)
    const recapIdx = html.search(/Récapitulatif de votre demande/i)
    if (recapIdx >= 0) {
      const recapP = html.lastIndexOf('<p', recapIdx)
      if (recapP >= 0) {
        return `${html.slice(0, recapP)}${styled}\n<p></p>\n${html.slice(recapP)}`
      }
    }
    return `${styled}\n<p></p>\n${html}`
  }

  if (!el.classList.contains('devis-ref-title')) {
    el.classList.add('devis-ref-title')
  }
  const hasSalmonTitleStyle = Boolean(
    el.querySelector('mark[data-color], mark[style*="background"]')
    && el.querySelector('u'),
  )
  const titleSpan = el.querySelector('span[style*="font-size"]')
  const hasCurrentTitleSize = Boolean(
    titleSpan?.getAttribute('style')?.includes(DEVIS_REF_TITLE_STYLE.fontSize),
  )
  if (normalize(el.textContent ?? '') === target && hasSalmonTitleStyle && hasCurrentTitleSize) return html

  if (titleParagraphHasCustomStyle(el)) {
    const inner = el.innerHTML
    const replaced = inner.replace(
      /Devis\s+MC-\d{2}-\d{3}[A-Z]?-\d{4}/i,
      target,
    )
    if (replaced !== inner) {
      el.innerHTML = replaced
      return root.innerHTML
    }
    if (normalize(el.textContent ?? '') === target) return html
  }

  const styled = devisRefTitleHtml(target)
  const tmp = doc.createElement('div')
  tmp.innerHTML = styled
  const freshP = tmp.firstElementChild
  if (freshP) el.replaceWith(freshP)
  return root.innerHTML
}

export function stripDiagnosticOpTitlesInTopHtml(html: string): string {
  if (!/diagnostic du chirurgien/i.test(html)) return html

  if (typeof window === 'undefined') {
    const re =
      /((?:<p\b[^>]*>)(?:(?!<\/p>)[\s\S])*Diagnostic du chirurgien(?:(?!<\/p>)[\s\S])*<\/p>)([\s\S]*?)(?=<p\b[^>]*>(?:(?!<\/p>)[\s\S])*Durée\s+TOTALE\s+du\s+séjour)/i
    if (!re.test(html)) return html
    return html.replace(re, (_full, head, body) => `${head}${stripDiagnosticOpTitlesFromHtml(body)}`)
  }

  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__root')
  if (!root) return html
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
  const heading = Array.from(root.querySelectorAll('p')).find((p) =>
    /diagnostic du chirurgien/i.test(normalize(p.textContent ?? '')),
  )
  if (!heading) return html

  const toRemove: Element[] = []
  let node = heading.nextSibling
  while (node) {
    const el = node.nodeType === 1 ? (node as Element) : null
    const txt = normalize(el?.textContent ?? node.textContent ?? '')
    if (el && /durée\s+totale\s+du\s+séjour/i.test(txt)) break
    if (el && /détails de l['’]intervention/i.test(txt)) break
    if (el?.classList.contains('section-hr')) break
    if (el?.classList.contains('diagnostic-op-title') || el?.classList.contains('diag-visage-op-title')) {
      toRemove.push(el)
    } else if (el?.tagName === 'P') {
      const strong = el.querySelector(':scope > strong')
      const strongText = normalize(strong?.textContent ?? '')
      if (strong && /^\d+\s*[-–.]\s+/.test(strongText) && el.childElementCount === 1) {
        toRemove.push(el)
      }
    }
    node = node.nextSibling
  }
  for (const el of toRemove) el.remove()
  return root.innerHTML
}

function normalizeDiagnosticDarkFluoInTopHtml(html: string): string {
  if (!/diagnostic du chirurgien/i.test(html)) return normalizeDiagnosticDarkFluoInHtml(html)
  const re =
    /((?:<p\b[^>]*>)(?:(?!<\/p>)[\s\S])*Diagnostic du chirurgien(?:(?!<\/p>)[\s\S])*<\/p>)([\s\S]*?)(?=<p\b[^>]*>(?:(?!<\/p>)[\s\S])*Durée\s+TOTALE\s+du\s+séjour)/i
  if (!re.test(html)) return normalizeDiagnosticDarkFluoInHtml(html)
  return html.replace(re, (_full, head, body) =>
    `${head}${normalizeDiagnosticZoneLeadInHtml(
      normalizeDiagnosticBlockGapsInHtml(normalizeDiagnosticDarkFluoInHtml(body)),
    )}`,
  )
}

function normalizeDiagnosticBlockGapsInTopHtml(html: string): string {
  if (!/diagnostic du chirurgien/i.test(html)) {
    return normalizeDiagnosticBlockGapsInHtml(normalizeDiagnosticZoneLeadInHtml(html))
  }
  const re =
    /((?:<p\b[^>]*>)(?:(?!<\/p>)[\s\S])*Diagnostic du chirurgien(?:(?!<\/p>)[\s\S])*<\/p>)([\s\S]*?)(?=<p\b[^>]*>(?:(?!<\/p>)[\s\S])*Durée\s+TOTALE\s+du\s+séjour)/i
  if (!re.test(html)) {
    return normalizeDiagnosticBlockGapsInHtml(normalizeDiagnosticZoneLeadInHtml(html))
  }
  return html.replace(re, (_full, head, body) =>
    `${head}${normalizeDiagnosticBlockGapsInHtml(normalizeDiagnosticZoneLeadInHtml(body))}`,
  )
}

/**
 * Recolle le diagnostic du rapport de CE devis (ou « — » s’il n’y en avait pas encore).
 */
function refreshDiagnosticInTopHtml(
  html: string,
  diagnostic: string | null | undefined,
  interventionLabels: string[] = [],
): string {
  const fresh = formatDiagnosticLetterHtml(diagnostic ?? '', interventionLabels)

  if (typeof window === 'undefined') {
    const re =
      /((?:<p\b[^>]*>)(?:(?!<\/p>)[\s\S])*Diagnostic du chirurgien(?:(?!<\/p>)[\s\S])*<\/p>)([\s\S]*?)(?=<p\b[^>]*>(?:(?!<\/p>)[\s\S])*Durée\s+TOTALE\s+du\s+séjour)/i
    if (!re.test(html)) return html
    return html.replace(re, `$1\n${fresh}\n<p></p>\n`)
  }

  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__root')
  if (!root) return html
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
  const heading = Array.from(root.querySelectorAll('p')).find((p) =>
    /diagnostic du chirurgien/i.test(normalize(p.textContent ?? '')),
  )
  if (!heading) return html

  let node = heading.nextSibling
  while (node) {
    const next = node.nextSibling
    const el = node.nodeType === 1 ? (node as Element) : null
    const txt = normalize(el?.textContent ?? node.textContent ?? '')
    if (el && /durée\s+totale\s+du\s+séjour/i.test(txt)) break
    if (el && /détails de l['’]intervention/i.test(txt)) break
    if (el?.classList.contains('section-hr')) break
    node.remove()
    node = next
  }

  const tmp = doc.createElement('div')
  tmp.innerHTML = `${fresh}\n<p></p>`
  const frag = doc.createDocumentFragment()
  while (tmp.firstChild) frag.appendChild(tmp.firstChild)
  heading.after(frag)
  return root.innerHTML
}

/** True si la lettre contient déjà un corps de diagnostic (hors simple titre). */
export function hasDiagnosticBodyInTopHtml(html: string): boolean {
  if (!/diagnostic du chirurgien/i.test(html)) return false

  if (typeof window === 'undefined') {
    const re =
      /diagnostic du chirurgien[\s\S]*?<\/p>\s*([\s\S]*?)(?=<p\b[^>]*>[\s\S]*?(?:Durée\s+TOTALE|Détails de l['’]intervention))/i
    const body = (re.exec(html)?.[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').trim()
    return body.length > 0 && body !== '—'
  }

  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__root')
  if (!root) return false

  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
  const heading = Array.from(root.querySelectorAll('p')).find((p) =>
    /diagnostic du chirurgien/i.test(normalize(p.textContent ?? '')),
  )
  if (!heading) return false

  let node = heading.nextSibling
  while (node) {
    const el = node.nodeType === 1 ? (node as Element) : null
    const txt = normalize(el?.textContent ?? node.textContent ?? '')
    if (el && /durée\s+totale\s+du\s+séjour/i.test(txt)) break
    if (el && /détails de l['’]intervention/i.test(txt)) break
    if (el?.classList.contains('section-hr')) break
    if (txt && txt !== '—') return true
    node = node.nextSibling
  }
  return false
}

/** Détecte une couleur bronze (hex ou rgb TipTap). */
const DEVIS_BRONZE_COLOR_RE = /#81572d|rgb\(\s*129\s*,\s*87\s*,\s*45\s*\)/i

function isDevisFieldLabelText(text: string): boolean {
  return /:\s*$/.test(text.replace(/\s+/g, ' ').trim())
}

function paragraphIsSalmonHeadingOnly(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim()
  return isDevisFieldLabelText(t) && /^[^:]+:\s*$/.test(t)
}

function paragraphLooksLikeFieldRow(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim()
  if (paragraphIsSalmonHeadingOnly(t)) return true
  return /^[^:]+:\s/.test(t) && t.length < 600
}

function elementHasBronzeLabelColor(el: Element): boolean {
  const style = el.getAttribute('style') ?? ''
  return DEVIS_BRONZE_COLOR_RE.test(style) || el.classList.contains('devis-field-label--bronze')
}

/** Libellé recoloré / surligné manuellement dans l’éditeur — ne pas écraser par la charte saumon. */
function elementHasUserCustomLabelStyle(el: Element): boolean {
  if (el.querySelector('mark')) return true
  const style = el.getAttribute('style') ?? ''
  if (!/color\s*:/i.test(style)) return false
  if (elementHasBronzeLabelColor(el)) return false
  if (style.includes(DEVIS_REF_TITLE_STYLE.color)) return false
  return true
}

function replaceWithSalmonLabel(doc: Document, el: Element, label: string): void {
  const span = doc.createElement('span')
  span.className = 'devis-field-label devis-field-label--salmon'
  span.setAttribute('style', devisSalmonLabelStyleAttr())
  span.textContent = label.replace(/\s+/g, ' ').trim()
  const parent = el.parentElement
  if (el.tagName === 'SPAN' && parent?.tagName === 'STRONG' && parent.childNodes.length === 1) {
    parent.replaceWith(span)
  } else {
    el.replaceWith(span)
  }
}

function upgradeParagraphFieldLabel(p: Element, doc: Document): void {
  if (p.classList.contains('devis-heading') || p.classList.contains('devis-ref-title')) return
  const normalized = (p.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (!paragraphLooksLikeFieldRow(normalized)) return
  if (paragraphIsSalmonHeadingOnly(normalized)) {
    p.classList.remove('devis-field-row')
    p.classList.add('devis-salmon-heading')
  } else {
    p.classList.add('devis-field-row')
    p.classList.remove('devis-salmon-heading')
  }

  const directStrong = p.querySelector(':scope > strong')
  if (directStrong && isDevisFieldLabelText(directStrong.textContent ?? '')) {
    if (elementHasUserCustomLabelStyle(directStrong)) return
    const style = directStrong.getAttribute('style') ?? ''
    const alreadySalmon = style.includes(DEVIS_REF_TITLE_STYLE.color)
      || directStrong.classList.contains('devis-field-label--salmon')
    if (!directStrong.querySelector('mark') && !alreadySalmon) {
      if (elementHasBronzeLabelColor(directStrong) || !/color\s*:/i.test(style)) {
        replaceWithSalmonLabel(doc, directStrong, directStrong.textContent ?? '')
        return
      }
    }
  }

  for (const el of Array.from(p.querySelectorAll('span, strong'))) {
    const labelText = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!isDevisFieldLabelText(labelText)) continue
    if (elementHasUserCustomLabelStyle(el)) continue
    if (el.querySelector('mark')) continue
    if (el.classList.contains('devis-field-label')) {
      const style = el.getAttribute('style') ?? ''
      const needsStyleBump = !style.includes(DEVIS_FIELD_LABEL_STYLE.fontSize)
        || !style.includes(DEVIS_REF_TITLE_STYLE.color)
        || !/font-weight:\s*700/i.test(style)
        || elementHasBronzeLabelColor(el)
        || !/!important/.test(style)
      if (needsStyleBump) {
        el.className = 'devis-field-label devis-field-label--salmon'
        el.setAttribute('style', devisSalmonLabelStyleAttr())
      }
      return
    }
    if (elementHasBronzeLabelColor(el)) {
      replaceWithSalmonLabel(doc, el, labelText)
      return
    }
    const innerSpan = el.tagName === 'STRONG' ? el.querySelector('span[style*="color"]') : null
    if (innerSpan && elementHasBronzeLabelColor(innerSpan)) {
      replaceWithSalmonLabel(doc, innerSpan, labelText)
      return
    }
  }
}

function refreshSalmonFieldLabelsDom(html: string): string {
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__root')
  if (!root) return html
  for (const p of Array.from(root.querySelectorAll('p'))) {
    upgradeParagraphFieldLabel(p, doc)
  }
  compactSpacingBeforeSalmonHeadingsDom(root)
  return root.innerHTML
}

function refreshSalmonFieldLabelsSsr(html: string): string {
  const bronzeHex = DEVIS_CHARTE.bronze.replace('#', '\\#')
  const salmonStyle = devisSalmonLabelStyleAttr()
  let out = html.replace(/devis-field-label--bronze/g, 'devis-field-label--salmon')
  out = out.replace(
    new RegExp(`(<span[^>]*style="[^"]*color:\\s*)${bronzeHex}([^"]*"[^>]*>)([^<]+:)(<\\/span>)`, 'gi'),
    `$1${DEVIS_REF_TITLE_STYLE.color}$2$3$4`,
  )
  out = out.replace(
    /<span([^>]*style="[^"]*color:\s*rgb\(\s*129\s*,\s*87\s*,\s*45\s*\)[^"]*"[^>]*)>([^<]+:)<\/span>/gi,
    `<span class="devis-field-label devis-field-label--salmon" style="${salmonStyle}">$2</span>`,
  )
  out = out.replace(
    new RegExp(`<strong([^>]*style="[^"]*color:\\s*${bronzeHex}[^"]*"[^>]*)>([^<]+:)<\\/strong>`, 'gi'),
    `<span class="devis-field-label devis-field-label--salmon" style="${salmonStyle}">$2</span>`,
  )
  out = out.replace(
    /<strong([^>]*style="[^"]*color:\s*rgb\(\s*129\s*,\s*87\s*,\s*45\s*\)[^"]*"[^>]*)>([^<]+:)<\/strong>/gi,
    `<span class="devis-field-label devis-field-label--salmon" style="${salmonStyle}">$2</span>`,
  )
  out = out.replace(
    /<p(?![^>]*class="[^"]*(?:devis-field-row|devis-salmon-heading))([^>]*)>\s*(<span class="devis-field-label[^>]*>[\s\S]*?<\/span>)\s*<\/p>/gi,
    '<p class="devis-salmon-heading"$1>$2</p>',
  )
  out = out.replace(
    /(<span class="devis-field-label[^"]*"[^>]*style="[^"]*)font-weight:\s*600/gi,
    '$1font-weight:700',
  )
  out = out.replace(
    /(<span class="devis-field-label[^"]*"[^>]*style="[^"]*)font-size:\s*14px/gi,
    `$1font-size:${DEVIS_FIELD_LABEL_STYLE.fontSize}`,
  )
  return out
}

function isEmptyParagraphEl(el: Element): boolean {
  if (el.tagName !== 'P') return false
  if (el.classList.contains('devis-spacer') || el.classList.contains('diag-block-gap')) return true
  const text = (el.textContent ?? '').replace(/\u00a0/g, ' ').trim()
  return text === '' && !el.querySelector('img')
}

function nextMeaningfulElement(el: Element | null): Element | null {
  let node = el?.nextElementSibling ?? null
  while (node) {
    if (isEmptyParagraphEl(node)) {
      node = node.nextElementSibling
      continue
    }
    return node
  }
  return null
}

function compactSpacingBeforeSalmonHeadingsDom(root: ParentNode): void {
  for (const list of Array.from(root.querySelectorAll('ul, ol'))) {
    const next = nextMeaningfulElement(list)
    if (!next?.classList.contains('devis-salmon-heading')) continue
    let cursor = list.nextElementSibling
    while (cursor && cursor !== next) {
      const remove = cursor
      cursor = cursor.nextElementSibling
      if (isEmptyParagraphEl(remove)) remove.remove()
    }
  }
  for (const heading of Array.from(root.querySelectorAll('p.devis-salmon-heading'))) {
    let prev = heading.previousElementSibling
    while (prev && isEmptyParagraphEl(prev)) {
      const remove = prev
      prev = prev.previousElementSibling
      remove.remove()
    }
  }
}

/** Retire paragraphes vides / commentaires entre une liste et le sous-titre saumon suivant. */
function compactSpacingBeforeSalmonHeadings(html: string): string {
  const emptyP = String.raw`<p\b[^>]*>\s*(?:<br\s*\/?>|&nbsp;|\u00a0|\s)*<\/p>`
  let out = html.replace(
    new RegExp(`<\\/ul>\\s*(?:<!--[\\s\\S]*?-->\\s*)*(?:${emptyP}\\s*)*(?:<!--[\\s\\S]*?-->\\s*)*(?=<p\\b[^>]*\\bdevis-salmon-heading\\b)`, 'gi'),
    '</ul>\n',
  )
  out = out.replace(
    new RegExp(`<\\/ol>\\s*(?:<!--[\\s\\S]*?-->\\s*)*(?:${emptyP}\\s*)*(?:<!--[\\s\\S]*?-->\\s*)*(?=<p\\b[^>]*\\bdevis-salmon-heading\\b)`, 'gi'),
    '</ol>\n',
  )
  out = out.replace(new RegExp(`(?:\\s*${emptyP})+\\s*(?=<p\\b[^>]*\\bdevis-salmon-heading\\b)`, 'gi'), '')
  return out
}

/** Libellés saumon — classe + styles (HTML haut ou bas de lettre). */
export function refreshSalmonFieldLabelsInTopHtml(html: string): string {
  const refreshed = typeof window !== 'undefined'
    ? refreshSalmonFieldLabelsDom(html)
    : refreshSalmonFieldLabelsSsr(html)
  return compactSpacingBeforeSalmonHeadings(refreshed)
}

/** True si le titre de section a déjà une mise en page personnalisée (couleur, surlignage…). */
function headingHasUserCustomStyle(inner: string): boolean {
  if (/<mark\b/i.test(inner)) return true
  const gray = DEVIS_SECTION_HEADING_STYLE.color.toLowerCase()
  const bronze = DEVIS_CHARTE.bronze.toLowerCase()
  const colorMatches = inner.match(/color:\s*([^;"']+)/gi) ?? []
  for (const raw of colorMatches) {
    const val = raw.replace(/^color:\s*/i, '').trim().toLowerCase()
    if (!val) continue
    if (val.includes(gray) || val.includes('#555555') || val.includes('85, 85, 85')) continue
    if (val.includes(bronze) || val.includes('#81572d') || val.includes('129, 87, 45')) continue
    return true
  }
  return false
}

/** Bronze → gris uniquement (sans écraser une personnalisation existante). */
function migrateBronzeSectionHeadingsOnly(html: string): string {
  const bronze = DEVIS_CHARTE.bronze.replace('#', '\\#')
  const bronzeRe = new RegExp(
    `<p\\b([^>]*class="[^"]*devis-heading[^"]*"[^>]*)>\\s*<strong[^>]*(?:style="[^"]*color:\\s*${bronze}[^"]*")?[^>]*>([\\s\\S]*?)<\\/strong>\\s*<\\/p>`,
    'gi',
  )
  return html.replace(bronzeRe, (_full, _attrs, inner) => {
    const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text) return _full
    return devisSectionHeading(text)
  })
}

/** Met à jour les titres de section bronze → gris souligné gras (lettres enregistrées avant la charte). */
function refreshSectionHeadingsInTopHtml(html: string): string {
  const bronze = DEVIS_CHARTE.bronze.replace('#', '\\#')
  const gray = DEVIS_SECTION_HEADING_STYLE.color.replace('#', '\\#')
  const bronzeRe = new RegExp(
    `<p\\b([^>]*class="[^"]*devis-heading[^"]*"[^>]*)>\\s*<strong[^>]*(?:style="[^"]*color:\\s*${bronze}[^"]*")?[^>]*>([\\s\\S]*?)<\\/strong>\\s*<\\/p>`,
    'gi',
  )
  let out = html.replace(bronzeRe, (_full, _attrs, inner) => {
    const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text) return _full
    return devisSectionHeading(text)
  })

  const headingRe = new RegExp(
    `<p\\b([^>]*class="[^"]*devis-heading[^"]*"[^>]*)>([\\s\\S]*?)<\\/p>`,
    'gi',
  )
  out = out.replace(headingRe, (_full, _attrs, inner) => {
    const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text) return _full
    if (headingHasUserCustomStyle(inner)) return _full
    const hasBold = /<strong\b/i.test(inner)
    const hasGray = new RegExp(gray, 'i').test(inner)
    const hasCurrentSize = new RegExp(
      `font-size:\\s*${DEVIS_SECTION_HEADING_STYLE.fontSize.replace('.', '\\.')}`,
      'i',
    ).test(inner)
    if (hasBold && hasGray && hasCurrentSize) return _full
    if (hasBold && /<u\b/i.test(inner)) return _full
    return devisSectionHeading(text)
  })

  const sectionSizeRe = new RegExp(
    `font-size:\\s*(?:${DEVIS_SECTION_HEADING_STYLE.fontSize.replace('.', '\\.')}|17px)`,
    'i',
  )
  const looseGrayRe =
    /<p\b(?![^>]*class="[^"]*devis-heading)([^>]*)>\s*(?:<strong[^>]*>)?(?:<u[^>]*>)?<span([^>]*)>([\s\S]*?)<\/span>[\s\S]*?<\/p>/gi
  return out.replace(looseGrayRe, (full, _pAttrs, spanAttrs, inner) => {
    if (!/#555555|rgb\(\s*85\s*,\s*85\s*,\s*85\s*\)/i.test(spanAttrs)) return full
    if (!sectionSizeRe.test(spanAttrs)) return full
    const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text) return full
    return devisSectionHeading(text)
  })
}

function recapAndDetailsFromContext(ctx: DevisLetterContext) {
  const pay = (ctx.formulaires?.[0]?.payload ?? {}) as Record<string, unknown>
  const rap = pickRapport(ctx)
  const patient = ctx.patient
  const inter = arr(pay.typeIntervention).join(', ') || '—'
  const nom = patient?.fullName || '—'
  const age = str(pay.dateNaissance) ? computeAge(str(pay.dateNaissance)) : ''
  const mensStr = [
    str(pay.poids) ? `${str(pay.poids)} kg` : '',
    str(pay.taille) ? `${str(pay.taille)} cm` : '',
  ].filter(Boolean).join(' ')
  const ageMens = [age, mensStr].filter(Boolean).join(' — ') || '—'
  const trait = pay.traitementEnCours === true ? (str(pay.traitementDetails) || 'Oui') : 'Aucun'
  const allerg = arr(pay.allergies).join(', ') || 'Aucune'
  const antecMed = [...arr(pay.antecedentsMedicaux), str(pay.autresMaladiesChroniques)].filter(Boolean).join(', ') || 'Aucun'
  const antecCh = pay.chirurgiesAnterieures === true ? (str(pay.chirurgiesDetails) || 'Oui') : 'Aucun'
  const adresse = [patient?.ville, patient?.pays].filter(Boolean).join(' — ') || '—'
  const tel = patient?.phone || '—'
  const interRec = (rap?.interventionsRecommandees ?? []).filter(Boolean).join(', ') || '—'
  const anesthType = rap?.anesthesieGenerale === true ? 'Générale' : 'Locale / Sédation'
  return { inter, nom, ageMens, trait, allerg, antecMed, antecCh, adresse, tel, interRec, anesthType }
}

/**
 * Met à jour uniquement les données (nom, séjour, clinique, total…) sans reformater
 * couleurs / polices déjà personnalisées dans l’éditeur.
 */
export function syncDevisLetterDataOnlyTopHtml(
  html: string,
  ctx: DevisLetterContext,
  opts?: { syncInclutExclut?: boolean },
): string {
  const syncInclutExclut = opts?.syncInclutExclut !== false
  const sv = sejourPdfFromContext(ctx)
  const active = pickDevis(ctx)
  const devisTitle = formatDevisTitle(active, ctx.dossierNumber)
  let out = refreshConvalescenceInTopHtml(html, ctx)
  out = stripDureeInterventionLine(out)
  out = ensureOffrePrixSectionHeading(out)
  out = refreshExamensInTopHtml(out, ctx)
  out = refreshExamensSalmonPhrasesInTopHtml(out)
  if (syncInclutExclut) out = refreshOffreInclutExclutInTopHtml(out, ctx)
  out = refreshDevisTitleInTopHtml(out, devisTitle)
  out = refreshHighlightByLabel(out, DUREE_TOTALE_SEJOUR_LABEL, sv.dureeTotale)
  {
    const recap = recapAndDetailsFromContext(ctx)
    out = refreshDevisFieldByLabel(out, 'Intervention souhaitée :', recap.inter)
    out = refreshDevisFieldByLabel(out, 'Nom Prénom :', recap.nom)
    out = refreshDevisFieldByLabel(out, 'Âge / Mensurations :', recap.ageMens)
    out = refreshDevisFieldByLabel(out, 'Traitement en cours :', recap.trait)
    out = refreshDevisFieldByLabel(out, 'Allergie :', recap.allerg)
    out = refreshDevisFieldByLabel(out, 'Antécédents médicaux :', recap.antecMed)
    out = refreshDevisFieldByLabel(out, 'Antécédents chirurgicaux :', recap.antecCh)
    out = refreshDevisFieldByLabel(out, 'Adresse :', recap.adresse)
    out = refreshDevisFieldByLabel(out, 'Tél. Mobile :', recap.tel)
    out = refreshDevisFieldByLabel(out, "Type d'anesthésie :", recap.anesthType)
    out = refreshDevisFieldByLabel(out, 'Intervention proposée :', recap.interRec)
  }
  out = refreshDevisFieldByLabel(out, "Durée d'Hospitalisation :", sv.dureeHosp)
  out = refreshDevisFieldByLabel(out, 'Clinique retenue :', sv.cliniqueRetenue)
  out = refreshDevisFieldByLabel(out, 'Hôtel de séjour sélectionné :', sv.hotelSejour)
  out = refreshDevisFieldByLabel(out, 'Durée de séjour post hospitalisation en Tunisie :', sv.postHospLabel)
  out = refreshDevisFieldByLabel(out, "Nombre d'adultes :", sv.nbAdultes)
  out = refreshDevisFieldByLabel(out, 'Nbr Enfants (2 – 12 ans) :', sv.nbEnfants)
  out = refreshDevisFieldByLabel(out, 'Type de chambre :', sv.typeChambre)
  out = normalizeSejourJoursToNuits(out)
  out = ensureOffrePrixSectionHeading(out)
  return out
}

/** Complète la charte uniquement sur les éléments encore « nus » (sans toucher aux styles utilisateur). */
export function upgradeDevisMissingLayoutInTopHtml(html: string): string {
  let out = migrateBronzeSectionHeadingsOnly(html)
  out = refreshSalmonFieldLabelsInTopHtml(out)
  out = ensureOffrePrixSectionHeading(out)
  if (/diagnostic du chirurgien/i.test(out)) {
    const re =
      /((?:<p\b[^>]*>)(?:(?!<\/p>)[\s\S])*Diagnostic du chirurgien(?:(?!<\/p>)[\s\S])*<\/p>)([\s\S]*?)(?=<p\b[^>]*>(?:(?!<\/p>)[\s\S])*Durée\s+TOTALE\s+du\s+séjour)/i
    if (re.test(out)) {
      out = out.replace(re, (_full, head, body) =>
        `${head}${upgradeDiagnosticMissingLayoutInHtml(body)}`,
      )
    }
  }
  return stripDiagnosticOpTitlesInTopHtml(out)
}

/** Réapplique les couleurs charte (AU NIVEAU saumon, phrases examens fluo) après chargement. */
export function restoreDevisCanonicalColorsInTopHtml(html: string): string {
  if (!html?.trim()) return html
  let out = normalizeDiagnosticBlockGapsInTopHtml(html)
  out = normalizeDiagnosticDarkFluoInTopHtml(out)
  out = refreshExamensSalmonPhrasesInTopHtml(out)
  if (/diagnostic du chirurgien/i.test(out)) {
    const re =
      /((?:<p\b[^>]*>)(?:(?!<\/p>)[\s\S])*Diagnostic du chirurgien(?:(?!<\/p>)[\s\S])*<\/p>)([\s\S]*?)(?=<p\b[^>]*>(?:(?!<\/p>)[\s\S])*Durée\s+TOTALE\s+du\s+séjour)/i
    if (re.test(out)) {
      out = out.replace(re, (_full, head, body) =>
        `${head}${upgradeDiagnosticMissingLayoutInHtml(body)}`,
      )
    }
  } else {
    out = upgradeDiagnosticMissingLayoutInHtml(out)
  }
  return out
}

/**
 * Applique les règles lettre devis sur le HTML haut (éditeur + PDF).
 * Clinique / hôtel / durées / inclut-exclut se resynchronisent (sauf si désactivé).
 * Diagnostic : conservé si déjà présent dans la lettre (personnalisation gestionnaire).
 */
export function refreshDevisLetterTopHtml(
  html: string,
  ctx: DevisLetterContext,
  opts?: { syncInclutExclut?: boolean; preserveManualLayout?: boolean; preserveManualDiagnostic?: boolean },
): string {
  const syncInclutExclut = opts?.syncInclutExclut !== false
  const preserveManualLayout = opts?.preserveManualLayout === true
  const preserveManualDiagnostic = opts?.preserveManualDiagnostic === true
  const sv = sejourPdfFromContext(ctx)
  const active = pickDevis(ctx)
  const devisTitle = formatDevisTitle(active, ctx.dossierNumber)
  let out = refreshConvalescenceInTopHtml(html, ctx)
  out = stripDureeInterventionLine(out)
  out = ensureOffrePrixSectionHeading(out)
  out = refreshExamensInTopHtml(out, ctx)
  out = refreshExamensSalmonPhrasesInTopHtml(out)
  out = normalizeInclutExclutLabels(out)
  if (syncInclutExclut) out = refreshOffreInclutExclutInTopHtml(out, ctx)
  out = refreshDevisTitleInTopHtml(out, devisTitle)
  out = refreshSectionHeadingsInTopHtml(out)
  out = refreshSalmonFieldLabelsInTopHtml(out)
  if (Array.isArray(ctx.rapports) && !preserveManualDiagnostic) {
    const rap = pickRapport(ctx)
    out = refreshDiagnosticInTopHtml(
      out,
      rap?.diagnostic,
      rap?.interventionsRecommandees ?? [],
    )
  }
  out = stripDiagnosticOpTitlesInTopHtml(out)
  out = normalizeDiagnosticDarkFluoInTopHtml(out)
  out = normalizeDiagnosticBlockGapsInTopHtml(out)
  out = refreshHighlightByLabel(out, DUREE_TOTALE_SEJOUR_LABEL, sv.dureeTotale)
  {
    const recap = recapAndDetailsFromContext(ctx)
    out = refreshDevisFieldByLabel(out, 'Intervention souhaitée :', recap.inter)
    out = refreshDevisFieldByLabel(out, 'Nom Prénom :', recap.nom)
    out = refreshDevisFieldByLabel(out, 'Âge / Mensurations :', recap.ageMens)
    out = refreshDevisFieldByLabel(out, 'Traitement en cours :', recap.trait)
    out = refreshDevisFieldByLabel(out, 'Allergie :', recap.allerg)
    out = refreshDevisFieldByLabel(out, 'Antécédents médicaux :', recap.antecMed)
    out = refreshDevisFieldByLabel(out, 'Antécédents chirurgicaux :', recap.antecCh)
    out = refreshDevisFieldByLabel(out, 'Adresse :', recap.adresse)
    out = refreshDevisFieldByLabel(out, 'Tél. Mobile :', recap.tel)
    out = refreshDevisFieldByLabel(out, "Type d'anesthésie :", recap.anesthType)
    out = refreshDevisFieldByLabel(out, 'Intervention proposée :', recap.interRec)
  }
  out = refreshDevisFieldByLabel(out, "Durée d'Hospitalisation :", sv.dureeHosp)
  out = refreshDevisFieldByLabel(out, 'Clinique retenue :', sv.cliniqueRetenue)
  out = refreshDevisFieldByLabel(out, 'Hôtel de séjour sélectionné :', sv.hotelSejour)
  out = refreshDevisFieldByLabel(out, 'Durée de séjour post hospitalisation en Tunisie :', sv.postHospLabel)
  out = refreshDevisFieldByLabel(out, "Nombre d'adultes :", sv.nbAdultes)
  out = refreshDevisFieldByLabel(out, 'Nbr Enfants (2 – 12 ans) :', sv.nbEnfants)
  out = refreshDevisFieldByLabel(out, 'Type de chambre :', sv.typeChambre)
  out = normalizeSejourJoursToNuits(out)
  out = normalizeGapBeforeDetailsIntervention(out)
  out = normalizeHeadingRhythmInHtml(out)
  if (!preserveManualLayout) {
    out = collapseExcessEmptyParagraphs(out)
  }
  if (!/Examens médicaux nécessaires/i.test(out) && !out.includes(EXAMENS_START)) {
    out = refreshExamensInTopHtml(out, ctx)
  }
  out = refreshExamensSalmonPhrasesInTopHtml(out)
  out = restoreDevisCanonicalColorsInTopHtml(out)
  out = ensureOffrePrixSectionHeading(out)
  out = stripTrailingEmptyParagraphs(out)
  return italicizeDevisLetterIntroHtml(out)
}

const DEVIS_LETTER_INTRO_RE = [
  /^Tunis le /i,
  /^Bonjour,?$/i,
  /^Nous vous remercions de la confiance/i,
  /^Suite à votre demande de devis/i,
]

/** Met en italique la date et le préambule (Bonjour + formules d’ouverture). */
export function italicizeDevisLetterIntroHtml(html: string): string {
  if (!html) return html
  return html.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (full, attrs: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!DEVIS_LETTER_INTRO_RE.some((re) => re.test(text))) return full
    let newAttrs = attrs
    if (!/\bdevis-letter-intro\b/.test(newAttrs)) {
      if (/\bclass="/i.test(newAttrs)) {
        newAttrs = newAttrs.replace(/\bclass="/i, 'class="devis-letter-intro ')
      } else {
        newAttrs += ' class="devis-letter-intro"'
      }
    }
    if (
      /font-style\s*:\s*italic/i.test(newAttrs)
      || /<em\b/i.test(inner)
      || /<i\b/i.test(inner)
    ) {
      return `<p${newAttrs}>${inner}</p>`
    }
    return `<p${newAttrs}><em>${inner}</em></p>`
  })
}

/** Helper pour l’écran gestionnaire (patient détail). */
export function letterContextFromGestionnairePatient(
  p: {
    dossierNumber: string
    phone?: string | null
    ville?: string | null
    pays?: string | null
    user: { fullName: string }
    devis?: DevisLetterDevis[] | null
    rapports?: DevisLetterRapport[] | null
    formulaires?: Array<{ payload?: Record<string, unknown> }> | null
  },
  activeDevis?: DevisLetterDevis | null,
): DevisLetterContext {
  return {
    dossierNumber: p.dossierNumber,
    devis: p.devis ?? null,
    activeDevis: activeDevis ?? null,
    rapports: p.rapports ?? null,
    formulaires: p.formulaires ?? null,
    patient: {
      fullName: p.user.fullName,
      phone: p.phone,
      ville: p.ville,
      pays: p.pays,
    },
  }
}

function todayFr() {
  return new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
function computeAge(d: string) {
  try { return `${new Date().getFullYear() - new Date(d).getFullYear()} ans` } catch { return '' }
}
function arr(v: unknown): string[] { return Array.isArray(v) ? v.map(String).filter(Boolean) : [] }
function str(v: unknown): string { return typeof v === 'string' ? v.trim() : '' }

/** Lettre haute initiale (sans customContent). */
export function buildDevisLetterTopHtml(ctx: DevisLetterContext): string {
  const recap = recapAndDetailsFromContext(ctx)
  const rap = pickRapport(ctx)
  const sv = sejourPdfFromContext(ctx)
  const diagnosticHtml = formatDiagnosticLetterHtml(
    rap?.diagnostic?.trim() || '',
    rap?.interventionsRecommandees ?? [],
  )
  const active = pickDevis(ctx)
  const ref = formatDevisTitle(active, ctx.dossierNumber)
  const date = `Tunis le ${todayFr()}`

  return italicizeDevisLetterIntroHtml(`
<p style="text-align:right"><em>${date}</em></p>
<p></p>
<p><em>Bonjour,</em></p>
<p><em>Nous vous remercions de la confiance que vous nous avez accordée.</em></p>
<p><em>Suite à votre demande de devis, nous avons le plaisir de vous faire parvenir ci-dessous notre meilleure offre pour l'organisation de votre séjour médical en Tunisie.</em></p>
<p></p>
${devisRefTitleHtml(ref)}

${devisSectionHeading('Récapitulatif de votre demande :')}
${devisFieldRow('Intervention souhaitée :', recap.inter)}
${devisFieldRow('Nom Prénom :', recap.nom)}
${devisFieldRow('Âge / Mensurations :', recap.ageMens)}
${devisFieldRow('Traitement en cours :', recap.trait)}
${devisFieldRow('Allergie :', recap.allerg)}
${devisFieldRow('Antécédents médicaux :', recap.antecMed)}
${devisFieldRow('Antécédents chirurgicaux :', recap.antecCh)}
${devisFieldRow('Adresse :', recap.adresse)}
${devisFieldRow('Tél. Mobile :', recap.tel)}

${devisSectionHeading('Diagnostic du chirurgien : Dr CHENNOUFI Mehdi')}
${diagnosticHtml}
${paraDureeTotaleSejourFluo(sv.dureeTotale)}

${devisSectionHeading("Détails de l'intervention :")}
${devisFieldRow('Intervention proposée :', recap.interRec)}
${devisFieldRow("Type d'anesthésie :", recap.anesthType)}
${devisFieldRow("Durée d'Hospitalisation :", sv.dureeHosp)}
${devisFieldRow('Clinique retenue :', sv.cliniqueRetenue)}
${devisFieldRow("Durée d'arrêt de travail (depuis l'intervention) :", '15 jours en moyenne')}
${devisFieldRow('Chirurgien traitant :', 'Dr. CHENNOUFI Mehdi')}

${buildSejourConvalescenceHtml(sv)}

${devisSectionHeading("À titre de traitement préventif, prenez 2 semaines avant l'intervention :")}
<ul>
<li>Tardyferon 80mg : 2 comprimés par jour pour traitement préventif de l'Anémie</li>
<li>Arnica montana 9 CH à raison de 5 granulés (4 fois par jour)</li>
<li>Arrêt de l'Aspégic / Anti-inflammatoire / Aspirine 10 jours avant la chirurgie.</li>
</ul>

${buildExamensMedicauxHtml(ctx)}

${devisSectionHeading('Offre de prix :')}
${buildOffreInclutExclutHtml(ctx)}
`)
}

const OFFRE_INCLUT_START = '<!-- DEVIS_OFFRE_INCLUT -->'
const OFFRE_EXCLUT_END = '<!-- /DEVIS_OFFRE_EXCLUT -->'

function ulFromLabels(labels: string[]): string {
  if (labels.length === 0) {
    return '<p><em>—</em></p>'
  }
  return `<ul>\n${labels.map((l) => `<li>${l}</li>`).join('\n')}\n</ul>`
}

/** Blocs « Votre devis inclut / Notre forfait exclut » selon les cases cochées. */
export function buildOffreInclutExclutHtml(ctx: DevisLetterContext): string {
  const notes = pickDevis(ctx)?.notesSejour ?? ''
  const drainageNb = resolveDrainageNb(notes, pickRapport(ctx) ?? null)
  const contentionDetail = parseContentionDetailFromNotes(notes)
  const inclut = labelsForInclut(resolveInclutIds(notes), drainageNb, contentionDetail)
  const exclut = labelsForIds(DEVIS_EXCLUT_ITEMS, resolveExclutIds(notes))
  return `${OFFRE_INCLUT_START}
${devisSalmonHeading('Votre devis inclut :')}
${ulFromLabels(inclut)}
${devisSalmonHeading('Notre forfait exclut :')}
${ulFromLabels(exclut)}
${OFFRE_EXCLUT_END}`
}

/** Grand titre gris « Offre de prix : » — inséré si absent avant « Votre devis inclut ». */
export function ensureOffrePrixSectionHeading(html: string): string {
  if (/<p\b[^>]*\bdevis-heading\b[^>]*>[\s\S]*?Offre de prix\s*:/i.test(html)) return html
  if (!/Votre devis inclut\s*:/i.test(html)) return html
  const inclutIdx = html.search(/Votre devis inclut\s*:/i)
  const insertAt = inclutIdx >= 0 ? html.lastIndexOf('<p', inclutIdx) : -1
  const heading = devisSectionHeading('Offre de prix :')
  if (insertAt < 0) return `${heading}\n${html}`
  return `${html.slice(0, insertAt)}${heading}\n${html.slice(insertAt)}`
}

/**
 * Resynchronise la section inclut/exclut depuis les cases du modal (notesSejour).
 * TipTap retire souvent les commentaires HTML → repli index-safe (pas de regex multi-<p>).
 */
export function refreshOffreInclutExclutInTopHtml(html: string, ctx: DevisLetterContext): string {
  const fresh = buildOffreInclutExclutHtml(ctx)
  const heading = devisSectionHeading('Offre de prix :')
  let out = html
  const marked = new RegExp(`${OFFRE_INCLUT_START}[\\s\\S]*?${OFFRE_EXCLUT_END}`)
  if (marked.test(out)) {
    out = out.replace(marked, fresh)
  } else {
    const inclutIdx = out.search(/Votre devis inclut\s*:/i)
    const exclutIdx = out.search(/Notre forfait exclut\s*:/i)
    if (inclutIdx >= 0 && exclutIdx > inclutIdx) {
      const start = out.lastIndexOf('<p', inclutIdx)
      if (start >= 0) {
        const afterExclutTitle = out.indexOf('</p>', exclutIdx)
        if (afterExclutTitle > exclutIdx) {
          let pos = afterExclutTitle + 4
          while (true) {
            const empty = out.slice(pos).match(/^\s*<p\b[^>]*>\s*<\/p>/i)
            if (!empty) break
            pos += empty[0].length
          }
          const ulMatch = out.slice(pos).match(/^\s*<ul\b[^>]*>[\s\S]*?<\/ul>/i)
          if (ulMatch) {
            pos += ulMatch[0].length
          } else {
            const dash = out.slice(pos).match(/^\s*<p\b[^>]*>\s*(?:<em\b[^>]*>)?\s*—\s*(?:<\/em>)?\s*<\/p>/i)
            if (dash) pos += dash[0].length
          }
          out = `${out.slice(0, start)}${fresh}${out.slice(pos)}`
        }
      }
    } else {
      const offreIdx = out.search(/Offre de prix\s*:/i)
      if (offreIdx < 0) {
        if (/Votre devis inclut/i.test(out)) {
          out = ensureOffrePrixSectionHeading(out)
        } else {
          out = `${out}\n${heading}\n${fresh}`
        }
      } else {
        const close = out.indexOf('</p>', offreIdx)
        if (close >= 0) out = `${out.slice(0, close + 4)}\n${fresh}`
      }
    }
  }
  return ensureOffrePrixSectionHeading(out)
}

const OFFRE_MEILLEURE_RE = /Notre meilleure offre\s*:/i

function normalizeOfferSubtitleHeadingHtml(subtitleHtml?: string | null): string {
  const raw = subtitleHtml?.trim()
  if (!raw) return devisSalmonHeading('Notre meilleure offre :')
  if (/^<p\b[^>]*\bdevis-salmon-heading\b/i.test(raw)) return raw
  if (/^<p\b/i.test(raw)) {
    if (/\bclass="/i.test(raw)) {
      return raw.replace(/\bclass="([^"]*)"/i, (_, cls: string) =>
        cls.includes('devis-salmon-heading') ? `class="${cls}"` : `class="devis-salmon-heading ${cls}"`,
      )
    }
    return raw.replace(/<p\b/i, '<p class="devis-salmon-heading"')
  }
  return `<p class="devis-salmon-heading">${raw}</p>`
}

/** Retire le sous-titre « Notre meilleure offre » du HTML haut (stockage / export PDF). */
export function stripOfferMeilleureHeadingFromTopHtml(html: string): string {
  let out = html.replace(
    /<p\b[^>]*\bdevis-salmon-heading\b[^>]*>[\s\S]*?Notre meilleure offre\s*:[\s\S]*?<\/p>\s*/gi,
    '',
  )
  const exclutIdx = out.search(/Notre forfait exclut\s*:/i)
  if (exclutIdx >= 0 && OFFRE_MEILLEURE_RE.test(out)) {
    const meilleureIdx = out.search(OFFRE_MEILLEURE_RE)
    if (meilleureIdx > exclutIdx) {
      const start = out.lastIndexOf('<p', meilleureIdx)
      const end = out.indexOf('</p>', meilleureIdx)
      if (start >= 0 && end > start) {
        out = `${out.slice(0, start)}${out.slice(end + 4)}`
      }
    }
  }
  return stripTrailingEmptyParagraphs(out)
}

/** Contenu éditable du sous-titre offre (sans balise <p>). */
export function extractOfferSubtitleFromTopHtml(html: string): string | null {
  const withClass = html.match(
    /<p\b[^>]*\bdevis-salmon-heading\b[^>]*>([\s\S]*?)<\/p>/i,
  )
  if (withClass && OFFRE_MEILLEURE_RE.test(withClass[0])) return withClass[1].trim()
  const idx = html.search(OFFRE_MEILLEURE_RE)
  if (idx < 0) return null
  const start = html.lastIndexOf('<p', idx)
  const end = html.indexOf('</p>', idx)
  if (start < 0 || end < 0) return null
  const block = html.slice(start, end + 4)
  const inner = block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)
  return inner ? inner[1].trim() : null
}

/** Sépare HTML haut / sous-titre pour sauvegarde et export. */
export function stripOfferMeilleureHeadingForExport(topHtml: string): {
  topHtml: string
  subtitleHtml: string | null
} {
  return {
    topHtml: stripOfferMeilleureHeadingFromTopHtml(topHtml),
    subtitleHtml: extractOfferSubtitleFromTopHtml(topHtml),
  }
}

/**
 * Insère « Notre meilleure offre : » juste après inclut/exclut — même flux que les autres sous-titres saumon.
 */
export function ensureOfferMeilleureHeadingInTopHtml(html: string, subtitleHtml?: string | null): string {
  if (!/Notre forfait exclut\s*:/i.test(html) && !html.includes(OFFRE_EXCLUT_END)) return html
  let out = stripOfferMeilleureHeadingFromTopHtml(html)
  out = stripTrailingEmptyParagraphs(out)
  const heading = normalizeOfferSubtitleHeadingHtml(subtitleHtml)
  const markerIdx = out.indexOf(OFFRE_EXCLUT_END)
  if (markerIdx >= 0) {
    const pos = markerIdx + OFFRE_EXCLUT_END.length
    return `${out.slice(0, pos)}\n${heading}${out.slice(pos)}`
  }
  const exclutIdx = out.search(/Notre forfait exclut\s*:/i)
  if (exclutIdx < 0) return `${out}\n${heading}`
  let pos = out.indexOf('</p>', exclutIdx)
  if (pos < 0) pos = exclutIdx
  else pos += 4
  while (true) {
    const empty = out.slice(pos).match(/^\s*<p\b[^>]*>\s*<\/p>/i)
    if (!empty) break
    pos += empty[0].length
  }
  const ulMatch = out.slice(pos).match(/^\s*<ul\b[^>]*>[\s\S]*?<\/ul>/i)
  if (ulMatch) pos += ulMatch[0].length
  return `${out.slice(0, pos)}\n${heading}${out.slice(pos)}`
}

export function buildDevisLetterBottomHtml(total: number, tndPerEur = DEFAULT_TND_PER_EUR): string {
  const amountLine = buildDevisAmountSentenceHtml(total, tndPerEur)
  return `
<p>${amountLine}</p>
${devisSalmonHeading('Modalités de paiement :')}
<p>${buildPaymentModalitiesBodyHtml()}</p>
${devisSalmonHeading("Validité de l'offre :")}
<p>${buildOfferValidityBlockHtml()}</p>
`
}
