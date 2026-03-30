import { Bell, CheckCheck, Info, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { formatRelative } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Notification } from '@/types'
import { useDemoStore } from '@/store/demoStore'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

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

export default function NotificationsPage() {
  const { user } = useAuthStore()
  const notificationsStore = useDemoStore((s) => s.notifications)
  const markNotificationRead = useDemoStore((s) => s.markNotificationRead)
  const markAllNotificationsReadForUser = useDemoStore((s) => s.markAllNotificationsReadForUser)
  const navigate = useNavigate()

  const allNotifs = useMemo(() => {
    if (!user) return []
    return notificationsStore.filter((n) => n.userId === user.id)
  }, [notificationsStore, user?.id])

  const unreadCount = useMemo(() => allNotifs.filter((n) => !n.lu).length, [allNotifs])

  const markAllRead = () => {
    if (!user) return
    markAllNotificationsReadForUser(user.id)
  }

  const markRead = (id: string) => markNotificationRead(id)

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            Notifications
            {unreadCount > 0 && (
              <Badge className="bg-brand-600 text-white text-xs">{unreadCount}</Badge>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">{allNotifs.length} notifications</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4" />
            Tout marquer comme lu
          </Button>
        )}
      </div>

      {allNotifs.length === 0 ? (
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
                onClick={() => markRead(notif.id)}
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
