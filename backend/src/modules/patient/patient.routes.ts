import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import { validate } from '../../middleware/validate.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { formulaireSubmitSchema, updateProfilSchema, repondreDevisSchema, repondreRendezVousSchema } from './patient.schema.js'
import * as patientService from './patient.service.js'

const storagePostOp = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `postop-${Date.now()}-${safe}`)
  },
})
const uploadPostOp = multer({
  storage: storagePostOp,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'))
  },
})

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
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    cb(null, allowed.includes(file.mimetype))
  },
})

export const patientRouter = Router()
const paramToString = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

// Toutes les routes patient requièrent une auth patient
patientRouter.use(requireAuth)
patientRouter.use(requireRole('patient'))

// POST /api/patient/formulaire — créer ou mettre à jour le formulaire
patientRouter.post(
  '/formulaire',
  validate(formulaireSubmitSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await patientService.upsertFormulaire(req.auth!.sub, req.body)
      res.status(201).json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)

// GET /api/patient/formulaire/latest — récupérer le dernier formulaire
patientRouter.get(
  '/formulaire/latest',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await patientService.getLatestFormulaire(req.auth!.sub)
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)

// POST /api/patient/upload — uploader un fichier (photo ou PDF)
patientRouter.post(
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

// PUT /api/patient/profil — mettre à jour ses coordonnées
patientRouter.put(
  '/profil',
  validate(updateProfilSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await patientService.updateProfil(req.auth!.sub, req.body)
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)

// GET /api/patient/devis — récupérer ses devis
patientRouter.get(
  '/devis',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await patientService.getDevis(req.auth!.sub)
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)

// POST /api/patient/devis/:id/consultation — première ouverture / lecture du devis (notification gestionnaire)
patientRouter.post(
  '/devis/:id/consultation',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await patientService.enregistrerConsultationDevis(req.auth!.sub, paramToString(req.params.id))
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)

// POST /api/patient/devis/:id/repondre — accepter ou refuser un devis
patientRouter.post(
  '/devis/:id/repondre',
  validate(repondreDevisSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await patientService.repondreDevis(req.auth!.sub, paramToString(req.params.id), req.body)
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)

// GET /api/patient/rendezvous — récupérer ses rendez-vous
patientRouter.get(
  '/rendezvous',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await patientService.getRendezVous(req.auth!.sub)
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)

// GET /api/patient/rendezvous/disponibilites — créneaux disponibles
patientRouter.get(
  '/rendezvous/disponibilites',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await patientService.getAvailableSlots(req.auth!.sub)
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)

// POST /api/patient/rendezvous/reserver — réservation d'un créneau
patientRouter.post(
  '/rendezvous/reserver',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await patientService.reserveRendezVous(req.auth!.sub, req.body)
      res.status(201).json({ ok: true, result })
    } catch (e) {
      next(e)
    }
  }
)

// POST /api/patient/rendezvous/:id/decision — accepter la date ou demander un autre créneau
patientRouter.post(
  '/rendezvous/:id/decision',
  validate(repondreRendezVousSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await patientService.repondreRendezVous(req.auth!.sub, paramToString(req.params.id), req.body)
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)

// GET /api/patient/dossier — récupérer le dossier complet
patientRouter.get(
  '/dossier',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await patientService.getMyDossier(req.auth!.sub)
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)

// GET /api/patient/post-op — récupérer son suivi post-opératoire
patientRouter.get(
  '/post-op',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await patientService.getMyPostOp(req.auth!.sub)
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)

// POST /api/patient/post-op/questionnaire — soumettre le questionnaire de satisfaction
patientRouter.post(
  '/post-op/questionnaire',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await patientService.submitQuestionnaire(req.auth!.sub, req.body)
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)

// POST /api/patient/post-op/photos — envoyer une photo de suivi
patientRouter.post(
  '/post-op/photos',
  uploadPostOp.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ ok: false, code: 'NO_FILE', message: 'Aucun fichier reçu.' })
        return
      }
      const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:4000'
      const url = `${baseUrl}/uploads/${req.file.filename}`
      const note = typeof req.body.note === 'string' ? req.body.note : undefined
      const result = await patientService.addMyPostOpPhoto(req.auth!.sub, { url, note })
      res.json({ ok: true, url, ...result })
    } catch (e) {
      next(e)
    }
  }
)
