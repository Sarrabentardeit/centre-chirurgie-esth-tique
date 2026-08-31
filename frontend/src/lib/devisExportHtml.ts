import type { Devis } from '@/lib/api'
import {
  DEVIS_LOGO_SRC,
  buildDevisDocumentEndHtml,
  buildDevisHeaderLogoHtml,
} from '@/lib/devisBranding'
import { buildDevisOfferBlockHtml, buildDevisPrintStyles, markDevisSpacerParagraphs } from '@/lib/devisCharte'
import {
  buildDevisLetterBottomHtml,
  buildDevisLetterTopHtml,
  letterContextFromGestionnairePatient,
  pickRapport,
  refreshDevisLetterTopHtml,
  sejourPdfFromContext,
  type DevisLetterContext,
} from '@/lib/devisLetterHtml'
import { replaceDevisAmountPlaceholders, DEFAULT_TND_PER_EUR } from '@/lib/moneyWords'
import { formatDevisListName, getDevisDisplayNumber } from '@/lib/utils'

export const DEVIS_CONTENT_BREAK = '|||EDITOR_BREAK|||'
/** Titre / description du tableau « Notre meilleure offre » (éditable dans l’éditeur lettre). */
export const DEVIS_OFFER_TITLE_PREFIX = 'DEVIS_OFFER_TITLE:'
/** Total affiché du tableau offre (éditable ; défaut = total des lignes devis). */
export const DEVIS_OFFER_TOTAL_PREFIX = 'DEVIS_OFFER_TOTAL:'
/** Présent si le total a été modifié à la main dans l’éditeur (ne pas resync depuis les lignes). */
export const DEVIS_OFFER_TOTAL_MANUAL_PREFIX = 'DEVIS_OFFER_TOTAL_MANUAL:'

export function splitDevisCustomContent(raw: string | null | undefined): {
  topHtml: string
  offerTitle: string | null
  offerTotal: string | null
  offerTotalManual: boolean
  botHtml: string
} {
  const empty = {
    topHtml: '',
    offerTitle: null as string | null,
    offerTotal: null as string | null,
    offerTotalManual: false,
    botHtml: '',
  }
  const text = raw?.trim() ?? ''
  if (!text) return empty
  if (!text.includes(DEVIS_CONTENT_BREAK)) {
    return { ...empty, topHtml: text }
  }
  const parts = text.split(DEVIS_CONTENT_BREAK)
  if (parts.length >= 2 && (parts[1] ?? '').startsWith(DEVIS_OFFER_TITLE_PREFIX)) {
    let botStart = 2
    let offerTotal: string | null = null
    if (parts.length >= 3 && (parts[2] ?? '').startsWith(DEVIS_OFFER_TOTAL_PREFIX)) {
      offerTotal = (parts[2] ?? '').slice(DEVIS_OFFER_TOTAL_PREFIX.length)
      botStart = 3
    }
    let offerTotalManual = false
    if (parts.length > botStart && (parts[botStart] ?? '').startsWith(DEVIS_OFFER_TOTAL_MANUAL_PREFIX)) {
      offerTotalManual =
        (parts[botStart] ?? '').slice(DEVIS_OFFER_TOTAL_MANUAL_PREFIX.length).trim() === '1'
      botStart += 1
    }
    return {
      topHtml: parts[0] ?? '',
      offerTitle: (parts[1] ?? '').slice(DEVIS_OFFER_TITLE_PREFIX.length),
      offerTotal,
      offerTotalManual,
      botHtml: parts.slice(botStart).join(DEVIS_CONTENT_BREAK),
    }
  }
  return {
    topHtml: parts[0] ?? '',
    offerTitle: null,
    offerTotal: null,
    offerTotalManual: false,
    botHtml: parts.slice(1).join(DEVIS_CONTENT_BREAK),
  }
}

