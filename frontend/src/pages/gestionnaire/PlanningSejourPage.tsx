import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, RefreshCw, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { StatusBadge } from '@/lib/statusUi'
import { cn, formatDate } from '@/lib/utils'
import { gestionnaireApi, type GestionnairePlanningSejourPatient } from '@/lib/api'
import { LIST_PAGE_SIZE, PaginationBar, paginateSlice } from '@/components/PaginationBar'
import { cachedFetch, hasCachedData } from '@/lib/cachedFetch'
import { queryKeys } from '@/lib/queryKeys'
import {
  passageBucket,
  passageDateRaw,
  passageMonthMeta,
  passageTimestamp,
  PASSAGE_BUCKET_LABEL,
  PASSAGE_BUCKET_ORDER,
  startOfTodayLocal,
  type PassageBucket,
} from '@/lib/passageDates'

type PhaseKey = 'all' | 'logistique' | 'planning' | 'intervention' | 'post_op'

function phaseOf(p: GestionnairePlanningSejourPatient): Exclude<PhaseKey, 'all'> {
  if (p.status === 'post_op' || p.status === 'suivi_termine') return 'post_op'
  if (p.status === 'intervention') return 'intervention'
  // Avant l’intervention : planning finalisé vs encore en logistique
  if (p.planning?.statut === 'finalise') return 'planning'
  return 'logistique'
}

