import { Menu, Bell, Calendar, FileCheck, FileText, Loader2, MessageSquare, Search, User, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuthStore } from '@/store/authStore'
import { cn, formatRelative } from '@/lib/utils'
import { playNotificationSound, unlockNotificationAudio } from '@/lib/notificationSounds'
import { dossierStatusUi } from '@/lib/statusUi'
import type { DossierStatus } from '@/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  gestionnaireApi,
  medecinApi,
  patientApi,
  type GestionnaireNotificationRow,
  type PatientListItem,
} from '@/lib/api'
import { useNotifUnreadStore } from '@/store/notifUnreadStore'

interface NavbarProps {
  onMenuClick: () => void
  title?: string
}

type ApiNotif = GestionnaireNotificationRow

type GlobalSearchHit = {
  patientId: string
  fullName: string
  email: string
  dossierNumber: string
  numeroDevis?: string | null
  status: string
}

function mapPatientsToHits(patients: PatientListItem[]): GlobalSearchHit[] {
  return patients.slice(0, 8).map((p) => ({
    patientId: p.id,
    fullName: p.user.fullName,
    email: p.user.email,
    dossierNumber: p.dossierNumber,
    numeroDevis: p.devis?.[0]?.numeroDevis ?? null,
    status: p.status,
  }))
}