export function joinDevisCustomContent(
  topHtml: string,
  botHtml: string,
  offerTitle?: string | null,
  offerTotal?: string | null,
  offerTotalManual = false,
): string {
  if (offerTitle == null && offerTotal == null) {
    return `${topHtml}${DEVIS_CONTENT_BREAK}${botHtml}`
  }
  const titleSeg = `${DEVIS_OFFER_TITLE_PREFIX}${offerTitle ?? ''}`
  if (offerTotal != null) {
    let out =
      `${topHtml}${DEVIS_CONTENT_BREAK}${titleSeg}${DEVIS_CONTENT_BREAK}${DEVIS_OFFER_TOTAL_PREFIX}${offerTotal}`
    if (offerTotalManual) {
      out += `${DEVIS_CONTENT_BREAK}${DEVIS_OFFER_TOTAL_MANUAL_PREFIX}1`
    }
    return `${out}${DEVIS_CONTENT_BREAK}${botHtml}`
  }
  return `${topHtml}${DEVIS_CONTENT_BREAK}${titleSeg}${DEVIS_CONTENT_BREAK}${botHtml}`
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n || 0))
}

/** Affichage éditable du total + montant numérique (pour lettres / €). */
export function resolveDevisOfferTotal(
  display: string | null | undefined,
  fallbackAmount: number,
): { display: string; amount: number } {
  const trimmed = display?.trim() ?? ''
  if (!trimmed) {
    return { display: fmtNum(fallbackAmount), amount: fallbackAmount }
  }
  const digits = trimmed.replace(/[^\d]/g, '')
  const amount = digits ? Number(digits) : NaN
  if (!Number.isFinite(amount) || amount < 0) {
    return { display: trimmed, amount: fallbackAmount }
  }
  return { display: trimmed, amount }
}

/** Total tableau offre saisi à la main (différent de la somme des lignes devis). */
export function isManualDevisOfferTotal(
  savedTotal: string | null | undefined,
  lignesSum: number,
): boolean {
  const raw = savedTotal?.trim()
  if (!raw) return false
  return resolveDevisOfferTotal(raw, lignesSum).amount !== lignesSum
}

/** Total à afficher (modal) : somme prestations ou total lettre si modifié dans l’éditeur. */
export function displayDevisOfferTotal(
  customContent: string | null | undefined,
  lignesTotal: number,
): number {
  const split = splitDevisCustomContent(customContent)
  const saved = split.offerTotal?.trim()
  if (!saved) return lignesTotal
  const resolved = resolveDevisOfferTotal(saved, lignesTotal)
  if (split.offerTotalManual || resolved.amount !== lignesTotal) {
    return resolved.amount
  }
  return lignesTotal
}

/**
 * Découpe + rafraîchit le customContent (même règles que le PDF).
 * À sauvegarder en base pour que patient / médecin voient le bon modèle.
 */
export function refreshDevisCustomContentParts(input: {
  customContent?: string | null
  devis: Devis
  letterContext: DevisLetterContext
  tndPerEur?: number
  /**
   * true (défaut) : le total du tableau offre suit le total des lignes devis
   * (auto-save modal → éditeur / PDF synchronisés).
   */
  syncOfferTotalFromLignes?: boolean
  /**
   * true : la description du tableau suit interventions / 1ʳᵉ ligne devis
   * (ouverture éditeur / Personnaliser). false (défaut) : conserve le texte lettre.
   */
  syncOfferTitleFromDevis?: boolean
  /**
   * Anciens devis sans marqueur manuel : conserver un total ≠ somme des lignes
   * à l’ouverture éditeur (migration vers DEVIS_OFFER_TOTAL_MANUAL).
   */
  preserveLegacyManualOfferTotal?: boolean
  /** false : garder inclut/exclut déjà dans le HTML. Défaut = sync depuis le modal. */
  syncInclutExclut?: boolean
}): { topHtml: string; botHtml: string; offerTitle: string | null; offerTotal: string | null; contentToSave: string } {
  const tndPerEur = input.tndPerEur ?? DEFAULT_TND_PER_EUR
  const total = (input.devis.lignes ?? []).reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)
  const split = splitDevisCustomContent(input.customContent)
  let topHtml = split.topHtml
  let botHtml = split.botHtml

  const ctx: DevisLetterContext = {
    ...input.letterContext,
    activeDevis: input.devis,
  }

  const rap = pickRapport(ctx)
  const defaultOfferTitle =
    (rap?.interventionsRecommandees ?? []).filter(Boolean).join(' + ')
    || (input.devis.lignes ?? []).find((l) => l.description?.trim())?.description.trim()
    || 'Séjour médical personnalisé'

  const syncTitle = input.syncOfferTitleFromDevis === true
  const offerTitle = syncTitle
    ? defaultOfferTitle
    : (split.offerTitle?.trim() || defaultOfferTitle)

  const syncTotal = input.syncOfferTotalFromLignes !== false
  const savedTotalRaw = split.offerTotal?.trim() || null
  const keepManualTotal =
    split.offerTotalManual
    || (
      input.preserveLegacyManualOfferTotal === true
      && isManualDevisOfferTotal(savedTotalRaw, total)
    )
  const offerTotal = keepManualTotal
    ? (savedTotalRaw || fmtNum(total))
    : syncTotal
      ? fmtNum(total)
      : (savedTotalRaw || fmtNum(total))
  const letterTotal = resolveDevisOfferTotal(offerTotal, total).amount

  if (!topHtml.trim()) topHtml = buildDevisLetterTopHtml(ctx)
  if (!botHtml.trim()) botHtml = buildDevisLetterBottomHtml(letterTotal, tndPerEur)
  topHtml = refreshDevisLetterTopHtml(topHtml, ctx, {
    syncInclutExclut: input.syncInclutExclut !== false,
  })
  botHtml = replaceDevisAmountPlaceholders(botHtml, letterTotal, tndPerEur)
  return {
    topHtml,
    botHtml,
    offerTitle,
    offerTotal,
    contentToSave: joinDevisCustomContent(
      topHtml,
      botHtml,
      offerTitle,
      offerTotal,
      keepManualTotal,
    ),
  }
}

