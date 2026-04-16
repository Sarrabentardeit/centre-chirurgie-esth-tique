import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import type { UserRole } from '@/types'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuthStore()
  const location = useLocation()

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
