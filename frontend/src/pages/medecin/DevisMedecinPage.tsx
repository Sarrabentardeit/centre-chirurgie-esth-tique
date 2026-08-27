import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Search, FileCheck, ChevronRight, Printer, RefreshCw,
  CheckCircle2, XCircle, Clock, X,
  Calendar, Eye, EyeOff, FileText,
} from 'lucide-react'
import { medecinApi, type DevisWithPatient, type DevisLigne } from '@/lib/api'
import { formatDevisPdfFileName, formatDevisTitle, getDevisDisplayNumber, cn } from '@/lib/utils'
import { DEVIS_OFFER_PREVIEW_CSS, buildDevisOfferBlockHtml } from '@/lib/devisCharte'
import {
  buildDevisExportHtml,
  refreshDevisCustomContentParts,
  resolveDevisOfferTotal,
  splitDevisCustomContent,
} from '@/lib/devisExportHtml'
import { sejourPdfFromContext } from '@/lib/devisLetterHtml'
import { parseSejourMeta, nbAdultesDevisFromAccompagnants } from '@/lib/devisSejourNotes'
import { inlineHtmlImages } from '@/lib/pdf'
import { StatusBadge } from '@/lib/statusUi'
import { EmptyState } from '@/components/EmptyState'
import { KpiStrip } from '@/components/PageHeader'
import { toast } from '@/store/toastStore'
import { PullToRefresh } from '@/components/PullToRefresh'
import { LIST_PAGE_SIZE, PaginationBar, paginateSlice } from '@/components/PaginationBar'
import { cachedFetch, hasCachedData } from '@/lib/cachedFetch'
import { queryKeys } from '@/lib/queryKeys'

/* ── Helpers ──────────────────────────────────────────────────────────────── */
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })

const fmtNum = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtAmount = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

function sejourLineFromDevis(d: DevisWithPatient) {
  return sejourPdfFromContext({
    dossierNumber: d.patient.dossierNumber,
    activeDevis: d,
  }).sejourLine
}

function letterParts(dv: DevisWithPatient) {
  return refreshDevisCustomContentParts({
    customContent: dv.customContent,
    devis: dv,
    letterContext: {
      dossierNumber: dv.patient.dossierNumber,
      activeDevis: dv,
      patient: { fullName: dv.patient.fullName },
    },
  })
}

/* ── Statut config ────────────────────────────────────────────────────────── */
type Statut = 'envoye' | 'accepte' | 'refuse'

