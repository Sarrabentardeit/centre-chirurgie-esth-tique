import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileCheck, Download, CheckCircle2, Clock, XCircle,
  AlertCircle, RefreshCw, MessageSquare,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { authApi, patientApi } from '@/lib/api'
import type { Devis } from '@/lib/api'
import { formatDate, formatCurrency } from '@/lib/utils'
import { formatDevisSejourNotesForDisplay, parseSejourMeta } from '@/lib/devisSejourNotes'
import { downloadDevisPdf } from '@/lib/pdf'
import { DEVIS_LOGO_SRC, buildDevisDocumentEndHtml, buildDevisHeaderLogoHtml, buildDevisHeaderRightHtml, layoutDevisForPrint } from '@/lib/devisBranding'
import { buildDevisOfferBlockHtml, buildDevisPrintStyles } from '@/lib/devisCharte'
import { replaceDevisAmountPlaceholders, DEFAULT_TND_PER_EUR } from '@/lib/moneyWords'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEVIS_STATUS = {
  brouillon: { label: 'Brouillon',  color: 'secondary',   icon: Clock },
  envoye:    { label: 'Reçu',       color: 'info',        icon: AlertCircle },
  accepte:   { label: 'Accepté',    color: 'success',     icon: CheckCircle2 },
  refuse:    { label: 'Refusé',     color: 'destructive', icon: XCircle },
} as const

const CONTENT_BREAK = '|||EDITOR_BREAK|||'

function PageSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Skeleton className="h-8 w-48" />
      <Card><CardContent className="pt-5 space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-10 w-32" />
      </CardContent></Card>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DevisPage() {
  const navigate = useNavigate()
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [devis, setDevis]       = useState<Devis[]>([])

  const [repondingId, setRepondingId]   = useState<string | null>(null)
  const [refusReason, setRefusReason]   = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [actionDone, setActionDone]     = useState<string | null>(null)
  const [patientIdentity, setPatientIdentity] = useState<{ nom: string; prenom: string; dossierNumber: string }>({
    nom: '',
    prenom: '',
    dossierNumber: '',
  })

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const res = await patientApi.getDevis()
      setDevis(res.devis)
      try {
        const me = await authApi.me()
        const fullName = (me.user.name ?? '').trim()
        const parts = fullName.split(/\s+/).filter(Boolean)
        const prenom = parts[0] ?? 'Patient'
        const nom = parts.slice(1).join(' ') || prenom
        setPatientIdentity({ nom, prenom, dossierNumber: me.patient?.dossierNumber ?? '' })
      } catch {
        // L'export PDF reste possible avec une identité générique.
      }
      for (const d of res.devis) {
        if (d.statut === 'envoye' && !d.vuParPatientAt) {
          void patientApi.enregistrerConsultationDevis(d.id).then((r) => {
            setDevis((prev) => prev.map((x) => (x.id === d.id ? r.devis : x)))
          }).catch(() => {
            /* silencieux : la consultation reste possible sans notification */
          })
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const handleRepondre = async (id: string, reponse: 'accepte' | 'refuse') => {
    setSubmitting(true)
    try {
      await patientApi.repondreDevis(id, {
        reponse,
        commentaire: reponse === 'refuse' ? refusReason : undefined,
      })
      setActionDone(id)
      setRepondingId(null)
      setRefusReason('')
      // Refresh
      const res = await patientApi.getDevis()
      setDevis(res.devis)
      if (reponse === 'accepte') navigate('/patient/agenda')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la réponse.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDownloadPdf = (d: Devis) => {
    const hasCustom = Boolean(d.customContent?.trim())
    if (hasCustom) {
      const raw = d.customContent!.trim()
      const [topHtml, botRaw] = raw.includes(CONTENT_BREAK) ? raw.split(CONTENT_BREAK) : [raw, '']
      const lignes = Array.isArray(d.lignes) ? d.lignes : []
      const total = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)
      const botHtml = replaceDevisAmountPlaceholders(botRaw ?? '', total, DEFAULT_TND_PER_EUR)
      const operationTitle =
        lignes.find((l) => l.description?.trim())?.description.trim() || 'Séjour médical personnalisé'
      const sej = parseSejourMeta(d.notesSejour)
      const nClin = Number.parseInt((sej.cliniqueNuits || '').trim(), 10)
      const nHotel = Number.parseInt((sej.hotelNuits || '').trim(), 10)
      const totalNights = (Number.isFinite(nClin) ? Math.max(0, nClin) : 0) + (Number.isFinite(nHotel) ? Math.max(0, nHotel) : 0)
      const jours = totalNights
      const sejourLine = totalNights > 0 ? `Séjour ${jours} jour${jours > 1 ? 's' : ''} (${totalNights} nuit${totalNights > 1 ? 's' : ''})` : ''
      const fmtNum = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n || 0))
      const logoUrl = `${window.location.origin}${DEVIS_LOGO_SRC}`
      const sigUrl = `${window.location.origin}/signature.jpg`
      const tableHtml = lignes.length > 0
        ? buildDevisOfferBlockHtml({
            operationTitle,
            sejourLine,
            totalFormatted: fmtNum(total),
          })
        : ''
      const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"/><title>Devis ${patientIdentity.dossierNumber}</title>
<style>${buildDevisPrintStyles()}</style></head>
<body><table class="page-table"><thead><tr><td><div class="doc-header">${buildDevisHeaderLogoHtml(logoUrl)}${buildDevisHeaderRightHtml(patientIdentity.dossierNumber)}</div></td></tr></thead>
<tfoot><tr><td></td></tr></tfoot><tbody><tr><td><div class="doc-body devis-top">${topHtml}</div><div class="devis-closing">${tableHtml}<div class="doc-body devis-bot">${botHtml}</div>${buildDevisDocumentEndHtml(sigUrl)}</div></td></tr></tbody></table></body></html>`
      const popup = window.open('', '_blank', 'width=1050,height=960')
      if (!popup) {
        setError("Autorisez les popups pour exporter en PDF.")
        return
      }
      popup.document.open()
      popup.document.write(html)
      popup.document.close()
      popup.focus()
      const waitAndPrint = () => {
        const imgs = Array.from(popup.document.images)
        const printNow = () => { layoutDevisForPrint(popup.document); popup.print(); popup.close() }
        if (imgs.length === 0) { printNow(); return }
        let loaded = 0
        const done = () => { if (++loaded >= imgs.length) printNow() }
        imgs.forEach((img) => {
          if (img.complete) done()
          else {
            img.addEventListener('load', done, { once: true })
            img.addEventListener('error', done, { once: true })
          }
        })
        setTimeout(() => { if (loaded < imgs.length) printNow() }, 2000)
      }
      setTimeout(waitAndPrint, 200)
      return
    }

    try {
      downloadDevisPdf({
        devis: d,
        patient: { nom: patientIdentity.nom, prenom: patientIdentity.prenom },
        currency: (d.currency || 'TND') as 'TND' | 'EUR',
        filename: `devis-${d.id.slice(0, 8)}.pdf`,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'exporter le PDF.")
    }
  }

  if (loading) return <div className="p-6"><PageSkeleton /></div>

  if (error) {
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
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-4">
          <FileCheck className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Aucun devis disponible</h3>
        <p className="text-muted-foreground text-sm">
          Votre devis sera disponible une fois que le médecin aura analysé votre dossier
          et que l'équipe l'aura préparé.
        </p>
        <Button variant="outline" className="mt-6" onClick={() => navigate('/patient/formulaire')}>
          Voir mon formulaire médical
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Mes Devis</h2>
        <p className="text-sm text-muted-foreground">{devis.length} devis disponible(s)</p>
      </div>

      {devis.map((d) => {
        const statusInfo = DEVIS_STATUS[d.statut] ?? DEVIS_STATUS.brouillon
        const StatusIcon = statusInfo.icon
        const lignes = Array.isArray(d.lignes) ? d.lignes : []
        const isPending = d.statut === 'envoye'

        return (
          <Card key={d.id} className="overflow-hidden">
            {/* ── Header ── */}
            <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-4 sm:px-6 py-4 border-b">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground mb-1 truncate">
                    Devis N° {d.id.slice(0, 8).toUpperCase()} — Version {d.version}
                  </p>
                  <p className="font-semibold text-foreground">Offre de soins personnalisée</p>
                </div>
                <Badge variant={statusInfo.color as 'info' | 'success' | 'secondary' | 'destructive'} className="gap-1 shrink-0">
                  <StatusIcon className="h-3 w-3" />
                  {statusInfo.label}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
                <span>Créé le {formatDate(d.dateCreation)}</span>
                {d.dateValidite && <span>Valable jusqu'au {formatDate(d.dateValidite)}</span>}
              </div>
            </div>

            <CardContent className="pt-5 space-y-5 px-4 sm:px-6">
              {/* ── Offre (aperçu écran lisible) ── */}
              {lignes.length > 0 ? (
                <div className="rounded-xl border border-[#e4c8bd]/bg-[#fdeada]/30 p-4 sm:p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#81572d]">Notre meilleure offre</p>
                      <p className="mt-1 text-sm font-semibold text-[#282727] leading-snug break-words">
                        {lignes.find((l) => l.description?.trim())?.description.trim() || 'Séjour médical personnalisé'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-bold text-[#81572d] tracking-tight">{formatCurrency(d.total)}</p>
                      <p className="text-[11px] text-muted-foreground">Ferme et définitif</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto -mx-1 px-1">
                    <table className="w-full text-sm min-w-[280px]">
                      <tbody className="divide-y divide-[#e4c8bd]/70">
                        {lignes.map((ligne, i) => (
                          <tr key={i}>
                            <td className="py-2.5 pr-2 text-[#282727] break-words">{ligne.description}</td>
                            <td className="text-right font-semibold whitespace-nowrap text-[#282727]">
                              {ligne.total === 0
                                ? <Badge variant="success" className="text-xs">Offert</Badge>
                                : formatCurrency(ligne.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Détail des prestations non disponible.</p>
              )}

              {/* ── Planning médical ── */}
              {d.planningMedical && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm">
                  <p className="font-semibold text-blue-800 mb-1">Planning médical</p>
                  <p className="text-blue-700 whitespace-pre-line">{d.planningMedical}</p>
                </div>
              )}

              {/* ── Notes séjour ── */}
              {d.notesSejour && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm">
                  <p className="font-semibold text-amber-800 mb-1">Informations séjour</p>
                  <p className="text-amber-700 whitespace-pre-line">
                    {formatDevisSejourNotesForDisplay(d.notesSejour)}
                  </p>
                </div>
              )}

              {/* ── Confirmation action ── */}
              {actionDone === d.id && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Votre réponse a bien été enregistrée.
                </div>
              )}

              {/* ── Actions ── */}
              <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 pt-1">
                {isPending && (
                  <>
                    <Button
                      variant="brand"
                      className="gap-2 w-full sm:w-auto min-h-11"
                      disabled={submitting}
                      onClick={() => handleRepondre(d.id, 'accepte')}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Accepter ce devis
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/5 w-full sm:w-auto min-h-11"
                      disabled={submitting}
                      onClick={() => setRepondingId((p) => p === d.id ? null : d.id)}
                    >
                      <XCircle className="h-4 w-4" />
                      Refuser
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  className="gap-2 w-full sm:w-auto min-h-11"
                  onClick={() => navigate('/patient/chat')}
                >
                  <MessageSquare className="h-4 w-4" />
                  Contacter l'équipe
                </Button>
                <Button
                  variant="ghost"
                  className="gap-2 text-muted-foreground w-full sm:w-auto min-h-11"
                  onClick={() => handleDownloadPdf(d)}
                >
                  <Download className="h-4 w-4" />
                  Exporter PDF
                </Button>
              </div>

              {/* ── Zone refus ── */}
              {repondingId === d.id && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <p className="text-sm font-medium">Motif du refus (optionnel)</p>
                  <Textarea
                    value={refusReason}
                    onChange={(e) => setRefusReason(e.target.value)}
                    placeholder="Ex: le tarif ne correspond pas à mon budget, je souhaite modifier certaines prestations..."
                    className="min-h-[90px]"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setRepondingId(null)}>
                      Annuler
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={submitting}
                      onClick={() => handleRepondre(d.id, 'refuse')}
                    >
                      Confirmer le refus
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