/**
 * Resync lettre depuis le brouillon modal / envoi direct :
 * clinique, séjour, inclut/exclut (cases modal), total prestations…
 * Conserve la description du tableau offre déjà personnalisée.
 */
export function refreshDevisCustomContentFromDraft(
  input: Omit<Parameters<typeof refreshDevisCustomContentParts>[0], 'syncOfferTotalFromLignes' | 'syncOfferTitleFromDevis' | 'syncInclutExclut'>,
) {
  return refreshDevisCustomContentParts({
    ...input,
    syncOfferTotalFromLignes: true,
    syncOfferTitleFromDevis: false,
    syncInclutExclut: true,
  })
}

/**
 * HTML PDF devis — même structure / rafraîchissement que l’éditeur gestionnaire.
 */
export function buildDevisExportHtml(input: {
  devis: Devis
  dossierNumber: string
  patientFullName: string
  /** Rapport + formulaires si dispo (gestionnaire) ; sinon refresh partiel depuis notes devis. */
  letterContext?: DevisLetterContext | null
  origin?: string
  tndPerEur?: number
  /** HTML haut déjà saisi (éditeur) — sinon customContent du devis. */
  topHtml?: string
  botHtml?: string
  /** Description du tableau offre (éditée dans l’éditeur lettre). */
  operationTitle?: string | null
  /** Total affiché du tableau offre (éditable). */
  operationTotal?: string | null
  /**
   * true : ne pas resynchroniser le HTML haut (export éditeur = WYSIWYG).
   * false (défaut) : resync clinique, durées, adultes… depuis le devis.
   */
  preserveTopHtml?: boolean
  /** Lors du refresh : false = garder inclut/exclut édités à la main. */
  syncInclutExclut?: boolean
}): string {
  const { devis: d, dossierNumber, patientFullName } = input
  const origin = input.origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const tndPerEur = input.tndPerEur ?? DEFAULT_TND_PER_EUR

  const lignes = Array.isArray(d.lignes) ? d.lignes : []
  const total = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)
  const headerRef = getDevisDisplayNumber(d, dossierNumber) || dossierNumber
  const pdfTitle = formatDevisListName(headerRef || dossierNumber, patientFullName, d.version)

  let topHtml = input.topHtml ?? ''
  let botHtml = input.botHtml ?? ''
  let offerTitle = input.operationTitle?.trim() || null
  let offerTotal = input.operationTotal?.trim() || null
  if (!input.topHtml && !input.botHtml) {
    const split = splitDevisCustomContent(d.customContent)
    topHtml = split.topHtml
    botHtml = split.botHtml
    if (!offerTitle) offerTitle = split.offerTitle
    if (!offerTotal) offerTotal = split.offerTotal
  } else if (d.customContent) {
    const split = splitDevisCustomContent(d.customContent)
    if (offerTitle == null) offerTitle = split.offerTitle
    if (offerTotal == null) offerTotal = split.offerTotal
  }

  const letterTotal = resolveDevisOfferTotal(offerTotal, total)

  const ctx: DevisLetterContext = input.letterContext ?? {
    dossierNumber,
    activeDevis: d,
    devis: [d],
    patient: { fullName: patientFullName },
  }
  // Toujours cibler le devis exporté
  const ctxForRefresh: DevisLetterContext = {
    ...ctx,
    dossierNumber,
    activeDevis: d,
    patient: ctx.patient ?? { fullName: patientFullName },
  }
  if (!topHtml.trim()) {
    topHtml = buildDevisLetterTopHtml(ctxForRefresh)
  }
  if (!botHtml.trim()) {
    botHtml = buildDevisLetterBottomHtml(letterTotal.amount, tndPerEur)
  }
  const preserveTop = input.preserveTopHtml === true
  if (!preserveTop) {
    topHtml = refreshDevisLetterTopHtml(topHtml, ctxForRefresh, {
      syncInclutExclut: input.syncInclutExclut !== false,
    })
  }
  topHtml = markDevisSpacerParagraphs(topHtml)
  botHtml = markDevisSpacerParagraphs(replaceDevisAmountPlaceholders(botHtml, letterTotal.amount, tndPerEur))

  const operationTitle =
    offerTitle?.trim()
    || lignes.find((l) => l.description?.trim())?.description.trim()
    || 'Séjour médical personnalisé'
  const sejourLine = sejourPdfFromContext(ctxForRefresh).sejourLine
  const tableHtml =
    lignes.length > 0
      ? buildDevisOfferBlockHtml({
          operationTitle,
          sejourLine,
          totalFormatted: letterTotal.display,
        })
      : ''

  const logoUrl = `${origin}${DEVIS_LOGO_SRC}`
  const sigUrl = `${origin}/signature.jpg`

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <title>${pdfTitle}</title>
  <style>${buildDevisPrintStyles()}</style>
