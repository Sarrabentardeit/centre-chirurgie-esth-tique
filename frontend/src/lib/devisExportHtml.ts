import type { Devis } from '@/lib/api'
import {
  DEVIS_LOGO_SRC,
  buildDevisDocumentEndHtml,
  buildDevisHeaderLogoHtml,
  buildDevisHeaderRightHtml,
} from '@/lib/devisBranding'
import { buildDevisOfferBlockHtml, buildDevisPrintStyles } from '@/lib/devisCharte'
import { parseSejourMeta } from '@/lib/devisSejourNotes'
import { replaceDevisAmountPlaceholders, DEFAULT_TND_PER_EUR } from '@/lib/moneyWords'
import { formatDevisListName, getDevisDisplayNumber } from '@/lib/utils'

const CONTENT_BREAK = '|||EDITOR_BREAK|||'

function fmtNum(n: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n || 0))
}

function sejourLineFromDevis(d: Devis): string {
  const sej = parseSejourMeta(d.notesSejour)
  const nClin = Number.parseInt((sej.cliniqueNuits || '').trim(), 10)
  const nHotel = Number.parseInt((sej.hotelNuits || '').trim(), 10)
  const totalNights =
    (Number.isFinite(nClin) ? Math.max(0, nClin) : 0) +
    (Number.isFinite(nHotel) ? Math.max(0, nHotel) : 0)
  if (totalNights <= 0) return ''
  const jours = totalNights
  return `Séjour ${jours} jour${jours > 1 ? 's' : ''} (${totalNights} nuit${totalNights > 1 ? 's' : ''})`
}

/**
 * HTML PDF devis — même structure que l’export gestionnaire / envoi chat.
 */
export function buildDevisExportHtml(input: {
  devis: Devis
  dossierNumber: string
  patientFullName: string
  origin?: string
  tndPerEur?: number
}): string {
  const { devis: d, dossierNumber, patientFullName } = input
  const origin = input.origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const tndPerEur = input.tndPerEur ?? DEFAULT_TND_PER_EUR

  const lignes = Array.isArray(d.lignes) ? d.lignes : []
  const total = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)
  const headerRef = getDevisDisplayNumber(d, dossierNumber) || dossierNumber
  const pdfTitle = formatDevisListName(headerRef || dossierNumber, patientFullName, d.version)

  const raw = d.customContent?.trim() ?? ''
  let topHtml = ''
  let botHtml = ''
  if (raw) {
    if (raw.includes(CONTENT_BREAK)) {
      const [t, b] = raw.split(CONTENT_BREAK)
      topHtml = t ?? ''
      botHtml = b ?? ''
    } else {
      topHtml = raw
    }
  }
  botHtml = replaceDevisAmountPlaceholders(botHtml, total, tndPerEur)

  const operationTitle =
    lignes.find((l) => l.description?.trim())?.description.trim() || 'Séjour médical personnalisé'
  const sejourLine = sejourLineFromDevis(d)
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
          ${buildDevisHeaderRightHtml(headerRef)}
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