export function Navbar({ onMenuClick, title }: NavbarProps) {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const setNotifUnread = useNotifUnreadStore((s) => s.setUnread)
  const [openNotif, setOpenNotif] = useState(false)
  const notifRef = useRef<HTMLDivElement | null>(null)
  const [apiNotifs, setApiNotifs] = useState<ApiNotif[]>([])
  const prevNotifUnreadRef = useRef<number | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchHits, setSearchHits] = useState<GlobalSearchHit[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [activeHit, setActiveHit] = useState(0)
  const searchRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const searchTimerRef = useRef<number | null>(null)
  const searchReqRef = useRef(0)

  const loadApiNotifications = useCallback(async () => {
    if (!user) return
    try {
      if (user.role === 'gestionnaire') {
        const res = await gestionnaireApi.getNotifications()
        setApiNotifs(res.notifications)
      } else if (user.role === 'patient') {
        const res = await patientApi.getNotifications()
        setApiNotifs(res.notifications)
      } else if (user.role === 'medecin') {
        const res = await medecinApi.getNotifications()
        setApiNotifs(res.notifications)
      }
    } catch {
      // Silent fallback: keep current UI state.
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      setApiNotifs([])
      return
    }
    void loadApiNotifications()
    const id = window.setInterval(() => {
      void loadApiNotifications()
    }, 15000)
    return () => window.clearInterval(id)
  }, [user, loadApiNotifications])

  const unreadCount = useMemo(
    () => apiNotifs.filter((n) => !n.lu).length,
    [apiNotifs],
  )

  useEffect(() => {
    setNotifUnread(unreadCount)
  }, [unreadCount, setNotifUnread])

  /** Compte hors messages chat (le son message est déjà géré à part). */
  const nonChatUnreadCount = useMemo(() => {
    const isChatNotif = (titre: string) => /message chat|nouveau message/i.test(titre)
    return apiNotifs.filter((n) => !n.lu && !isChatNotif(n.titre)).length
  }, [apiNotifs])

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

  const userNotifications = useMemo(
    () =>
      apiNotifs
        .slice()
        .sort((a, b) => new Date(b.dateCreation).getTime() - new Date(a.dateCreation).getTime())
        .slice(0, 6),
    [apiNotifs],
  )

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (!notifRef.current) return
      if (!notifRef.current.contains(e.target as Node)) setOpenNotif(false)
    }
    if (openNotif) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [openNotif])

  const isStaffSearch = user?.role === 'medecin' || user?.role === 'gestionnaire'

  const runGlobalSearch = useCallback(async (raw: string) => {
    const q = raw.trim()
    if (!user || (user.role !== 'medecin' && user.role !== 'gestionnaire')) return
    if (q.length < 2) {
      setSearchHits([])
      setSearchError(null)
      setSearchLoading(false)
      return
    }
    const reqId = ++searchReqRef.current
    setSearchLoading(true)
    setSearchError(null)
    try {
      const res =
        user.role === 'medecin'
          ? await medecinApi.getPatients({ search: q })
          : await gestionnaireApi.getPatients({ search: q })
      if (reqId !== searchReqRef.current) return
      setSearchHits(mapPatientsToHits(res.patients))
      setActiveHit(0)
    } catch (e) {
      if (reqId !== searchReqRef.current) return
      setSearchHits([])
      setSearchError(e instanceof Error ? e.message : 'Recherche impossible.')
    } finally {
      if (reqId === searchReqRef.current) setSearchLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!isStaffSearch) return
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current)
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchHits([])
      setSearchError(null)
      setSearchLoading(false)
      return
    }
    setSearchLoading(true)
    searchTimerRef.current = window.setTimeout(() => {
      void runGlobalSearch(q)
    }, 280)
    return () => {
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current)
    }
  }, [searchQuery, isStaffSearch, runGlobalSearch])

  useEffect(() => {
    if (!searchOpen) return
    const handleOutside = (e: MouseEvent) => {
      if (!searchRef.current) return
      if (!searchRef.current.contains(e.target as Node)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [searchOpen])

  const goToSearchHit = useCallback((hit: GlobalSearchHit) => {
    if (!user) return
    if (user.role === 'gestionnaire') {
      navigate(`/gestionnaire/devis/${hit.patientId}`)
    } else {
      navigate(`/medecin/patients/${hit.patientId}`)
    }
    setSearchOpen(false)
    setSearchQuery('')
    setSearchHits([])
    searchInputRef.current?.blur()
  }, [navigate, user])

  const openNotificationsPage = () => {
    if (!user) return
    if (user.role === 'gestionnaire') navigate('/gestionnaire/notifications')
    else if (user.role === 'patient') navigate('/patient/notifications')
    else if (user.role === 'medecin') navigate('/medecin/notifications')
    setOpenNotif(false)
  }

  const markAllRead = async () => {
    if (!user) return
    try {
      if (user.role === 'gestionnaire') await gestionnaireApi.markAllNotificationsRead()
      else if (user.role === 'patient') await patientApi.markAllNotificationsRead()
      else if (user.role === 'medecin') await medecinApi.markAllNotificationsRead()
      setApiNotifs((prev) => prev.map((n) => ({ ...n, lu: true })))
    } catch {
      // Silent fallback.
    }
  }

  const onNotifClick = async (n: ApiNotif) => {
    if (!n.lu && user) {
      try {
        if (user.role === 'gestionnaire') await gestionnaireApi.markNotificationRead(n.id)
        else if (user.role === 'patient') await patientApi.markNotificationRead(n.id)
        else if (user.role === 'medecin') await medecinApi.markNotificationRead(n.id)
        setApiNotifs((prev) => prev.map((row) => (row.id === n.id ? { ...row, lu: true } : row)))
      } catch {
        // Silent fallback.
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
      style={{ paddingTop: 'var(--safe-top)', height: 'calc(var(--top-nav-h) + var(--safe-top))' }}
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

      {/* Recherche globale — médecin / gestionnaire */}
      {isStaffSearch && (
        <div className="flex-1 max-w-md min-w-0" ref={searchRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setSearchOpen(true)
                setOpenNotif(false)
              }}
              onFocus={() => {
                setSearchOpen(true)
                setOpenNotif(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearchOpen(false)
                  searchInputRef.current?.blur()
                  return
                }
                if (!searchOpen || searchHits.length === 0) {
                  if (e.key === 'Enter' && searchQuery.trim().length >= 2) {
                    e.preventDefault()
                    void runGlobalSearch(searchQuery)
                    setSearchOpen(true)
                  }
                  return
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActiveHit((i) => Math.min(i + 1, searchHits.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActiveHit((i) => Math.max(i - 1, 0))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  const hit = searchHits[activeHit]
                  if (hit) goToSearchHit(hit)
                }
              }}
              placeholder="Nom, email, nº dossier, devis…"
              className="w-full h-9 pl-9 pr-9 rounded-lg border border-input bg-muted/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:bg-background transition-colors"
              autoComplete="off"
              aria-label="Recherche globale"
              aria-expanded={searchOpen}
              aria-controls="global-search-results"
            />
            {searchQuery ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md text-muted-foreground hover:bg-muted flex items-center justify-center"
                aria-label="Effacer la recherche"
                onClick={() => {
                  setSearchQuery('')
                  setSearchHits([])
                  setSearchError(null)
                  searchInputRef.current?.focus()
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}

            {searchOpen && searchQuery.trim().length >= 2 && (
              <div
                id="global-search-results"
                role="listbox"
                className="absolute left-0 right-0 top-11 z-50 rounded-xl border border-border bg-white shadow-lg overflow-hidden"
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/70 bg-slate-50/80">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Résultats
                  </p>
                  {searchLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {searchError ? (
                    <p className="px-3 py-4 text-sm text-destructive">{searchError}</p>
                  ) : searchLoading && searchHits.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">Recherche…</p>
                  ) : searchHits.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Aucun patient, dossier ou devis trouvé.
                    </p>
                  ) : (
                    <div className="p-1.5 space-y-0.5">
                      {searchHits.map((hit, idx) => {
                        const statusUi = dossierStatusUi(hit.status as DossierStatus)
                        return (
                          <button
                            key={hit.patientId}
                            type="button"
                            role="option"
                            aria-selected={idx === activeHit}
                            className={cn(
                              'w-full rounded-lg px-2.5 py-2 text-left transition-colors flex items-start gap-2.5',
                              idx === activeHit ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-muted/60',
                            )}
                            onMouseEnter={() => setActiveHit(idx)}
                            onClick={() => goToSearchHit(hit)}
                          >
                            <span className="mt-0.5 h-8 w-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                              {hit.numeroDevis ? <FileText className="h-4 w-4" /> : <User className="h-4 w-4" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-slate-900 truncate">
                                {hit.fullName}
                              </span>
                              <span className="block text-[11px] text-muted-foreground truncate">
                                {hit.dossierNumber}
                                {hit.numeroDevis && hit.numeroDevis !== hit.dossierNumber
                                  ? ` · Devis ${hit.numeroDevis}`
                                  : ''}
                                {' · '}
                                {hit.email}
                              </span>
                            </span>
                            <span className="shrink-0 text-[10px] font-semibold text-slate-500 mt-1">
                              {statusUi.label}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                {searchHits.length > 0 && (
                  <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
                    ↑↓ naviguer · Entrée ouvrir · Échap fermer
                  </div>
                )}
              </div>
            )}
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

              {user?.role === 'patient' && (
                <div className="flex gap-1.5 border-b border-border px-2 py-2">
                  {[
                    { label: 'Devis', href: '/patient/devis', icon: FileCheck },
                    { label: 'RDV', href: '/patient/agenda', icon: Calendar },
                    { label: 'Chat', href: '/patient/chat', icon: MessageSquare },
                  ].map(({ label, href, icon: Icon }) => (
                    <button
                      key={href}
                      type="button"
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-muted/60 px-2 py-1.5 text-[11px] font-medium text-foreground hover:bg-brand-50 hover:text-brand-700"
                      onClick={() => {
                        navigate(href)
                        setOpenNotif(false)
                      }}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {label}
                    </button>
                  ))}
                </div>
              )}

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
