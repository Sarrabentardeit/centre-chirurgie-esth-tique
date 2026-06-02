import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, RefreshCw, FileText, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ConfirmDialog } from '@/components/ConfirmDialog'
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
  const [deleteTarget, setDeleteTarget] = useState<GestionnairePlanningSejourPatient | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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

  const closeDeleteDialog = () => {
    if (deleteLoading) return
    setDeleteTarget(null)
    setDeleteError(null)
  }

  const confirmDelete = async () => {
    if (!deleteTarget?.planning) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await gestionnaireApi.deletePlanningSejour(deleteTarget.id)
      setPatients((prev) =>
        prev.map((row) => (row.id === deleteTarget.id ? { ...row, planning: null } : row)),
      )
      setDeleteTarget(null)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Impossible de supprimer le planning.')
    } finally {
      setDeleteLoading(false)
    }
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
              onDelete={setDeleteTarget}
            />
          )}
          {finalises.length > 0 && (
            <PatientSection
              title="Finalisés"
              titleClass="text-emerald-700"
              patients={finalises}
              onOpen={openEditor}
              onDelete={setDeleteTarget}
              done
            />
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={closeDeleteDialog}
        title="Supprimer ce planning séjour ?"
        description="Le document enregistré sera effacé. La patiente reste dans la liste tant que son devis est accepté."
        confirmLabel="Supprimer le planning"
        loading={deleteLoading}
        error={deleteError}
        onConfirm={confirmDelete}
        icon={
          <div className="h-11 w-11 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
            <Trash2 className="h-5 w-5 text-destructive" />
          </div>
        }
      >
        {deleteTarget && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="font-semibold text-sm text-slate-900">{deleteTarget.user.fullName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {deleteTarget.planning?.moisLabel ?? 'Planning'}
              {deleteTarget.planning?.statut === 'finalise' ? ' · finalisé' : ' · brouillon'}
            </p>
          </div>
        )}
      </ConfirmDialog>
    </div>
  )
}

function PatientSection({
  title,
  titleClass,
  patients,
  onOpen,
  onDelete,
  done,
}: {
  title: string
  titleClass: string
  patients: GestionnairePlanningSejourPatient[]
  onOpen: (id: string) => void
  onDelete: (p: GestionnairePlanningSejourPatient) => void
  done?: boolean
}) {
  return (
    <div className="space-y-2">
      <p className={cn('text-[11px] font-semibold uppercase tracking-wide', titleClass)}>{title}</p>
      {patients.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-muted/50 hover:border-brand-300 transition-all"
        >
          <button
            type="button"
            onClick={() => onOpen(p.id)}
            className="flex flex-1 items-center gap-3 min-w-0 text-left"
          >
            <Avatar className="h-9 w-9 shrink-0">
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
              <span className="text-[10px] font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-full px-2 py-0.5 shrink-0">
                Finalisé
              </span>
            ) : p.planning?.hasContent ? (
              <FileText className="h-4 w-4 text-amber-600 shrink-0" />
            ) : (
              <span className="text-[10px] font-medium text-amber-700 shrink-0">À faire</span>
            )}
          </button>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-500 hover:text-brand-700"
              title="Modifier le planning"
              onClick={() => onOpen(p.id)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            {p.planning && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-destructive hover:bg-destructive/10"
                title="Supprimer le planning"
                onClick={() => onDelete(p)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
