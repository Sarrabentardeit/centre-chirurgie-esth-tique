import { Navigate, useLocation } from 'react-router-dom'
import { useAuthHydrated, useAuthStore } from '@/store/authStore'
import type { UserRole } from '@/types'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuthStore()
  const hydrated = useAuthHydrated()
  const location = useLocation()

  // Évite une redirection fantôme avant lecture de la session localStorage
  if (!hydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Chargement de la session…
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    // Règle absolue : les patients ne voient jamais le backoffice
    const isBackofficeArea =
      location.pathname.startsWith('/medecin') ||
      location.pathname.startsWith('/gestionnaire')
    const loginPath = isBackofficeArea ? '/login' : '/acces-patient'
    return <Navigate to={loginPath} state={{ from: location }} replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const fallbackPaths: Record<UserRole, string> = {
      patient: '/patient/dossier',
      medecin: '/medecin/dashboard',
      gestionnaire: '/gestionnaire/dashboard',
    }
    return <Navigate to={fallbackPaths[user.role]} replace />
  }

  return <>{children}</>
}
