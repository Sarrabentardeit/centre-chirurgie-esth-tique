/**
 * Rafraîchissement commun du corps de lettre devis (éditeur + tous les PDF).
 * Applique les règles actuelles : titre bronze, examens, séjour, chambre, etc.
 */
import {
  DEVIS_ACCENT,
  DEVIS_CHARTE,
  devisFieldRow,
  devisHighlightBox,
  devisLabel,
  devisSectionHeading,
  devisSeparator,
} from '@/lib/devisCharte'
import {
  DEVIS_EXCLUT_ITEMS,
  DEVIS_INCLUT_ITEMS,
  labelsForIds,
  resolveExclutIds,
  resolveInclutIds,
} from '@/lib/devisOfferInclus'
import { devisSejourDefaultsFromRapport, parseSejourMeta } from '@/lib/devisSejourNotes'
import { buildDevisAmountSentence, DEFAULT_TND_PER_EUR } from '@/lib/moneyWords'
import { paraSalmonHi } from '@/lib/planningSejourBranding'
import { formatDevisTitle } from '@/lib/utils'

export type DevisLetterDevis = {
  statut?: string
  numeroDevis?: string | null
  notesSejour?: string | null
}

export type DevisLetterRapport = {
  diagnostic?: string | null
  examensDemandes?: string[]
  interventionsRecommandees?: string[]
  anesthesieGenerale?: boolean | null
  nuitsClinique?: number | null
  nuitsPreoperatoires?: number | null
  dureeSejourTunisie?: number | null
  nbAdultesSejour?: number | null
  nbEnfantsSejour?: number | null
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

/** Textes séjour / clinique / hôtel pour le PDF. */
export function sejourPdfFromContext(ctx: DevisLetterContext) {
  const rap = ctx.rapports?.[0]
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
  const nbAdultes = sej.nbAdultes.trim() !== '' ? sej.nbAdultes.trim() : fromRapport.nbAdultes
  const nbEnfants = sej.nbEnfants.trim() !== '' ? sej.nbEnfants.trim() : fromRapport.nbEnfants
  const typeChambre = Number(nbAdultes) === 2 ? 'Double' : 'Single'

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

function refreshDevisFieldByLabel(html: string, label: string, value: string): string {
  if (typeof window === 'undefined') return html
  if (value == null || value === '—') return html
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__root')
  if (!root) return html
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
  const target = normalize(label)
  let changed = false
  for (const p of Array.from(root.querySelectorAll('p'))) {
    if (normalize(p.textContent ?? '').startsWith(target)) {
      const tmp = doc.createElement('div')
      tmp.innerHTML = devisFieldRow(label, value)
      const fresh = tmp.firstElementChild
      if (fresh) {
        p.replaceWith(fresh)
        changed = true
      }
      break
    }
  }
  return changed ? root.innerHTML : html
}

function refreshHighlightByLabel(html: string, label: string, value: string): string {
  if (typeof window === 'undefined') return html
  if (value == null || value === '—') return html
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__root')
  if (!root) return html
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
  const target = normalize(label)
  for (const p of Array.from(root.querySelectorAll('p'))) {
    if (!normalize(p.textContent ?? '').startsWith(target)) continue
    const tmp = doc.createElement('div')
    tmp.innerHTML = devisHighlightBox(label, value)
    const fresh = tmp.firstElementChild
    if (fresh) {
      p.replaceWith(fresh)
      return root.innerHTML
    }
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
  const examens = ctx.rapports?.[0]?.examensDemandes ?? []
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
      return `${out.slice(0, offrePStart)}${fresh}\n<p></p>\n${out.slice(offrePStart)}`
    }
  }
  return `${out}\n${fresh}`
}

function refreshExamensInTopHtml(html: string, ctx: DevisLetterContext): string {
  const fromRapport = (ctx.rapports?.[0]?.examensDemandes ?? [])
    .map((e) => e.trim())
    .filter(Boolean)

  const labels = fromRapport.length > 0 ? fromRapport : extractExamensLabelsFromHtml(html)
  const hasSection =
    /Examens médicaux nécessaires/i.test(html) || html.includes(EXAMENS_START)

  if (labels.length === 0 && !hasSection) return html

  const fresh = buildExamensMedicauxHtml({
    ...ctx,
    rapports: [{ ...(ctx.rapports?.[0] ?? {}), examensDemandes: labels }],
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
  return `<p class="devis-ref-title" style="text-align:center;color:${DEVIS_ACCENT};font-size:18px;letter-spacing:0.02em;font-weight:700"><strong style="color:${DEVIS_ACCENT};font-size:18px;letter-spacing:0.02em"><span style="color:${DEVIS_ACCENT};font-size:18px;letter-spacing:0.02em">${title}</span></strong></p>`
}

function refreshDevisTitleInTopHtml(html: string, title: string): string {
  const styled = devisRefTitleHtml(title)
  let out = html
  // Toutes les variantes TipTap / anciennes (centré, class, texte nu)
  out = out.replace(/<p[^>]*class="[^"]*devis-ref-title[^"]*"[^>]*>[\s\S]*?<\/p>/gi, styled)
  out = out.replace(
    /<p[^>]*(?:style="[^"]*text-align:\s*center[^"]*")[^>]*>\s*(?:<strong[^>]*>)?\s*(?:<span[^>]*>)?\s*Devis(?:\s+MC-[\w-]*)?\s*(?:<\/span>)?\s*(?:<\/strong>)?\s*<\/p>/gi,
    styled,
  )
  out = out.replace(
    /<p[^>]*>\s*(?:<strong[^>]*>)?\s*(?:<span[^>]*>)?\s*Devis\s+MC-[\w-]+\s*(?:<\/span>)?\s*(?:<\/strong>)?\s*<\/p>/gi,
    styled,
  )
  // Si aucun titre trouvé, l’insérer avant le récapitulatif
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

/**
 * Applique toutes les règles lettre devis sur le HTML haut (éditeur + PDF partout).
 */
export function refreshDevisLetterTopHtml(html: string, ctx: DevisLetterContext): string {
  const sv = sejourPdfFromContext(ctx)
  const active = pickDevis(ctx)
  const devisTitle = formatDevisTitle(active, ctx.dossierNumber)
  let out = refreshConvalescenceInTopHtml(html, ctx)
  out = stripDureeInterventionLine(out)
  out = refreshExamensInTopHtml(out, ctx)
  out = normalizeInclutExclutLabels(out)
  out = refreshDevisTitleInTopHtml(out, devisTitle)
  out = refreshHighlightByLabel(out, 'Durée TOTALE du séjour :', sv.dureeTotale)
  out = refreshDevisFieldByLabel(out, "Durée d'Hospitalisation :", sv.dureeHosp)
  out = refreshDevisFieldByLabel(out, 'Clinique retenue :', sv.cliniqueRetenue)
  out = refreshDevisFieldByLabel(out, 'Hôtel de séjour sélectionné :', sv.hotelSejour)
  out = refreshDevisFieldByLabel(out, 'Durée de séjour post hospitalisation en Tunisie :', sv.postHospLabel)
  out = refreshDevisFieldByLabel(out, "Nombre d'adultes :", sv.nbAdultes)
  out = refreshDevisFieldByLabel(out, 'Nbr Enfants (2 – 12 ans) :', sv.nbEnfants)
  out = refreshDevisFieldByLabel(out, 'Type de chambre :', sv.typeChambre)
  out = refreshSejourBadgeInHtml(out, sv.sejourLine)
  out = normalizeSejourJoursToNuits(out)
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
  const rap = ctx.rapports?.[0]
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

  const diagnostic = rap?.diagnostic?.trim() || '—'
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
<p>${diagnostic.replace(/\n/g, '<br/>')}</p>
<p></p>
${devisHighlightBox('Durée TOTALE du séjour :', sv.dureeTotale)}

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
<p></p>

${buildExamensMedicauxHtml(ctx)}
<p></p>

${devisSectionHeading('Offre de prix :')}
<p><strong>Votre devis inclut :</strong></p>
<ul>
<li>Assistance depuis votre arrivée à l'aéroport de Tunis-Carthage et jusqu'à votre départ,</li>
<li>Transferts multiples aéroport/hôtel et hôtel/clinique,</li>
<li>Consultation préopératoire à Tunis,</li>
<li>Honoraires du chirurgien et de l'anesthésiste,</li>
<li>Frais de la clinique et séjour (bloc opératoire, consommables, pharmacie, médication…),</li>
<li>Les produits pharmaceutiques pour votre traitement postopératoire,</li>
<li>Convalescence dans un hôtel,</li>
<li>2 Séances de drainage lymphatique : massages par un kinésithérapeute,</li>
<li>Consultation post opératoire en Tunisie avant votre départ,</li>
<li>Suivi post-opératoire gratuit avec votre chirurgien ou son équipe pendant 6 mois.</li>
</ul>
<p></p>

<p><strong>Notre forfait exclut :</strong></p>
<ul>
<li>Les vols aller-retour,</li>
<li>Les dépenses personnelles (extras à l'hôtel ou à la clinique tels que les boissons, téléphone, etc…),</li>
<li>Les poches de sang en cas de besoin de transfusion,</li>
<li>Le prolongement de votre séjour initial en cas de nécessité,</li>
<li>Les bilans sanguins préopératoires.</li>
</ul>
`
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
