import { Menu, Bell, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { formatRelative } from '@/lib/utils'
import { playNotificationSound, unlockNotificationAudio } from '@/lib/notificationSounds'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  gestionnaireApi,
  patientApi,
  type GestionnaireNotificationRow,
} from '@/lib/api'

interface NavbarProps {
  onMenuClick: () => void
  title?: string
}

type ApiNotif = GestionnaireNotificationRow

export function Navbar({ onMenuClick, title }: NavbarProps) {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [openNotif, setOpenNotif] = useState(false)
  const notifRef = useRef<HTMLDivElement | null>(null)
  const [apiNotifs, setApiNotifs] = useState<ApiNotif[]>([])
  const prevNotifUnreadRef = useRef<number | null>(null)

  const notifications = useDemoStore((s) => s.notifications)
  const markNotificationRead = useDemoStore((s) => s.markNotificationRead)
  const markAllNotificationsReadForUser = useDemoStore((s) => s.markAllNotificationsReadForUser)

  const usesApiNotifs = user?.role === 'gestionnaire' || user?.role === 'patient'

  const loadApiNotifications = useCallback(async () => {
    if (!user) return
    try {
      if (user.role === 'gestionnaire') {
        const res = await gestionnaireApi.getNotifications()
        setApiNotifs(res.notifications)
      } else if (user.role === 'patient') {
        const res = await patientApi.getNotifications()
        setApiNotifs(res.notifications)
      }
    } catch {
      // Silent fallback: keep current UI state.
    }
  }, [user])

  useEffect(() => {
    if (!usesApiNotifs) {
      setApiNotifs([])
      return
    }
    void loadApiNotifications()
    const id = window.setInterval(() => {
      void loadApiNotifications()
    }, 15000)
    return () => window.clearInterval(id)
  }, [usesApiNotifs, loadApiNotifications])

  const unreadCount = useMemo(() => {
    if (!user) return 0
    if (usesApiNotifs) {
      return apiNotifs.filter((n) => !n.lu).length
    }
    return notifications.filter((n) => n.userId === user.id && !n.lu).length
  }, [apiNotifs, notifications, user, usesApiNotifs])

  /** Compte hors messages chat (le son message est déjà géré à part). */
  const nonChatUnreadCount = useMemo(() => {
    if (!user) return 0
    const isChatNotif = (titre: string) => /message chat|nouveau message/i.test(titre)
    if (usesApiNotifs) {
      return apiNotifs.filter((n) => !n.lu && !isChatNotif(n.titre)).length
    }
    return notifications.filter((n) => n.userId === user.id && !n.lu && !isChatNotif(n.titre)).length
  }, [apiNotifs, notifications, user, usesApiNotifs])

  // Son quand une nouvelle notification (hors chat) arrive
  useEffect(() => {
    if (!user) {
      prevNotifUnreadRef.current = null
      return
    }
    const prev = prevNotifUnreadRef.current
    if (prev !== null && nonChatUnreadCount > prev) {
      unlockNotificationAudio()
      playNotificationSound()
    }
    prevNotifUnreadRef.current = nonChatUnreadCount
  }, [nonChatUnreadCount, user])

  const userNotifications = useMemo(() => {
    if (!user) return []
    if (usesApiNotifs) {
      return apiNotifs
        .slice()
        .sort((a, b) => new Date(b.dateCreation).getTime() - new Date(a.dateCreation).getTime())
        .slice(0, 6)
    }
    return notifications
      .filter((n) => n.userId === user.id)
      .slice()
      .sort((a, b) => new Date(b.dateCreation).getTime() - new Date(a.dateCreation).getTime())
      .slice(0, 6)
  }, [apiNotifs, notifications, user, usesApiNotifs])

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (!notifRef.current) return
      if (!notifRef.current.contains(e.target as Node)) setOpenNotif(false)
    }
    if (openNotif) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [openNotif])

  const openNotificationsPage = () => {
    if (!user) return
    if (user.role === 'gestionnaire') navigate('/gestionnaire/notifications')
    if (user.role === 'patient') navigate('/patient/notifications')
    if (user.role === 'medecin') navigate('/medecin/dashboard')
    setOpenNotif(false)
  }

  const markAllRead = async () => {
    if (!user) return
    if (user.role === 'gestionnaire') {
      try {
        await gestionnaireApi.markAllNotificationsRead()
        setApiNotifs((prev) => prev.map((n) => ({ ...n, lu: true })))
      } catch {
        // Silent fallback.
      }
      return
    }
    if (user.role === 'patient') {
      try {
        await patientApi.markAllNotificationsRead()
        setApiNotifs((prev) => prev.map((n) => ({ ...n, lu: true })))
      } catch {
        // Silent fallback.
      }
      return
    }
    markAllNotificationsReadForUser(user.id)
  }

  const onNotifClick = async (n: ApiNotif | (typeof notifications)[number]) => {
    if (!n.lu && user) {
      if (user.role === 'gestionnaire') {
        try {
          await gestionnaireApi.markNotificationRead(n.id)
          setApiNotifs((prev) => prev.map((row) => (row.id === n.id ? { ...row, lu: true } : row)))
        } catch {
          // Silent fallback.
        }
      } else if (user.role === 'patient') {
        try {
          await patientApi.markNotificationRead(n.id)
          setApiNotifs((prev) => prev.map((row) => (row.id === n.id ? { ...row, lu: true } : row)))
        } catch {
          // Silent fallback.
        }
      } else {
        markNotificationRead(n.id)
      }
    }
    if (n.lienAction) navigate(n.lienAction)
    setOpenNotif(false)
  }

  const initials = user?.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? 'U'

  return (
    <header
      className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 px-4 lg:px-6"
      style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(4rem + env(safe-area-inset-top))' }}
    >
      {/* Menu button (mobile) */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden min-h-11 min-w-11"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Title */}
      {title && (
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground sm:flex-none sm:text-lg">{title}</h1>
      )}

      {/* Search bar — backoffice uniquement */}
      {user?.role !== 'patient' && (
        <div className="flex-1 max-w-md hidden md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Rechercher un patient, dossier..."
              className="w-full h-9 pl-9 pr-4 rounded-lg border border-input bg-muted/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:bg-background transition-colors"
            />
          </div>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => setOpenNotif((v) => !v)}
            aria-label="Ouvrir les notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </Button>

          {openNotif && (
            <div className="absolute right-0 top-11 z-50 w-[320px] max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                <p className="text-sm font-semibold">Notifications</p>
                {user && unreadCount > 0 && (
                  <button
                    className="text-xs text-brand-600 hover:underline"
                    onClick={() => void markAllRead()}
                  >
                    Tout marquer lu
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {userNotifications.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">Aucune notification</p>
                ) : (
                  <div className="p-2 space-y-1.5">
                    {userNotifications.map((n) => (
                      <button
                        key={n.id}
                        className="w-full rounded-lg border border-border p-2.5 text-left hover:bg-muted/50 transition-colors"
                        onClick={() => void onNotifClick(n)}
                      >
                        <div className="flex items-start gap-2">
                          <div className={`mt-1 h-2 w-2 rounded-full ${n.lu ? 'bg-slate-300' : 'bg-brand-600'}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{n.titre}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">{formatRelative(n.dateCreation)}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-border p-2">
                <Button variant="ghost" size="sm" className="w-full" onClick={openNotificationsPage}>
                  Voir toutes les notifications
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Avatar */}
        <Avatar className="h-8 w-8 cursor-pointer">
          <AvatarImage src={user?.avatar} alt={user?.name} />
          <AvatarFallback className="bg-brand-100 text-brand-700 text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  )
}
