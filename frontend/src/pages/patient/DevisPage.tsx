import { FileCheck, Download, CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { formatDate, formatCurrency } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { downloadDevisPdf } from '@/lib/pdf'
import { Textarea } from '@/components/ui/textarea'

const DEVIS_STATUS = {
  brouillon: { label: 'Brouillon', color: 'secondary', icon: Clock },
  envoye: { label: 'Reçu', color: 'info', icon: AlertCircle },
  accepte: { label: 'Accepté', color: 'success', icon: CheckCircle2 },
  refuse: { label: 'Refusé', color: 'destructive', icon: XCircle },
} as const

export default function DevisPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const patientAcceptDevis = useDemoStore((s) => s.patientAcceptDevis)
  const patientRequestDevisUpdate = useDemoStore((s) => s.patientRequestDevisUpdate)

  const patients = useDemoStore((s) => s.patients)
  const devisStore = useDemoStore((s) => s.devis)
  const currency = useDemoStore((s) => s.currency)

  const patient = useMemo(() => {
    if (!user) return undefined
    return patients.find((p) => p.userId === user.id)
  }, [patients, user?.id])

  const devis = useMemo(() => {
    if (!patient) return []
    return devisStore.filter((d) => d.patientId === patient.id)
  }, [devisStore, patient?.id])
  const [requestingDevisId, setRequestingDevisId] = useState<string | null>(null)
  const [requestReason, setRequestReason] = useState('')
  const [requestSentFor, setRequestSentFor] = useState<string | null>(null)

  if (devis.length === 0) {
    return (
      <div className="max-w-2xl mx-auto mt-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-4">
          <FileCheck className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Aucun devis disponible</h3>
        <p className="text-muted-foreground text-sm">
          Votre devis sera disponible une fois que le médecin aura analysé votre dossier.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Mes Devis</h2>
        <p className="text-sm text-muted-foreground">{devis.length} devis disponible(s)</p>
      </div>

      {devis.map((d) => {
        const statusInfo = DEVIS_STATUS[d.statut]
        const StatusIcon = statusInfo.icon

        return (
          <Card key={d.id} className="overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4 border-b">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Devis N° {d.id.toUpperCase()} — Version {d.version}
                  </p>
                  <p className="font-semibold text-foreground">Offre de soins personnalisée</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={statusInfo.color as 'info' | 'success' | 'secondary'} className="gap-1">
                    <StatusIcon className="h-3 w-3" />
                    {statusInfo.label}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-6 mt-3 text-xs text-muted-foreground">
                <span>Créé le {formatDate(d.dateCreation)}</span>
                <span>Valable jusqu'au {formatDate(d.dateValidite)}</span>
              </div>
            </div>

            <CardContent className="pt-5 space-y-5">
              {/* Lines */}
              <div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left pb-2 font-medium">Prestation</th>
                      <th className="text-center pb-2 font-medium">Qté</th>
                      <th className="text-right pb-2 font-medium">P.U.</th>
                      <th className="text-right pb-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {d.lignes.map((ligne, i) => (
                      <tr key={i} className="py-2">
                        <td className="py-3 font-medium">{ligne.description}</td>
                        <td className="text-center text-muted-foreground">{ligne.quantite}</td>
                        <td className="text-right text-muted-foreground">
                          {ligne.prixUnitaire === 0 ? 'Inclus' : formatCurrency(ligne.prixUnitaire, currency)}
                        </td>
                        <td className="text-right font-semibold">
                          {ligne.total === 0 ? (
                            <Badge variant="success" className="text-xs">Offert</Badge>
                          ) : (
                            formatCurrency(ligne.total, currency)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <Separator className="my-3" />
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total estimatif</span>
                  <span className="text-xl font-bold text-brand-600">{formatCurrency(d.total, currency)}</span>
                </div>
              </div>

              {/* Planning médical */}
              {d.planningMedical && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm">
                  <p className="font-semibold text-blue-800 mb-1">Planning médical</p>
                  <p className="text-blue-700">{d.planningMedical}</p>
                </div>
              )}

              {/* Notes séjour */}
              {d.notesSejour && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm">
                  <p className="font-semibold text-amber-800 mb-1">Informations séjour</p>
                  <p className="text-amber-700">{d.notesSejour}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-3 pt-2">
                <Button
                  variant="brand"
                  className="flex-1 sm:flex-none gap-2"
                  disabled={d.statut !== 'envoye'}
                  onClick={() => {
                    if (!patient) return
                    patientAcceptDevis(patient.id, d.id)
                    navigate('/patient/agenda')
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Accepter ce devis
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    if (!patient) return
                    downloadDevisPdf({
                      devis: d,
                      patient,
                      currency,
                      filename: `devis-${d.id}.pdf`,
                    })
                  }}
                >
                  <Download className="h-4 w-4" />
                  Télécharger PDF
                </Button>
                <Button
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => {
                    setRequestingDevisId((prev) => (prev === d.id ? null : d.id))
                    setRequestSentFor(null)
                  }}
                >
                  Demander une modification
                </Button>
              </div>

              {requestingDevisId === d.id && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-sm font-medium">Motif de modification</p>
                  <Textarea
                    value={requestReason}
                    onChange={(e) => setRequestReason(e.target.value)}
                    placeholder="Ex: je souhaite changer une ligne, ajouter une prestation, ajuster les dates..."
                    className="min-h-[90px]"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setRequestingDevisId(null)}>
                      Annuler
                    </Button>
                    <Button
                      variant="brand-outline"
                      size="sm"
                      disabled={requestReason.trim().length < 8 || !patient}
                      onClick={() => {
                        if (!patient) return
                        const reason = requestReason.trim()
                        if (reason.length < 8) return
                        patientRequestDevisUpdate(patient.id, d.id, reason)
                        setRequestReason('')
                        setRequestingDevisId(null)
                        setRequestSentFor(d.id)
                      }}
                    >
                      Envoyer la demande
                    </Button>
                  </div>
                  {requestSentFor === d.id && (
                    <p className="text-xs text-emerald-700">Demande envoyée à l’équipe ✅</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
