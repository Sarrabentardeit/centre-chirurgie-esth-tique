import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, FileText, Calendar,
  Bell, Heart, ClipboardList, FileCheck,
  CalendarDays,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import type { UserRole } from '@/types'

interface BottomNavItem {
  label: string
  href: string
  icon: React.ElementType
}

/** Labels courts pour tenir sur petits smartphones (≤360px). */
const BOTTOM_NAV_ITEMS: Record<UserRole, BottomNavItem[]> = {
  patient: [
    { label: 'Dossier', href: '/patient/dossier', icon: FileText },
    { label: 'Form.', href: '/patient/formulaire', icon: ClipboardList },
    { label: 'Devis', href: '/patient/devis', icon: FileCheck },
    { label: 'Agenda', href: '/patient/agenda', icon: Calendar },
    { label: 'Post-op', href: '/patient/post-op', icon: Heart },
  ],
  medecin: [
    { label: 'Accueil', href: '/medecin/dashboard', icon: LayoutDashboard },
    { label: 'Patients', href: '/medecin/patients', icon: Users },
    { label: 'Rapports', href: '/medecin/rapports', icon: FileText },
    { label: 'Agenda', href: '/medecin/agenda', icon: Calendar },
    { label: 'Post-op', href: '/medecin/post-op', icon: Heart },
  ],
  gestionnaire: [
    { label: 'Accueil', href: '/gestionnaire/dashboard', icon: LayoutDashboard },
    { label: 'Patients', href: '/gestionnaire/patients', icon: Users },
    { label: 'Devis', href: '/gestionnaire/devis', icon: FileCheck },
    { label: 'Planning', href: '/gestionnaire/planning-sejour', icon: CalendarDays },
    { label: 'Notifs', href: '/gestionnaire/notifications', icon: Bell },
  ],
}

export function BottomNav() {
  const { user } = useAuthStore()
  if (!user) return null

  const items = BOTTOM_NAV_ITEMS[user.role]

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 flex lg:hidden border-t border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map(({ label, href, icon: Icon }) => (
        <NavLink
          key={href}
          to={href}
          className={({ isActive }) =>
            cn(
              'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-[9px] font-medium leading-tight transition-colors',
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
                  'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
                  isActive ? 'bg-brand-50' : ''
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="w-full text-center">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
