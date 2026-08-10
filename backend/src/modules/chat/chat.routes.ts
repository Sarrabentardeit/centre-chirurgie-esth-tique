import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'
import multer from 'multer'
import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { validate } from '../../middleware/validate.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { markReadSchema, sendMessageSchema } from './chat.schema.js'
import * as chatService from './chat.service.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR = path.join(__dirname, '../../../uploads')
mkdirSync(UPLOADS_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `chat-${Date.now()}-${safe}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    cb(null, allowed.includes(file.mimetype))
  },
})

export const chatRouter = Router()

chatRouter.use(requireAuth)

// GET /api/chat/unread — badge non lus
chatRouter.get('/unread', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await chatService.getUnreadCount(req.auth!.sub, req.auth!.role)
    res.json({ ok: true, ...result })
  } catch (e) {
    next(e)
  }
})

// GET /api/chat/conversations — liste des fils (équipe)
chatRouter.get(
  '/conversations',
  requireRole('medecin', 'gestionnaire'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await chatService.listConversations(req.auth!.role)
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  },
)

// GET /api/chat/patients?search= — annuaire léger pour démarrer un chat
chatRouter.get(
  '/patients',
  requireRole('medecin', 'gestionnaire'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined
      const result = await chatService.searchChatPatients(search)
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  },
)

// POST /api/chat/upload — pièce jointe (image / PDF)
chatRouter.post('/upload', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({
      ok: false,
      code: 'NO_FILE',
      message: 'Aucun fichier reçu (JPG, PNG, WEBP ou PDF, max 12 Mo).',
    })
    return
  }
  const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:4000'
  const url = `${baseUrl}/uploads/${req.file.filename}`
  res.json({
    ok: true,
    url,
    name: req.file.originalname,
    size: req.file.size,
  })
})

// GET /api/chat/messages?patientId=
chatRouter.get('/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined
    const result = await chatService.getMessages(req.auth!.sub, req.auth!.role, patientId)
    res.json({ ok: true, ...result })
  } catch (e) {
    next(e)
  }
})

// POST /api/chat/messages
chatRouter.post(
  '/messages',
  validate(sendMessageSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await chatService.sendMessage(req.auth!.sub, req.auth!.role, req.body)
      res.status(201).json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  },
)

// POST /api/chat/messages/read
chatRouter.post(
  '/messages/read',
  validate(markReadSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await chatService.markMessagesRead(req.auth!.sub, req.auth!.role, req.body)
      res.json(result)
    } catch (e) {
      next(e)
    }
  },
)
