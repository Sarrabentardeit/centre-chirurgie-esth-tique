import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileCheck, Download, CheckCircle2, Clock, XCircle,
  AlertCircle, RefreshCw, MessageSquare, X, ChevronRight, Gift,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { authApi, patientApi } from '@/lib/api'
import type { Devis } from '@/lib/api'
import {
  formatDate,
  formatCurrency,
  formatDevisPdfFileName,
  formatDevisListName,
  cn,
} from '@/lib/utils'
import { parseSejourMeta } from '@/lib/devisSejourNotes'
import { inlineHtmlImages } from '@/lib/pdf'
import { buildDevisExportHtml } from '@/lib/devisExportHtml'

const DEVIS_STATUS = {
  brouillon: { label: 'Brouillon', color: 'secondary' as const, icon: Clock, chip: 'bg-slate-100 text-slate-600 border-slate-200' },
  envoye:    { label: 'Reçu',      color: 'info' as const,      icon: AlertCircle, chip: 'bg-sky-100 text-sky-800 border-sky-200' },
  accepte:   { label: 'Accepté',   color: 'success' as const,   icon: CheckCircle2, chip: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  refuse:    { label: 'Refusé',    color: 'destructive' as const, icon: XCircle, chip: 'bg-rose-100 text-rose-800 border-rose-200' },
}

/** Retire les aides entre parenthèses : (nbr de nuitées), (à préciser), etc. */
function cleanPrestationLabel(raw: string | null | undefined): string {
  return (raw ?? '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function PageSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
    </div>
  )
}

export default function DevisPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [devis, setDevis] = useState<Devis[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showRefuse, setShowRefuse] = useState(false)
  const [refusReason, setRefusReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [actionDone, setActionDone] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [patientIdentity, setPatientIdentity] = useState<{
    nom: string
    prenom: string
    dossierNumber: string
    fullName: string
  }>({
    nom: '',
    prenom: '',
    dossierNumber: '',
    fullName: '',
  })

  const selected = useMemo(
    () => devis.find((d) => d.id === selectedId) ?? null,
    [devis, selectedId],
  )

  const sortedDevis = useMemo(
    () => [...devis].sort((a, b) => b.version - a.version || +new Date(b.dateCreation) - +new Date(a.dateCreation)),
    [devis],
  )

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await patientApi.getDevis()
      setDevis(res.devis)
      try {
        const me = await authApi.me()
        const fullName = (me.user.name ?? '').trim()
        const parts = fullName.split(/\s+/).filter(Boolean)
        const prenom = parts[0] ?? 'Patient'
        const nom = parts.slice(1).join(' ') || prenom
        setPatientIdentity({
          nom,
          prenom,
          dossierNumber: me.patient?.dossierNumber ?? '',
          fullName,
        })
      } catch {
        /* identité générique pour PDF */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const markConsulted = (d: Devis) => {
    if (d.statut !== 'envoye' || d.vuParPatientAt) return
    void patientApi
      .enregistrerConsultationDevis(d.id)
      .then((r) => {
        setDevis((prev) => prev.map((x) => (x.id === d.id ? r.devis : x)))
      })
      .catch(() => {
        /* silencieux */
      })
  }

  const openDevis = (d: Devis) => {
    setSelectedId(d.id)
    setShowRefuse(false)
    setRefusReason('')
    setActionDone(false)
    markConsulted(d)
  }

  const closeModal = () => {
    if (submitting) return
    setSelectedId(null)
    setShowRefuse(false)
    setRefusReason('')
    setActionDone(false)
  }

  const handleRepondre = async (id: string, reponse: 'accepte' | 'refuse') => {
    setSubmitting(true)
    try {
      await patientApi.repondreDevis(id, {
        reponse,
        commentaire: reponse === 'refuse' ? refusReason : undefined,
      })
      setActionDone(true)
      setShowRefuse(false)
      setRefusReason('')
      const res = await patientApi.getDevis()
      setDevis(res.devis)
      if (reponse === 'accepte') {
        setSelectedId(null)
        navigate('/patient/agenda')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la réponse.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDownloadPdf = async (d: Devis) => {
    setExporting(true)
    setError(null)
    try {
      const fullName =
        patientIdentity.fullName ||
        [patientIdentity.prenom, patientIdentity.nom].filter(Boolean).join(' ')
      const html = await inlineHtmlImages(
        buildDevisExportHtml({
          devis: d,
          dossierNumber: patientIdentity.dossierNumber || d.numeroDevis || '',
          patientFullName: fullName,
        }),
      )
      const blob = await patientApi.renderDevisPdf(html)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = formatDevisPdfFileName(
        patientIdentity.dossierNumber || d.numeroDevis,
        fullName,
        d.version,
      )
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'exporter le PDF.")
    } finally {
      setExporting(false)
    }
  }

  const devisTitle = (d: Devis) =>
    formatDevisListName(
      patientIdentity.dossierNumber || d.numeroDevis,
      patientIdentity.fullName || `${patientIdentity.prenom} ${patientIdentity.nom}`.trim(),
      d.version,
    )

  if (loading) {
    return (
      <div className="p-6">
        <PageSkeleton />
      </div>
    )
  }

  if (error && devis.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground text-sm">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Réessayer
        </Button>
      </div>
    )
  }

  if (devis.length === 0) {
    return (
      <div className="max-w-2xl mx-auto mt-12 text-center px-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#fdeada] border border-[#e4c8bd] mx-auto mb-4">
          <FileCheck className="h-8 w-8 text-[#81572d]" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Aucun devis disponible</h3>
        <p className="text-muted-foreground text-sm">
          Votre devis sera disponible une fois que le médecin aura analysé votre dossier et que
          l&apos;équipe l&apos;aura préparé.
        </p>
        <Button variant="outline" className="mt-6" onClick={() => navigate('/patient/formulaire')}>
          Voir mon formulaire médical
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h2 className="font-display text-2xl font-semibold text-[#062a30] tracking-tight">Mes Devis</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {sortedDevis.length} devis — cliquez pour consulter le détail
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-[#e4c8bd]/80 bg-white shadow-sm overflow-hidden divide-y divide-[#e4c8bd]/50">
        {sortedDevis.map((d) => {
          const statusInfo = DEVIS_STATUS[d.statut] ?? DEVIS_STATUS.brouillon
          const StatusIcon = statusInfo.icon
          const isNew = d.statut === 'envoye' && !d.vuParPatientAt

          return (
            <button
              key={d.id}
              type="button"
              onClick={() => openDevis(d)}
              className="w-full text-left px-4 sm:px-5 py-4 hover:bg-[#fdeada]/35 transition-colors flex items-start sm:items-center gap-3 sm:gap-4"
            >
              <div className="h-10 w-10 rounded-xl bg-[#fdeada] border border-[#e4c8bd] flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                <FileCheck className="h-5 w-5 text-[#81572d]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[#062a30] break-words">{devisTitle(d)}</p>
                  {isNew && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-[#81572d] text-white">
                      Nouveau
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>Version {d.version}</span>
                  <span>{formatDate(d.dateCreation)}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 sm:hidden">
                  <p className="text-sm font-bold text-[#81572d] tabular-nums">{formatCurrency(d.total)}</p>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border',
                      statusInfo.chip,
                    )}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {statusInfo.label}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-bold text-[#81572d] tabular-nums">{formatCurrency(d.total)}</p>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border',
                      statusInfo.chip,
                    )}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {statusInfo.label}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-[#81572d]/70 mt-1 sm:mt-0" />
              </div>
            </button>
          )
        })}
      </div>

      {/* Modal détail */}
      {selected && (() => {
        const statusInfo = DEVIS_STATUS[selected.statut] ?? DEVIS_STATUS.brouillon
        const StatusIcon = statusInfo.icon
        const lignes = Array.isArray(selected.lignes) ? selected.lignes : []
        const paidLignes = lignes.filter((l) => (l.total ?? 0) > 0)
        const offeredLignes = lignes.filter((l) => (l.total ?? 0) === 0)
        const offerLabel = cleanPrestationLabel(
          paidLignes.find((l) => l.description?.trim())?.description ||
            lignes.find((l) => l.description?.trim())?.description ||
            'Offre de soins personnalisée',
        )
        const sej = parseSejourMeta(selected.notesSejour)
        const sejourCards = [
          sej.cliniqueNom && { label: 'Clinique', value: sej.cliniqueNom },
          sej.cliniqueNuits && { label: 'Nuits clinique', value: sej.cliniqueNuits },
          sej.hotelNom && { label: 'Hôtel', value: sej.hotelNom },
          sej.hotelNuits && { label: 'Nuits hôtel', value: sej.hotelNuits },
          sej.dureeSejourTotale && { label: 'Séjour', value: `${sej.dureeSejourTotale} jour(s)` },
          sej.nbAdultes !== '' && { label: 'Adultes', value: sej.nbAdultes },
          sej.nbEnfants !== '' && { label: 'Enfants', value: sej.nbEnfants },
        ].filter(Boolean) as Array<{ label: string; value: string }>

        return (
          <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="devis-modal-title"
          >
            <button
              type="button"
              className="absolute inset-0 bg-[#062a30]/60 backdrop-blur-sm"
              onClick={closeModal}
              aria-label="Fermer"
            />
            <div className="relative z-10 w-full sm:max-w-2xl max-h-[96dvh] sm:max-h-[92vh] overflow-hidden rounded-t-[1.75rem] sm:rounded-[1.75rem] bg-[#f7f1eb] shadow-[0_28px_80px_rgba(6,42,48,0.35)] flex flex-col">
              {/* Header compact */}
              <div className="shrink-0 relative overflow-hidden bg-[#062a30] px-5 sm:px-6 pt-5 pb-6">
                <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[#81572d]/25 blur-2xl" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#e4c8bd]">
                      Devis personnalisé
                    </p>
                    <h3
                      id="devis-modal-title"
                      className="mt-2 font-display text-[1.15rem] sm:text-xl font-semibold text-white leading-snug"
                    >
                      {devisTitle(selected)}
                    </h3>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#81572d] text-white">
                        <StatusIcon className="h-3 w-3" />
                        {statusInfo.label}
                      </span>
                      <span className="text-[11px] text-white/65">
                        v{selected.version} · {formatDate(selected.dateCreation)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitting}
                    className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center shrink-0 transition-colors"
                    aria-label="Fermer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Montant flottant */}
              <div className="shrink-0 px-5 sm:px-6 -mt-4 relative z-10">
                <div className="rounded-2xl bg-white border border-[#e4c8bd]/80 px-5 py-4 shadow-md flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#81572d]">
                      Total
                    </p>
                    <p className="mt-0.5 text-sm text-[#282727]/75 truncate">{offerLabel}</p>
                  </div>
                  <p className="text-3xl font-bold tabular-nums tracking-tight text-[#062a30] shrink-0">
                    {formatCurrency(selected.total)}
                  </p>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
                {lignes.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-6">
                    Détail des prestations non disponible.
                  </p>
                ) : (
                  <div className="rounded-2xl bg-white border border-[#e4c8bd]/70 overflow-hidden shadow-sm">
                    {paidLignes.length > 0 && (
                      <div className="px-4 sm:px-5 py-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#81572d] mb-2.5">
                          Prestations
                        </p>
                        <ul className="divide-y divide-[#f0e6df]">
                          {paidLignes.map((ligne, i) => (
                            <li
                              key={`p-${i}`}
                              className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                            >
                              <span className="text-sm text-[#282727]">
                                {cleanPrestationLabel(ligne.description)}
                              </span>
                              <span className="text-sm font-semibold tabular-nums text-[#062a30] shrink-0">
                                {formatCurrency(ligne.total)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {offeredLignes.length > 0 && (
                      <div
                        className={cn(
                          'px-4 sm:px-5 py-4 bg-[#fdeada]/40',
                          paidLignes.length > 0 && 'border-t border-[#e4c8bd]/50',
                        )}
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <Gift className="h-3.5 w-3.5 text-[#81572d]" />
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#81572d]">
                            Inclus
                          </p>
                        </div>
                        <ul className="columns-1 sm:columns-2 gap-x-6 space-y-2">
                          {offeredLignes.map((ligne, i) => (
                            <li
                              key={`o-${i}`}
                              className="flex items-start gap-2 text-[13px] text-[#282727] break-inside-avoid"
                            >
                              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#81572d] shrink-0" />
                              <span className="leading-snug">{cleanPrestationLabel(ligne.description)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {selected.planningMedical && (
                  <div className="rounded-2xl bg-white border border-[#e4c8bd]/70 px-4 sm:px-5 py-4 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#81572d] mb-2">
                      Planning médical
                    </p>
                    <p className="text-sm text-[#282727] whitespace-pre-line leading-relaxed">
                      {selected.planningMedical}
                    </p>
                  </div>
                )}

                {sejourCards.length > 0 && (
                  <div className="rounded-2xl bg-white border border-[#e4c8bd]/70 px-4 sm:px-5 py-4 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#81572d] mb-3">
                      Séjour
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {sejourCards.map((item) => (
                        <div
                          key={item.label}
                          className="rounded-xl bg-[#f7f1eb] px-3 py-2.5 min-w-0"
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#81572d]/80">
                            {item.label}
                          </p>
                          <p className="mt-0.5 text-sm font-medium text-[#062a30] truncate" title={item.value}>
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>
                    {sej.noteSejour && (
                      <p className="mt-3 text-sm text-[#282727]/80 leading-relaxed">{sej.noteSejour}</p>
                    )}
                  </div>
                )}

                {actionDone && (
                  <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Votre réponse a bien été enregistrée.
                  </div>
                )}

                {showRefuse && (
                  <div className="rounded-2xl border border-rose-200 bg-white px-4 sm:px-5 py-4 space-y-3 shadow-sm">
                    <p className="text-sm font-semibold text-[#062a30]">Motif du refus (optionnel)</p>
                    <Textarea
                      value={refusReason}
                      onChange={(e) => setRefusReason(e.target.value)}
                      placeholder="Ex. : le tarif ne correspond pas à mon budget…"
                      className="min-h-[90px] bg-[#f7f1eb] border-[#e4c8bd]"
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setShowRefuse(false)}>
                        Annuler
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={submitting}
                        onClick={() => void handleRepondre(selected.id, 'refuse')}
                      >
                        Confirmer le refus
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div
                className="shrink-0 px-5 sm:px-6 pt-4 bg-white border-t border-[#e4c8bd]/60 space-y-2.5"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
              >
                {selected.statut === 'envoye' && (
                  <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr] gap-2">
                    <Button
                      className="gap-2 min-h-12 w-full font-semibold rounded-xl bg-[#81572d] hover:bg-[#6b4825] text-white"
                      disabled={submitting}
                      onClick={() => void handleRepondre(selected.id, 'accepte')}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Accepter
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 min-h-12 w-full rounded-xl border-[#e4c8bd] text-[#282727] hover:bg-[#f7f1eb]"
                      disabled={submitting}
                      onClick={() => setShowRefuse((v) => !v)}
                    >
                      Refuser
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-10 rounded-xl border-[#e4c8bd] text-[#81572d] hover:bg-[#fdeada]/50"
                      onClick={() => navigate('/patient/chat')}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Contacter
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-10 rounded-xl border-[#81572d]/40 bg-[#fdeada]/40 text-[#062a30] hover:bg-[#fdeada] font-semibold"
                      disabled={exporting || submitting}
                      onClick={() => void handleDownloadPdf(selected)}
                    >
                      {exporting ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      {exporting ? 'Téléchargement…' : 'Télécharger le PDF'}
                    </Button>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-medium text-[#929292] hover:text-[#062a30] px-2 py-1"
                    onClick={closeModal}
                    disabled={submitting}
                  >
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
