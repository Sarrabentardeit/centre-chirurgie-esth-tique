import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, FileText, Calendar,
  Bell, Heart, FileCheck,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useChatUnreadStore } from '@/store/chatUnreadStore'
import { useNotifUnreadStore } from '@/store/notifUnreadStore'
import type { UserRole } from '@/types'
import { UnreadBadge } from '@/components/UnreadBadge'

interface BottomNavItem {
  label: string
  href: string
  icon: React.ElementType
  badgeKey?: 'chat' | 'notifications'
}

/** 5 onglets max — labels courts pour ≤360px. */
const BOTTOM_NAV_ITEMS: Record<UserRole, BottomNavItem[]> = {
  patient: [
    { label: 'Dossier', href: '/patient/dossier', icon: FileText },
    { label: 'Agenda', href: '/patient/agenda', icon: Calendar },
    { label: 'Devis', href: '/patient/devis', icon: FileCheck },
    { label: 'Chat', href: '/patient/chat', icon: MessageSquare, badgeKey: 'chat' },
    { label: 'Notifs', href: '/patient/notifications', icon: Bell, badgeKey: 'notifications' },
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
    { label: 'Notifs', href: '/gestionnaire/notifications', icon: Bell, badgeKey: 'notifications' },
  ],
}

export function BottomNav() {
  const { user } = useAuthStore()
  const chatUnread = useChatUnreadStore((s) => s.unread)
  const notifUnread = useNotifUnreadStore((s) => s.unread)
  const location = useLocation()
  const navigate = useNavigate()

  if (!user) return null

  const items = BOTTOM_NAV_ITEMS[user.role]
  const badgeFor = (key?: 'chat' | 'notifications') => {
    if (key === 'chat') return chatUnread
    if (key === 'notifications') return notifUnread
    return 0
  }

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 flex lg:hidden border-t border-brand-200/80 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/92"
      style={{
        height: 'calc(var(--bottom-nav-h) + var(--safe-bottom))',
        paddingBottom: 'var(--safe-bottom)',
      }}
    >
      {items.map(({ label, href, icon: Icon, badgeKey }) => (
        <NavLink
          key={href}
          to={href}
          onClick={(e) => {
            if (location.pathname !== href && location.pathname.startsWith(`${href}/`)) {
              e.preventDefault()
              navigate(href)
            } else if (location.pathname === href) {
              e.preventDefault()
              navigate(href, { replace: true, state: { navReset: Date.now() } })
            }
          }}
          className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 pt-1.5 text-[10px] font-semibold leading-none tracking-tight"
        >
          {({ isActive }) => {
            const count = badgeFor(badgeKey)
            return (
              <>
                {/* Indicateur actif — pill */}
                <span
                  className={cn(
                    'absolute top-1 h-0.5 w-5 rounded-full transition-all duration-200',
                    isActive ? 'bg-brand-600 opacity-100 scale-100' : 'opacity-0 scale-75',
                  )}
                />
                <span
                  className={cn(
                    'relative mt-0.5 flex h-8 w-[2.65rem] items-center justify-center rounded-full transition-all duration-200',
                    isActive ? 'bg-brand-100 text-brand-950' : 'text-brand-800/55',
                  )}
                >
                  <Icon
                    className={cn('h-[1.35rem] w-[1.35rem]', isActive && 'text-brand-700')}
                    strokeWidth={isActive ? 2.35 : 1.9}
                  />
                  <UnreadBadge
                    count={count}
                    size="sm"
                    className="absolute -right-0.5 -top-0.5"
                  />
                </span>
                <span
                  className={cn(
                    'w-full truncate text-center transition-colors',
                    isActive ? 'text-brand-950' : 'text-brand-800/55',
                  )}
                >
                  {label}
                </span>
              </>
            )
          }}
        </NavLink>
      ))}
    </nav>
  )
}
