import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import { rateLimit } from 'express-rate-limit'
import { resolveDevisPdfPath, verifyDevisPdfToken } from '../../lib/devisPdfPublic.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR = path.join(__dirname, '../../../uploads')

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `guest-${Date.now()}-${safe}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    cb(null, allowed.includes(file.mimetype))
  },
})

/** Limite dédiée pour limiter l’abus d’upload sans compte (pas de limite globale /api). */
const publicUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: 'TOO_MANY_REQUESTS', message: 'Trop d’uploads depuis cette adresse, réessayez plus tard.' },
})

export const publicRouter = Router()

// POST /api/public/upload — formulaire public avant création de compte (mêmes types que /patient/upload)
publicRouter.post(
  '/upload',
  publicUploadLimiter,
  upload.single('file'),
  (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({
        ok: false,
        code: 'NO_FILE',
        message: 'Aucun fichier reçu ou type non autorisé.',
      })
      return
    }
    const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:4000'
    const url = `${baseUrl}/uploads/${req.file.filename}`
    res.json({ ok: true, url, name: req.file.originalname, size: req.file.size })
  },
)

/** PDF devis public (WhatsApp) — pas de JSON 404, ouverture inline. */
publicRouter.get(
  '/devis/:devisId/pdf',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const devisId = String(req.params.devisId ?? '')
      const k = typeof req.query.k === 'string' ? req.query.k : undefined
      if (!devisId || !verifyDevisPdfToken(devisId, k)) {
        res.status(404).type('html').send(
          '<!doctype html><meta charset="utf-8"><title>Devis introuvable</title><p>Ce lien de devis n’est pas valide.</p>',
        )
        return
      }
      const found = await resolveDevisPdfPath(devisId)
      if (!found) {
        res.status(404).type('html').send(
          '<!doctype html><meta charset="utf-8"><title>Devis introuvable</title><p>Le PDF de ce devis n’est pas encore disponible. Demandez à la clinique de le renvoyer.</p>',
        )
        return
      }
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${found.downloadName.replace(/"/g, '')}"`,
      )
      res.sendFile(found.filePath, (err) => {
        if (err) next(err)
      })
    } catch (e) {
      next(e)
    }
  },
)
