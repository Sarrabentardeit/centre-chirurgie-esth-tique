import { prisma } from './prisma.js'
import { sendNotificationEmail, type EmailAudience } from './mailer.js'

type NotifType = 'info' | 'warning' | 'success' | 'error'

/**
 * Notification in-app + email pour un rôle staff.
 * - medecin : NOTIFICATION_EMAILS_MEDECIN (sinon NOTIFICATION_EMAILS)
 * - gestionnaire : NOTIFICATION_EMAILS_GESTIONNAIRE (sinon NOTIFICATION_EMAILS)
 */
export async function notifyStaff(input: {
  role: EmailAudience
  titre: string
  message: string
  type?: NotifType
  lienAction?: string | null
  /** false = in-app seulement */
  email?: boolean
}) {
  const users = await prisma.user.findMany({
    where: { role: input.role },
    select: { id: true },
  })

  const notifPromises = users.map(async (user) => {
    const exists = await prisma.notification.findFirst({
      where: {
        userId: user.id,
        titre: input.titre,
        message: input.message,
        lienAction: input.lienAction ?? null,
      },
      select: { id: true },
    })
    if (exists) return

    await prisma.notification.create({
      data: {
        userId: user.id,
        type: input.type ?? 'info',
        titre: input.titre,
        message: input.message,
        lienAction: input.lienAction ?? null,
      },
    })
  })

  await Promise.all([
    ...notifPromises,
    input.email === false
      ? Promise.resolve()
      : sendNotificationEmail({
          titre: input.titre,
          message: input.message,
          lienAction: input.lienAction,
          audience: input.role,
        }),
  ])
}
