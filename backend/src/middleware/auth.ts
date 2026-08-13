import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { AppError } from './errorHandler.js'
import type { JwtPayload, UserRole } from '../modules/auth/auth.types.js'

function extractAccessToken(req: Request): string | null {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice(7)
  // EventSource ne peut pas envoyer Authorization → token en query
  const q = req.query.access_token
  if (typeof q === 'string' && q.trim()) return q.trim()
  return null
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractAccessToken(req)
  if (!token) {
    return next(new AppError(401, 'SESSION_EXPIRED', 'Session expirée. Veuillez vous reconnecter.'))
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload
    req.auth = payload
    next()
  } catch {
    next(new AppError(401, 'SESSION_EXPIRED', 'Session expirée. Veuillez vous reconnecter.'))
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'Accès refusé.'))
    }
    next()
  }
}
