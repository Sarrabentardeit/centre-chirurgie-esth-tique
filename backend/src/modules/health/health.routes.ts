import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../../lib/prisma.js'
import { env } from '../../config/env.js'

export const healthRouter = Router()

healthRouter.get('/health', async (_req: Request, res: Response) => {
  let dbStatus: 'reachable' | 'unreachable' = 'unreachable'

  try {
    await prisma.$queryRaw`SELECT 1`
    dbStatus = 'reachable'
  } catch {
    dbStatus = 'unreachable'
  }

  const status = dbStatus === 'reachable' ? 200 : 503

  res.status(status).json({
    ok: dbStatus === 'reachable',
    service: 'centre-est-backend',
    environment: env.NODE_ENV,
    database: dbStatus,
    timestamp: new Date().toISOString(),
  })
})
