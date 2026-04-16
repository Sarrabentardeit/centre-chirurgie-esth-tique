import { Package, CheckCircle2, Circle, Plane, FileText, Home, Car, Calendar, RefreshCw, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useEffect, useState } from 'react'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { gestionnaireApi, type GestionnaireLogistiquePatient } from '@/lib/api'

const CHECKLIST_ITEMS = [
  { key: 'passport', label: 'Passeport vérifié', icon: FileText },
  { key: 'billet', label: 'Billet d\'avion reçu', icon: Plane },
  { key: 'hebergementConfirme', label: 'Hébergement confirmé', icon: Home },
  { key: 'transfertAeroport', label: 'Transfert aéroport organisé', icon: Car },
] as const

export default function LogistiquePage() {
  const [patientsLogistique, setPatientsLogistique] = useState<GestionnaireLogistiquePatient[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPatient, setSelectedPatient] = useState('')
  const selected = patientsLogistique.find((p) => p.id === selectedPatient)
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    passport: false,
    billet: false,
    hebergementConfirme: false,
    transfertAeroport: false,
  })
  const [notes, setNotes] = useState('')
  const [dateArrivee, setDateArrivee] = useState('')
  const [dateDepart, setDateDepart] = useState('')
  const [hebergement, setHebergement] = useState('')
  const [transport, setTransport] = useState('')
  const [accompagnateur, setAccompagnateur] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)

  const completionCount = Object.values(checklist).filter(Boolean).length
  const totalItems = Object.keys(checklist).length

  const getDoneCount = (p: GestionnaireLogistiquePatient) => (
    p.logistique
      ? [
          p.logistique.checklist.passport,
          p.logistique.checklist.billet,
          p.logistique.checklist.hebergementConfirme,
          p.logistique.checklist.transfertAeroport,
        ].filter(Boolean).length
      : 0
  )

  const orderedPatients = [...patientsLogistique].sort((a, b) => {
    const aDone = getDoneCount(a)
    const bDone = getDoneCount(b)
    const aComplete = aDone === 4
    const bComplete = bDone === 4

    if (aComplete !== bComplete) return aComplete ? 1 : -1
    if (aDone !== bDone) return aDone - bDone
    return a.user.fullName.localeCompare(b.user.fullName, 'fr')
  })

  const patientsATraiter = orderedPatients.filter((p) => getDoneCount(p) < 4)
  const patientsCompletes = orderedPatients.filter((p) => getDoneCount(p) === 4)
  const selectedDone = selected ? getDoneCount(selected) : 0

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await gestionnaireApi.getLogistique()
      setPatientsLogistique(res.patients)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (!selectedPatient && patientsLogistique.length > 0) {
      setSelectedPatient(patientsLogistique[0].id)
    }
  }, [patientsLogistique, selectedPatient])

  useEffect(() => {
    if (!selected) return
    setChecklist({
      passport: selected.logistique?.checklist.passport ?? false,
      billet: selected.logistique?.checklist.billet ?? false,
      hebergementConfirme: selected.logistique?.checklist.hebergementConfirme ?? false,
      transfertAeroport: selected.logistique?.checklist.transfertAeroport ?? false,
    })
    setNotes(selected.logistique?.notes ?? '')
    setDateArrivee(selected.logistique?.dateArrivee ?? '')
    setDateDepart(selected.logistique?.dateDepart ?? '')
    setHebergement(selected.logistique?.hebergement ?? '')
    setTransport(selected.logistique?.transport ?? '')
    setAccompagnateur(selected.logistique?.accompagnateur ?? '')
  }, [selected?.id])

  const save = async () => {
    if (!selectedPatient) return
    setSaving(true)
    setError(null)
    try {
      await gestionnaireApi.updateLogistique(selectedPatient, {
        passport: checklist.passport,
        billet: checklist.billet,
        hebergementConfirme: checklist.hebergementConfirme,
        transfertAeroport: checklist.transfertAeroport,
        notes,
        dateArrivee: dateArrivee || null,
        dateDepart: dateDepart || null,
        hebergement: hebergement || null,
        transport: transport || null,
        accompagnateur: accompagnateur || null,
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de sauvegarder.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Logistique sejours</h2>
            <p className="text-sm text-muted-foreground">Organisation et suivi des dossiers logistiques</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-amber-700 font-semibold">A traiter</p>
            <p className="text-2xl font-bold text-amber-800 mt-1">{patientsATraiter.length}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">Completes</p>
            <p className="text-2xl font-bold text-emerald-800 mt-1">{patientsCompletes.length}</p>
          </div>
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-brand-700 font-semibold">Total dossiers</p>
            <p className="text-2xl font-bold text-brand-800 mt-1">{patientsLogistique.length}</p>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {patientsLogistique.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white text-center py-16">
          <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Aucun patient avec logistique a preparer.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {/* Patient list */}
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm max-h-[75vh] overflow-y-auto">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Séjours à organiser (cliquez pour ouvrir la fiche)
            </p>

            {patientsATraiter.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide">À traiter</p>
                {patientsATraiter.map((p) => {
                  const done = getDoneCount(p)
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPatient(p.id)
                        setIsModalOpen(true)
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                        selectedPatient === p.id
                          ? 'border-brand-500 bg-brand-50 shadow-sm'
                          : 'border-border hover:bg-muted/50'
                      )}
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-purple-100 text-purple-700 text-sm font-semibold">
                          {p.user.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{p.user.fullName}</p>
                        <p className="text-xs text-muted-foreground">{p.ville ?? '—'}</p>
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
            )}

            {patientsCompletes.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Complétés</p>
                {patientsCompletes.map((p) => {
                  const done = getDoneCount(p)
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPatient(p.id)
                        setIsModalOpen(true)
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                        selectedPatient === p.id
                          ? 'border-slate-300 bg-slate-50 shadow-sm'
                          : 'border-slate-200 hover:bg-slate-50/80'
                      )}
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-slate-100 text-slate-700 text-sm font-semibold">
                          {p.user.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{p.user.fullName}</p>
                        <p className="text-xs text-muted-foreground">{p.ville ?? '—'}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <div className="h-1.5 flex-1 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500/80 rounded-full" style={{ width: '100%' }} />
                          </div>
                          <span className="text-xs text-slate-600 font-medium">{done}/4</span>
                        </div>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Terminé
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal logistique */}
      {isModalOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsModalOpen(false)}
            aria-label="Fermer"
          />
          <div className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/95 px-5 py-4 backdrop-blur">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {selected.user.fullName} — {selected.ville ?? '—'}, {selected.pays ?? '—'}
                </h3>
                {dateArrivee && (
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Arrivée : {formatDate(dateArrivee)}
                    </span>
                    {dateDepart && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        Départ : {formatDate(dateDepart)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={selectedDone === totalItems ? 'success' : 'warning'}>
                  {selectedDone}/{totalItems} complété
                </Badge>
                <Button variant="ghost" size="icon" onClick={() => setIsModalOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Date arrivée</label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    value={dateArrivee}
                    onChange={(e) => setDateArrivee(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Date départ</label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    value={dateDepart}
                    onChange={(e) => setDateDepart(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Hébergement</label>
                  <input
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    value={hebergement}
                    onChange={(e) => setHebergement(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Transport</label>
                  <input
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    value={transport}
                    onChange={(e) => setTransport(e.target.value)}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs text-muted-foreground">Accompagnateur</label>
                  <input
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    value={accompagnateur}
                    onChange={(e) => setAccompagnateur(e.target.value)}
                  />
                </div>
              </div>

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

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                  Fermer
                </Button>
                <Button
                  variant="brand"
                  className="h-11 text-sm font-semibold"
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {saving ? 'Sauvegarde...' : completionCount === totalItems ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Logistique complète
                    </>
                  ) : (
                    'Sauvegarder'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
