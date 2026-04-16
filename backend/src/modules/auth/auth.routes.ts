import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { registerSchema, loginSchema, refreshSchema } from './auth.schema.js'
import * as authService from './auth.service.js'

export const authRouter = Router()

// POST /api/auth/register
authRouter.post(
  '/register',
  validate(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.register(req.body, {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      })
      res.status(201).json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)

// POST /api/auth/login
authRouter.post(
  '/login',
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.login(req.body, {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      })
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)

// POST /api/auth/refresh
authRouter.post(
  '/refresh',
  validate(refreshSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.refresh(req.body.refreshToken)
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)

// POST /api/auth/logout
authRouter.post(
  '/logout',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body
      if (refreshToken && req.auth?.sub) {
        await authService.logout(req.auth.sub, refreshToken)
      }
      res.json({ ok: true, message: 'Déconnecté.' })
    } catch (e) {
      next(e)
    }
  }
)

// GET /api/auth/me
authRouter.get(
  '/me',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.getMe(req.auth!.sub)
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)
