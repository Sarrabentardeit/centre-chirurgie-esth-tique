import { useCallback, useEffect, useMemo, useState } from 'react'
import { History, RefreshCw, Search, X } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { dossierStatusLabel, formatDateTime, cn } from '@/lib/utils'
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

const DEVIS_STATUT_FR: Record<string, string> = {
  brouillon: 'Brouillon',
  envoye: 'Envoyé',
  accepte: 'Accepté',
  refuse: 'Refusé',
}

function str(data: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!data) return null
  const v = data[key]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function devisStatutFr(s: string | null): string {
  if (!s) return '—'
  return DEVIS_STATUT_FR[s] ?? s
}

function patientLabel(log: GestionnaireAuditLog): string | null {
  const name = log.context?.patientName
    ?? str(log.after, 'patientName')
    ?? str(log.before, 'patientName')
    ?? str(log.before, 'fullName')
  const dossier = log.context?.dossierNumber
    ?? str(log.after, 'dossierNumber')
    ?? str(log.before, 'dossierNumber')
  if (name && dossier) return `${name} · ${dossier}`
  if (name) return name
  if (dossier) return dossier
  return null
}

function summarize(log: GestionnaireAuditLog): { title: string; detail: string | null } {
  const before = log.before ?? {}
  const after = log.after ?? {}
  const num =
    log.context?.numeroDevis
    ?? str(after, 'numeroDevis')
    ?? str(before, 'numeroDevis')
  const kind = str(after, 'kind') ?? str(before, 'kind')

  if (log.entity === 'devis') {
    const from = str(before, 'statut')
    const to = str(after, 'statut')
    const reason = str(after, 'reason')

    if (kind === 'envoi_devis' || (from === 'brouillon' && to === 'envoye')) {
      return {
        title: `Devis envoyé${num ? ` ${num}` : ''}`,
        detail: `Statut : ${devisStatutFr(from)} → ${devisStatutFr(to)}`,
      }
    }
    if (kind === 'acceptation_devis' || to === 'accepte') {
      return {
        title: `Devis accepté${num ? ` ${num}` : ''}`,
        detail: `Statut : ${devisStatutFr(from)} → ${devisStatutFr(to)}`,
      }
    }
    if (kind === 'refus_devis' || to === 'refuse') {
      return {
        title: `Devis refusé${num ? ` ${num}` : ''}`,
        detail: reason
          ? `Statut : ${devisStatutFr(from)} → ${devisStatutFr(to)} · Motif : ${reason}`
          : `Statut : ${devisStatutFr(from)} → ${devisStatutFr(to)}`,
      }
    }
    if (kind === 'annulation_acceptation') {
      return {
        title: `Acceptation annulée${num ? ` (${num})` : ''}`,
        detail: `Statut : ${devisStatutFr(from)} → ${devisStatutFr(to)}`,
      }
    }
    if (log.action === 'delete' || kind === 'suppression_devis') {
      const version = typeof before.version === 'number' ? ` v${before.version}` : ''
      return {
        title: `Devis supprimé${num ? ` ${num}` : ''}${version}`,
        detail: from ? `Était : ${devisStatutFr(from)}` : null,
      }
    }
    if (from && to && from !== to) {
      return {
        title: `Devis${num ? ` ${num}` : ''} : ${devisStatutFr(from)} → ${devisStatutFr(to)}`,
        detail: null,
      }
    }
    return {
      title: `Action devis${num ? ` ${num}` : ''}`,
      detail: null,
    }
  }

  if (log.entity === 'patient') {
    const from = str(before, 'status')
    const to = str(after, 'status')
    if (from && to) {
      return {
        title: 'Changement de statut du dossier',
        detail: `${dossierStatusLabel(from)} → ${dossierStatusLabel(to)}`,
      }
    }
    if (log.action === 'delete') {
      return {
        title: 'Patient / compte supprimé',
        detail: str(before, 'email'),
      }
    }
    return { title: 'Action patient', detail: null }
  }

  if (log.entity === 'message') {
    const preview = str(before, 'preview')
    return {
      title: 'Message chat supprimé',
      detail: preview
        ? `« ${preview.slice(0, 100)}${preview.length > 100 ? '…' : ''} »`
        : null,
    }
  }

  return {
    title: `${ACTION_LABELS[log.action]} · ${ENTITY_LABELS[log.entity] ?? log.entity}`,
    detail: null,
  }
}

export default function AuditPage() {
  const [logs, setLogs] = useState<GestionnaireAuditLog[]>([])
  const [entity, setEntity] = useState('')
  const [search, setSearch] = useState('')
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return logs
    return logs.filter((log) => {
      const { title, detail } = summarize(log)
      const patient = patientLabel(log) ?? ''
      const hay = [
        title,
        detail ?? '',
        patient,
        log.actor.fullName,
        log.actor.role,
        log.context?.numeroDevis ?? '',
        log.context?.dossierNumber ?? '',
        ENTITY_LABELS[log.entity] ?? log.entity,
        ACTION_LABELS[log.action],
      ].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [logs, search])

  const countLabel = useMemo(() => {
    if (loading && logs.length === 0) return 'Chargement…'
    if (search.trim()) {
      return `${filtered.length} résultat${filtered.length > 1 ? 's' : ''} (sur ${logs.length})`
    }
    return `${logs.length} action${logs.length > 1 ? 's' : ''} récente${logs.length > 1 ? 's' : ''}`
  }, [loading, logs.length, filtered.length, search])

  useEffect(() => {
    setPage(1)
  }, [entity, search])

  const { slice: pageLogs, totalPages, page: safePage, total } = useMemo(
    () => paginateSlice(filtered, page, LIST_PAGE_SIZE),
    [filtered, page],
  )

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <PageHeader
        title="Journal d’audit"
        description="Historique détaillé : qui a fait quoi, sur quel dossier / devis, et quel changement."
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Actualiser
          </Button>
        }
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <input
          className="w-full pl-10 pr-9 py-2.5 text-sm rounded-xl border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30 focus:border-brand-400"
          placeholder="Rechercher nom, n° dossier, n° devis, action…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

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
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={History}
          title={search ? 'Aucun résultat' : 'Aucune action enregistrée'}
          description={
            search
              ? `Aucun résultat pour « ${search} ».`
              : 'Les envois de devis, changements de statut et suppressions apparaîtront ici.'
          }
        />
      ) : (
        <div className="rounded-xl border border-border bg-white overflow-hidden">
          <div className="space-y-2 p-2 sm:p-3">
            {pageLogs.map((log) => {
              const { title, detail } = summarize(log)
              const patient = patientLabel(log)
              return (
                <Card key={log.id}>
                  <CardContent className="py-3.5 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1.5">
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
                        <p className="text-sm font-semibold text-foreground leading-snug">{title}</p>
                        {detail && (
                          <p className="text-xs text-slate-600 leading-relaxed">{detail}</p>
                        )}
                        {patient && (
                          <p className="text-xs font-medium text-brand-800">
                            Patiente : {patient}
                          </p>
                        )}
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
              )
            })}
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
