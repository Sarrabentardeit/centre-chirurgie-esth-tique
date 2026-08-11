import type { Devis } from '@/lib/api'
import {
  DEVIS_LOGO_SRC,
  buildDevisDocumentEndHtml,
  buildDevisHeaderLogoHtml,
} from '@/lib/devisBranding'
import { buildDevisOfferBlockHtml, buildDevisPrintStyles } from '@/lib/devisCharte'
import {
  buildDevisLetterBottomHtml,
  buildDevisLetterTopHtml,
  letterContextFromGestionnairePatient,
  refreshDevisLetterTopHtml,
  sejourPdfFromContext,
  type DevisLetterContext,
} from '@/lib/devisLetterHtml'
import { replaceDevisAmountPlaceholders, DEFAULT_TND_PER_EUR } from '@/lib/moneyWords'
import { formatDevisListName, getDevisDisplayNumber } from '@/lib/utils'

export const DEVIS_CONTENT_BREAK = '|||EDITOR_BREAK|||'

function fmtNum(n: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n || 0))
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
}): { topHtml: string; botHtml: string; contentToSave: string } {
  const tndPerEur = input.tndPerEur ?? DEFAULT_TND_PER_EUR
  const total = (input.devis.lignes ?? []).reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)
  const raw = input.customContent?.trim() ?? ''
  let topHtml = ''
  let botHtml = ''
  if (raw.includes(DEVIS_CONTENT_BREAK)) {
    const [t, b] = raw.split(DEVIS_CONTENT_BREAK)
    topHtml = t ?? ''
    botHtml = b ?? ''
  } else if (raw) {
    topHtml = raw
  }

  const ctx: DevisLetterContext = {
    ...input.letterContext,
    activeDevis: input.devis,
  }
  if (!topHtml.trim()) topHtml = buildDevisLetterTopHtml(ctx)
  if (!botHtml.trim()) botHtml = buildDevisLetterBottomHtml(total, tndPerEur)
  topHtml = refreshDevisLetterTopHtml(topHtml, ctx)
  botHtml = replaceDevisAmountPlaceholders(botHtml, total, tndPerEur)
  return {
    topHtml,
    botHtml,
    contentToSave: `${topHtml}${DEVIS_CONTENT_BREAK}${botHtml}`,
  }
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
  if (!input.topHtml && !input.botHtml) {
    const raw = d.customContent?.trim() ?? ''
    if (raw) {
      if (raw.includes(DEVIS_CONTENT_BREAK)) {
        const [t, b] = raw.split(DEVIS_CONTENT_BREAK)
        topHtml = t ?? ''
        botHtml = b ?? ''
      } else {
        topHtml = raw
      }
    }
  }

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
    botHtml = buildDevisLetterBottomHtml(total, tndPerEur)
  }
  topHtml = refreshDevisLetterTopHtml(topHtml, ctxForRefresh)
  botHtml = replaceDevisAmountPlaceholders(botHtml, total, tndPerEur)

  const operationTitle =
    lignes.find((l) => l.description?.trim())?.description.trim() || 'Séjour médical personnalisé'
  const sejourLine = sejourPdfFromContext(ctxForRefresh).sejourLine
  const tableHtml =
    lignes.length > 0
      ? buildDevisOfferBlockHtml({
          operationTitle,
          sejourLine,
          totalFormatted: fmtNum(total),
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
  tndPerEur?: number
}): string {
  const letterContext = letterContextFromGestionnairePatient(input.patient, input.devis)
  return buildDevisExportHtml({
    devis: input.devis,
    dossierNumber: input.patient.dossierNumber,
    patientFullName: input.patient.user.fullName,
    letterContext,
    topHtml: input.topHtml,
    botHtml: input.botHtml,
    tndPerEur: input.tndPerEur,
  })
}
