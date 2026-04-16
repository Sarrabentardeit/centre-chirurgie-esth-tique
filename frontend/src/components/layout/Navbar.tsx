import { Menu, Bell, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { formatRelative } from '@/lib/utils'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { gestionnaireApi, type GestionnaireNotificationRow } from '@/lib/api'

interface NavbarProps {
  onMenuClick: () => void
  title?: string
}

export function Navbar({ onMenuClick, title }: NavbarProps) {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [openNotif, setOpenNotif] = useState(false)
  const notifRef = useRef<HTMLDivElement | null>(null)
  const [gestionnaireNotifs, setGestionnaireNotifs] = useState<GestionnaireNotificationRow[]>([])

  const notifications = useDemoStore((s) => s.notifications)
  const markNotificationRead = useDemoStore((s) => s.markNotificationRead)
  const markAllNotificationsReadForUser = useDemoStore((s) => s.markAllNotificationsReadForUser)

  const loadGestionnaireNotifications = useCallback(async () => {
    if (user?.role !== 'gestionnaire') return
    try {
      const res = await gestionnaireApi.getNotifications()
      setGestionnaireNotifs(res.notifications)
    } catch {
      // Silent fallback: keep current UI state.
    }
  }, [user?.role])

  useEffect(() => {
    if (user?.role !== 'gestionnaire') {
      setGestionnaireNotifs([])
      return
    }
    void loadGestionnaireNotifications()
    const id = window.setInterval(() => {
      void loadGestionnaireNotifications()
    }, 15000)
    return () => window.clearInterval(id)
  }, [user?.role, loadGestionnaireNotifications])

  const unreadCount = useMemo(() => {
    if (!user) return 0
    if (user.role === 'gestionnaire') {
      return gestionnaireNotifs.filter((n) => !n.lu).length
    }
    return notifications.filter((n) => n.userId === user.id && !n.lu).length
  }, [gestionnaireNotifs, notifications, user])

  const userNotifications = useMemo(() => {
    if (!user) return []
    if (user.role === 'gestionnaire') {
      return gestionnaireNotifs
        .slice()
        .sort((a, b) => new Date(b.dateCreation).getTime() - new Date(a.dateCreation).getTime())
        .slice(0, 6)
    }
    return notifications
      .filter((n) => n.userId === user.id)
      .slice()
      .sort((a, b) => new Date(b.dateCreation).getTime() - new Date(a.dateCreation).getTime())
      .slice(0, 6)
  }, [gestionnaireNotifs, notifications, user])

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
    if (user.role === 'patient') navigate('/patient/dossier')
    if (user.role === 'medecin') navigate('/medecin/dashboard')
    setOpenNotif(false)
  }

  const initials = user?.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? 'U'

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 px-4 lg:px-6">
      {/* Menu button (mobile) */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Title */}
      {title && (
        <h1 className="text-lg font-semibold text-foreground hidden sm:block">{title}</h1>
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
                    onClick={async () => {
                      if (user.role === 'gestionnaire') {
                        try {
                          await gestionnaireApi.markAllNotificationsRead()
                          setGestionnaireNotifs((prev) => prev.map((n) => ({ ...n, lu: true })))
                        } catch {
                          // Silent fallback.
                        }
                        return
                      }
                      markAllNotificationsReadForUser(user.id)
                    }}
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
                        onClick={async () => {
                          if (!n.lu && user?.role === 'gestionnaire') {
                            try {
                              await gestionnaireApi.markNotificationRead(n.id)
                              setGestionnaireNotifs((prev) =>
                                prev.map((row) => (row.id === n.id ? { ...row, lu: true } : row))
                              )
                            } catch {
                              // Silent fallback.
                            }
                          } else if (!n.lu) {
                            markNotificationRead(n.id)
                          }
                          if (n.lienAction) navigate(n.lienAction)
                          setOpenNotif(false)
                        }}
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
