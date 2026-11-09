import './config/env.js'
import path from 'path'
import { readdir } from 'fs/promises'
import { existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import pinoHttp, { type Options as PinoHttpOptions } from 'pino-http'
import { env } from './config/env.js'
import { logger } from './lib/logger.js'
import { healthRouter } from './modules/health/health.routes.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { patientRouter } from './modules/patient/patient.routes.js'
import { medecinRouter } from './modules/medecin/medecin.routes.js'
import { gestionnaireRouter } from './modules/gestionnaire/gestionnaire.routes.js'
import { publicRouter } from './modules/public/public.routes.js'
import { chatRouter } from './modules/chat/chat.routes.js'
import { errorHandler } from './middleware/errorHandler.js'
import { startGoogleCalendarScheduler } from './modules/google-calendar/google-calendar.scheduler.js'
import { startDevisRappelScheduler } from './modules/gestionnaire/devis-rappel.scheduler.js'
import { startPlanningJ7RappelScheduler } from './modules/gestionnaire/planning-j7-rappel.scheduler.js'
import { logMailerStatus } from './lib/mailer.js'
import jwt from 'jsonwebtoken'
import { verifyGuestUploadToken } from './lib/uploadAccess.js'
import type { JwtPayload } from './modules/auth/auth.types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const allowedCorsOrigins = env.CORS_ORIGINS
  ? env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : []

const app = express()

// ── Sécurité ────────────────────────────────────────────────────────────────
app.use(helmet())
app.use(
  cors({
    origin:
      env.NODE_ENV === 'production'
        ? (allowedCorsOrigins.length > 0 ? allowedCorsOrigins : ['https://votre-domaine.vercel.app'])
        : (origin, callback) => {
            // Dev : Vite peut démarrer sur 5173, 5174, 5175…
            if (!origin || /^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
              callback(null, true)
              return
            }
            callback(new Error(`CORS blocked: ${origin}`))
          },
    credentials: true,
  }),
)

// ── Rate limiting ────────────────────────────────────────────────────────────
// PAS de limite globale sur /api : le front poll chat/unread/messages en continu.
// Une limite globale provoquait « Trop de requêtes » en usage normal.
// La protection anti-abus est ciblée :
//   - auth (login/register) → auth.routes.ts
//   - upload public → public.routes.ts

// ── Logging HTTP ─────────────────────────────────────────────────────────────
const pinoHttpMiddleware = (pinoHttp as unknown as (opts: PinoHttpOptions) => ReturnType<typeof express>)({ logger })
app.use(pinoHttpMiddleware)

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '15mb' }))
app.use(express.urlencoded({ extended: true }))

// ── Uploads protégés (photos / PDF patients) ─────────────────────────────────
// Plus d’accès public par lien nu : JWT (Bearer ou ?access_token=) ou jeton guest ?k=
const uploadsDir = path.join(__dirname, '../uploads')
mkdirSync(uploadsDir, { recursive: true })

function extractUploadAccessToken(req: express.Request): string | null {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice(7)
  const q = req.query.access_token
  if (typeof q === 'string' && q.trim()) return q.trim()
  return null
}

function canAccessUpload(req: express.Request, filename: string): boolean {
  const jwtToken = extractUploadAccessToken(req)
  if (jwtToken) {
    try {
      jwt.verify(jwtToken, env.JWT_ACCESS_SECRET) as JwtPayload
      return true
    } catch {
      /* fall through */
    }
  }
  const k = typeof req.query.k === 'string' ? req.query.k : undefined
  return verifyGuestUploadToken(filename, k)
}

function sendUploadFile(
  res: express.Response,
  next: express.NextFunction,
  filePath: string,
) {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('Cache-Control', 'private, no-store')
  if (filePath.toLowerCase().endsWith('.pdf')) {
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'inline')
  }
  res.sendFile(filePath, (err) => {
    if (err) next(err)
  })
}

// Express 5 : wildcard obligatoire pour `fichier.pdf`
app.get('/uploads/*file', async (req, res, next) => {
  try {
    const raw = req.params.file
    const requested = Array.isArray(raw) ? raw.join('/') : String(raw ?? '')
    const safeRequested = path.basename(requested).replace(/[^a-zA-Z0-9._-]/g, '_')
    if (!safeRequested) {
      res.status(404).type('html').send(
        '<!doctype html><meta charset="utf-8"><title>Fichier introuvable</title><p>Ce document n’est plus disponible.</p>',
      )
      return
    }

    if (!canAccessUpload(req, safeRequested)) {
      res.status(401).type('html').send(
        '<!doctype html><meta charset="utf-8"><title>Accès refusé</title><p>Connexion requise pour ouvrir ce fichier.</p>',
      )
      return
    }

    const directPath = path.join(uploadsDir, safeRequested)
    if (existsSync(directPath)) {
      sendUploadFile(res, next, directPath)
      return
    }

    try {
      const files = await readdir(uploadsDir)
      const suffix = `-${safeRequested}`
      const candidate = files
        .filter((f) => f === safeRequested || f.endsWith(suffix))
        .sort()
        .pop()

      if (!candidate) {
        res.status(404).type('html').send(
          '<!doctype html><meta charset="utf-8"><title>Fichier introuvable</title><p>Ce document n’est plus disponible.</p>',
        )
        return
      }
      sendUploadFile(res, next, path.join(uploadsDir, candidate))
    } catch (scanErr) {
      if (scanErr && typeof scanErr === 'object' && 'code' in scanErr && (scanErr as { code?: string }).code === 'ENOENT') {
        res.status(404).type('html').send(
          '<!doctype html><meta charset="utf-8"><title>Fichier introuvable</title><p>Ce document n’est plus disponible.</p>',
        )
        return
      }
      next(scanErr)
    }
  } catch (e) {
    next(e)
  }
})

// Anciennes URLs `/api/uploads/...` → même contrôle d’accès (pas de redirect public).
app.get('/api/uploads/*file', (req, res) => {
  const raw = req.params.file
  const requested = Array.isArray(raw) ? raw.join('/') : String(raw ?? '')
  const safeRequested = path.basename(requested).replace(/[^a-zA-Z0-9._-]/g, '_')
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  res.redirect(302, `/uploads/${safeRequested}${q}`)
})

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', healthRouter)
app.use('/api/auth', authRouter)
app.use('/api/public', publicRouter)
app.use('/api/chat', chatRouter)

app.use('/api/patient', patientRouter)
app.use('/api/medecin', medecinRouter)
app.use('/api/gestionnaire', gestionnaireRouter)

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Route introuvable.' })
})

// ── Erreurs globales ─────────────────────────────────────────────────────────
app.use(errorHandler)

// ── Démarrage ────────────────────────────────────────────────────────────────
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, '🚀 Serveur démarré')
  logMailerStatus()
  startGoogleCalendarScheduler()
  startDevisRappelScheduler()
  startPlanningJ7RappelScheduler()
})

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(
      { port: env.PORT },
      `Port ${env.PORT} déjà utilisé (un autre projet tourne dessus). Arrêtez-le ou changez PORT, puis relancez le backend.`,
    )
    process.exit(1)
  }
  throw err
})

export default app
