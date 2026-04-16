import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, CheckCheck, Info, AlertCircle, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatRelative, cn } from '@/lib/utils'
import type { Notification } from '@/types'
import { useNavigate } from 'react-router-dom'
import { gestionnaireApi, type GestionnaireNotificationRow } from '@/lib/api'

const TYPE_ICONS: Record<Notification['type'], React.ElementType> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  urgent: AlertCircle,
}

const ICON_COLORS: Record<Notification['type'], string> = {
  info: 'text-blue-600',
  success: 'text-emerald-600',
  warning: 'text-amber-600',
  urgent: 'text-red-600',
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
  const [rows, setRows] = useState<GestionnaireNotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await gestionnaireApi.getNotifications()
      setRows(res.notifications)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const allNotifs: UiNotif[] = useMemo(
    () => rows.map((n) => ({ ...n, type: mapApiType(n.type) })),
    [rows]
  )

  const unreadCount = useMemo(() => allNotifs.filter((n) => !n.lu).length, [allNotifs])

  const markAllRead = async () => {
    try {
      await gestionnaireApi.markAllNotificationsRead()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action impossible.')
    }
  }

  const markRead = async (id: string) => {
    try {
      await gestionnaireApi.markNotificationRead(id)
      setRows((prev) => prev.map((n) => (n.id === id ? { ...n, lu: true } : n)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action impossible.')
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            Notifications
            {unreadCount > 0 && (
              <Badge className="bg-brand-600 text-white text-xs">{unreadCount}</Badge>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">{allNotifs.length} notifications</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void markAllRead()}>
              <CheckCheck className="h-4 w-4" />
              Tout marquer comme lu
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {loading && allNotifs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Chargement…</p>
      ) : allNotifs.length === 0 ? (
        <div className="text-center py-12">
          <Bell className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Aucune notification.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {allNotifs.map((notif) => {
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
                onClick={() => void markRead(notif.id)}
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
                      <p className="text-sm text-muted-foreground mt-0.5">{notif.message}</p>
                      {notif.lienAction && (
                        <Button
                          variant="link"
                          className="p-0 h-auto text-xs text-brand-600 hover:underline mt-1"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(notif.lienAction!)
                          }}
                        >
                          Voir le détail →
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
