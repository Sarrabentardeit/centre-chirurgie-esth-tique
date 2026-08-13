import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'
import multer from 'multer'
import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { validate } from '../../middleware/validate.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import {
  markReadSchema,
  messageIdParamSchema,
  pinMessageSchema,
  sendMessageSchema,
} from './chat.schema.js'
import * as chatService from './chat.service.js'
import { subscribeChatRealtime } from '../../lib/chatRealtime.js'

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

// GET /api/chat/events — flux SSE temps réel (token via Authorization ou ?access_token=)
chatRouter.get('/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  // EventSource cross-origin (Vite → API) : CORP same-origin de Helmet bloque sinon
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  if (typeof res.flushHeaders === 'function') res.flushHeaders()
  subscribeChatRealtime(req.auth!.sub, req.auth!.role, res)
})

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

// DELETE /api/chat/messages/:messageId/for-all
chatRouter.delete(
  '/messages/:messageId/for-all',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { messageId } = messageIdParamSchema.parse(req.params)
      const result = await chatService.deleteMessageForAll(req.auth!.sub, req.auth!.role, messageId)
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  },
)

// DELETE /api/chat/messages/:messageId/for-me
chatRouter.delete(
  '/messages/:messageId/for-me',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { messageId } = messageIdParamSchema.parse(req.params)
      const result = await chatService.deleteMessageForMe(req.auth!.sub, req.auth!.role, messageId)
      res.json(result)
    } catch (e) {
      next(e)
    }
  },
)

// PATCH /api/chat/messages/:messageId/pin
chatRouter.patch(
  '/messages/:messageId/pin',
  validate(pinMessageSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { messageId } = messageIdParamSchema.parse(req.params)
      const result = await chatService.setMessagePinned(
        req.auth!.sub,
        req.auth!.role,
        messageId,
        req.body.pinned,
      )
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  },
)

// POST /api/chat/messages/:messageId/unread
chatRouter.post(
  '/messages/:messageId/unread',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { messageId } = messageIdParamSchema.parse(req.params)
      const result = await chatService.markMessageUnread(req.auth!.sub, req.auth!.role, messageId)
      res.json(result)
    } catch (e) {
      next(e)
    }
  },
)
