import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { validate } from '../../middleware/validate.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { AppError } from '../../middleware/errorHandler.js'
import {
  createUserByGestionnaireSchema,
  logistiqueSchema,
  refuseDevisSchema,
  updateTemplateSchema,
  upsertDevisDraftSchema,
} from './gestionnaire.schema.js'
import { createAgendaEventSchema, updateAgendaEventSchema } from '../medecin/medecin.schema.js'
import * as gestionnaireService from './gestionnaire.service.js'

function pid(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v
  if (!s) throw new AppError(400, 'BAD_PARAM', 'Paramètre manquant.')
  return s
}

export const gestionnaireRouter = Router()

gestionnaireRouter.use(requireAuth)
gestionnaireRouter.use(requireRole('gestionnaire'))

gestionnaireRouter.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await gestionnaireService.getDashboard(req.auth!.sub)
    res.json({ ok: true, ...result })
  } catch (e) {
    next(e)
  }
})

gestionnaireRouter.get('/patients', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const result = await gestionnaireService.getPatients(search, status)
    res.json({ ok: true, ...result })
  } catch (e) {
    next(e)
  }
})

gestionnaireRouter.get('/patients/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await gestionnaireService.getPatientById(pid(req.params.id))
    res.json({ ok: true, ...result })
  } catch (e) {
    next(e)
  }
})

gestionnaireRouter.post(
  '/patients/:patientId/devis/brouillon',
  validate(upsertDevisDraftSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await gestionnaireService.upsertDevisDraft(req.auth!.sub, pid(req.params.patientId), req.body)
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)

gestionnaireRouter.post('/devis/:devisId/envoyer', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await gestionnaireService.sendDevis(req.auth!.sub, pid(req.params.devisId))
    res.json({ ok: true, ...result })
  } catch (e) {
    next(e)
  }
})

gestionnaireRouter.post(
  '/devis/:devisId/refuser',
  validate(refuseDevisSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await gestionnaireService.refuseDevis(req.auth!.sub, pid(req.params.devisId), req.body)
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)

gestionnaireRouter.get('/notifications', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await gestionnaireService.listNotifications(req.auth!.sub)
    res.json({ ok: true, ...result })
  } catch (e) {
    next(e)
  }
})

gestionnaireRouter.patch('/notifications/:id/lu', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await gestionnaireService.markNotificationRead(req.auth!.sub, pid(req.params.id))
    res.json(result)
  } catch (e) {
    next(e)
  }
})

gestionnaireRouter.post('/notifications/lu-toutes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await gestionnaireService.markAllNotificationsRead(req.auth!.sub)
    res.json(result)
  } catch (e) {
    next(e)
  }
})

gestionnaireRouter.get('/logistique', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await gestionnaireService.getLogistiquePatients()
    res.json({ ok: true, ...result })
  } catch (e) {
    next(e)
  }
})

gestionnaireRouter.put(
  '/logistique/:patientId',
  validate(logistiqueSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await gestionnaireService.upsertLogistique(req.auth!.sub, pid(req.params.patientId), req.body)
      res.json(result)
    } catch (e) {
      next(e)
    }
  }
)

gestionnaireRouter.get('/communication/templates', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await gestionnaireService.getCommunicationTemplates()
    res.json({ ok: true, ...result })
  } catch (e) {
    next(e)
  }
})

gestionnaireRouter.put(
  '/communication/templates/:key',
  validate(updateTemplateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = pid(req.params.key) as 'formulaireAck' | 'devisSent' | 'refus'
      const result = await gestionnaireService.updateCommunicationTemplate(req.auth!.sub, key, req.body)
      res.json(result)
    } catch (e) {
      next(e)
    }
  }
)

gestionnaireRouter.post('/communication/templates/:key/reset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = pid(req.params.key) as 'formulaireAck' | 'devisSent' | 'refus'
    const result = await gestionnaireService.resetCommunicationTemplate(req.auth!.sub, key)
    res.json(result)
  } catch (e) {
    next(e)
  }
})

gestionnaireRouter.post('/communication/templates/reset-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await Promise.all([
      gestionnaireService.resetCommunicationTemplate(req.auth!.sub, 'formulaireAck'),
      gestionnaireService.resetCommunicationTemplate(req.auth!.sub, 'devisSent'),
      gestionnaireService.resetCommunicationTemplate(req.auth!.sub, 'refus'),
    ])
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

gestionnaireRouter.get('/analytics', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await gestionnaireService.getAnalytics()
    res.json({ ok: true, ...result })
  } catch (e) {
    next(e)
  }
})

gestionnaireRouter.get('/agenda', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const from = typeof req.query.from === 'string' ? req.query.from : undefined
    const to = typeof req.query.to === 'string' ? req.query.to : undefined
    const medecinId = typeof req.query.medecinId === 'string' ? req.query.medecinId : undefined
    const result = await gestionnaireService.getAgendaForGestionnaire(from, to, medecinId)
    res.json({ ok: true, ...result })
  } catch (e) {
    next(e)
  }
})

gestionnaireRouter.post(
  '/agenda',
  validate(createAgendaEventSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const medecinId = typeof req.query.medecinId === 'string' ? req.query.medecinId : undefined
      const result = await gestionnaireService.createAgendaEventByGestionnaire(req.auth!.sub, req.body, medecinId)
      res.status(201).json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)

gestionnaireRouter.put(
  '/agenda/:id',
  validate(updateAgendaEventSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await gestionnaireService.updateAgendaEventByGestionnaire(req.auth!.sub, pid(req.params.id), req.body)
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)

gestionnaireRouter.delete('/agenda/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await gestionnaireService.deleteAgendaEventByGestionnaire(req.auth!.sub, pid(req.params.id))
    res.json({ ok: true, ...result })
  } catch (e) {
    next(e)
  }
})

gestionnaireRouter.get('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined
    const roleRaw = typeof req.query.role === 'string' ? req.query.role : undefined
    const role = roleRaw === 'patient' || roleRaw === 'medecin' || roleRaw === 'gestionnaire' ? roleRaw : undefined
    const pageRaw = typeof req.query.page === 'string' ? Number(req.query.page) : undefined
    const pageSizeRaw = typeof req.query.pageSize === 'string' ? Number(req.query.pageSize) : undefined
    const result = await gestionnaireService.listUsers({
      search,
      role,
      page: Number.isFinite(pageRaw) ? pageRaw : undefined,
      pageSize: Number.isFinite(pageSizeRaw) ? pageSizeRaw : undefined,
    })
    res.json({ ok: true, ...result })
  } catch (e) {
    next(e)
  }
})

gestionnaireRouter.post(
  '/users',
  validate(createUserByGestionnaireSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await gestionnaireService.createUserByGestionnaire(req.auth!.sub, req.body)
      res.status(201).json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  }
)
