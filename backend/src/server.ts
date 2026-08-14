import './config/env.js'
import path from 'path'
import { readdir } from 'fs/promises'
import { mkdirSync } from 'fs'
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
import { logMailerStatus } from './lib/mailer.js'

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

// ── Fichiers statiques (uploads) ─────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '../uploads')
mkdirSync(uploadsDir, { recursive: true })
app.use('/uploads', (_req, res, next) => {
  // Autoriser l'affichage des images/PDF dans le frontend (origin différente en dev: 5173 -> 4000).
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  next()
})
app.use('/uploads', express.static(uploadsDir))
app.get('/uploads/:filename', async (req, res, next) => {
  try {
    const requested = req.params.filename
    const safeRequested = requested.replace(/[^a-zA-Z0-9._-]/g, '_')
    const directPath = path.join(uploadsDir, safeRequested)

    res.sendFile(directPath, async (err) => {
      if (!err) return
      try {
        const files = await readdir(uploadsDir)
        const suffix = `-${safeRequested}`
        const candidate = files
          .filter((f) => f === safeRequested || f.endsWith(suffix))
          .sort()
          .pop()

        if (!candidate) {
          next()
          return
        }
        res.sendFile(path.join(uploadsDir, candidate), (fallbackErr) => {
          if (fallbackErr) next(fallbackErr)
        })
      } catch (scanErr) {
        // Si le dossier uploads n'existe pas encore, répondre en 404
        // (évite un INTERNAL_ERROR pour un simple fichier absent).
        if (scanErr && typeof scanErr === 'object' && 'code' in scanErr && (scanErr as { code?: string }).code === 'ENOENT') {
          next()
          return
        }
        next(scanErr)
      }
    })
  } catch (e) {
    next(e)
  }
})

// Compatibilité rétroactive : anciennes URLs stockées en `/api/uploads/...`
// (ou caches frontend) doivent continuer à fonctionner en production.
app.get('/api/uploads/:filename', (req, res) => {
  const requested = String(req.params.filename ?? '')
  const safeRequested = requested.replace(/[^a-zA-Z0-9._-]/g, '_')
  res.redirect(302, `/uploads/${safeRequested}`)
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
app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, '🚀 Serveur démarré')
  logMailerStatus()
  startGoogleCalendarScheduler()
  startDevisRappelScheduler()
})

export default app
