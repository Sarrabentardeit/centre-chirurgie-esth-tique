import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { validate } from '../../middleware/validate.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { markReadSchema, sendMessageSchema } from './chat.schema.js'
import * as chatService from './chat.service.js'

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
  }
)

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
  }
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
  }
)
