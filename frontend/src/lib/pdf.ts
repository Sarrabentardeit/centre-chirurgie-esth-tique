import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import type { Devis } from '@/lib/api'
import type { Patient } from '@/types'
import type { CurrencyUnit } from '@/lib/utils'
import { formatDate, formatCurrency } from '@/lib/utils'
import { formatDevisSejourNotesForDisplay } from '@/lib/devisSejourNotes'

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
  patient: { nom: string; prenom: string }
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
  doc.text(`Valable jusqu'au: ${params.devis.dateValidite ? formatDate(params.devis.dateValidite) : '—'}`, marginLeft + 85, y)
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
    const noteLines = splitLinesForTable(
      doc,
      formatDevisSejourNotesForDisplay(params.devis.notesSejour),
      usableWidth
    )
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

/** Same as `downloadDevisPdf` but returns a Blob instead of triggering a browser download. */
export function devisPdfAsBlob(params: DownloadDevisPdfParams): Blob {
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
  doc.text(`Valable jusqu'au: ${params.devis.dateValidite ? formatDate(params.devis.dateValidite) : '—'}`, marginLeft + 85, y)
  doc.setFont('helvetica', 'normal')
  y += 12

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Désignation', marginLeft, y)
  doc.text('Qté', marginLeft + col1 + 4, y, { align: 'right' })
  doc.text('P.U.', marginLeft + col1 + col2 + 4, y, { align: 'right' })
  doc.text('Total', marginLeft + col1 + col2 + col3 + 4, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  y += 2
  drawSeparator()
  y += 8

  for (const ligne of params.devis.lignes) {
    if (ligne.quantite === 0 && ligne.prixUnitaire === 0) continue
    const lines = splitLinesForTable(doc, ligne.description, col1 - 4)
    const total = ligne.quantite * ligne.prixUnitaire
    doc.text(lines, marginLeft, y)
    doc.text(String(ligne.quantite), marginLeft + col1 + 4, y, { align: 'right' })
    doc.text(formatCurrency(ligne.prixUnitaire, params.currency), marginLeft + col1 + col2 + 4, y, { align: 'right' })
    doc.text(formatCurrency(total, params.currency), marginLeft + col1 + col2 + col3 + 4, y, { align: 'right' })
    y += lines.length * 6 + 2
    if (y > 270) { doc.addPage(); y = 18 }
  }

  drawSeparator()
  y += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Total', marginLeft, y)
  doc.text(formatCurrency(params.devis.total, params.currency), marginLeft + usableWidth, y, { align: 'right' })
  y += 10

  if (params.devis.planningMedical) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Planning médical', marginLeft, y)
    y += 7
    doc.setFont('helvetica', 'normal')
    const planningLines = splitLinesForTable(doc, params.devis.planningMedical, usableWidth)
    for (const l of planningLines) {
      if (y > 270) { doc.addPage(); y = 18 }
      doc.text(l, marginLeft, y)
      y += 6
    }
  }

  if (params.devis.notesSejour) {
    y += 4
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Détails du séjour', marginLeft, y)
    y += 7
    doc.setFont('helvetica', 'normal')
    const sejourLines = splitLinesForTable(
      doc,
      formatDevisSejourNotesForDisplay(params.devis.notesSejour),
      usableWidth,
    )
    for (const l of sejourLines) {
      if (y > 270) { doc.addPage(); y = 18 }
      doc.text(l, marginLeft, y)
      y += 6
    }
  }

  return new Blob([doc.output('arraybuffer')], { type: 'application/pdf' })
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

/**
 * Convertit les src d'images (logo, signature…) en data-URL pour un rendu PDF hors navigateur.
 */
export async function inlineHtmlImages(html: string): Promise<string> {
  const urls = new Set<string>()
  const re = /\bsrc=["']([^"']+)["']/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const src = match[1]
    if (src && !src.startsWith('data:')) urls.add(src)
  }

  const replacements = new Map<string, string>()
  await Promise.all(
    [...urls].map(async (src) => {
      try {
        const abs = /^https?:\/\//i.test(src) ? src : `${window.location.origin}${src.startsWith('/') ? '' : '/'}${src}`
        const res = await fetch(abs)
        if (!res.ok) return
        const blob = await res.blob()
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(blob)
        })
        replacements.set(src, dataUrl)
      } catch {
        /* garder l'URL d'origine */
      }
    }),
  )

  let out = html
  for (const [src, dataUrl] of replacements) {
    out = out.split(`src="${src}"`).join(`src="${dataUrl}"`)
    out = out.split(`src='${src}'`).join(`src='${dataUrl}'`)
  }
  return out
}

