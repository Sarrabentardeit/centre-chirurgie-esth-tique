import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/store/authStore'

export type ChatRealtimeEvent = {
  type: 'chat:message' | 'chat:thread' | 'chat:unread'
  patientId?: string
  messageId?: string
}

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

type Listener = (event: ChatRealtimeEvent) => void

const listeners = new Set<Listener>()
let sharedSource: EventSource | null = null
let sharedToken: string | null = null
let reconnectTimer: number | null = null
let reconnectAttempt = 0

function clearReconnect() {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function closeShared() {
  clearReconnect()
  if (sharedSource) {
    sharedSource.close()
    sharedSource = null
  }
  sharedToken = null
  reconnectAttempt = 0
}

function dispatch(event: ChatRealtimeEvent) {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
      /* ignore listener errors */
    }
  }
}

function scheduleReconnect() {
  if (listeners.size === 0) return
  clearReconnect()
  const delay = Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempt, 4))
  reconnectAttempt += 1
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    ensureSharedConnection()
  }, delay)
}

function ensureSharedConnection() {
  const token = useAuthStore.getState().token
  if (!token || listeners.size === 0) {
    closeShared()
    return
  }

  if (sharedSource && sharedToken === token && sharedSource.readyState !== EventSource.CLOSED) {
    return
  }

  if (sharedSource) {
    sharedSource.close()
    sharedSource = null
  }

  sharedToken = token
  const url = `${BASE_URL}/chat/events?access_token=${encodeURIComponent(token)}`
  const es = new EventSource(url)
  sharedSource = es

  const onTyped = (type: ChatRealtimeEvent['type']) => (ev: MessageEvent) => {
    try {
      const data = JSON.parse(String(ev.data)) as ChatRealtimeEvent
      dispatch({ ...data, type })
    } catch {
      /* ignore malformed */
    }
  }

  es.addEventListener('chat:message', onTyped('chat:message'))
  es.addEventListener('chat:thread', onTyped('chat:thread'))
  es.addEventListener('chat:unread', onTyped('chat:unread'))

  es.onopen = () => {
    reconnectAttempt = 0
  }

  es.onerror = () => {
    if (sharedSource === es) {
      es.close()
      sharedSource = null
      scheduleReconnect()
    }
  }
}

export function subscribeChatRealtime(listener: Listener): () => void {
  listeners.add(listener)
  ensureSharedConnection()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) closeShared()
  }
}

/** Hook React : écoute le flux SSE chat (connexion partagée). */
export function useChatRealtime(onEvent: Listener, enabled = true) {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (!enabled || !token) return
    return subscribeChatRealtime((event) => onEventRef.current(event))
  }, [enabled, token])

  // Reconnecter si le token change (refresh)
  useEffect(() => {
    if (!enabled || !token) return
    if (sharedToken && sharedToken !== token) {
      closeShared()
      ensureSharedConnection()
    }
  }, [enabled, token])
}
