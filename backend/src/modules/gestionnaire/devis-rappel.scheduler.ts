import { logger } from '../../lib/logger.js'
import { processDevisRappelsAuto } from '../gestionnaire/gestionnaire.service.js'

/** Toutes les 15 min — rappel devis 72 h après envoi. */
const TICK_MS = 15 * 60 * 1000

export function startDevisRappelScheduler(): void {
  const tick = async () => {
    try {
      const result = await processDevisRappelsAuto()
      if (result.sent > 0 || result.checked > 0) {
        logger.info(
          { checked: result.checked, sent: result.sent },
          '[devis-rappel-auto] tick',
        )
      }
    } catch (err) {
      logger.warn({ err }, '[devis-rappel-auto] tick failed')
    }
  }

  setInterval(() => void tick(), TICK_MS)
  setTimeout(() => void tick(), 45_000)
  logger.info({ intervalMinutes: TICK_MS / 60_000 }, '[devis-rappel-auto] scheduler démarré')
}
