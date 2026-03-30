import { useAuthStore, getDashboardPath } from '@/store/authStore'
import { mockLogin } from '@/mocks/auth'
import { useNavigate } from 'react-router-dom'

export function useAuth() {
  const { user, isAuthenticated, isLoading, login, logout, setLoading } = useAuthStore()
  const navigate = useNavigate()

  const handleLogin = async (email: string, password: string) => {
    setLoading(true)
    const result = await mockLogin(email, password)
    if (result.success && result.user && result.token) {
      login(result.user, result.token)
      navigate(getDashboardPath(result.user.role))
      return { success: true }
    }
    setLoading(false)
    return { success: false, error: result.error }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return {
    user,
    isAuthenticated,
    isLoading,
    handleLogin,
    handleLogout,
  }
}
