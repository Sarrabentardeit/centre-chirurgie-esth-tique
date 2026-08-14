import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, CheckCheck, Info, AlertCircle, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { formatRelative, cn } from '@/lib/utils'
import type { Notification } from '@/types'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { gestionnaireApi, medecinApi, type GestionnaireNotificationRow } from '@/lib/api'
import { PullToRefresh } from '@/components/PullToRefresh'
import { LIST_PAGE_SIZE, PaginationBar, paginateSlice } from '@/components/PaginationBar'
import { cachedFetch, hasCachedData, setCachedData } from '@/lib/cachedFetch'
import { queryKeys } from '@/lib/queryKeys'

const TYPE_ICONS: Record<Notification['type'], React.ElementType> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  urgent: AlertCircle,
}

const ICON_COLORS: Record<Notification['type'], string> = {
  info: 'text-brand-700',
  success: 'text-emerald-600',
  warning: 'text-amber-600',
  urgent: 'text-rose-600',
}

function mapApiType(t: string): Notification['type'] {
  if (t === 'error') return 'urgent'
  if (t === 'success') return 'success'
  if (t === 'warning') return 'warning'
  return 'info'
}

type UiNotif = Omit<GestionnaireNotificationRow, 'type'> & { type: Notification['type'] }

export default function NotificationsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isMedecin = user?.role === 'medecin'
  const [rows, setRows] = useState<GestionnaireNotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const load = useCallback(async (opts?: { silent?: boolean; useCache?: boolean }) => {
    const key = queryKeys.notifications(isMedecin ? 'medecin' : 'gestionnaire')
    const force = !opts?.useCache
    if (!opts?.silent) {
      if (opts?.useCache && hasCachedData(key)) setLoading(false)
      else setLoading(true)
    }
    setError(null)
    try {
      const res = await cachedFetch(
        key,
        () => (isMedecin ? medecinApi.getNotifications() : gestionnaireApi.getNotifications()),
        { force },
      )
      setRows(res.notifications)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [isMedecin])

  useEffect(() => {
    void load({ useCache: true })
  }, [load])

  const allNotifs: UiNotif[] = useMemo(
    () => rows.map((n) => ({ ...n, type: mapApiType(n.type) })),
    [rows]
  )

  const unreadCount = useMemo(() => allNotifs.filter((n) => !n.lu).length, [allNotifs])

  const { slice: pageNotifs, totalPages, page: safePage, total } = useMemo(
    () => paginateSlice(allNotifs, page, LIST_PAGE_SIZE),
    [allNotifs, page],
  )

  const markAllRead = async () => {
    try {
      if (isMedecin) await medecinApi.markAllNotificationsRead()
      else await gestionnaireApi.markAllNotificationsRead()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action impossible.')
    }
  }

  const markRead = async (id: string) => {
    try {
      if (isMedecin) await medecinApi.markNotificationRead(id)
      else await gestionnaireApi.markNotificationRead(id)
      const role = isMedecin ? 'medecin' as const : 'gestionnaire' as const
      setRows((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, lu: true } : n))
        setCachedData(queryKeys.notifications(role), { ok: true as const, notifications: next })
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action impossible.')
    }
  }

  return (
    <PullToRefresh onRefresh={() => load({ silent: true })}>
    <div className="max-w-2xl mx-auto space-y-5">
      <PageHeader
        title="Notifications"
        description={`${allNotifs.length} notification${allNotifs.length > 1 ? 's' : ''}${unreadCount > 0 ? ` · ${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : ''}`}
        actions={
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {unreadCount > 0 && (
              <Badge className="bg-brand-600 text-white text-xs sm:mr-1">{unreadCount}</Badge>
            )}
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5 flex-1 sm:flex-none" onClick={() => void markAllRead()}>
                <CheckCheck className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Tout marquer comme lu</span>
                <span className="sm:hidden">Tout lire</span>
              </Button>
            )}
          </div>
        }
      />

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {loading && allNotifs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Chargement…</p>
      ) : allNotifs.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Aucune notification"
          description="Les alertes patients, messages et événements apparaîtront ici."
          actionLabel={isMedecin ? 'Voir les patients' : 'Voir les devis'}
          onAction={() => navigate(isMedecin ? '/medecin/patients' : '/gestionnaire/devis')}
        />
      ) : (
        <div className="rounded-xl border border-border bg-white overflow-hidden">
          <div className="space-y-2 p-2 sm:p-3">
            {pageNotifs.map((notif) => {
              const isRead = notif.lu
              const Icon = TYPE_ICONS[notif.type]
              return (
                <Card
                  key={notif.id}
                  className={cn(
                    'transition-all cursor-pointer',
                    !isRead && 'shadow-sm border-l-4',
                    notif.type === 'info' && !isRead && 'border-l-blue-500',
                    notif.type === 'success' && !isRead && 'border-l-emerald-500',
                    notif.type === 'warning' && !isRead && 'border-l-amber-500',
                    notif.type === 'urgent' && !isRead && 'border-l-red-500',
                  )}
                  onClick={() => {
                    void markRead(notif.id)
                    if (notif.lienAction) navigate(notif.lienAction)
                  }}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl mt-0.5',
                          notif.type === 'info' && 'bg-blue-100',
                          notif.type === 'success' && 'bg-emerald-100',
                          notif.type === 'warning' && 'bg-amber-100',
                          notif.type === 'urgent' && 'bg-red-100',
                        )}
                      >
                        <Icon className={cn('h-4 w-4', ICON_COLORS[notif.type])} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn('text-sm font-semibold', isRead && 'font-medium text-muted-foreground')}>
                            {notif.titre}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            <p className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatRelative(notif.dateCreation)}
                            </p>
                            {!isRead && (
                              <div className="h-2 w-2 rounded-full bg-brand-600" />
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-line">{notif.message}</p>
                        {notif.lienAction && (
                          <Button
                            variant="link"
                            className="p-0 h-auto text-xs text-brand-600 hover:underline mt-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              void markRead(notif.id)
                              navigate(notif.lienAction!)
                            }}
                          >
                            Ouvrir le dossier →
                          </Button>
                        )}
                      </div>
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
    </PullToRefresh>
  )
}
