import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileCheck, Download, CheckCircle2, Clock, XCircle,
  AlertCircle, RefreshCw, MessageSquare,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { patientApi } from '@/lib/api'
import type { Devis } from '@/lib/api'
import { formatDate, formatCurrency } from '@/lib/utils'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEVIS_STATUS = {
  brouillon: { label: 'Brouillon',  color: 'secondary',   icon: Clock },
  envoye:    { label: 'Reçu',       color: 'info',        icon: AlertCircle },
  accepte:   { label: 'Accepté',    color: 'success',     icon: CheckCircle2 },
  refuse:    { label: 'Refusé',     color: 'destructive', icon: XCircle },
} as const

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

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const res = await patientApi.getDevis()
      setDevis(res.devis)
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
    <div className="max-w-3xl mx-auto space-y-6 p-6">
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
            <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4 border-b">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Devis N° {d.id.slice(0, 8).toUpperCase()} — Version {d.version}
                  </p>
                  <p className="font-semibold text-foreground">Offre de soins personnalisée</p>
                </div>
                <Badge variant={statusInfo.color as 'info' | 'success' | 'secondary' | 'destructive'} className="gap-1">
                  <StatusIcon className="h-3 w-3" />
                  {statusInfo.label}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-6 mt-3 text-xs text-muted-foreground">
                <span>Créé le {formatDate(d.dateCreation)}</span>
                {d.dateValidite && <span>Valable jusqu'au {formatDate(d.dateValidite)}</span>}
              </div>
            </div>

            <CardContent className="pt-5 space-y-5">
              {/* ── Lignes ── */}
              {lignes.length > 0 ? (
                <div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b">
                        <th className="text-left pb-2 font-medium">Prestation</th>
                        <th className="text-center pb-2 font-medium w-12">Qté</th>
                        <th className="text-right pb-2 font-medium w-24">P.U.</th>
                        <th className="text-right pb-2 font-medium w-24">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {lignes.map((ligne, i) => (
                        <tr key={i}>
                          <td className="py-3 font-medium">{ligne.description}</td>
                          <td className="text-center text-muted-foreground">{ligne.quantite}</td>
                          <td className="text-right text-muted-foreground">
                            {ligne.prixUnitaire === 0 ? 'Inclus' : formatCurrency(ligne.prixUnitaire)}
                          </td>
                          <td className="text-right font-semibold">
                            {ligne.total === 0
                              ? <Badge variant="success" className="text-xs">Offert</Badge>
                              : formatCurrency(ligne.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Separator className="my-3" />
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Total estimatif</span>
                    <span className="text-xl font-bold text-brand-600">
                      {formatCurrency(d.total)}
                    </span>
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
                  <p className="text-amber-700 whitespace-pre-line">{d.notesSejour}</p>
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
              <div className="flex flex-wrap gap-3 pt-1">
                {isPending && (
                  <>
                    <Button
                      variant="brand"
                      className="gap-2"
                      disabled={submitting}
                      onClick={() => handleRepondre(d.id, 'accepte')}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Accepter ce devis
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/5"
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
                  className="gap-2"
                  onClick={() => navigate('/patient/chat')}
                >
                  <MessageSquare className="h-4 w-4" />
                  Contacter l'équipe
                </Button>
                <Button variant="ghost" className="gap-2 text-muted-foreground" disabled>
                  <Download className="h-4 w-4" />
                  PDF (bientôt)
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
