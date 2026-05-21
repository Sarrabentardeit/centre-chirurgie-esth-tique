import { prisma } from '../../lib/prisma.js'
import { logger } from '../../lib/logger.js'
import { fullSync, isGoogleCalendarConfigured } from './google-calendar.service.js'

const TICK_MS = 3 * 60 * 1000
const MIN_GAP_MS = 2 * 60 * 1000

export function startGoogleCalendarScheduler(): void {
  if (!isGoogleCalendarConfigured()) {
    logger.info('[google-calendar] scheduler désactivé (credentials manquants)')
    return
  }

  const tick = async () => {
    const rows = await prisma.googleCalendarSync.findMany({
      select: { medecinId: true, lastSyncAt: true },
    })
    const now = Date.now()
    for (const row of rows) {
      if (row.lastSyncAt && now - row.lastSyncAt.getTime() < MIN_GAP_MS) continue
      try {
        await fullSync(row.medecinId)
      } catch (err) {
        logger.warn({ err, medecinId: row.medecinId }, '[google-calendar] scheduler sync failed')
      }
    }
  }

  setInterval(() => void tick(), TICK_MS)
  setTimeout(() => void tick(), 15_000)
  logger.info({ intervalMinutes: TICK_MS / 60_000 }, '[google-calendar] scheduler démarré')
}
