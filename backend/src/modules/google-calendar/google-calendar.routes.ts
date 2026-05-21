import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { env } from '../../config/env.js'
import * as googleCalendar from './google-calendar.service.js'

function frontendBase(): string {
  return (env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, '')
}

/** Callback OAuth (sans JWT) — URL enregistrée dans Google Cloud */
export const googleCalendarCallbackRouter = Router()

googleCalendarCallbackRouter.get('/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = String(req.query.code ?? '')
    const state = String(req.query.state ?? '')
    const error = req.query.error as string | undefined

    if (error) {
      res.redirect(`${frontendBase()}/gestionnaire/agenda?google=error`)
      return
    }
    if (!code || !state) {
      res.status(400).send('Paramètres OAuth manquants.')
      return
    }
    const redirectUrl = await googleCalendar.handleOAuthCallback(code, state)
    res.redirect(redirectUrl)
  } catch (e) {
    next(e)
  }
})
