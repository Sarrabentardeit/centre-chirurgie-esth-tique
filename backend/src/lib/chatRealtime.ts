import type { Response } from 'express'
import type { UserRole } from '../modules/auth/auth.types.js'

export type ChatRealtimeEvent = {
  type: 'chat:message' | 'chat:thread' | 'chat:unread' | 'notif:new'
  patientId?: string
  messageId?: string
  /** Auteur du message — pour ne pas sonner chez l’expéditeur. */
  senderId?: string
  notificationId?: string
  titre?: string
  /** chat = pas de son notif (déjà couvert par son message) */
  kind?: 'chat' | 'system'
}

type Client = {
  userId: string
  role: UserRole
  res: Response
}

const clients = new Set<Client>()

function writeEvent(res: Response, event: ChatRealtimeEvent) {
  res.write(`event: ${event.type}\n`)
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

export function subscribeChatRealtime(userId: string, role: UserRole, res: Response) {
  const client: Client = { userId, role, res }
  clients.add(client)

  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`)
    } catch {
      clearInterval(heartbeat)
      clients.delete(client)
    }
  }, 25000)

  const cleanup = () => {
    clearInterval(heartbeat)
    clients.delete(client)
  }

  res.on('close', cleanup)
  res.on('error', cleanup)

  res.write(`: connected\n\n`)
  return cleanup
}

export function publishChatToUser(userId: string, event: ChatRealtimeEvent) {
  for (const client of clients) {
    if (client.userId !== userId) continue
    try {
      writeEvent(client.res, event)
    } catch {
      clients.delete(client)
    }
  }
}

export function publishChatToUsers(userIds: string[], event: ChatRealtimeEvent) {
  const set = new Set(userIds)
  for (const client of clients) {
    if (!set.has(client.userId)) continue
    try {
      writeEvent(client.res, event)
    } catch {
      clients.delete(client)
    }
  }
}

export function publishChatToStaff(event: ChatRealtimeEvent) {
  for (const client of clients) {
    if (client.role !== 'medecin' && client.role !== 'gestionnaire') continue
    try {
      writeEvent(client.res, event)
    } catch {
      clients.delete(client)
    }
  }
}

/** Alias sémantique : même canal SSE que le chat (`/api/chat/events`). */
export function publishNotifToUser(
  userId: string,
  event: Omit<ChatRealtimeEvent, 'type'> & { type?: 'notif:new' },
) {
  publishChatToUser(userId, {
    type: 'notif:new',
    notificationId: event.notificationId,
    titre: event.titre,
    kind: event.kind,
  })
}
