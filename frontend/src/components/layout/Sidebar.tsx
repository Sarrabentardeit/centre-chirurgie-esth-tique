import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, FileText, Calendar, MessageSquare,
  Bell, LogOut, Heart, ClipboardList, FileCheck,
  Package, TrendingUp, Camera, X, UserPlus, CalendarDays,
  ChevronDown, History,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useChatUnreadStore } from '@/store/chatUnreadStore'
import { useNotifUnreadStore } from '@/store/notifUnreadStore'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { UnreadBadge } from '@/components/UnreadBadge'
import { useEffect, useMemo, useState } from 'react'
import type { UserRole } from '@/types'
import { gestionnaireApi, medecinApi, patientApi } from '@/lib/api'
import { prefetchRoute } from '@/lib/routePrefetch'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  badgeKey?: 'chat' | 'notifications'
}

interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  patient: [
    { label: 'Mon Dossier', href: '/patient/dossier', icon: FileText },
    { label: 'Formulaire Médical', href: '/patient/formulaire', icon: ClipboardList },
    { label: 'Mes Devis', href: '/patient/devis', icon: FileCheck },
    { label: 'Mon Agenda', href: '/patient/agenda', icon: Calendar },
    { label: 'Planning séjour', href: '/patient/planning-sejour', icon: CalendarDays },
    { label: 'Suivi Post-Op', href: '/patient/post-op', icon: Camera },
    { label: 'Chat', href: '/patient/chat', icon: MessageSquare, badgeKey: 'chat' },
    { label: 'Notifications', href: '/patient/notifications', icon: Bell, badgeKey: 'notifications' },
  ],
  medecin: [],
  gestionnaire: [],
}

const MEDECIN_TOP: NavItem[] = [
  { label: 'Tableau de bord', href: '/medecin/dashboard', icon: LayoutDashboard },
]

const MEDECIN_GROUPS: NavGroup[] = [
  {
    id: 'medecin-clinique',
    label: 'Clinique',
    items: [
      { label: 'Patients', href: '/medecin/patients', icon: Users },
      { label: 'Rapports Médicaux', href: '/medecin/rapports', icon: FileText },
      { label: 'Devis', href: '/medecin/devis', icon: FileCheck },
      { label: 'Agenda', href: '/medecin/agenda', icon: Calendar },
    ],
  },
  {
    id: 'medecin-suivi',
    label: 'Suivi',
    items: [
      { label: 'Suivi Post-Op', href: '/medecin/post-op', icon: Heart },
      { label: 'Chat', href: '/medecin/chat', icon: MessageSquare, badgeKey: 'chat' },
      { label: 'Notifications', href: '/medecin/notifications', icon: Bell, badgeKey: 'notifications' },
    ],
  },
]

const GESTIONNAIRE_TOP: NavItem[] = [
  { label: 'Tableau de bord', href: '/gestionnaire/dashboard', icon: LayoutDashboard },
]

const GESTIONNAIRE_GROUPS: NavGroup[] = [
  {
    id: 'operations',
    label: 'Opérations',
    items: [
      { label: 'Patients', href: '/gestionnaire/patients', icon: Users },
      { label: 'Devis', href: '/gestionnaire/devis', icon: FileCheck },
      { label: 'Agenda', href: '/gestionnaire/agenda', icon: Calendar },
      { label: 'Planning séjour', href: '/gestionnaire/planning-sejour', icon: CalendarDays },
      { label: 'Chat', href: '/gestionnaire/chat', icon: MessageSquare, badgeKey: 'chat' },
    ],
  },
  {
    id: 'suivi',
    label: 'Suivi',
    items: [
      { label: 'Logistique', href: '/gestionnaire/logistique', icon: Package },
      { label: 'Communication', href: '/gestionnaire/communications', icon: MessageSquare },
      { label: 'Notifications', href: '/gestionnaire/notifications', icon: Bell, badgeKey: 'notifications' },
      { label: 'Analytics', href: '/gestionnaire/analytics', icon: TrendingUp },
      { label: 'Journal d’audit', href: '/gestionnaire/audit', icon: History },
    ],
  },
]

const GESTIONNAIRE_BOTTOM: NavItem[] = [
  { label: 'Comptes', href: '/gestionnaire/users', icon: UserPlus },
]

