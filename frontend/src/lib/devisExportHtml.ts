import type { Devis } from '@/lib/api'
import {
  DEVIS_LOGO_SRC,
  buildDevisDocumentEndHtml,
  buildDevisHeaderLogoHtml,
} from '@/lib/devisBranding'
import { buildDevisOfferBlockHtml, buildDevisPrintStyles, buildOfferDescEditorHtml, looksLikeOfferDescHtml, markDevisSpacerParagraphs, normalizeDevisBottomFluoInHtml, prepareDevisHtmlForEditor, restoreOfferSejourFluoInHtml } from '@/lib/devisCharte'
import {
  buildDevisLetterBottomHtml,
  buildDevisLetterTopHtml,
  hasDiagnosticBodyInTopHtml,
  italicizeDevisLetterIntroHtml,
  letterContextFromGestionnairePatient,
  pickRapport,
  refreshDevisLetterTopHtml,
  restoreDevisCanonicalColorsInTopHtml,
  refreshOffreInclutExclutInTopHtml,
  refreshSalmonFieldLabelsInTopHtml,
  sejourPdfFromContext,
  stripOfferMeilleureHeadingFromTopHtml,
  syncOfferSejourInHtml,
  stripDiagnosticOpTitlesInTopHtml,
  upgradeDevisMissingLayoutInTopHtml,
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
/** Titre au-dessus du tableau (« Notre meilleure offre : »). */
export const DEVIS_OFFER_SUBTITLE_PREFIX = 'DEVIS_OFFER_SUBTITLE:'
/** En-tête colonne Description. */
export const DEVIS_OFFER_HEAD_DESC_PREFIX = 'DEVIS_OFFER_HEAD_DESC:'
/** En-tête colonne Tarif. */
export const DEVIS_OFFER_HEAD_PRICE_PREFIX = 'DEVIS_OFFER_HEAD_PRICE:'
/** Ancien marqueur (ignoré à la lecture, plus écrit). */
const DEVIS_EDITOR_WYSIWYG_PREFIX = 'DEVIS_EDITOR_WYSIWYG:'

export type DevisOfferChrome = {
  subtitle?: string | null
  headDesc?: string | null
  headPrice?: string | null
}

export function splitDevisCustomContent(raw: string | null | undefined): {
  topHtml: string
  offerTitle: string | null
  offerTotal: string | null
  offerTotalManual: boolean
  offerSubtitle: string | null
  offerHeadDesc: string | null
  offerHeadPrice: string | null
  botHtml: string
} {
  const empty = {
    topHtml: '',
    offerTitle: null as string | null,
    offerTotal: null as string | null,
    offerTotalManual: false,
    offerSubtitle: null as string | null,
    offerHeadDesc: null as string | null,
    offerHeadPrice: null as string | null,
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
    if (parts.length > botStart && (parts[botStart] ?? '').startsWith(DEVIS_EDITOR_WYSIWYG_PREFIX)) {
      botStart += 1
    }
    let offerSubtitle: string | null = null
    if (parts.length > botStart && (parts[botStart] ?? '').startsWith(DEVIS_OFFER_SUBTITLE_PREFIX)) {
      offerSubtitle = (parts[botStart] ?? '').slice(DEVIS_OFFER_SUBTITLE_PREFIX.length)
      botStart += 1
    }
    let offerHeadDesc: string | null = null
    if (parts.length > botStart && (parts[botStart] ?? '').startsWith(DEVIS_OFFER_HEAD_DESC_PREFIX)) {
      offerHeadDesc = (parts[botStart] ?? '').slice(DEVIS_OFFER_HEAD_DESC_PREFIX.length)
      botStart += 1
    }
    let offerHeadPrice: string | null = null
    if (parts.length > botStart && (parts[botStart] ?? '').startsWith(DEVIS_OFFER_HEAD_PRICE_PREFIX)) {
      offerHeadPrice = (parts[botStart] ?? '').slice(DEVIS_OFFER_HEAD_PRICE_PREFIX.length)
      botStart += 1
    }
    return {
      topHtml: parts[0] ?? '',
      offerTitle: (parts[1] ?? '').slice(DEVIS_OFFER_TITLE_PREFIX.length),
      offerTotal,
      offerTotalManual,
      offerSubtitle,
      offerHeadDesc,
      offerHeadPrice,
      botHtml: parts.slice(botStart).join(DEVIS_CONTENT_BREAK),
    }
  }
  return {
    ...empty,
    topHtml: parts[0] ?? '',
    botHtml: parts.slice(1).join(DEVIS_CONTENT_BREAK),
  }
}

export function joinDevisCustomContent(
  topHtml: string,
  botHtml: string,
  offerTitle?: string | null,
  offerTotal?: string | null,
  offerTotalManual = false,
  chrome?: DevisOfferChrome | null,
): string {
  if (offerTitle == null && offerTotal == null) {
    return `${topHtml}${DEVIS_CONTENT_BREAK}${botHtml}`
  }
  const titleSeg = `${DEVIS_OFFER_TITLE_PREFIX}${offerTitle ?? ''}`
  const chromeSegs: string[] = []
  if (chrome?.subtitle != null) chromeSegs.push(`${DEVIS_OFFER_SUBTITLE_PREFIX}${chrome.subtitle}`)
  if (chrome?.headDesc != null) chromeSegs.push(`${DEVIS_OFFER_HEAD_DESC_PREFIX}${chrome.headDesc}`)
  if (chrome?.headPrice != null) chromeSegs.push(`${DEVIS_OFFER_HEAD_PRICE_PREFIX}${chrome.headPrice}`)
  const chromeJoin = chromeSegs.length > 0 ? `${DEVIS_CONTENT_BREAK}${chromeSegs.join(DEVIS_CONTENT_BREAK)}` : ''
  if (offerTotal != null) {
    let out =
      `${topHtml}${DEVIS_CONTENT_BREAK}${titleSeg}${DEVIS_CONTENT_BREAK}${DEVIS_OFFER_TOTAL_PREFIX}${offerTotal}`
    if (offerTotalManual) {
      out += `${DEVIS_CONTENT_BREAK}${DEVIS_OFFER_TOTAL_MANUAL_PREFIX}1`
    }
    return `${out}${chromeJoin}${DEVIS_CONTENT_BREAK}${botHtml}`
  }
  return `${topHtml}${DEVIS_CONTENT_BREAK}${titleSeg}${chromeJoin}${DEVIS_CONTENT_BREAK}${botHtml}`
}

/** Lettre déjà personnalisée (ne pas resynchroniser le HTML depuis le modal). */
export function hasPersonalizedDevisLetter(customContent: string | null | undefined): boolean {
  return Boolean(splitDevisCustomContent(customContent).topHtml.trim())
}

/** Charge le brouillon : mise en forme conservée, données du modal toujours à jour. */
export function loadDevisCustomContentForEditor(input: {
  customContent?: string | null
  defaultTopHtml: string
  defaultBotHtml: string
  defaultOfferTitle: string
  defaultOfferTotal: string
  defaultOfferSubtitle?: string
  defaultOfferHeadDesc?: string
  defaultOfferHeadPrice?: string
  lignesTotal: number
  tndPerEur?: number
  devis?: Devis
  letterContext?: DevisLetterContext | null
}): {
  topHtml: string
  botHtml: string
  offerTitle: string
  offerTotal: string
  offerTotalManual: boolean
  offerSubtitle: string
  offerHeadDesc: string
  offerHeadPrice: string
} {
  const tndPerEur = input.tndPerEur ?? DEFAULT_TND_PER_EUR
  const split = splitDevisCustomContent(input.customContent)
  const hasSavedLetter = Boolean(split.topHtml.trim())
  const hasSavedBot = Boolean(split.botHtml.trim())
  const letterCtx = input.devis && input.letterContext
    ? { ...input.letterContext, activeDevis: input.devis }
    : null

  let topRaw = split.topHtml.trim() || input.defaultTopHtml
  let botRaw = split.botHtml.trim() || input.defaultBotHtml

  if (letterCtx) {
    if (hasSavedLetter) {
      // Resync données + ordre des sections (examens → offre → inclut), sans écraser la mise en forme manuelle
      topRaw = upgradeDevisMissingLayoutInTopHtml(
        refreshDevisLetterTopHtml(topRaw, letterCtx, {
          syncInclutExclut: true,
          preserveManualLayout: true,
          preserveManualDiagnostic: true,
        }),
      )
    } else {
      const refreshed = refreshDevisCustomContentParts({
        customContent: input.customContent,
        devis: input.devis!,
        letterContext: input.letterContext!,
        tndPerEur,
        syncOfferTotalFromLignes: true,
        syncOfferTitleFromDevis: false,
        syncInclutExclut: true,
        preserveLegacyManualOfferTotal: false,
        preserveManualLayout: true,
        preserveManualDiagnostic: true,
      })
      topRaw = refreshed.topHtml.trim() || input.defaultTopHtml
      botRaw = refreshed.botHtml.trim() || input.defaultBotHtml
      topRaw = prepareDevisHtmlForEditor(topRaw)
    }
  }

  const sv = letterCtx ? sejourPdfFromContext(letterCtx) : null
  const offerRaw = split.offerTitle?.trim() || input.defaultOfferTitle
  const offerTitle = sv
    ? (
        hasSavedLetter && offerRaw.startsWith('<')
          ? restoreOfferSejourFluoInHtml(syncOfferSejourInHtml(offerRaw, sv.sejourLine, sv.typeChambre))
          : (
              looksLikeOfferDescHtml(offerRaw) && offerRaw.startsWith('<')
                ? restoreOfferSejourFluoInHtml(syncOfferSejourInHtml(offerRaw, sv.sejourLine, sv.typeChambre))
                : buildOfferDescEditorHtml(offerRaw, sv.sejourLine, sv.typeChambre)
            )
      )
    : offerRaw
  const botPrepared = refreshSalmonFieldLabelsInTopHtml(
    replaceDevisAmountPlaceholders(botRaw, input.lignesTotal, tndPerEur),
  )
  return {
    topHtml: restoreDevisCanonicalColorsInTopHtml(italicizeDevisLetterIntroHtml(topRaw)),
    botHtml: hasSavedBot
      ? botPrepared
      : prepareDevisHtmlForEditor(botPrepared),
    offerTitle,
    offerTotal: syncOfferTotalDisplay(split.offerTotal?.trim() || input.defaultOfferTotal, input.lignesTotal),
    offerTotalManual: false,
    offerSubtitle: split.offerSubtitle?.trim() || input.defaultOfferSubtitle || '',
    offerHeadDesc: split.offerHeadDesc?.trim() || input.defaultOfferHeadDesc || '',
    offerHeadPrice: split.offerHeadPrice?.trim() || input.defaultOfferHeadPrice || '',
  }
}

/**
 * Sauvegarde modal : conserve couleurs / espacements, met à jour tous les champs
 * (séjour, clinique, hôtel, inclus, total, phrase en lettres…).
 */
export function mergeDevisCustomContentOnModalSave(
  input: Parameters<typeof refreshDevisCustomContentParts>[0],
): string {
  return refreshDevisCustomContentParts({
    ...input,
    syncOfferTotalFromLignes: true,
    syncOfferTitleFromDevis: false,
    syncInclutExclut: input.syncInclutExclut !== false,
    preserveLegacyManualOfferTotal: false,
    preserveManualLayout: true,
    preserveManualDiagnostic: true,
  }).contentToSave
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n || 0))
}

