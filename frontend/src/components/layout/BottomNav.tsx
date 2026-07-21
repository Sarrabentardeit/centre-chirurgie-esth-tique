import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, FileText, Calendar,
  Bell, Heart, ClipboardList, FileCheck,
  CalendarDays, MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import type { UserRole } from '@/types'
import { useEffect, useState } from 'react'
import { chatApi } from '@/lib/api'

interface BottomNavItem {
  label: string
  href: string
  icon: React.ElementType
  badgeKey?: 'chat'
}

/** 5 onglets max — labels courts pour ≤360px. */
const BOTTOM_NAV_ITEMS: Record<UserRole, BottomNavItem[]> = {
  patient: [
    { label: 'Dossier', href: '/patient/dossier', icon: FileText },
    { label: 'Form.', href: '/patient/formulaire', icon: ClipboardList },
    { label: 'Chat', href: '/patient/chat', icon: MessageSquare, badgeKey: 'chat' },
    { label: 'Devis', href: '/patient/devis', icon: FileCheck },
    { label: 'Post-op', href: '/patient/post-op', icon: Heart },
  ],
  medecin: [
    { label: 'Accueil', href: '/medecin/dashboard', icon: LayoutDashboard },
    { label: 'Patients', href: '/medecin/patients', icon: Users },
    { label: 'Chat', href: '/medecin/chat', icon: MessageSquare, badgeKey: 'chat' },
    { label: 'Agenda', href: '/medecin/agenda', icon: Calendar },
    { label: 'Post-op', href: '/medecin/post-op', icon: Heart },
  ],
  gestionnaire: [
    { label: 'Accueil', href: '/gestionnaire/dashboard', icon: LayoutDashboard },
    { label: 'Patients', href: '/gestionnaire/patients', icon: Users },
    { label: 'Chat', href: '/gestionnaire/chat', icon: MessageSquare, badgeKey: 'chat' },
    { label: 'Devis', href: '/gestionnaire/devis', icon: FileCheck },
    { label: 'Notifs', href: '/gestionnaire/notifications', icon: Bell },
  ],
}

export function BottomNav() {
  const { user } = useAuthStore()
  const location = useLocation()
  const [chatUnread, setChatUnread] = useState(0)

  useEffect(() => {
    if (!user) {
      setChatUnread(0)
      return
    }
    let cancelled = false
    const load = () => {
      void chatApi
        .getUnread()
        .then((r) => {
          if (!cancelled) setChatUnread(r.unread)
        })
        .catch(() => {
          if (!cancelled) setChatUnread(0)
        })
    }
    load()
    const id = window.setInterval(load, 10000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [user?.id, user?.role, location.pathname])

  if (!user) return null

  const items = BOTTOM_NAV_ITEMS[user.role]

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 flex lg:hidden border-t border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map(({ label, href, icon: Icon, badgeKey }) => (
        <NavLink
          key={href}
          to={href}
          className={({ isActive }) =>
            cn(
              'relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-2 text-[10px] font-medium leading-tight transition-colors',
              isActive
                ? 'text-brand-600'
                : 'text-muted-foreground hover:text-foreground'
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  'relative flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                  isActive ? 'bg-brand-50' : '',
                  badgeKey === 'chat' && 'text-brand-700'
                )}
              >
                <Icon className={cn('h-5 w-5', badgeKey === 'chat' && isActive && 'scale-105')} />
                {badgeKey === 'chat' && chatUnread > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-white">
                    {chatUnread > 9 ? '9+' : chatUnread}
                  </span>
                )}
              </span>
              <span className="w-full text-center truncate">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
