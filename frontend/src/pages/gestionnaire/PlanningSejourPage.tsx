import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, RefreshCw, FileText, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { gestionnaireApi, type GestionnairePlanningSejourPatient } from '@/lib/api'

function isFinalise(p: GestionnairePlanningSejourPatient) {
  return p.planning?.statut === 'finalise'
}

export default function PlanningSejourPage() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<GestionnairePlanningSejourPatient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const ordered = useMemo(() => {
    return [...patients].sort((a, b) => {
      const af = isFinalise(a)
      const bf = isFinalise(b)
      if (af !== bf) return af ? 1 : -1
      return a.user.fullName.localeCompare(b.user.fullName, 'fr')
    })
  }, [patients])

  const aTraiter = ordered.filter((p) => !isFinalise(p))
  const finalises = ordered.filter((p) => isFinalise(p))

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await gestionnaireApi.getPlanningSejour()
      setPatients(res.patients)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const openEditor = (id: string) => {
    navigate(`/gestionnaire/planning-sejour/${id}/personnaliser`)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Planning séjour</h2>
            <p className="text-sm text-muted-foreground">
              Patientes avec devis accepté — éditeur comme les devis (modèle Word)
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Actualiser
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-amber-700 font-semibold">À traiter</p>
            <p className="text-2xl font-bold text-amber-800 mt-1">{aTraiter.length}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">Finalisés</p>
            <p className="text-2xl font-bold text-emerald-800 mt-1">{finalises.length}</p>
          </div>
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-brand-700 font-semibold">Total</p>
            <p className="text-2xl font-bold text-brand-800 mt-1">{patients.length}</p>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {patients.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white text-center py-16">
          <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Aucune patiente avec devis accepté pour le moment.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm max-h-[75vh] overflow-y-auto space-y-4">
          {aTraiter.length > 0 && (
            <PatientSection
              title="À traiter"
              titleClass="text-amber-700"
              patients={aTraiter}
              onOpen={openEditor}
            />
          )}
          {finalises.length > 0 && (
            <PatientSection
              title="Finalisés"
              titleClass="text-emerald-700"
              patients={finalises}
              onOpen={openEditor}
              done
            />
          )}
        </div>
      )}
    </div>
  )
}

function PatientSection({
  title,
  titleClass,
  patients,
  onOpen,
  done,
}: {
  title: string
  titleClass: string
  patients: GestionnairePlanningSejourPatient[]
  onOpen: (id: string) => void
  done?: boolean
}) {
  return (
    <div className="space-y-2">
      <p className={cn('text-[11px] font-semibold uppercase tracking-wide', titleClass)}>{title}</p>
      {patients.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onOpen(p.id)}
          className="w-full flex items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-muted/50 hover:border-brand-300 transition-all"
        >
          <Avatar className="h-9 w-9">
            <AvatarFallback
              className={cn(
                'text-sm font-semibold',
                done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800',
              )}
            >
              {p.user.fullName
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{p.user.fullName}</p>
            <p className="text-xs text-muted-foreground">
              {p.planning?.moisLabel ?? 'Planning non créé'}
              {p.planning?.hasContent ? ' · brouillon enregistré' : ''}
            </p>
          </div>
          {done ? (
            <span className="text-[10px] font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-full px-2 py-0.5">
              Finalisé
            </span>
          ) : p.planning?.hasContent ? (
            <FileText className="h-4 w-4 text-amber-600 shrink-0" />
          ) : (
            <span className="text-[10px] font-medium text-amber-700">À faire</span>
          )}
          <Pencil className="h-4 w-4 text-slate-400 shrink-0" />
        </button>
      ))}
    </div>
  )
}
