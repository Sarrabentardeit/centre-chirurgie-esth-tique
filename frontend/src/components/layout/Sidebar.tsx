import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, FileText, Calendar, MessageSquare,
  Bell, Settings, LogOut, Heart, ClipboardList, FileCheck,
  Package, TrendingUp, Camera, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { UserRole } from '@/types'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  badge?: number
}

const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  patient: [
    { label: 'Mon Dossier', href: '/patient/dossier', icon: FileText },
    { label: 'Formulaire Médical', href: '/patient/formulaire', icon: ClipboardList },
    { label: 'Mes Devis', href: '/patient/devis', icon: FileCheck },
    { label: 'Mon Agenda', href: '/patient/agenda', icon: Calendar },
    { label: 'Suivi Post-Op', href: '/patient/post-op', icon: Camera },
    { label: 'Chat', href: '/patient/chat', icon: MessageSquare, badge: 2 },
  ],
  medecin: [
    { label: 'Tableau de bord', href: '/medecin/dashboard', icon: LayoutDashboard },
    { label: 'Patients', href: '/medecin/patients', icon: Users },
    { label: 'Rapports Médicaux', href: '/medecin/rapports', icon: FileText },
    { label: 'Agenda', href: '/medecin/agenda', icon: Calendar },
    { label: 'Suivi Post-Op', href: '/medecin/post-op', icon: Heart },
    { label: 'Chat', href: '/medecin/chat', icon: MessageSquare, badge: 3 },
  ],
  gestionnaire: [
    { label: 'Tableau de bord', href: '/gestionnaire/dashboard', icon: LayoutDashboard },
    { label: 'Patients', href: '/gestionnaire/patients', icon: Users },
    { label: 'Devis', href: '/gestionnaire/devis', icon: FileCheck },
    { label: 'Chat', href: '/gestionnaire/chat', icon: MessageSquare, badge: 2 },
    { label: 'Communication', href: '/gestionnaire/communications', icon: MessageSquare },
    { label: 'Logistique', href: '/gestionnaire/logistique', icon: Package },
    { label: 'Notifications', href: '/gestionnaire/notifications', icon: Bell, badge: 5 },
    { label: 'Analytics', href: '/gestionnaire/analytics', icon: TrendingUp },
  ],
}

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()

  if (!user) return null

  const navItems = NAV_ITEMS[user.role]
  const initials = user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  const roleLabel: Record<UserRole, string> = {
    patient: 'Patient',
    medecin: 'Médecin',
    gestionnaire: 'Gestionnaire',
  }

  const roleColor: Record<UserRole, string> = {
    patient: 'bg-blue-100 text-blue-700',
    medecin: 'bg-brand-100 text-brand-700',
    gestionnaire: 'bg-purple-100 text-purple-700',
  }

  return (
    <>
      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white border-r border-border shadow-lg transition-transform duration-300 lg:translate-x-0 lg:static lg:shadow-none',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 shadow-sm">
              <Heart className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground leading-none">Dr. Mehdi Chennoufi</p>
              <p className="text-xs text-muted-foreground mt-0.5">Chirurgie Esthétique</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* User Profile */}
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="bg-brand-100 text-brand-700 text-sm font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', roleColor[user.role])}>
                {roleLabel[user.role]}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.href ||
              (item.href !== '/' && location.pathname.startsWith(item.href))
            return (
              <NavLink
                key={item.href}
                to={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-brand-50 text-brand-700 shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-brand-600' : '')} />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <Badge className="h-5 min-w-5 px-1.5 text-xs bg-brand-600 text-white border-0">
                    {item.badge}
                  </Badge>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-border space-y-1">
          <NavLink
            to="/parametres"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
          >
            <Settings className="h-4 w-4" />
            Paramètres
          </NavLink>
          <button
            onClick={() => {
              logout()
              navigate('/login', { replace: true })
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </div>
      </aside>
    </>
  )
}
