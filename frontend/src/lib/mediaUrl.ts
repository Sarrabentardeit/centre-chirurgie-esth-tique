import { useAuthStore } from '@/store/authStore'

type AuthPersistShape = {
  state?: { token?: string | null }
}

function readAccessToken(): string | null {
  try {
    const raw = localStorage.getItem('auth-storage')
    if (raw) {
      const parsed = JSON.parse(raw) as AuthPersistShape
      if (parsed.state?.token) return parsed.state.token
    }
  } catch {
    /* ignore */
  }
  return useAuthStore.getState().token
}

/**
 * Rebase une URL `/uploads/...` vers l’API courante et y attache le JWT
 * (`?access_token=`) pour que <img> / <a> fonctionnent sans header Authorization.
 * Conserve un éventuel `?k=` (jeton guest formulaire public).
 */
export function resolveProtectedUploadUrl(value: string): string {
  if (!value?.trim()) return value
  if (value.startsWith('blob:') || value.startsWith('data:')) return value

  const viteApi = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000/api').replace(
    /\/$/,
    '',
  )
  const apiBase = viteApi.replace(/\/api\/?$/, '') || ''

  const normalizeUploadPath = (pathname: string): string => {
    if (pathname.startsWith('/api/uploads/')) return `/uploads/${pathname.slice('/api/uploads/'.length)}`
    return pathname
  }

  let pathname = value.trim()
  let search = ''
  try {
    if (pathname.startsWith('http://') || pathname.startsWith('https://')) {
      const u = new URL(pathname)
      pathname = u.pathname
      search = u.search
    } else if (pathname.includes('?')) {
      const i = pathname.indexOf('?')
      search = pathname.slice(i)
      pathname = pathname.slice(0, i)
    }
  } catch {
    return value
  }

  pathname = normalizeUploadPath(pathname)

  let absolute: string
  if (pathname.startsWith('/uploads/')) absolute = `${apiBase}${pathname}`
  else if (pathname.startsWith('/')) absolute = `${apiBase}${pathname}`
  else if (pathname.startsWith('uploads/')) absolute = `${apiBase}/${pathname}`
  else if (/\.(jpe?g|png|webp|gif|pdf)$/i.test(pathname)) absolute = `${apiBase}/uploads/${pathname}`
  else return value

  const token = readAccessToken()
  if (token) {
    // Session connectée : JWT durable (ignorer un ancien ?k= guest qui peut expirer).
    return `${absolute}?access_token=${encodeURIComponent(token)}`
  }

  // Formulaire public : conserver le jeton guest ?k= si présent
  if (search) return `${absolute}${search}`
  return absolute
}
