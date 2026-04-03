import { useAuthStore, getDashboardPath } from '@/store/authStore'
import { mockLogin } from '@/mocks/auth'
import { useLocation, useNavigate } from 'react-router-dom'
import type { UserRole } from '@/types'

export function useAuth() {
  const { user, isAuthenticated, isLoading, login, logout, setLoading } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogin = async (
    email: string,
    password: string,
    allowedRoles?: UserRole[]
  ) => {
    setLoading(true)
    const result = await mockLogin(email, password)
    if (result.success && result.user && result.token) {
      if (allowedRoles && !allowedRoles.includes(result.user.role)) {
        setLoading(false)
        return {
          success: false,
          error: 'Espace réservé au backoffice. Les patientes accèdent via le lien formulaire direct.',
        }
      }
      login(result.user, result.token)
      const fromPath =
        (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
      const canUseFromPath = Boolean(
        fromPath &&
          ((result.user.role === 'patient' && fromPath.startsWith('/patient')) ||
            (result.user.role === 'medecin' && fromPath.startsWith('/medecin')) ||
            (result.user.role === 'gestionnaire' && fromPath.startsWith('/gestionnaire')))
      )
      navigate(canUseFromPath ? (fromPath as string) : getDashboardPath(result.user.role))
      return { success: true }
    }
    setLoading(false)
    return { success: false, error: result.error }
  }

  const handleLogout = () => {
    const redirectPath = user?.role === 'patient' ? '/acces-patient' : '/login'
    logout()
    navigate(redirectPath)
  }

  return {
    user,
    isAuthenticated,
    isLoading,
    handleLogin,
    handleLogout,
  }
}