function renderNavGroups({
  groups,
  openGroups,
  setOpenGroups,
  groupBadge,
  badges,
  onClose,
}: {
  groups: NavGroup[]
  openGroups: Record<string, boolean>
  setOpenGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  groupBadge: (group: NavGroup) => number
  badges: { chat: number; notifications: number }
  onClose: () => void
}) {
  return groups.map((group) => {
    const expanded = openGroups[group.id] ?? true
    const badge = groupBadge(group)
    return (
      <div key={group.id} className="pt-2">
        <button
          type="button"
          onClick={() =>
            setOpenGroups((prev) => ({ ...prev, [group.id]: !expanded }))
          }
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-brand-600/80 hover:bg-brand-100/70"
        >
          <span className="flex-1 text-left">{group.label}</span>
          {badge > 0 && !expanded && (
            <Badge className="h-5 min-w-5 px-1.5 text-[10px] bg-brand-600 text-white border-0 normal-case tracking-normal">
              {badge > 99 ? '99+' : badge}
            </Badge>
          )}
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </button>
        {expanded && (
          <div className="mt-0.5 space-y-0.5 pl-0.5">
            {group.items.map((item) => (
              <NavItemLink
                key={item.href}
                item={item}
                badges={badges}
                onClose={onClose}
              />
            ))}
          </div>
        )}
      </div>
    )
  })
}

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

