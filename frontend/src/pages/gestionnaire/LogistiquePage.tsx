import { Package, CheckCircle2, Circle, Plane, FileText, Home, Car, Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useEffect, useMemo, useState } from 'react'
import { useDemoStore } from '@/store/demoStore'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

const CHECKLIST_ITEMS = [
  { key: 'passport', label: 'Passeport vérifié', icon: FileText },
  { key: 'billet', label: 'Billet d\'avion reçu', icon: Plane },
  { key: 'hebergement', label: 'Hébergement confirmé', icon: Home },
  { key: 'transfertAeroport', label: 'Transfert aéroport organisé', icon: Car },
] as const

export default function LogistiquePage() {
  const patients = useDemoStore((s) => s.patients)
  const patientsLogistique = useMemo(
    () => patients.filter((p) => ['date_reservee', 'logistique'].includes(p.status)),
    [patients]
  )
  const logistiqueAll = useDemoStore((s) => s.logistique)
  const gestionnaireCompleteLogistique = useDemoStore((s) => s.gestionnaireCompleteLogistique)
  const [selectedPatient, setSelectedPatient] = useState('')
  const logistique = logistiqueAll.find((l) => l.patientId === selectedPatient)
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    passport: logistique?.passport ?? false,
    billet: logistique?.billet ?? false,
    hebergement: logistique?.hebergement ?? false,
    transfertAeroport: logistique?.transfertAeroport ?? false,
  })
  const [notes, setNotes] = useState(logistique?.notes ?? '')

  const completionCount = Object.values(checklist).filter(Boolean).length
  const totalItems = Object.keys(checklist).length
  const patient = useDemoStore((s) => s.patients.find((p) => p.id === selectedPatient))

  useEffect(() => {
    if (!selectedPatient && patientsLogistique.length > 0) {
      setSelectedPatient(patientsLogistique[0].id)
    }
  }, [patientsLogistique, selectedPatient])

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Logistique Séjours</h2>
        <p className="text-sm text-muted-foreground">Organisation du séjour des patientes</p>
      </div>

      {patientsLogistique.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Aucun patient avec logistique à préparer.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Patient list */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Séjours à organiser
            </p>
            {patientsLogistique.map((p) => {
              const log = logistiqueAll.find((l) => l.patientId === p.id)
              const done = log
                ? [log.passport, log.billet, log.hebergement, log.transfertAeroport].filter(Boolean).length
                : 0
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedPatient(p.id)
                    const newLog = logistiqueAll.find((l) => l.patientId === p.id)
                    setChecklist({
                      passport: newLog?.passport ?? false,
                      billet: newLog?.billet ?? false,
                      hebergement: newLog?.hebergement ?? false,
                      transfertAeroport: newLog?.transfertAeroport ?? false,
                    })
                    setNotes(newLog?.notes ?? '')
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                    selectedPatient === p.id
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-border hover:bg-muted/50'
                  )}
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-purple-100 text-purple-700 text-sm font-semibold">
                      {p.prenom[0]}{p.nom[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{p.prenom} {p.nom}</p>
                    <p className="text-xs text-muted-foreground">{p.ville}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full"
                          style={{ width: `${(done / 4) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{done}/4</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Checklist */}
          <div className="lg:col-span-2">
            {patient && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-base">
                      {patient.prenom} {patient.nom} — {patient.ville}, {patient.pays}
                    </CardTitle>
                    <Badge variant={completionCount === totalItems ? 'success' : 'warning'}>
                      {completionCount}/{totalItems} complété
                    </Badge>
                  </div>
                  {logistique?.dateArrivee && (
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        Arrivée : {formatDate(logistique.dateArrivee)}
                      </span>
                      {logistique.dateDepart && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Départ : {formatDate(logistique.dateDepart)}
                        </span>
                      )}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Checklist items */}
                  <div className="space-y-2">
                    {CHECKLIST_ITEMS.map(({ key, label, icon: Icon }) => (
                      <button
                        key={key}
                        onClick={() => setChecklist((prev) => ({ ...prev, [key]: !prev[key] }))}
                        className={cn(
                          'w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                          checklist[key]
                            ? 'border-emerald-300 bg-emerald-50'
                            : 'border-border hover:bg-muted/50'
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                            checklist[key] ? 'bg-emerald-100' : 'bg-muted'
                          )}
                        >
                          <Icon className={cn('h-4 w-4', checklist[key] ? 'text-emerald-600' : 'text-muted-foreground')} />
                        </div>
                        <span className="flex-1 text-sm font-medium">{label}</span>
                        {checklist[key] ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground/30" />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes logistiques</label>
                    <textarea
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      rows={3}
                      placeholder="Vol, hébergement, instructions particulières..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>

                  <Button
                    variant="brand"
                    className="w-full"
                    disabled={completionCount !== totalItems}
                    onClick={() => gestionnaireCompleteLogistique(selectedPatient)}
                  >
                    {completionCount === totalItems ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Logistique complète
                      </>
                    ) : (
                      'Sauvegarder'
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