export default function PlanningSejourPage() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<GestionnairePlanningSejourPatient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<GestionnairePlanningSejourPatient | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [phaseFilter, setPhaseFilter] = useState<PhaseKey>('all')

  const ordered = useMemo(() => {
    const today = startOfTodayLocal()
    /**
     * À venir puis Opérées — même tri dans chaque bloc :
     * décroissant (plus récent en premier), ex. nov → oct → sept.
     */
    return [...patients].sort((a, b) => {
      const ba = passageBucket(a, today)
      const bb = passageBucket(b, today)
      if (ba !== bb) return PASSAGE_BUCKET_ORDER[ba] - PASSAGE_BUCKET_ORDER[bb]
      const ta = passageTimestamp(a)
      const tb = passageTimestamp(b)
      if (ta == null && tb == null) return a.user.fullName.localeCompare(b.user.fullName, 'fr')
      if (ta == null) return 1
      if (tb == null) return -1
      return tb - ta
    })
  }, [patients])

  const phaseCounts = useMemo(() => {
    const counts = { logistique: 0, planning: 0, intervention: 0, post_op: 0 }
    for (const p of patients) {
      counts[phaseOf(p)] += 1
    }
    return counts
  }, [patients])

  const filtered = useMemo(() => {
    if (phaseFilter === 'all') return ordered
    return ordered.filter((p) => phaseOf(p) === phaseFilter)
  }, [ordered, phaseFilter])

  const passageCounts = useMemo(() => {
    const today = startOfTodayLocal()
    let upcoming = 0
    let past = 0
    let undated = 0
    for (const p of filtered) {
      const b = passageBucket(p, today)
      if (b === 'upcoming') upcoming += 1
      else if (b === 'past') past += 1
      else undated += 1
    }
    return { upcoming, past, undated }
  }, [filtered])

  const { slice: pagePatients, totalPages, page: safePage, total: listTotal } = useMemo(
    () => paginateSlice(filtered, page, LIST_PAGE_SIZE),
    [filtered, page],
  )

  useEffect(() => {
    setPage(1)
  }, [patients.length, phaseFilter])

  const load = async (opts?: { useCache?: boolean }) => {
    const key = queryKeys.planningSejour()
    const force = !opts?.useCache
    if (opts?.useCache && hasCachedData(key)) setLoading(false)
    else setLoading(true)
    setError(null)
    try {
      const res = await cachedFetch(key, () => gestionnaireApi.getPlanningSejour(), { force })
      setPatients(res.patients)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load({ useCache: true })
  }, [])

  const openEditor = (id: string) => {
    navigate(`/gestionnaire/planning-sejour/${id}/personnaliser`)
  }

  const openDossierPlanning = (id: string) => {
    navigate(`/gestionnaire/devis/${id}?section=planning`)
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

  const kpiItems: Array<{
    key: PhaseKey
    label: string
    value: number
    tone: string
  }> = [
    {
      key: 'all',
      label: 'Total',
      value: patients.length,
      tone: 'border-slate-200 bg-slate-50 text-slate-700',
    },
    {
      key: 'logistique',
      label: 'Logistique en cours',
      value: phaseCounts.logistique,
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
    },
    {
      key: 'planning',
      label: 'Planning',
      value: phaseCounts.planning,
      tone: 'border-sky-200 bg-sky-50 text-sky-800',
    },
    {
      key: 'intervention',
      label: 'Intervention',
      value: phaseCounts.intervention,
      tone: 'border-violet-200 bg-violet-50 text-violet-800',
    },
    {
      key: 'post_op',
      label: 'Post-op',
      value: phaseCounts.post_op,
      tone: 'border-brand-200 bg-brand-50 text-brand-800',
    },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Patients Confirmés</h2>
            <p className="text-sm text-muted-foreground">
              À venir puis Opérées — plus récent en premier (ex. nov → oct → sept).
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Actualiser
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
          {kpiItems.map((item) => {
            const active = phaseFilter === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setPhaseFilter(item.key)}
                className={cn(
                  'rounded-xl border px-4 py-3 text-left transition-all',
                  item.tone,
                  active ? 'ring-2 ring-brand-400/40 shadow-sm' : 'hover:shadow-sm',
                )}
              >
                <p className="text-xs uppercase tracking-wide font-semibold opacity-80">{item.label}</p>
                <p className="text-2xl font-bold mt-1 tabular-nums">{item.value}</p>
              </button>
            )
          })}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {patients.length === 0 && !loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white text-center py-16">
          <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Aucune patiente avec devis accepté pour le moment.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-2 bg-muted/10 border-b border-border/40">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{filtered.length}</span>
              {' '}dossier{filtered.length > 1 ? 's' : ''}
              {phaseFilter !== 'all' ? ' (filtrés)' : ''}
            </p>
          </div>
          <div className="divide-y divide-border/40 max-h-[75vh] overflow-y-auto">
            {pagePatients.map((p, idx) => {
              const today = startOfTodayLocal()
              const passage = passageDateRaw(p)
              const bucket = passageBucket(p, today)
              const month = passageMonthMeta(passage?.value)
              const globalIndex = (safePage - 1) * LIST_PAGE_SIZE + idx
              const prev = globalIndex > 0 ? filtered[globalIndex - 1] : null
              const prevBucket = prev ? passageBucket(prev, today) : null
              const prevMonth = prev ? passageMonthMeta(passageDateRaw(prev)?.value) : null
              const showBucketHeader = prev == null || prevBucket !== bucket
              const showMonthHeader =
                bucket !== 'undated'
                && !!month
                && (showBucketHeader || prevMonth?.key !== month.key)
              const bucketCount =
                bucket === 'upcoming'
                  ? passageCounts.upcoming
                  : bucket === 'past'
                    ? passageCounts.past
                    : passageCounts.undated

              return (
                <div key={p.id}>
                  {showBucketHeader && (
                    <BucketHeader bucket={bucket} count={bucketCount} />
                  )}
                  {showMonthHeader && month && (
                    <div className="px-4 sm:px-5 py-1.5 bg-white border-b border-border/40">
                      <p className="text-[11px] font-medium text-slate-500">{month.label}</p>
                    </div>
                  )}
                  <PatientRow
                    patient={p}
                    passage={passage}
                    onOpenDossier={openDossierPlanning}
                    onOpenEditor={openEditor}
                    onDelete={setDeleteTarget}
                  />
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                Aucun dossier dans cette phase.
              </div>
            )}
          </div>
          <PaginationBar
            page={safePage}
            totalPages={totalPages}
            total={listTotal}
            pageSize={LIST_PAGE_SIZE}
            onPageChange={setPage}
          />
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

function BucketHeader({ bucket, count }: { bucket: PassageBucket; count: number }) {
  return (
    <div
      className={cn(
        'px-4 sm:px-5 py-2.5 border-b flex items-center justify-between gap-2',
        bucket === 'upcoming' && 'bg-emerald-50/70 border-emerald-100',
        bucket === 'past' && 'bg-slate-50 border-slate-200/80',
        bucket === 'undated' && 'bg-amber-50/60 border-amber-100',
      )}
    >
      <p
        className={cn(
          'text-xs font-semibold tracking-wide',
          bucket === 'upcoming' && 'text-emerald-800',
          bucket === 'past' && 'text-slate-600',
          bucket === 'undated' && 'text-amber-800',
        )}
      >
        {PASSAGE_BUCKET_LABEL[bucket]}
      </p>
      <span className="text-[11px] font-medium text-slate-500 tabular-nums">{count}</span>
    </div>
  )
}

function PatientRow({
  patient: p,
  passage,
  onOpenDossier,
  onOpenEditor,
  onDelete,
}: {
  patient: GestionnairePlanningSejourPatient
  passage: { kind: 'intervention' | 'arrivee'; value: string } | null
  onOpenDossier: (id: string) => void
  onOpenEditor: (id: string) => void
  onDelete: (p: GestionnairePlanningSejourPatient) => void
}) {
  const planningHint =
    p.planning?.statut === 'finalise'
      ? 'Planning finalisé'
      : p.planning?.hasContent
        ? 'Planning brouillon'
        : null

  return (
    <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-muted/20 transition-colors">
      <button
        type="button"
        onClick={() => onOpenDossier(p.id)}
        className="flex flex-1 items-center gap-3 min-w-0 text-left"
      >
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarFallback className="text-sm font-semibold bg-brand-50 text-brand-700">
            {p.user.fullName
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-900 truncate">{p.user.fullName}</p>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-md shrink-0">
              {p.dossierNumber}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <StatusBadge kind="dossier" value={p.status} />
            {planningHint && <span className="text-[11px] text-slate-400">{planningHint}</span>}
          </div>
        </div>

        <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0 min-w-[140px]">
          {passage ? (
            <p className="text-sm font-semibold text-slate-900 tabular-nums">{formatDate(passage.value)}</p>
          ) : (
            <p className="text-sm text-slate-400">—</p>
          )}
          <p className="text-[11px] text-slate-500">
            {passage?.kind === 'arrivee'
              ? 'Date d’arrivée'
              : passage
                ? 'Date d’intervention'
                : 'Date non renseignée'}
          </p>
        </div>
      </button>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-500 hover:text-brand-700"
          title="Modifier le planning"
          onClick={() => onOpenEditor(p.id)}
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
  )
}
