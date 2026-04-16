import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import { validate } from '../../middleware/validate.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import {
  rapportSchema,
  createAgendaEventSchema,
  updateAgendaEventSchema,
  updatePatientStatusSchema,
  createPreDossierSchema,
} from './medecin.schema.js'
import * as medecinService from './medecin.service.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR = path.join(__dirname, '../../../uploads')

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}-${safe}`)
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

export const medecinRouter = Router()
const paramToString = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

medecinRouter.use(requireAuth)
medecinRouter.use(requireRole('medecin'))

// ── Dashboard ────────────────────────────────────────────────────────────────
medecinRouter.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await medecinService.getDashboard(req.auth!.sub)
    res.json({ ok: true, ...result })
  } catch (e) { next(e) }
})

medecinRouter.get('/dashboard/alertes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await medecinService.getDashboardAlertes(req.auth!.sub)
    res.json({ ok: true, ...result })
  } catch (e) { next(e) }
})

// ── Patients ─────────────────────────────────────────────────────────────────
medecinRouter.get('/patients', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = req.query.search as string | undefined
    const status = req.query.status as string | undefined
    const result = await medecinService.getPatients(search, status)
    res.json({ ok: true, ...result })
  } catch (e) { next(e) }
})

medecinRouter.post(
  '/patients',
  validate(createPreDossierSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await medecinService.createPreDossier(req.auth!.sub, req.body)
      res.status(201).json({ ok: true, ...result })
    } catch (e) { next(e) }
  }
)

medecinRouter.get('/patients/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await medecinService.getPatientById(paramToString(req.params.id))
    res.json({ ok: true, ...result })
  } catch (e) { next(e) }
})

medecinRouter.put('/patients/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await medecinService.updatePatient(paramToString(req.params.id), req.body)
    res.json({ ok: true, ...result })
  } catch (e) { next(e) }
})

medecinRouter.delete('/patients/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await medecinService.deletePatient(paramToString(req.params.id))
    res.json({ ok: true, ...result })
  } catch (e) { next(e) }
})

medecinRouter.patch(
  '/patients/:id/status',
  validate(updatePatientStatusSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await medecinService.updatePatientStatus(paramToString(req.params.id), req.body)
      res.json({ ok: true, ...result })
    } catch (e) { next(e) }
  }
)

// ── Rapport ───────────────────────────────────────────────────────────────────
medecinRouter.post(
  '/patients/:id/rapport',
  validate(rapportSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await medecinService.upsertRapport(req.auth!.sub, paramToString(req.params.id), req.body)
      res.status(201).json({ ok: true, ...result })
    } catch (e) { next(e) }
  }
)

// ── RDV patient ───────────────────────────────────────────────────────────────
medecinRouter.post(
  '/patients/:id/rdv',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await medecinService.createRendezVous(req.auth!.sub, paramToString(req.params.id), req.body)
      res.status(201).json({ ok: true, ...result })
    } catch (e) { next(e) }
  }
)

// ── Agenda ────────────────────────────────────────────────────────────────────
medecinRouter.get('/agenda', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const from = req.query.from as string | undefined
    const to   = req.query.to   as string | undefined
    const result = await medecinService.getAgenda(req.auth!.sub, from, to)
    res.json({ ok: true, ...result })
  } catch (e) { next(e) }
})

medecinRouter.post(
  '/agenda',
  validate(createAgendaEventSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await medecinService.createAgendaEvent(req.auth!.sub, req.body)
      res.status(201).json({ ok: true, ...result })
    } catch (e) { next(e) }
  }
)

medecinRouter.put(
  '/agenda/:id',
  validate(updateAgendaEventSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await medecinService.updateAgendaEvent(req.auth!.sub, paramToString(req.params.id), req.body)
      res.json({ ok: true, ...result })
    } catch (e) { next(e) }
  }
)

medecinRouter.delete('/agenda/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await medecinService.deleteAgendaEvent(req.auth!.sub, paramToString(req.params.id))
    res.json({ ok: true, ...result })
  } catch (e) { next(e) }
})

// ── Upload médecin ────────────────────────────────────────────────────────────
medecinRouter.post(
  '/upload',
  upload.single('file'),
  (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ ok: false, code: 'NO_FILE', message: 'Aucun fichier reçu ou type non autorisé.' })
      return
    }
    const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:4000'
    const url = `${baseUrl}/uploads/${req.file.filename}`
    res.json({ ok: true, url, name: req.file.originalname, size: req.file.size })
  }
)

// ── Suivi Post-Op ─────────────────────────────────────────────────────────────
medecinRouter.get('/post-op', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await medecinService.getPostOpPatients()
    res.json({ ok: true, ...result })
  } catch (e) { next(e) }
})

medecinRouter.get('/post-op/:patientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await medecinService.getPostOp(paramToString(req.params.patientId))
    res.json({ ok: true, ...result })
  } catch (e) { next(e) }
})

medecinRouter.post('/post-op/:patientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await medecinService.upsertPostOp(paramToString(req.params.patientId), req.body)
    res.status(201).json({ ok: true, ...result })
  } catch (e) { next(e) }
})

medecinRouter.post('/post-op/:patientId/photos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await medecinService.addPostOpPhoto(paramToString(req.params.patientId), req.body)
    res.json({ ok: true, ...result })
  } catch (e) { next(e) }
})