</head>
<body>
  <table class="page-table">
    <thead>
      <tr><td>
        <div class="doc-header">
          ${buildDevisHeaderLogoHtml(logoUrl)}
        </div>
      </td></tr>
    </thead>
    <tfoot><tr><td></td></tr></tfoot>
    <tbody>
      <tr><td>
        <div class="doc-body devis-top">${topHtml}</div>
        <div class="devis-closing">
          ${tableHtml}
          <div class="doc-body devis-bot">${botHtml}</div>
          ${buildDevisDocumentEndHtml(sigUrl)}
        </div>
      </td></tr>
    </tbody>
  </table>
</body>
</html>`
}

/** Contexte complet gestionnaire → export / envoi chat. */
export function buildGestionnaireDevisExportHtml(input: {
  devis: Devis
  patient: {
    dossierNumber: string
    user: { fullName: string }
    devis?: Devis[] | null
    rapports?: DevisLetterContext['rapports']
    formulaires?: DevisLetterContext['formulaires']
  }
  topHtml?: string
  botHtml?: string
  operationTitle?: string | null
  operationTotal?: string | null
  tndPerEur?: number
  /** Export éditeur : conserver le HTML haut tel quel (inclut/exclut modifiés à la main). */
  preserveTopHtml?: boolean
  /** false = ne pas écraser inclut/exclut lors d’un refresh modal. */
  syncInclutExclut?: boolean
}): string {
  const letterContext = letterContextFromGestionnairePatient(input.patient, input.devis)
  return buildDevisExportHtml({
    devis: input.devis,
    dossierNumber: input.patient.dossierNumber,
    patientFullName: input.patient.user.fullName,
    letterContext,
    topHtml: input.topHtml,
    botHtml: input.botHtml,
    operationTitle: input.operationTitle,
    operationTotal: input.operationTotal,
    tndPerEur: input.tndPerEur,
    preserveTopHtml: input.preserveTopHtml === true,
    syncInclutExclut: input.syncInclutExclut,
  })
}
