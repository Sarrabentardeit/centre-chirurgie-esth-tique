import jsPDF from 'jspdf'
import type { Devis, Patient } from '@/types'
import type { CurrencyUnit } from '@/lib/utils'
import { formatDate, formatCurrency } from '@/lib/utils'

type DownloadPdfFromTextParams = {
  title?: string
  filename: string
  lines: string[]
  subtitle?: string
}

export function downloadPdfFromText(params: DownloadPdfFromTextParams) {
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
  })

  const marginLeft = 15
  const pageWidth = 210
  const usableWidth = pageWidth - marginLeft * 2

  let y = 18
  if (params.title) {
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(params.title, marginLeft, y)
    y += 8
    doc.setFont('helvetica', 'normal')
  }

  if (params.subtitle) {
    doc.setFontSize(11)
    doc.setTextColor(80)
    doc.text(params.subtitle, marginLeft, y)
    doc.setTextColor(0)
    y += 6
  }

  doc.setFontSize(11)

  const pushWrappedLine = (line: string) => {
    const wrapped = doc.splitTextToSize(line, usableWidth)
    for (const w of wrapped) {
      doc.text(String(w), marginLeft, y)
      y += 6
      // A4 height: ~297mm. On laisse une marge bas.
      if (y > 275) {
        doc.addPage()
        y = 18
      }
    }
  }

  const lines = params.lines
  if (lines.length === 0) lines.push('—')

  for (const line of lines) {
    if (line.trim().length === 0) {
      y += 4
      if (y > 275) {
        doc.addPage()
        y = 18
      }
      continue
    }
    if (y > 275) {
      doc.addPage()
      y = 18
    }
    pushWrappedLine(line)
  }

  doc.save(params.filename)
}

type DownloadDevisPdfParams = {
  devis: Devis
  patient: Patient
  currency: CurrencyUnit
  filename: string
}

function splitLinesForTable(doc: jsPDF, text: string, maxWidth: number) {
  return doc.splitTextToSize(text, maxWidth).map((x: unknown) => String(x))
}

export function downloadDevisPdf(params: DownloadDevisPdfParams) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const marginLeft = 15
  const pageWidth = 210
  const usableWidth = pageWidth - marginLeft * 2
  const col1 = 98
  const col2 = 24
  const col3 = 29

  let y = 18

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Devis médical', marginLeft, y)
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(80)
  doc.text(`Patient: ${params.patient.prenom} ${params.patient.nom}`, marginLeft, y)
  y += 6
  doc.setTextColor(0)

  const drawSeparator = () => {
    doc.setDrawColor(220)
    doc.line(marginLeft, y + 2, marginLeft + usableWidth, y + 2)
  }

  drawSeparator()
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.text(`Créé le: ${formatDate(params.devis.dateCreation)}`, marginLeft, y)
  doc.text(`Valable jusqu'au: ${formatDate(params.devis.dateValidite)}`, marginLeft + 85, y)
  doc.setFont('helvetica', 'normal')
  y += 12

  // Header table
  doc.setFont('helvetica', 'bold')
  doc.text('Prestation', marginLeft, y)
  doc.text('Qté', marginLeft + col1 + 2, y)
  doc.text('P.U.', marginLeft + col1 + col2 + 2, y)
  doc.text('Total', marginLeft + col1 + col2 + col3 + 2, y)
  doc.setFont('helvetica', 'normal')

  y += 2
  drawSeparator()
  y += 6

  const lineHeight = 6

  for (const ligne of params.devis.lignes) {
    const descLines = splitLinesForTable(doc, ligne.description, col1)
    const qty = String(ligne.quantite)
    const puText = ligne.prixUnitaire === 0 ? 'Inclus' : formatCurrency(ligne.prixUnitaire, params.currency)
    const totalText = ligne.total === 0 ? 'Offert' : formatCurrency(ligne.total, params.currency)

    const rowLines = Math.max(descLines.length, 1)
    const rowHeight = rowLines * lineHeight

    if (y + rowHeight > 275) {
      doc.addPage()
      y = 18
    }

    // Description
    for (let i = 0; i < descLines.length; i++) {
      doc.text(descLines[i], marginLeft, y + i * lineHeight)
    }

    // Numeric columns (sur la première ligne)
    doc.text(qty, marginLeft + col1 + 2, y)
    doc.text(puText, marginLeft + col1 + col2 + 2, y)
    doc.text(totalText, marginLeft + col1 + col2 + col3 + 2, y)

    y += rowHeight
  }

  drawSeparator()
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Total estimatif', marginLeft, y)
  doc.text(formatCurrency(params.devis.total, params.currency), marginLeft + usableWidth, y, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  y += 10

  if (params.devis.planningMedical) {
    doc.setFont('helvetica', 'bold')
    doc.text('Planning médical', marginLeft, y)
    doc.setFont('helvetica', 'normal')
    y += 4
    const planningLines = splitLinesForTable(doc, params.devis.planningMedical, usableWidth)
    for (const l of planningLines) {
      if (y > 275) {
        doc.addPage()
        y = 18
      }
      doc.text(l, marginLeft, y)
      y += 6
    }
  }

  if (params.devis.notesSejour) {
    y += 4
    doc.setFont('helvetica', 'bold')
    doc.text('Informations séjour', marginLeft, y)
    doc.setFont('helvetica', 'normal')
    y += 4
    const noteLines = splitLinesForTable(doc, params.devis.notesSejour, usableWidth)
    for (const l of noteLines) {
      if (y > 275) {
        doc.addPage()
        y = 18
      }
      doc.text(l, marginLeft, y)
      y += 6
    }
  }

  doc.save(params.filename)
}

type DownloadRapportPdfParams = {
  patient: Patient
  medecinName: string
  diagnostic: string
  interventions: string
  valeur: string
  notes: string
  filename: string
}

export function downloadRapportPdf(params: DownloadRapportPdfParams) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const marginLeft = 15
  const pageWidth = 210
  const usableWidth = pageWidth - marginLeft * 2

  let y = 18

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Rapport médical', marginLeft, y)
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(80)
  doc.text(`Patient: ${params.patient.prenom} ${params.patient.nom}`, marginLeft, y)
  y += 6
  doc.text(`Médecin: ${params.medecinName}`, marginLeft, y)
  y += 6
  doc.text(`Date: ${formatDate(new Date().toISOString())}`, marginLeft, y)
  doc.setTextColor(0)
  y += 8

  const drawSeparator = () => {
    doc.setDrawColor(220)
    doc.line(marginLeft, y + 2, marginLeft + usableWidth, y + 2)
  }

  drawSeparator()
  y += 10

  const section = (title: string, body: string) => {
    doc.setFont('helvetica', 'bold')
    doc.text(title, marginLeft, y)
    doc.setFont('helvetica', 'normal')
    y += 4

    const lines = body.trim().length ? doc.splitTextToSize(body, usableWidth) : ['—']
    for (const l of lines) {
      doc.text(String(l), marginLeft, y)
      y += 6
      if (y > 275) {
        doc.addPage()
        y = 18
      }
    }
    y += 4
  }

  section('Diagnostic', params.diagnostic)
  section('Interventions recommandées', params.interventions)
  section('Valorisation médicale (pour le devis)', params.valeur)
  section('Notes complémentaires', params.notes)

  doc.save(params.filename)
}


