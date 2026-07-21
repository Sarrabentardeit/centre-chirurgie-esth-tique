import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquare, Send, Stethoscope, User, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuthStore } from '@/store/authStore'
import { chatApi, medecinApi, gestionnaireApi, type ChatConversation, type ChatMessage } from '@/lib/api'
import { formatDateTime, cn } from '@/lib/utils'
import { playMessageSound } from '@/lib/notificationSounds'

export default function ChatPage() {
  const { user } = useAuthStore()
  const isPatient = user?.role === 'patient'
  const isStaff = user?.role === 'medecin' || user?.role === 'gestionnaire'

  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [patientOptions, setPatientOptions] = useState<Array<{ id: string; fullName: string; email: string; dossierNumber: string }>>([])
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchPatient, setSearchPatient] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<number | null>(null)
  const lastMessageIdRef = useRef<string | null>(null)

  const activeConversation = conversations.find((c) => c.patientId === selectedPatientId)
  const activePatientOption = patientOptions.find((p) => p.id === selectedPatientId)

  const loadConversations = useCallback(async () => {
    if (!isStaff) return
    try {
      const res = await chatApi.getConversations()
      setConversations(res.conversations)
      setSelectedPatientId((prev) => prev || res.conversations[0]?.patientId || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de charger les conversations.')
    }
  }, [isStaff])

  const loadPatientDirectory = useCallback(async () => {
    if (!isStaff || !user) return
    try {
      const res = user.role === 'gestionnaire'
        ? await gestionnaireApi.getPatients()
        : await medecinApi.getPatients()
      setPatientOptions(
        res.patients.map((p) => ({
          id: p.id,
          fullName: p.user.fullName,
          email: p.user.email,
          dossierNumber: p.dossierNumber,
        }))
      )
    } catch {
      /* silent */
    }
  }, [isStaff, user])

  const loadMessages = useCallback(async (patientId?: string, silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await chatApi.getMessages(isPatient ? undefined : patientId)
      const last = res.messages[res.messages.length - 1]
      const prevLastId = lastMessageIdRef.current
      if (
        silent &&
        prevLastId &&
        last &&
        last.id !== prevLastId &&
        last.expediteurId !== user?.id
      ) {
        playMessageSound()
      }
      lastMessageIdRef.current = last?.id ?? null
      setMessages(res.messages)
      if (isStaff && patientId) {
        await chatApi.markRead(patientId)
        setConversations((prev) =>
          prev.map((c) => (c.patientId === patientId ? { ...c, unreadCount: 0 } : c))
        )
      } else if (isPatient) {
        await chatApi.markRead()
      }
      setError(null)
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [isPatient, isStaff, user?.id])

  // Reset baseline when switching conversation
  useEffect(() => {
    lastMessageIdRef.current = null
  }, [selectedPatientId, isPatient])

  useEffect(() => {
    void loadConversations()
    void loadPatientDirectory()
  }, [loadConversations, loadPatientDirectory])

  useEffect(() => {
    if (isPatient) {
      void loadMessages()
      return
    }
    if (selectedPatientId) void loadMessages(selectedPatientId)
  }, [isPatient, selectedPatientId, loadMessages])

  // Polling toutes les 5 s
  useEffect(() => {
    const tick = () => {
      if (isPatient) void loadMessages(undefined, true)
      else if (selectedPatientId) {
        void loadMessages(selectedPatientId, true)
        void loadConversations()
      }
    }
    pollRef.current = window.setInterval(tick, 5000)
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [isPatient, selectedPatientId, loadMessages, loadConversations])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = async () => {
    const contenu = input.trim()
    if (!contenu || !user) return
    if (isStaff && !selectedPatientId) {
      setError('Sélectionnez un patient.')
      return
    }
    setSending(true)
    setError(null)
    try {
      const res = await chatApi.sendMessage({
        contenu,
        patientId: isStaff ? selectedPatientId : undefined,
      })
      setMessages((prev) => [...prev, res.message])
      setInput('')
      if (isStaff) void loadConversations()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Envoi impossible.')
    } finally {
      setSending(false)
    }
  }

  const filteredPatients = useMemo(() => {
    const q = searchPatient.trim().toLowerCase()
    const fromConv = new Set(conversations.map((c) => c.patientId))
    const list = patientOptions.filter((p) => !fromConv.has(p.id))
    if (!q) return list.slice(0, 12)
    return list
      .filter((p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.dossierNumber.toLowerCase().includes(q)
      )
      .slice(0, 12)
  }, [patientOptions, conversations, searchPatient])

  const headerTitle = isPatient
    ? 'Équipe médicale'
    : activeConversation?.fullName ?? activePatientOption?.fullName ?? 'Messages'

  const headerSub = isPatient
    ? 'Conversation avec le cabinet'
    : activeConversation
      ? `${activeConversation.dossierNumber} · ${activeConversation.email}`
      : activePatientOption
        ? `${activePatientOption.dossierNumber} · ${activePatientOption.email}`
        : 'Choisissez un patient pour démarrer'

  return (
    <div className={cn('mx-auto flex min-h-[calc(100vh-8rem)]', isPatient ? 'max-w-2xl flex-col' : 'max-w-5xl flex-col gap-4 lg:flex-row')}>
      {isStaff && (
        <div className="w-full shrink-0 rounded-xl border border-border bg-white p-3 lg:w-80">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Conversations
          </p>

          <div className="space-y-1 max-h-52 overflow-y-auto lg:max-h-[40vh] mb-3">
            {conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-3">Aucune conversation pour le moment.</p>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.patientId}
                  type="button"
                  onClick={() => setSelectedPatientId(c.patientId)}
                  className={cn(
                    'w-full text-left rounded-lg px-3 py-2 text-sm transition-all',
                    selectedPatientId === c.patientId ? 'bg-brand-50 text-brand-700' : 'hover:bg-muted'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium truncate">{c.fullName}</p>
                    {c.unreadCount > 0 && (
                      <span className="shrink-0 rounded-full bg-brand-600 text-white text-[10px] font-bold px-1.5 py-0.5">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{c.lastMessagePreview || c.dossierNumber}</p>
                </button>
              ))
            )}
          </div>

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Nouveau message</p>
          <Input
            value={searchPatient}
            onChange={(e) => setSearchPatient(e.target.value)}
            placeholder="Chercher un patient…"
            className="h-8 text-sm mb-2"
          />
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {filteredPatients.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPatientId(p.id)}
                className={cn(
                  'w-full text-left rounded-lg px-3 py-2 text-sm transition-all',
                  selectedPatientId === p.id ? 'bg-brand-50 text-brand-700' : 'hover:bg-muted'
                )}
              >
                <p className="font-medium truncate">{p.fullName}</p>
                <p className="text-[11px] text-muted-foreground truncate">{p.dossierNumber}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <div className="rounded-xl bg-white border border-border p-4 flex items-center gap-3 mb-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100">
            <MessageSquare className="h-5 w-5 text-brand-700" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{headerTitle}</p>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <p className="text-xs text-muted-foreground truncate">{headerSub}</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex-1 rounded-xl border border-border bg-white overflow-hidden flex flex-col min-h-[320px]">
          <ScrollArea className="flex-1 p-4">
            {loading && messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">Chargement…</p>
            ) : messages.length === 0 ? (
              <div className="text-center py-12 px-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {isPatient
                    ? 'Écrivez votre premier message à l’équipe.'
                    : selectedPatientId
                      ? 'Aucun message. Envoyez le premier.'
                      : 'Sélectionnez un patient.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((m) => {
                  const own = m.expediteurId === user?.id
                  return (
                    <div key={m.id} className={cn('flex gap-2', own ? 'flex-row-reverse' : 'flex-row')}>
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className={cn(
                          'text-[10px]',
                          m.expediteurRole === 'medecin' ? 'bg-blue-100 text-blue-700' :
                          m.expediteurRole === 'gestionnaire' ? 'bg-purple-100 text-purple-700' :
                          'bg-slate-100 text-slate-700'
                        )}>
                          {m.expediteurRole === 'medecin' ? <Stethoscope className="h-3.5 w-3.5" /> :
                            m.expediteurRole === 'gestionnaire' ? <Users className="h-3.5 w-3.5" /> :
                              <User className="h-3.5 w-3.5" />}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn('max-w-[85%] sm:max-w-[75%] space-y-1', own ? 'items-end' : 'items-start')}>
                        <div className="flex items-center gap-2 px-1">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {own ? 'Vous' : (m.expediteurNom ?? (
                              m.expediteurRole === 'medecin' ? 'Médecin' :
                              m.expediteurRole === 'gestionnaire' ? 'Gestionnaire' : 'Patient'
                            ))}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{formatDateTime(m.dateEnvoi)}</span>
                        </div>
                        <div className={cn(
                          'rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                          own ? 'bg-brand-600 text-white rounded-tr-md' : 'bg-muted text-foreground rounded-tl-md'
                        )}>
                          {m.contenu}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>
            )}
          </ScrollArea>

          <div className="border-t border-border p-3 flex items-center gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleSend()
                }
              }}
              placeholder={
                isStaff && !selectedPatientId
                  ? 'Sélectionnez un patient…'
                  : 'Écrire un message…'
              }
              disabled={sending || (isStaff && !selectedPatientId)}
              className="flex-1"
            />
            <Button
              variant="brand"
              size="icon"
              onClick={() => void handleSend()}
              disabled={sending || !input.trim() || (isStaff && !selectedPatientId)}
              aria-label="Envoyer"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
