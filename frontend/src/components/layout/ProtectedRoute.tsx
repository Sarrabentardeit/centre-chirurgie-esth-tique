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
    const isPatientArea = location.pathname.startsWith('/patient')
    const loginPath = isPatientArea ? '/acces-patient' : '/login'
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
