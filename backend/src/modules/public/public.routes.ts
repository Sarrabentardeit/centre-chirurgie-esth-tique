import { Router } from 'express'
import type { Request, Response } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import { rateLimit } from 'express-rate-limit'

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

/** Limite dédiée (en plus du /api global) pour limiter l’abus sans compte. */
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