/**
 * Génère un PDF blob depuis un HTML complet (personnalisation devis).
 * Préférer le rendu serveur Chromium (sendDevis html) pour un rendu identique à l'export.
 */
export function htmlToPdfBlob(fullHtml: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // Iframe off-screen : le HTML bénéficie de son propre document et de ses styles
    const iframe = document.createElement('iframe')
    iframe.style.cssText =
      'position:fixed;top:0;left:-9999px;width:794px;height:1122px;border:0;opacity:0;pointer-events:none;'
    document.body.appendChild(iframe)

    const cleanup = () => {
      try { document.body.removeChild(iframe) } catch { /* déjà supprimé */ }
    }

    iframe.onload = async () => {
      try {
        const iDoc = iframe.contentDocument!

        // Attendre le chargement de toutes les images
        const imgs = Array.from(iDoc.querySelectorAll('img'))
        await Promise.all(
          imgs.map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((res) => {
                  img.onload  = () => res()
                  img.onerror = () => res()
                }),
          ),
        )

        // Laisser le navigateur finaliser le rendu CSS
        await new Promise((res) => setTimeout(res, 400))

        // Adapter la hauteur de l'iframe au contenu réel
        const scrollH = iDoc.documentElement.scrollHeight || iDoc.body.scrollHeight || 1122
        iframe.style.height = `${scrollH}px`
        await new Promise((res) => setTimeout(res, 100))

        const canvas = await html2canvas(iDoc.body, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          logging: false,
          backgroundColor: '#ffffff',
          width:        794,
          height:       scrollH,
          windowWidth:  794,
          windowHeight: scrollH,
        })

        if (canvas.width === 0 || canvas.height === 0) {
          throw new Error('html2canvas a rendu un canvas vide (0×0)')
        }

        const A4_W   = 210
        const A4_H   = 297
        const MARGIN = 10
        const usableW = A4_W - 2 * MARGIN
        const usableH = A4_H - 2 * MARGIN
        const totalImgH = (canvas.height / canvas.width) * usableW

        const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
        let remainingH = totalImgH
        let srcYPx    = 0
        let firstPage = true

        while (remainingH > 0) {
          if (!firstPage) pdf.addPage()
          firstPage = false

          const pageH   = Math.min(usableH, remainingH)
          const pageHPx = Math.round((pageH / totalImgH) * canvas.height)

          const slice = document.createElement('canvas')
          slice.width  = canvas.width
          slice.height = Math.max(1, pageHPx)
          slice.getContext('2d')?.drawImage(
            canvas,
            0, srcYPx, canvas.width, pageHPx,
            0, 0,      canvas.width, pageHPx,
          )
          pdf.addImage(slice.toDataURL('image/jpeg', 0.90), 'JPEG', MARGIN, MARGIN, usableW, pageH)

          srcYPx    += pageHPx
          remainingH -= pageH
        }

        cleanup()
        resolve(new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' }))
      } catch (err) {
        cleanup()
        reject(err)
      }
    }

    iframe.onerror = () => { cleanup(); reject(new Error('Échec du chargement de l\'iframe')) }

    // Injecter le HTML via srcdoc (même origine → html2canvas fonctionne)
    iframe.srcdoc = fullHtml
  })
}
