import { useEffect } from 'react'
import { useAuthStore, getDashboardPath } from '@/store/authStore'
import { authApi, ApiRequestError } from '@/lib/api'
import { useLocation, useNavigate } from 'react-router-dom'
import type { User, UserRole } from '@/types'

export function useAuth() {
  const { user, isAuthenticated, isLoading, login, logout, setLoading } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  // Écoute l'événement auth:logout émis lors d'un 401 non-récupérable
  useEffect(() => {
    const handler = () => {
      const currentRole = useAuthStore.getState().user?.role
      logout()
      // Règle absolue : les patients ne vont JAMAIS sur /login (backoffice)
      if (currentRole === 'medecin' || currentRole === 'gestionnaire') {
        navigate('/login')
      } else {
        navigate('/acces-patient')
      }
    }
    window.addEventListener('auth:logout', handler)
    return () => window.removeEventListener('auth:logout', handler)
  }, [logout, navigate])

  const handleLogin = async (
    email: string,
    password: string,
    allowedRoles?: UserRole[]
  ) => {
    setLoading(true)
    try {
      const result = await authApi.login({ email, password })
      const userRole = result.user.role as UserRole

      if (allowedRoles && !allowedRoles.includes(userRole)) {
        setLoading(false)
        if (userRole === 'patient') {
          return {
            success: false,
            error: 'Cet espace est réservé au backoffice. Les patientes accèdent via l\'espace patient.',
          }
        }
        return {
          success: false,
          error: 'Accès non autorisé pour ce rôle.',
        }
      }

      const user: User = {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: userRole,
      }
      login(user, result.accessToken, result.refreshToken)

      const fromPath =
        (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
      const canUseFromPath = Boolean(
        fromPath &&
          ((userRole === 'patient' && fromPath.startsWith('/patient')) ||
            (userRole === 'medecin' && fromPath.startsWith('/medecin')) ||
            (userRole === 'gestionnaire' && fromPath.startsWith('/gestionnaire')))
      )
      navigate(canUseFromPath ? (fromPath as string) : getDashboardPath(userRole))
      return { success: true }
    } catch (err) {
      setLoading(false)
      if (err instanceof ApiRequestError) {
        if (err.code === 'INVALID_CREDENTIALS' || err.status === 401) {
          return { success: false, error: 'Email ou mot de passe incorrect.' }
        }
        return { success: false, error: err.message }
      }
      return { success: false, error: 'Erreur de connexion. Vérifiez votre réseau.' }
    }
  }

  const handleLogout = async () => {
    const redirectPath = user?.role === 'patient' ? '/acces-patient' : '/login'
    const { refreshToken } = useAuthStore.getState()
    try {
      if (refreshToken) await authApi.logout(refreshToken)
    } catch { /* on déconnecte quand même */ }
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