function syncOfferTotalDisplay(stored: string | null | undefined, amount: number): string {
  const formatted = fmtNum(amount)
  const raw = stored?.trim() ?? ''
  if (!raw) return formatted
  if (!raw.startsWith('<')) return formatted
  const updated = raw.replace(/\d[\d\s\u00a0.]*/, formatted)
  return /\d/.test(updated) ? updated : `<p>${formatted}</p>`
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
  const saved = devisOfferSegmentPlainText(split.offerTotal) || split.offerTotal?.trim()
  if (!saved) return lignesTotal
  const resolved = resolveDevisOfferTotal(saved, lignesTotal)
  if (split.offerTotalManual || resolved.amount !== lignesTotal) {
    return resolved.amount
  }
  return lignesTotal
}

export function devisOfferSegmentPlainText(stored: string | null | undefined): string {
  const raw = stored?.trim() ?? ''
  if (!raw) return ''
  if (!raw.startsWith('<')) return raw
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
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
  /** true : ne pas compacter les paragraphes vides (réouverture éditeur). */
  preserveManualLayout?: boolean
  /**
   * true : garder le diagnostic déjà dans la lettre (personnalisation gestionnaire).
   * false : resynchroniser depuis le rapport lié.
   * Défaut : auto (conserver si corps diagnostic déjà enregistré).
   */
  preserveManualDiagnostic?: boolean
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
  const sv = sejourPdfFromContext(ctx)
  let offerTitle = syncTitle
    ? defaultOfferTitle
    : (split.offerTitle?.trim() || defaultOfferTitle)
  if (offerTitle?.trim()) {
    offerTitle = looksLikeOfferDescHtml(offerTitle) && offerTitle.trim().startsWith('<')
      ? syncOfferSejourInHtml(offerTitle, sv.sejourLine, sv.typeChambre)
      : buildOfferDescEditorHtml(offerTitle, sv.sejourLine, sv.typeChambre)
  }

  const syncTotal = input.syncOfferTotalFromLignes !== false
  const savedTotalRaw = split.offerTotal?.trim() || null
  const keepManualTotal =
    !syncTotal
    && (
      split.offerTotalManual
      || (
        input.preserveLegacyManualOfferTotal === true
        && isManualDevisOfferTotal(savedTotalRaw, total)
      )
    )
  const offerTotal = keepManualTotal
    ? (savedTotalRaw || fmtNum(total))
    : syncTotal
      ? syncOfferTotalDisplay(savedTotalRaw, total)
      : (savedTotalRaw || fmtNum(total))
  const letterTotal = resolveDevisOfferTotal(offerTotal, total).amount

  const preserveManualDiagnostic =
    input.preserveManualDiagnostic === true
    || (
      input.preserveManualDiagnostic !== false
      && hasDiagnosticBodyInTopHtml(split.topHtml)
    )

  if (!topHtml.trim()) topHtml = buildDevisLetterTopHtml(ctx)
  if (!botHtml.trim()) botHtml = buildDevisLetterBottomHtml(letterTotal, tndPerEur)
  topHtml = refreshDevisLetterTopHtml(topHtml, ctx, {
    syncInclutExclut: input.syncInclutExclut !== false,
    preserveManualLayout: input.preserveManualLayout === true,
    preserveManualDiagnostic,
  })
  topHtml = markDevisSpacerParagraphs(topHtml)
  botHtml = markDevisSpacerParagraphs(normalizeDevisBottomFluoInHtml(replaceDevisAmountPlaceholders(botHtml, letterTotal, tndPerEur)))
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
      {
        subtitle: split.offerSubtitle,
        headDesc: split.offerHeadDesc,
        headPrice: split.offerHeadPrice,
      },
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
    preserveManualDiagnostic: true,
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
  subtitleHtml?: string | null
  headDescHtml?: string | null
  headPriceHtml?: string | null
  /**
   * true : ne pas resynchroniser le HTML haut (export éditeur = WYSIWYG).
   * false (défaut) : resync clinique, durées, adultes… depuis le devis.
   */
  preserveTopHtml?: boolean
  /** true : conserver le HTML bas tel quel (export éditeur). */
  preserveBotHtml?: boolean
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
  let subtitleHtml = input.subtitleHtml?.trim() || null
  let headDescHtml = input.headDescHtml?.trim() || null
  let headPriceHtml = input.headPriceHtml?.trim() || null
  const applyOfferChrome = (split: ReturnType<typeof splitDevisCustomContent>) => {
    if (!offerTitle) offerTitle = split.offerTitle
    if (!offerTotal) offerTotal = split.offerTotal
    if (!subtitleHtml) subtitleHtml = split.offerSubtitle
    if (!headDescHtml) headDescHtml = split.offerHeadDesc
    if (!headPriceHtml) headPriceHtml = split.offerHeadPrice
  }
  if (!input.topHtml && !input.botHtml) {
    const split = splitDevisCustomContent(d.customContent)
    topHtml = split.topHtml
    botHtml = split.botHtml
    applyOfferChrome(split)
  } else if (d.customContent) {
    applyOfferChrome(splitDevisCustomContent(d.customContent))
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
  } else {
    topHtml = stripDiagnosticOpTitlesInTopHtml(topHtml)
  }
  topHtml = stripOfferMeilleureHeadingFromTopHtml(topHtml)
  if (/Offre de prix\s*:/i.test(topHtml)) {
    const inclutIdx = topHtml.search(/Votre devis inclut\s*:/i)
    const exclutIdx = topHtml.search(/Notre forfait exclut\s*:/i)
    const hasInclutList = inclutIdx >= 0 && /<ul\b/i.test(topHtml.slice(inclutIdx))
    const hasExclutList =
      exclutIdx >= 0 && (/<ul\b/i.test(topHtml.slice(exclutIdx)) || /<p\b[^>]*>\s*(?:<em\b[^>]*>)?\s*—/i.test(topHtml.slice(exclutIdx)))
    if (inclutIdx < 0 || exclutIdx < 0 || !hasInclutList || !hasExclutList) {
      topHtml = refreshOffreInclutExclutInTopHtml(topHtml, ctxForRefresh)
    }
  }
  topHtml = markDevisSpacerParagraphs(topHtml)
  if (input.preserveBotHtml === true) {
    botHtml = markDevisSpacerParagraphs(botHtml)
  } else {
    botHtml = markDevisSpacerParagraphs(normalizeDevisBottomFluoInHtml(replaceDevisAmountPlaceholders(botHtml, letterTotal.amount, tndPerEur)))
  }

  const operationTitle =
    offerTitle?.trim()
    || lignes.find((l) => l.description?.trim())?.description.trim()
    || 'Séjour médical personnalisé'
  const sejourPdf = sejourPdfFromContext(ctxForRefresh)
  const tableHtml =
    lignes.length > 0
      ? buildDevisOfferBlockHtml({
          operationTitle,
          sejourLine: sejourPdf.sejourLine,
          typeChambre: sejourPdf.typeChambre,
          totalFormatted: letterTotal.display,
          subtitleHtml,
          headDescHtml,
          headPriceHtml,
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
  subtitleHtml?: string | null
  headDescHtml?: string | null
  headPriceHtml?: string | null
  tndPerEur?: number
  /** Export éditeur : conserver le HTML haut tel quel (inclut/exclut modifiés à la main). */
  preserveTopHtml?: boolean
  preserveBotHtml?: boolean
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
    subtitleHtml: input.subtitleHtml,
    headDescHtml: input.headDescHtml,
    headPriceHtml: input.headPriceHtml,
    tndPerEur: input.tndPerEur,
    preserveTopHtml: input.preserveTopHtml === true,
    preserveBotHtml: input.preserveBotHtml === true,
    syncInclutExclut: input.syncInclutExclut,
  })
}