const STATUT: Record<Statut, { label: string; bg: string; text: string; dot: string; Icon: React.ElementType }> = {
  envoye:  { label: 'Envoyé',  bg: 'bg-blue-50',  text: 'text-blue-700',  dot: 'bg-blue-400',  Icon: Clock },
  accepte: { label: 'Accepté', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400', Icon: CheckCircle2 },
  refuse:  { label: 'Refusé',  bg: 'bg-red-50',   text: 'text-red-700',   dot: 'bg-red-400',   Icon: XCircle },
}

function Badge({ statut }: { statut: string }) {
  return <StatusBadge kind="devis" value={statut} />
}

/* ── PDF — même moteur Chromium que gestionnaire / patient / chat ─────────── */
async function exportPdf(dv: DevisWithPatient) {
  try {
    const { topHtml, botHtml, offerTitle, offerTotal } = letterParts(dv)
    const html = await inlineHtmlImages(
      buildDevisExportHtml({
        devis: dv,
        dossierNumber: dv.patient.dossierNumber,
        patientFullName: dv.patient.fullName,
        topHtml,
        botHtml,
        operationTitle: offerTitle,
        operationTotal: offerTotal,
      }),
    )
    const blob = await medecinApi.renderDevisPdf(html)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = formatDevisPdfFileName(
      getDevisDisplayNumber(dv, dv.patient.dossierNumber) || dv.patient.dossierNumber,
      dv.patient.fullName,
      dv.version,
    )
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (e) {
    toast({
      title: 'Export PDF impossible',
      description: e instanceof Error ? e.message : undefined,
      variant: 'error',
    })
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   HEADER + KPI (bandeau compact)
══════════════════════════════════════════════════════════════════════════ */
function PageHeader({ list }: { list: DevisWithPatient[] }) {
  const total   = list.length
  const accepte = list.filter((d) => d.statut === 'accepte').length
  const envoye  = list.filter((d) => d.statut === 'envoye').length
  const montant = list.reduce((s, d) => s + d.total, 0)
  const taux    = total ? Math.round((accepte / total) * 100) : 0

  return (
    <div className="shrink-0 border-b border-border bg-white">
      <div className="px-4 sm:px-5 pt-4 pb-4 flex flex-col gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Espace médecin</p>
          <h1 className="font-display text-2xl font-semibold text-brand-950 tracking-tight">Devis envoyés</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Consultez, suivez et exportez les devis patients.</p>
        </div>
        <KpiStrip
          items={[
            { key: 't', label: 'Envoyés', value: total, tone: 'sky' },
            { key: 'e', label: 'En attente', value: envoye, tone: 'amber' },
            { key: 'a', label: 'Acceptés', value: accepte, tone: 'emerald' },
            { key: 'x', label: 'Taux', value: `${taux}%`, tone: 'teal' },
            { key: 'v', label: 'Volume TND', value: fmtAmount(montant), tone: 'violet' },
          ]}
        />
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   DEVIS ROW (liste pleine largeur)
══════════════════════════════════════════════════════════════════════════ */
function DevisRow({ dv, onClick }: { dv: DevisWithPatient; onClick: () => void }) {
  const ref = getDevisDisplayNumber(dv, dv.patient.dossierNumber) || dv.patient.dossierNumber

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left px-4 sm:px-5 py-3.5 border-b border-border/50 hover:bg-[#fdeada]/25 transition-colors"
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="h-10 w-10 rounded-full bg-slate-100 text-slate-600 group-hover:bg-[#81572d] group-hover:text-white flex items-center justify-center text-xs font-bold shrink-0 transition-colors">
          {initials(dv.patient.fullName)}
        </div>

        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-1 sm:gap-4 sm:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <p className="text-sm font-semibold text-foreground truncate">{dv.patient.fullName}</p>
              <Badge statut={dv.statut} />
            </div>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">{ref}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {fmtDate(dv.dateCreation)}
            </span>
            {dv.vuParPatientAt ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                <Eye className="h-3 w-3" /> Consulté
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-slate-400">
                <EyeOff className="h-3 w-3" /> Non vu
              </span>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3">
            <p className="text-sm font-bold tabular-nums text-foreground">
              {fmtAmount(dv.total)}
              <span className="ml-1 text-[10px] font-semibold text-muted-foreground">TND</span>
            </p>
            {/* Toujours visible sur mobile (pas de hover) ; hover sur desktop */}
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#81572d] sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              Voir
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   MODAL VISUALISATION
══════════════════════════════════════════════════════════════════════════ */
function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2.5">
      {children}
    </h3>
  )
}

function DetailModal({ dv, onClose }: { dv: DevisWithPatient; onClose: () => void }) {
  const lignes = (dv.lignes ?? []) as DevisLigne[]
  const ref = getDevisDisplayNumber(dv, dv.patient.dossierNumber) || dv.patient.dossierNumber
  const title = formatDevisTitle(dv, dv.patient.dossierNumber)
  const sej = parseSejourMeta(dv.notesSejour)
  const nbAdultesDevis = nbAdultesDevisFromAccompagnants(sej.nbAdultes || '0')
  const hasSej = !!(sej.cliniqueNom || sej.cliniqueNuits || sej.hotelNom || sej.hotelNuits)
  const sejourLine = sejourLineFromDevis(dv)

  const raw = dv.customContent ?? ''
  const split = splitDevisCustomContent(raw)
  const botHtml = split.botHtml.trim()
  const { topHtml, offerTitle, offerTotal } = letterParts(dv)
  const hasContent = !!raw.trim()
  const offerDescription =
    offerTitle?.trim()
    || split.offerTitle?.trim()
    || lignes.find((l) => l.description?.trim())?.description.trim()
    || 'Séjour médical personnalisé'
  const offerTotalDisplay = resolveDevisOfferTotal(
    offerTotal ?? split.offerTotal,
    dv.total,
  ).display
  const cfg = STATUT[dv.statut as Statut]

  const startY = useRef(0)
  const dragY = useRef(0)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const sejourRows = [
    { label: 'Clinique', value: sej.cliniqueNom },
    { label: 'Nuits clinique', value: sej.cliniqueNuits },
    { label: 'Hôtel', value: sej.hotelNom },
    { label: 'Nuits hôtel', value: sej.hotelNuits },
    { label: 'Durée totale', value: sej.dureeSejourTotale ? `${sej.dureeSejourTotale} nuit(s)` : '' },
    {
      label: 'Adultes',
      value: [
        sej.nbAdultes !== '' ? `${nbAdultesDevis} adulte${Number(nbAdultesDevis) > 1 ? 's' : ''}` : '',
        sej.nbEnfants ? `${sej.nbEnfants} enfant${Number(sej.nbEnfants) > 1 ? 's' : ''}` : '',
      ].filter(Boolean).join(', '),
    },
  ].filter((row) => row.value)

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <style>{DEVIS_OFFER_PREVIEW_CSS}</style>
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="devis-modal-title"
        className="relative z-10 flex flex-col w-full sm:max-w-3xl lg:max-w-4xl
          max-h-[min(90dvh,90vh)]
          bg-white rounded-2xl shadow-2xl border border-border overflow-hidden"
        style={{
          transform: offset ? `translateY(${offset}px)` : undefined,
          transition: dragging ? 'none' : 'transform 0.22s ease-out',
        }}
      >
        {/* Handle swipe-to-dismiss (mobile) */}
        <div
          className="sm:hidden touch-none flex justify-center pt-2 pb-1"
          onTouchStart={(e) => {
            startY.current = e.touches[0]?.clientY ?? 0
            dragY.current = 0
            setDragging(true)
          }}
          onTouchMove={(e) => {
            const y = e.touches[0]?.clientY ?? 0
            const delta = Math.max(0, y - startY.current)
            dragY.current = delta
            setOffset(delta)
          }}
          onTouchEnd={() => {
            setDragging(false)
            if (dragY.current > 96) onClose()
            setOffset(0)
          }}
          onTouchCancel={() => {
            setDragging(false)
            setOffset(0)
          }}
        >
          <div className="h-1 w-10 rounded-full bg-brand-200" />
        </div>
        {/* Header */}
        <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-border bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="devis-modal-title" className="text-base sm:text-lg font-bold text-foreground truncate">
                  {title}
                </h2>
                <Badge statut={dv.statut} />
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {dv.patient.fullName}
                <span className="mx-1.5 opacity-40">·</span>
                <span className="font-mono">{ref}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void exportPdf(dv)}
                className="inline-flex items-center gap-1.5 h-9 min-h-9 px-3 rounded-lg bg-[#81572d] text-white text-xs font-semibold hover:bg-[#6d4926] transition-colors"
              >
                <Printer className="h-3.5 w-3.5" />
                PDF
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Synthèse */}
          <div className={cn('px-4 sm:px-6 py-4 border-b border-border', cfg?.bg ?? 'bg-slate-50')}>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Montant total</p>
                <p className="text-2xl font-extrabold text-foreground tracking-tight tabular-nums">
                  {fmtNum(dv.total)} <span className="text-sm font-semibold text-muted-foreground">TND</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Envoyé le <span className="font-medium text-foreground">{fmtDate(dv.dateCreation)}</span>
                  {dv.vuParPatientAt && (
                    <> · Consulté le <span className="font-medium text-foreground">{fmtDate(dv.vuParPatientAt)}</span></>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {lignes.length > 0 && (
                  <span className="inline-flex items-center rounded-md bg-white/90 border border-border px-2.5 py-1 text-[11px] font-medium">
                    {lignes.length} ligne{lignes.length > 1 ? 's' : ''}
                  </span>
                )}
                {sejourLine && (
                  <span className="inline-flex items-center rounded-md bg-white/90 border border-border px-2.5 py-1 text-[11px] font-medium">
                    {sejourLine}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-6 py-5 space-y-6">
            {/* Facturation */}
            {lignes.length > 0 && (
              <section>
                <SectionTitle>Facturation</SectionTitle>
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[440px]">
                      <thead>
                        <tr className="bg-slate-50 text-[11px] text-muted-foreground">
                          <th className="px-3.5 py-2.5 text-left font-semibold">Description</th>
                          <th className="px-3.5 py-2.5 text-center font-semibold w-14">Qté</th>
                          <th className="px-3.5 py-2.5 text-right font-semibold w-24">P.U.</th>
                          <th className="px-3.5 py-2.5 text-right font-semibold w-28">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {lignes.map((l, i) => (
                          <tr key={i} className="bg-white">
                            <td className="px-3.5 py-2.5 font-medium text-foreground">{l.description}</td>
                            <td className="px-3.5 py-2.5 text-center text-muted-foreground">{l.quantite}</td>
                            <td className="px-3.5 py-2.5 text-right text-muted-foreground tabular-nums">{fmtNum(l.prixUnitaire)}</td>
                            <td className="px-3.5 py-2.5 text-right font-semibold tabular-nums">{fmtNum(l.quantite * l.prixUnitaire)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-[#fdeada]/60 border-t border-[#e4c8bd]">
                          <td colSpan={3} className="px-3.5 py-3 text-right font-bold">Total</td>
                          <td className="px-3.5 py-3 text-right font-extrabold text-[#81572d] tabular-nums">
                            {fmtNum(dv.total)} TND
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* Séjour */}
            {hasSej && (
              <section>
                <SectionTitle>Séjour</SectionTitle>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {sejourRows.map(({ label, value }) => (
                    <div key={label} className="rounded-lg border border-border bg-slate-50/60 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                      <p className="text-sm font-semibold text-foreground mt-0.5 break-words">{value}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Document */}
            <section>
              <SectionTitle>Document personnalisé</SectionTitle>
              {hasContent ? (
                <div className="rounded-xl border border-border overflow-hidden bg-[#f4f2ef]">
                  <div className="px-3.5 py-2.5 bg-white/80 border-b border-border flex items-center justify-between">
                    <p className="text-[11px] font-medium text-muted-foreground">Aperçu du devis PDF</p>
                    <button
                      type="button"
                      onClick={() => void exportPdf(dv)}
                      className="text-[11px] font-semibold text-[#81572d] hover:underline inline-flex items-center gap-1"
                    >
                      <Printer className="h-3 w-3" />
                      Exporter
                    </button>
                  </div>
                  <div className="p-3 sm:p-4">
                    <div className="rounded-lg bg-white border border-black/5 px-4 py-5 sm:px-6 sm:py-6 space-y-4 text-[13px] leading-[1.7] text-[#282727]
                      [&_.devis-heading]:my-2.5 [&_.devis-heading]:border-0 [&_.devis-heading]:bg-transparent
                      [&_.devis-heading]:px-0 [&_.devis-heading]:py-0 [&_.devis-heading]:text-[#81572d] [&_.devis-heading]:font-bold
                      [&_p]:my-0 [&_p]:mb-2
                      [&_ol]:my-2 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:marker:text-[#282727]
                      [&_ul]:my-0 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5
                      [&_li]:mb-1.5
                      [&_mark]:rounded-sm [&_mark]:px-0.5">
                      {topHtml && <div dangerouslySetInnerHTML={{ __html: topHtml }} />}
                      {lignes.length > 0 && (
                        <div
                          className="doc-offer-preview"
                          dangerouslySetInnerHTML={{
                            __html: buildDevisOfferBlockHtml({
                              operationTitle: offerDescription,
                              sejourLine,
                              totalFormatted: offerTotalDisplay,
                            }),
                          }}
                        />
                      )}
                      {botHtml && (
                        <div className="border-t border-[#e4c8bd] pt-3" dangerouslySetInnerHTML={{ __html: botHtml }} />
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-slate-50 py-8 text-center px-4">
                  <FileText className="mx-auto h-8 w-8 text-muted-foreground/35 mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">Aucun contenu personnalisé</p>
                  <p className="text-xs text-muted-foreground/70 mt-1 mb-3">
                    Le gestionnaire n’a pas encore rédigé ce document.
                  </p>
                  <button
                    type="button"
                    onClick={() => void exportPdf(dv)}
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#81572d] text-white text-xs font-semibold"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Exporter PDF
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Footer sticky — safe-area iPhone / Android gesture bar */}
        <div className="shrink-0 border-t border-border bg-white px-4 sm:px-6 pt-3 flex items-center justify-between gap-3 pb-safe">
          <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
            {dv.patient.fullName} · {ref}
          </p>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none h-11 sm:h-10 px-4 rounded-lg border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              Fermer
            </button>
            <button
              type="button"
              onClick={() => void exportPdf(dv)}
              className="flex-1 sm:flex-none h-11 sm:h-10 px-4 rounded-lg bg-[#81572d] text-white text-sm font-semibold hover:bg-[#6d4926] transition-colors inline-flex items-center justify-center gap-2"
            >
              <Printer className="h-4 w-4" />
              <span className="sm:hidden">PDF</span>
              <span className="hidden sm:inline">Exporter PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   EMPTY STATE
══════════════════════════════════════════════════════════════════════════ */
function ListEmpty({ hasData }: { hasData: boolean }) {
  return (
    <EmptyState
      icon={FileCheck}
      title={hasData ? 'Aucun résultat' : 'Aucun devis envoyé'}
      description={
        hasData
          ? 'Modifiez la recherche ou le filtre de statut.'
          : 'Les devis envoyés aux patients apparaîtront ici.'
      }
    />
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE PRINCIPALE — liste pleine largeur + modal
══════════════════════════════════════════════════════════════════════════ */
export default function DevisMedecinPage() {
  const [allDevis, setAllDevis] = useState<DevisWithPatient[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState('')
  const [filter, setFilter]     = useState<'all' | Statut>('all')
  const [page, setPage]         = useState(1)
  const [selected, setSelected] = useState<DevisWithPatient | null>(null)

  const load = useCallback(async (opts?: { silent?: boolean; useCache?: boolean }) => {
    const key = queryKeys.medecinDevis()
    const force = !opts?.useCache
    if (!opts?.silent) {
      if (opts?.useCache && hasCachedData(key)) setLoading(false)
      else setLoading(true)
    }
    setError(null)
    try {
      const r = await cachedFetch(key, () => medecinApi.getAllDevis(), { force })
      setAllDevis(r.devis)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load({ useCache: true })
  }, [load])

  const filtered = useMemo(() => {
    let list = filter === 'all' ? allDevis : allDevis.filter((d) => d.statut === filter)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((d) =>
        d.patient.fullName.toLowerCase().includes(q) ||
        d.patient.dossierNumber.toLowerCase().includes(q) ||
        (d.numeroDevis ?? '').toLowerCase().includes(q),
      )
    }
    return list
  }, [allDevis, search, filter])

  useEffect(() => {
    setPage(1)
  }, [search, filter])

  const { slice: pageDevis, totalPages, page: safePage, total } = useMemo(
    () => paginateSlice(filtered, page, LIST_PAGE_SIZE),
    [filtered, page],
  )

  const counts = useMemo(() => ({
    all:     allDevis.length,
    envoye:  allDevis.filter((d) => d.statut === 'envoye').length,
    accepte: allDevis.filter((d) => d.statut === 'accepte').length,
    refuse:  allDevis.filter((d) => d.statut === 'refuse').length,
  }), [allDevis])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 bg-[#f7f6f4]">
        <RefreshCw className="h-5 w-5 text-[#81572d] animate-spin" />
        <p className="text-sm text-muted-foreground font-medium">Chargement des devis…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
        <XCircle className="h-6 w-6 text-red-400" />
        <p className="text-sm font-semibold text-red-600">{error}</p>
      </div>
    )
  }

  const TABS: Array<{ key: 'all' | Statut; label: string; count: number }> = [
    { key: 'all', label: 'Tous', count: counts.all },
    { key: 'envoye', label: 'Envoyés', count: counts.envoye },
    { key: 'accepte', label: 'Acceptés', count: counts.accepte },
    { key: 'refuse', label: 'Refusés', count: counts.refuse },
  ]

  return (
    <PullToRefresh onRefresh={() => load({ silent: true })} className="h-full">
    <div className="flex flex-col h-full bg-[#f7f6f4] overflow-hidden">
      <PageHeader list={allDevis} />

      <div className="flex-1 min-h-0 px-3 sm:px-5 py-3 sm:py-4 overflow-hidden">
        <div className="h-full flex flex-col bg-white border border-border rounded-xl shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-border space-y-3 shrink-0">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  type="search"
                  placeholder="Patient, dossier, référence…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-10 pl-10 pr-9 text-sm rounded-lg border border-border bg-slate-50/80
                    placeholder:text-muted-foreground/70
                    focus:outline-none focus:ring-2 focus:ring-[#81572d]/20 focus:border-[#81572d]/50"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Effacer
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground shrink-0 sm:text-right">
                {filtered.length} devis affiché{filtered.length > 1 ? 's' : ''}
              </p>
            </div>

            <div className="flex p-0.5 rounded-lg bg-slate-100/90 w-full max-w-xl overflow-x-auto">
              {TABS.map(({ key, label, count }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={cn(
                    'flex-1 min-w-[4.5rem] sm:min-w-0 py-2 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-semibold transition-all',
                    filter === key
                      ? 'bg-white text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className="truncate">{label}</span>
                  <span className={cn('ml-1 tabular-nums', filter === key ? 'text-[#81572d]' : 'opacity-60')}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Liste */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {filtered.length === 0 ? (
              <ListEmpty hasData={allDevis.length > 0} />
            ) : (
              pageDevis.map((dv) => (
                <DevisRow key={dv.id} dv={dv} onClick={() => setSelected(dv)} />
              ))
            )}
          </div>
          {filtered.length > 0 && (
            <PaginationBar
              page={safePage}
              totalPages={totalPages}
              total={total}
              pageSize={LIST_PAGE_SIZE}
              onPageChange={setPage}
              className="shrink-0"
            />
          )}
        </div>
      </div>

      {selected && (
        <DetailModal dv={selected} onClose={() => setSelected(null)} />
      )}
    </div>
    </PullToRefresh>
  )
}
