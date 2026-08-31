/**
 * Rafraîchissement commun du corps de lettre devis (éditeur + tous les PDF).
 * Applique les règles actuelles : titre bronze, examens, séjour, chambre, etc.
 */
import {
  DEVIS_CHARTE,
  devisFieldRow,
  devisLabel,
  devisSectionHeading,
  devisSeparator,
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
import { buildDevisAmountSentence, DEFAULT_TND_PER_EUR } from '@/lib/moneyWords'
import { paraSalmonHi } from '@/lib/planningSejourBranding'
import { formatDevisTitle } from '@/lib/utils'
import { formatDiagnosticLetterHtml } from '@/lib/diagnosticFormat'

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
      ? `${dureeNuits} nuit${dureeNuits > 1 ? 's' : ''}`
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

function refreshDevisFieldByLabel(html: string, label: string, value: string): string {
  if (value == null || value === '—') return html
  const target = normalizeFieldLabel(label)
  if (typeof window === 'undefined') {
    const re = new RegExp(
      `<p\\b[^>]*>[\\s\\S]*?${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['\u2019]")}[\\s\\S]*?<\\/p>`,
      'i',
    )
    if (!re.test(html)) return html
    return html.replace(re, devisFieldRow(label, value))
  }
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__root')
  if (!root) return html
  let changed = false
  for (const p of Array.from(root.querySelectorAll('p'))) {
    if (!normalizeFieldLabel(p.textContent ?? '').startsWith(target)) continue
    const tmp = doc.createElement('div')
    tmp.innerHTML = devisFieldRow(label, value)
    const fresh = tmp.firstElementChild
    if (fresh) {
      p.replaceWith(fresh)
      changed = true
    }
    break
  }
  return changed ? root.innerHTML : html
}

function refreshHighlightByLabel(html: string, label: string, value: string): string {
  if (value == null || value === '—') return html
  // Uniquement via DOM : un seul <p> (jamais de regex multi-paragraphes —
  // sinon on écrase tout le début de la lettre jusqu’à « Durée TOTALE »).
  if (typeof window === 'undefined') {
    // Fallback Node / SSR : paragraphe isolé seulement
    const fresh = `${paraSalmonHi(`${label} ${value}`)}\n<p></p>`
    const re =
      /<p\b[^>]*>(?:(?!<\/p>)[\s\S])*Durée\s+TOTALE\s+du\s+séjour\s*:(?:(?!<\/p>)[\s\S])*<\/p>(?:\s*<p(?:\s[^>]*)?>\s*<\/p>)?/i
    return re.test(html) ? html.replace(re, fresh) : html
  }

  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__root')
  if (!root) return html
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
  const target = normalize(label)
  const fresh = `${paraSalmonHi(`${label} ${value}`)}\n<p></p>`

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

function refreshSejourBadgeInHtml(html: string, sejourLine: string): string {
  if (!sejourLine.trim()) return html
  let out = html.replace(
    /(<div class="sejour-badge">)([\s\S]*?)(<\/div>)/gi,
    `$1${sejourLine}$3`,
  )
  out = out.replace(
    /Séjour\s+(\d+)\s+jours?\s*\(\s*\d+\s+nuits?\s*\)/gi,
    (_, n: string) => `Séjour ${n} nuit${Number(n) > 1 ? 's' : ''}`,
  )
  out = out.replace(
    /Séjour\s+(\d+)\s+jours?\b/gi,
    (_, n: string) => `Séjour ${n} nuit${Number(n) > 1 ? 's' : ''}`,
  )
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

export function buildExamensMedicauxHtml(ctx: DevisLetterContext): string {
  const examens = pickRapport(ctx)?.examensDemandes ?? []
  const hasBilan = examens.some((e) => e.toLowerCase().includes('bilan sanguin'))
  const otherExamens = examens.filter((e) => !e.toLowerCase().includes('bilan sanguin'))
  const ink = DEVIS_CHARTE.charcoal
  const examTitle = (label: string) =>
    `<strong><span style="color:${ink}">${label}</span></strong>`
  const examSubItem = (label: string) =>
    `<li><strong><span style="color:${ink}">${label}</span></strong></li>`

  let body = paraSalmonHi(
    "Les examens doivent avoir une validité maximum de 3 mois — À envoyer à J-10 de la date d'intervention",
  )
  const examItems: string[] = []
  if (hasBilan) {
    examItems.push(
      `${examTitle('Bilan sanguin préopératoire complet')} — à effectuer avant la date d'intervention, afin de s'assurer de la faisabilité de l'intervention, qui comprend :
<ul style="margin:6px 0 0;padding-left:22px;list-style-type:disc">
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
  body += `<ol style="margin:8px 0 10px;padding-left:22px;list-style-type:decimal">
${examItems.map((item) => `<li style="margin:0 0 10px">${item}</li>`).join('\n')}
</ol>`
  body += paraSalmonHi(
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
      return `${head}${fresh}\n<p></p>\n${out.slice(offrePStart)}`
    }
  }
  return `${stripTrailingEmptyParagraphs(out)}\n${fresh}`
}

/** Paragraphe TipTap vide (`<p></p>`, `<p><br></p>`, `&nbsp;`). */
const EMPTY_P_RE = String.raw`<p\b[^>]*>\s*(?:(?:<br\b[^>]*/?>|&nbsp;|\u00a0|\s)*)\s*</p>`

function stripTrailingEmptyParagraphs(html: string): string {
  return html.replace(new RegExp(`(?:\\s*${EMPTY_P_RE})+$`, 'gi'), '\n')
}

/** Réduit les trous verticaux (surtout entre traitement préventif et examens). */
function collapseExcessEmptyParagraphs(html: string): string {
  // Ne pas fusionner les espacements manuels (jusqu’à 6 lignes vides conservées).
  let out = html.replace(new RegExp(`(?:${EMPTY_P_RE}\\s*){7,}`, 'gi'), '<p></p>\n<p></p>\n<p></p>\n<p></p>\n<p></p>\n<p></p>\n')
  // Aucun paragraphe vide juste avant le titre Examens
  out = out.replace(
    new RegExp(
      `(</ul>)(\\s*(?:${EMPTY_P_RE}\\s*)+)(?=<p\\b[^>]*class="[^"]*devis-heading[^"]*"[^>]*>[\\s\\S]*?Examens médicaux)`,
      'gi',
    ),
    '$1\n',
  )
  out = out.replace(
    new RegExp(
      `((?:Aspégic|Anti-inflammatoire|Aspirine)[\\s\\S]*?</li>\\s*</ul>)(\\s*(?:${EMPTY_P_RE}\\s*)+)(?=[\\s\\S]{0,200}?Examens médicaux)`,
      'gi',
    ),
    '$1\n',
  )
  // Titre Examens précédé de <p> vides (sans </ul> juste avant)
  out = out.replace(
    new RegExp(
      `(?:${EMPTY_P_RE}\\s*)+(?=<p\\b[^>]*>[\\s\\S]*?Examens médicaux nécessaires)`,
      'gi',
    ),
    '',
  )
  return out
}

function refreshExamensInTopHtml(html: string, ctx: DevisLetterContext): string {
  const rap = pickRapport(ctx)
  const fromRapport = (rap?.examensDemandes ?? [])
    .map((e) => e.trim())
    .filter(Boolean)

  const labels = fromRapport.length > 0 ? fromRapport : extractExamensLabelsFromHtml(html)
  const hasSection =
    /Examens médicaux nécessaires/i.test(html) || html.includes(EXAMENS_START)

  if (labels.length === 0 && !hasSection) return html

  const fresh = buildExamensMedicauxHtml({
    ...ctx,
    activeDevis: rap?.id
      ? { ...(pickDevis(ctx) ?? {}), rapportId: rap.id }
      : { rapportId: null, dateCreation: undefined, envoyeAt: undefined },
    rapports: [{ ...(rap ?? {}), examensDemandes: labels }],
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
      /<span[^>]*style="[^"]*color:[^"]*"[^>]*>\s*Votre devis inclut\s*:\s*<\/span>/gi,
      '<strong>Votre devis inclut :</strong>',
    )
    .replace(
      /<span[^>]*style="[^"]*color:[^"]*"[^>]*>\s*Notre forfait exclut\s*:\s*<\/span>/gi,
      '<strong>Notre forfait exclut :</strong>',
    )
}

export function devisRefTitleHtml(title: string): string {
  return `<p class="devis-ref-title" style="text-align:center"><strong>${title}</strong></p>`
}

function titleParagraphHasCustomStyle(el: Element): boolean {
  if (el.getAttribute('style')?.match(/(?:^|;)\s*(?:color|font-size)\s*:/i)) return true
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
      /<p[^>]*(?:style="[^"]*text-align:\s*center[^"]*")[^>]*>\s*(?:<strong[^>]*>)?\s*(?:<span[^>]*>)?\s*Devis(?:\s+MC-[\w-]+)?(?:\s+-?[a-zA-Z0-9]+)?\s*(?:<\/span>)?\s*(?:<\/strong>)?\s*<\/p>/gi,
      styled,
    )
    out = out.replace(
      /<p[^>]*>\s*(?:<strong[^>]*>)?\s*(?:<span[^>]*>)?\s*Devis\s+MC-[\w-]+(?:\s+-?[a-zA-Z0-9]+)?\s*(?:<\/span>)?\s*(?:<\/strong>)?\s*<\/p>/gi,
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
  if (normalize(el.textContent ?? '') === target) return html

  if (titleParagraphHasCustomStyle(el)) {
    const inner = el.innerHTML
    const replaced = inner.replace(
      /Devis(?:\s+MC-[\w-]+)?(?:\s+-?[a-zA-Z0-9]+)?/i,
      target,
    )
    if (replaced !== inner) {
      el.innerHTML = replaced
      return root.innerHTML
    }
    return html
  }

  el.innerHTML = `<strong>${target}</strong>`
  return root.innerHTML
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

/**
 * Applique les règles lettre devis sur le HTML haut (éditeur + PDF).
 * Clinique / hôtel / durées / inclut-exclut se resynchronisent (sauf si désactivé).
 * Diagnostic : rapport lié à ce devis (correction du même rapport reprise ; pas un R plus récent).
 */
export function refreshDevisLetterTopHtml(
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
  out = refreshExamensInTopHtml(out, ctx)
  out = normalizeInclutExclutLabels(out)
  if (syncInclutExclut) out = refreshOffreInclutExclutInTopHtml(out, ctx)
  out = refreshDevisTitleInTopHtml(out, devisTitle)
  if (Array.isArray(ctx.rapports)) {
    const rap = pickRapport(ctx)
    out = refreshDiagnosticInTopHtml(
      out,
      rap?.diagnostic,
      rap?.interventionsRecommandees ?? [],
    )
  }
  out = refreshHighlightByLabel(out, 'Durée TOTALE du séjour :', sv.dureeTotale)
  out = refreshDevisFieldByLabel(out, "Durée d'Hospitalisation :", sv.dureeHosp)
  out = refreshDevisFieldByLabel(out, 'Clinique retenue :', sv.cliniqueRetenue)
  out = refreshDevisFieldByLabel(out, 'Hôtel de séjour sélectionné :', sv.hotelSejour)
  out = refreshDevisFieldByLabel(out, 'Durée de séjour post hospitalisation en Tunisie :', sv.postHospLabel)
  out = refreshDevisFieldByLabel(out, "Nombre d'adultes :", sv.nbAdultes)
  out = refreshDevisFieldByLabel(out, 'Nbr Enfants (2 – 12 ans) :', sv.nbEnfants)
  out = refreshDevisFieldByLabel(out, 'Type de chambre :', sv.typeChambre)
  {
    const interRec = (pickRapport(ctx)?.interventionsRecommandees ?? []).filter(Boolean).join(', ') || '—'
    out = refreshDevisFieldByLabel(out, 'Intervention proposée :', interRec)
  }
  out = refreshSejourBadgeInHtml(out, sv.sejourLine)
  out = normalizeSejourJoursToNuits(out)
  out = collapseExcessEmptyParagraphs(out)
  return out
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
  const pay = (ctx.formulaires?.[0]?.payload ?? {}) as Record<string, unknown>
  const rap = pickRapport(ctx)
  const sv = sejourPdfFromContext(ctx)
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

  const diagnosticHtml = formatDiagnosticLetterHtml(
    rap?.diagnostic?.trim() || '',
    rap?.interventionsRecommandees ?? [],
  )
  const interRec = (rap?.interventionsRecommandees ?? []).join(', ') || '—'
  const anesthType = rap?.anesthesieGenerale === true ? 'Générale' : 'Locale / Sédation'
  const active = pickDevis(ctx)
  const ref = formatDevisTitle(active, ctx.dossierNumber)
  const date = `Tunis le ${todayFr()}`

  return `
<p style="text-align:right">${date}</p>
<p></p>
<p>Bonjour,</p>
<p>Nous vous remercions de la confiance que vous nous avez accordée.</p>
<p>Suite à votre demande de devis, nous avons le plaisir de vous faire parvenir ci-dessous notre meilleure offre pour l'organisation de votre séjour médical en Tunisie.</p>
<p></p>
${devisRefTitleHtml(ref)}
<p></p>

${devisSectionHeading('Récapitulatif de votre demande :')}
${devisFieldRow('Intervention souhaitée :', inter)}
${devisFieldRow('Nom Prénom :', nom)}
${devisFieldRow('Âge / Mensurations :', ageMens)}
${devisFieldRow('Traitement en cours :', trait)}
${devisFieldRow('Allergie :', allerg)}
${devisFieldRow('Antécédents médicaux :', antecMed)}
${devisFieldRow('Antécédents chirurgicaux :', antecCh)}
${devisFieldRow('Adresse :', adresse)}
${devisFieldRow('Tél. Mobile :', tel)}
<p></p>

${devisSectionHeading('Diagnostic du chirurgien : Dr CHENNOUFI Mehdi')}
${diagnosticHtml}
<p></p>
${paraSalmonHi(`Durée TOTALE du séjour : ${sv.dureeTotale}`)}
<p></p>

${devisSeparator()}

${devisSectionHeading("Détails de l'intervention :")}
${devisFieldRow('Intervention proposée :', interRec)}
${devisFieldRow("Type d'anesthésie :", anesthType)}
${devisFieldRow("Durée d'Hospitalisation :", sv.dureeHosp)}
${devisFieldRow('Clinique retenue :', sv.cliniqueRetenue)}
${devisFieldRow("Durée d'arrêt de travail (depuis l'intervention) :", '15 jours en moyenne')}
${devisFieldRow('Chirurgien traitant :', 'Dr. CHENNOUFI Mehdi')}
<p></p>

${buildSejourConvalescenceHtml(sv)}
<p></p>

${devisSectionHeading("À titre de traitement préventif, prenez 2 semaines avant l'intervention :")}
<ul>
<li>Tardyferon 80mg : 2 comprimés par jour pour traitement préventif de l'Anémie</li>
<li>Arnica montana 9 CH à raison de 5 granulés (4 fois par jour)</li>
<li>Arrêt de l'Aspégic / Anti-inflammatoire / Aspirine 10 jours avant la chirurgie.</li>
</ul>

${buildExamensMedicauxHtml(ctx)}
<p></p>

${devisSectionHeading('Offre de prix :')}
${buildOffreInclutExclutHtml(ctx)}
`
}

const OFFRE_INCLUT_START = '<!-- DEVIS_OFFRE_INCLUT -->'
const OFFRE_INCLUT_END = '<!-- /DEVIS_OFFRE_INCLUT -->'
const OFFRE_EXCLUT_START = '<!-- DEVIS_OFFRE_EXCLUT -->'
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
<p><strong>Votre devis inclut :</strong></p>
${ulFromLabels(inclut)}
${OFFRE_INCLUT_END}
<p></p>
${OFFRE_EXCLUT_START}
<p><strong>Notre forfait exclut :</strong></p>
${ulFromLabels(exclut)}
${OFFRE_EXCLUT_END}`
}

/**
 * Resynchronise la section inclut/exclut depuis les cases du modal (notesSejour).
 * TipTap retire souvent les commentaires HTML → repli index-safe (pas de regex multi-<p>).
 */
export function refreshOffreInclutExclutInTopHtml(html: string, ctx: DevisLetterContext): string {
  const fresh = buildOffreInclutExclutHtml(ctx)
  const marked = new RegExp(`${OFFRE_INCLUT_START}[\\s\\S]*?${OFFRE_EXCLUT_END}`)
  if (marked.test(html)) return html.replace(marked, fresh)

  const inclutIdx = html.search(/Votre devis inclut\s*:/i)
  const exclutIdx = html.search(/Notre forfait exclut\s*:/i)
  if (inclutIdx >= 0 && exclutIdx > inclutIdx) {
    const start = html.lastIndexOf('<p', inclutIdx)
    if (start >= 0) {
      const afterExclutTitle = html.indexOf('</p>', exclutIdx)
      if (afterExclutTitle > exclutIdx) {
        let pos = afterExclutTitle + 4
        // TipTap : éventuels <p></p> vides entre le titre et la <ul>
        while (true) {
          const empty = html.slice(pos).match(/^\s*<p\b[^>]*>\s*<\/p>/i)
          if (!empty) break
          pos += empty[0].length
        }
        const ulMatch = html.slice(pos).match(/^\s*<ul\b[^>]*>[\s\S]*?<\/ul>/i)
        if (ulMatch) {
          pos += ulMatch[0].length
        } else {
          const dash = html.slice(pos).match(/^\s*<p\b[^>]*>\s*(?:<em\b[^>]*>)?\s*—\s*(?:<\/em>)?\s*<\/p>/i)
          if (dash) pos += dash[0].length
        }
        return `${html.slice(0, start)}${fresh}${html.slice(pos)}`
      }
    }
  }

  // Dernier recours : remplacer tout après « Offre de prix » (fin du HTML haut)
  const offreIdx = html.search(/Offre de prix\s*:/i)
  if (offreIdx < 0) {
    if (/Votre devis inclut/i.test(html)) return html
    return `${html}\n${fresh}`
  }
  const close = html.indexOf('</p>', offreIdx)
  if (close < 0) return html
  return `${html.slice(0, close + 4)}\n${fresh}`
}

export function buildDevisLetterBottomHtml(total: number, tndPerEur = DEFAULT_TND_PER_EUR): string {
  const amountLine = buildDevisAmountSentence(total, tndPerEur)
  return `
<p>${amountLine}</p>
<p></p>
<p><strong>${devisLabel('Modalités de paiement :')}</strong></p>
<p>Elle devra être réglée en dinars tunisiens et en espèces et ce au moment de votre admission à la clinique en Tunisie.</p>
<p>Les cartes de crédit ne sont pas acceptées.</p>
<p></p>
<p><strong>${devisLabel("Validité de l'offre :")}</strong></p>
<p>La présente offre de prix sera valable pour une durée de trois (3) mois à compter de ce jour et seulement en période hors saison pour les hôtels (hors juillet/août et décembre).</p>
<p></p>
<p>Nous espérons que notre offre de prix vous agréera et nous tenons à votre entière disposition pour vous conseiller au mieux pour réussir votre séjour.</p>
`
}
