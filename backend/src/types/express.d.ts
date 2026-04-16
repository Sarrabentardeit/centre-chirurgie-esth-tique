import type { UserRole } from '../modules/auth/auth.types.js'

declare global {
  namespace Express {
    interface Request {
      auth?: {
        sub: string
        email: string
        role: UserRole
        iat: number
        exp: number
      }
    }
  }
}
