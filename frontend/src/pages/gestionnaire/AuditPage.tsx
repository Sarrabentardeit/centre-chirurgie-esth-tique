import { useCallback, useEffect, useMemo, useState } from 'react'
import { History, RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatDateTime, cn } from '@/lib/utils'
import { gestionnaireApi, type GestionnaireAuditLog } from '@/lib/api'
import { LIST_PAGE_SIZE, PaginationBar, paginateSlice } from '@/components/PaginationBar'
import { cachedFetch, hasCachedData } from '@/lib/cachedFetch'
import { queryKeys } from '@/lib/queryKeys'

const ENTITY_FILTERS = [
  { value: '', label: 'Tout' },
  { value: 'devis', label: 'Devis' },
  { value: 'patient', label: 'Statut patient' },
  { value: 'message', label: 'Messages' },
] as const

const ACTION_LABELS: Record<GestionnaireAuditLog['action'], string> = {
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
  status_change: 'Changement de statut',
}

const ENTITY_LABELS: Record<string, string> = {
  devis: 'Devis',
  patient: 'Patient',
  message: 'Message chat',
}

function summarize(log: GestionnaireAuditLog): string {
  const before = log.before ?? {}
  const after = log.after ?? {}

  if (log.entity === 'devis') {
    const from = typeof before.statut === 'string' ? before.statut : null
    const to = typeof after.statut === 'string' ? after.statut : null
    const num =
      (typeof after.numeroDevis === 'string' && after.numeroDevis) ||
      (typeof before.numeroDevis === 'string' && before.numeroDevis) ||
      null
    if (log.action === 'delete') {
      return `Suppression du devis${num ? ` ${num}` : ''}${from ? ` (était ${from})` : ''}`
    }
    if (from && to) return `Devis${num ? ` ${num}` : ''} : ${from} → ${to}`
    return `Action devis${num ? ` ${num}` : ''}`
  }

  if (log.entity === 'patient') {
    const from = typeof before.status === 'string' ? before.status : null
    const to = typeof after.status === 'string' ? after.status : null
    if (from && to) return `Statut dossier : ${from} → ${to}`
    return 'Changement de statut patient'
  }

  if (log.entity === 'message') {
    const preview = typeof before.preview === 'string' ? before.preview.trim() : ''
    return preview
      ? `Message supprimé pour tous : « ${preview.slice(0, 80)}${preview.length > 80 ? '…' : ''} »`
      : 'Message supprimé pour tout le monde'
  }

  return `${ACTION_LABELS[log.action]} · ${ENTITY_LABELS[log.entity] ?? log.entity}`
}

export default function AuditPage() {
  const [logs, setLogs] = useState<GestionnaireAuditLog[]>([])
  const [entity, setEntity] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (opts?: { useCache?: boolean }) => {
    const key = queryKeys.audit(entity)
    const force = !opts?.useCache
    if (opts?.useCache && hasCachedData(key)) setLoading(false)
    else setLoading(true)
    setError(null)
    try {
      const res = await cachedFetch(
        key,
        () =>
          gestionnaireApi.getAuditLogs({
            entity: entity || undefined,
            limit: 100,
          }),
        { force },
      )
      setLogs(res.logs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [entity])

  useEffect(() => {
    void load({ useCache: true })
  }, [load])

  const countLabel = useMemo(() => {
    if (loading && logs.length === 0) return 'Chargement…'
    return `${logs.length} action${logs.length > 1 ? 's' : ''} récente${logs.length > 1 ? 's' : ''}`
  }, [loading, logs.length])

  useEffect(() => {
    setPage(1)
  }, [entity])

  const { slice: pageLogs, totalPages, page: safePage, total } = useMemo(
    () => paginateSlice(logs, page, LIST_PAGE_SIZE),
    [logs, page],
  )

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <PageHeader
        title="Journal d’audit"
        description="Historique des actions sensibles : envoi de devis, changements de statut, suppressions de messages."
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Actualiser
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {ENTITY_FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            onClick={() => setEntity(f.value)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              entity === f.value
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">{countLabel}</p>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && logs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Chargement…</p>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={History}
          title="Aucune action enregistrée"
          description="Les envois de devis, changements de statut et suppressions de messages apparaîtront ici."
        />
      ) : (
        <div className="rounded-xl border border-border bg-white overflow-hidden">
          <div className="space-y-2 p-2 sm:p-3">
            {pageLogs.map((log) => (
              <Card key={log.id}>
                <CardContent className="py-3.5 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px]">
                          {ENTITY_LABELS[log.entity] ?? log.entity}
                        </Badge>
                        <Badge
                          className={cn(
                            'text-[10px] border-0',
                            log.action === 'delete' && 'bg-red-100 text-red-700',
                            log.action === 'status_change' && 'bg-amber-100 text-amber-800',
                            (log.action === 'create' || log.action === 'update') && 'bg-slate-100 text-slate-700',
                          )}
                        >
                          {ACTION_LABELS[log.action]}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-foreground leading-snug">{summarize(log)}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.actor.fullName}
                        <span className="mx-1">·</span>
                        {log.actor.role}
                      </p>
                    </div>
                    <p className="shrink-0 text-[11px] text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <PaginationBar
            page={safePage}
            totalPages={totalPages}
            total={total}
            pageSize={LIST_PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  )
}
