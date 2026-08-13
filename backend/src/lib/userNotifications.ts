import { prisma } from './prisma.js'
import { publishNotifToUser } from './chatRealtime.js'

type NotifType = 'info' | 'warning' | 'success' | 'error'

function isChatNotificationTitle(titre: string) {
  return /message chat|nouveau message/i.test(titre)
}

/**
 * Crée une notification in-app et pousse un event SSE `notif:new`
 * pour son + badge en temps réel côté client.
 */
export async function createUserNotification(input: {
  userId: string
  titre: string
  message: string
  type?: NotifType
  lienAction?: string | null
  /** Forcer kind SSE (sinon déduit du titre) */
  kind?: 'chat' | 'system'
}) {
  const row = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type ?? 'info',
      titre: input.titre,
      message: input.message,
      lienAction: input.lienAction ?? null,
    },
  })

  const kind =
    input.kind ?? (isChatNotificationTitle(input.titre) ? 'chat' : 'system')

  publishNotifToUser(input.userId, {
    type: 'notif:new',
    notificationId: row.id,
    titre: row.titre,
    kind,
  })

  return row
}
