import { logger } from '../../lib/logger.js'
import { processPlanningJ7Rappels } from '../../lib/planningJ7Rappel.js'

/** Toutes les 15 min — email gestionnaire à J-7 de l’arrivée. */
const TICK_MS = 15 * 60 * 1000

export function startPlanningJ7RappelScheduler(): void {
  const tick = async () => {
    try {
      const result = await processPlanningJ7Rappels()
      if (result.sent > 0) {
        logger.info(result, '[planning-j7] tick')
      }
    } catch (err) {
      logger.warn({ err }, '[planning-j7] tick failed')
    }
  }

  setInterval(() => void tick(), TICK_MS)
  setTimeout(() => void tick(), 60_000)
  logger.info({ intervalMinutes: TICK_MS / 60_000 }, '[planning-j7] scheduler démarré')
}