function NavItemLink({
  item,
  badges,
  onClose,
}: {
  item: NavItem
  badges: { chat: number; notifications: number }
  onClose: () => void
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const Icon = item.icon
  const isActive =
    location.pathname === item.href ||
    (item.href !== '/' && location.pathname.startsWith(item.href))
  const badgeCount = item.badgeKey ? badges[item.badgeKey] : 0

  return (
    <NavLink
      to={item.href}
      end={item.href === '/gestionnaire/devis' || item.href === '/medecin/devis'}
      onMouseEnter={() => prefetchRoute(item.href)}
      onFocus={() => prefetchRoute(item.href)}
      onTouchStart={() => prefetchRoute(item.href)}
      onClick={(e) => {
        prefetchRoute(item.href)
        onClose()
        if (
          location.pathname !== item.href &&
          location.pathname.startsWith(`${item.href}/`)
        ) {
          e.preventDefault()
          navigate(item.href)
        } else if (location.pathname === item.href) {
          e.preventDefault()
          navigate(item.href, { replace: true, state: { navReset: Date.now() } })
        }
      }}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-white text-brand-950 shadow-sm ring-1 ring-brand-200'
          : 'text-brand-800/70 hover:bg-white/70 hover:text-brand-950',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-brand-600' : 'text-brand-600/60')} />
      <span className="flex-1">{item.label}</span>
      <UnreadBadge count={badgeCount} className="bg-brand-600" />
    </NavLink>
  )
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()

  const chatUnread = useChatUnreadStore((s) => s.unread)
  const notifUnread = useNotifUnreadStore((s) => s.unread)
  const setNotifUnread = useNotifUnreadStore((s) => s.setUnread)

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!user) {
      setNotifUnread(0)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        if (user.role === 'gestionnaire') {
          const r = await gestionnaireApi.getDashboard()
          if (!cancelled) setNotifUnread(r.stats.notifications)
          return
        }
        if (user.role === 'medecin') {
          const r = await medecinApi.getNotifications()
          if (!cancelled) setNotifUnread(r.notifications.filter((n) => !n.lu).length)
          return
        }
        const r = await patientApi.getNotifications()
        if (!cancelled) setNotifUnread(r.notifications.filter((n) => !n.lu).length)
      } catch {
        if (!cancelled) setNotifUnread(0)
      }
    }
    void load()
    const id = window.setInterval(() => {
      void load()
    }, 20000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [user, location.pathname, setNotifUnread])

  // Groupes ouverts par défaut (médecin + gestionnaire)
  useEffect(() => {
    if (user?.role !== 'gestionnaire' && user?.role !== 'medecin') return
    const groups = user.role === 'medecin' ? MEDECIN_GROUPS : GESTIONNAIRE_GROUPS
    setOpenGroups((prev) => {
      if (Object.keys(prev).length > 0) return prev
      const next: Record<string, boolean> = {}
      for (const group of groups) next[group.id] = true
      return next
    })
  }, [user?.role])

  const badges = useMemo(() => {
    if (!user) return { chat: 0, notifications: 0 }
    return { chat: chatUnread, notifications: notifUnread }
  }, [user, chatUnread, notifUnread])

  if (!user) return null

  const navItems = NAV_ITEMS[user.role]
  const initials = user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  const roleLabel: Record<UserRole, string> = {
    patient: 'Patient',
    medecin: 'Médecin',
    gestionnaire: 'Gestionnaire',
  }

  const roleColor: Record<UserRole, string> = {
    patient: 'bg-brand-100 text-brand-950',
    medecin: 'bg-brand-100 text-brand-700',
    gestionnaire: 'bg-brand-200 text-brand-800',
  }

  const groupBadge = (group: NavGroup) =>
    group.items.reduce((sum, item) => {
      if (!item.badgeKey) return sum
      return sum + badges[item.badgeKey]
    }, 0)

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[min(16rem,85vw)] flex-col bg-brand-50 border-r border-brand-200 shadow-lg transition-transform duration-300 lg:translate-x-0 lg:relative lg:w-64 lg:shadow-none',
          'pb-app-nav lg:pb-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Accent charte */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-brand-950" aria-hidden />
        <div className="pointer-events-none absolute inset-y-0 left-1 w-px bg-brand-600/60" aria-hidden />

        {/* En-tête marque — monogramme transparent + typo charte */}
        <div className="relative border-b border-brand-200 bg-gradient-to-b from-white to-brand-50 px-3 pb-4 pt-4 pl-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 text-center">
              <div className="mx-auto flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-brand-100/70 ring-1 ring-brand-200">
                <img
                  src="/brand-mark-sidebar.png"
                  alt=""
                  className="h-[3.35rem] w-[3.35rem] object-contain"
                />
              </div>
              <p className="mt-3 font-display text-[1.05rem] font-semibold leading-none tracking-tight text-brand-950">
                Dr. Mehdi Chennoufi
              </p>
              <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-600">
                Chirurgie Esthétique
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-8 w-8 shrink-0 text-brand-800 hover:bg-brand-100 hover:text-brand-950"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="absolute inset-x-5 bottom-0 h-px bg-gradient-to-r from-transparent via-brand-600/50 to-transparent" />
        </div>

        {/* Profil */}
        <div className="border-b border-brand-200 bg-brand-50 px-3 py-3 pl-4">
          <div className="flex items-center gap-3 rounded-xl border border-brand-200/80 bg-white/80 p-3 shadow-sm">
            <Avatar className="h-9 w-9 ring-2 ring-brand-100">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="bg-brand-100 text-brand-700 text-sm font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-brand-900 truncate">{user.name}</p>
              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', roleColor[user.role])}>
                {roleLabel[user.role]}
              </span>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 pl-4 space-y-1 bg-brand-50/60">
          {user.role === 'gestionnaire' ? (
            <>
              {GESTIONNAIRE_TOP.map((item) => (
                <NavItemLink key={item.href} item={item} badges={badges} onClose={onClose} />
              ))}
              {renderNavGroups({
                groups: GESTIONNAIRE_GROUPS,
                openGroups,
                setOpenGroups,
                groupBadge,
                badges,
                onClose,
              })}
              <div className="pt-2 border-t border-brand-200 mt-2 space-y-0.5">
                {GESTIONNAIRE_BOTTOM.map((item) => (
                  <NavItemLink key={item.href} item={item} badges={badges} onClose={onClose} />
                ))}
              </div>
            </>
          ) : user.role === 'medecin' ? (
            <>
              {MEDECIN_TOP.map((item) => (
                <NavItemLink key={item.href} item={item} badges={badges} onClose={onClose} />
              ))}
              {renderNavGroups({
                groups: MEDECIN_GROUPS,
                openGroups,
                setOpenGroups,
                groupBadge,
                badges,
                onClose,
              })}
            </>
          ) : (
            navItems.map((item) => (
              <NavItemLink key={item.href} item={item} badges={badges} onClose={onClose} />
            ))
          )}
        </nav>

        <div className="shrink-0 border-t border-brand-200 bg-brand-50 px-3 py-3 pl-4">
          <button
            type="button"
            onClick={() => {
              const redirectPath = user.role === 'patient' ? '/acces-patient' : '/login'
              logout()
              navigate(redirectPath, { replace: true })
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-100 transition-all"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Déconnexion
          </button>
        </div>
      </aside>
    </>
  )
}
