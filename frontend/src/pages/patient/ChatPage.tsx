import { useState, useRef, useEffect, useMemo } from 'react'
import { Send, Bot, User, Stethoscope } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { MessageChat } from '@/types'

const BOT_RESPONSES = [
  "Je comprends votre question. Je vais transmettre votre message à l'équipe médicale.",
  "Bonjour ! Pour toute question médicale spécifique, le Dr. Mehdi Chennoufi vous répondra dans les plus brefs délais.",
  "Merci pour votre message. Notre équipe vous répondra sous 24h.",
  "Votre dossier est en cours de traitement. N'hésitez pas à poser vos questions.",
]

export default function ChatPage() {
  const { user } = useAuthStore()
  const patients = useDemoStore((s) => s.patients)
  const messagesStore = useDemoStore((s) => s.messages)
  const ensurePatientForUser = useDemoStore((s) => s.ensurePatientForUser)
  const addChatMessage = useDemoStore((s) => s.addChatMessage)

  const isPatientRole = user?.role === 'patient'

  const patient = useMemo(() => {
    if (!user) return undefined
    return patients.find((p) => p.userId === user.id)
  }, [patients, user?.id])

  const conversations = useMemo(() => {
    if (isPatientRole) return []
    return patients
      .filter((p) => messagesStore.some((m) => m.dossierPatientId === p.id))
      .slice(0, 20)
  }, [isPatientRole, messagesStore, patients])

  const [selectedPatientId, setSelectedPatientId] = useState<string>('')

  useEffect(() => {
    if (isPatientRole) return
    if (!selectedPatientId && conversations.length > 0) {
      setSelectedPatientId(conversations[0].id)
    }
  }, [conversations, isPatientRole, selectedPatientId])

  const activePatient = isPatientRole
    ? patient
    : patients.find((p) => p.id === selectedPatientId)

  const messages = useMemo(() => {
    if (!activePatient) return []
    return messagesStore
      .filter((m) => m.dossierPatientId === activePatient.id)
      .slice()
      .sort((a, b) => new Date(a.dateEnvoi).getTime() - new Date(b.dateEnvoi).getTime())
  }, [activePatient?.id, messagesStore])

  // Ensure patient record exists in demo store (so chatbot is available immediately)
  useEffect(() => {
    if (!user || !isPatientRole) return
    ensurePatientForUser(user, { sourceContact: 'direct' })
  }, [user, ensurePatientForUser, isPatientRole])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [channel, setChannel] = useState<'assistant' | 'equipe'>('assistant')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleSend = () => {
    if (!input.trim() || !activePatient || !user) return

    addChatMessage(activePatient.id, user.id, user.role, input.trim())
    setInput('')
    if (isPatientRole && channel === 'assistant') setIsTyping(true)

    if (isPatientRole && channel === 'assistant') {
      setTimeout(() => {
        setIsTyping(false)
        const botReply = BOT_RESPONSES[Math.floor(Math.random() * BOT_RESPONSES.length)]
        addChatMessage(activePatient.id, 'bot', 'bot', botReply)
      }, 1500)
    }
  }

  const visibleMessages = useMemo(() => {
    if (!isPatientRole) return messages
    if (channel === 'assistant') {
      return messages.filter((m) => m.expediteurRole === 'bot' || m.expediteurId === user?.id)
    }
    return messages.filter((m) => m.expediteurRole !== 'bot')
  }, [channel, isPatientRole, messages, user?.id])

  const getAvatarContent = (msg: MessageChat) => {
    if (msg.expediteurRole === 'bot') return <Bot className="h-4 w-4" />
    if (msg.expediteurRole === 'medecin') return <Stethoscope className="h-4 w-4" />
    return <User className="h-4 w-4" />
  }

  const getAvatarClass = (msg: MessageChat) => {
    if (msg.expediteurRole === 'bot') return 'bg-brand-100 text-brand-700'
    if (msg.expediteurRole === 'medecin') return 'bg-blue-100 text-blue-700'
    return 'bg-slate-100 text-slate-700'
  }

  const getSenderName = (msg: MessageChat) => {
    if (msg.expediteurRole === 'bot') return 'Assistant'
    if (msg.expediteurRole === 'medecin') return 'Dr. Mehdi Chennoufi'
    if (msg.expediteurRole === 'gestionnaire') return 'Gestionnaire'
    return 'Vous'
  }

  const isOwnMessage = (msg: MessageChat) => msg.expediteurId === user?.id

  return (
    <div className={cn('mx-auto flex min-h-[calc(100vh-8rem)]', isPatientRole ? 'max-w-2xl flex-col' : 'max-w-5xl flex-col gap-4 lg:flex-row')}>
      {!isPatientRole && (
        <div className="w-full shrink-0 rounded-xl border border-border bg-white p-3 lg:w-72">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Conversations</p>
          <div className="space-y-1 max-h-44 overflow-y-auto lg:max-h-[calc(100vh-16rem)]">
            {conversations.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPatientId(p.id)}
                className={cn(
                  'w-full text-left rounded-lg px-3 py-2 text-sm transition-all',
                  selectedPatientId === p.id ? 'bg-brand-50 text-brand-700' : 'hover:bg-muted'
                )}
              >
                <p className="font-medium">{p.prenom} {p.nom}</p>
                <p className="text-xs text-muted-foreground">{p.email}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0">
      {/* Chat Header */}
      <div className="rounded-xl bg-white border border-border p-4 flex items-center gap-3 mb-4 shadow-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100">
          <Bot className="h-5 w-5 text-brand-700" />
        </div>
        <div>
          <p className="font-semibold text-sm">
            {isPatientRole && channel === 'assistant' ? 'Chat — Assistant' : 'Chat — Équipe médicale'}
          </p>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <p className="text-xs text-muted-foreground">
              {isPatientRole
                ? channel === 'assistant'
                  ? 'Réponse automatique instantanée'
                  : 'Conversation directe avec médecin/gestionnaire'
                : activePatient
                ? `Conversation active: ${activePatient.prenom} ${activePatient.nom}`
                : 'Aucune conversation sélectionnée'}
            </p>
          </div>
        </div>
      </div>

      {isPatientRole && (
        <div className="mb-3 inline-flex w-fit rounded-lg border border-border bg-white p-1">
          <button
            type="button"
            onClick={() => setChannel('assistant')}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-all',
              channel === 'assistant' ? 'bg-brand-600 text-white' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            Assistant
          </button>
          <button
            type="button"
            onClick={() => setChannel('equipe')}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-all',
              channel === 'equipe' ? 'bg-brand-600 text-white' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            Equipe médicale
          </button>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 rounded-xl border border-border bg-white p-4">
        <div className="space-y-4">
          {visibleMessages.map((msg) => {
            const own = isOwnMessage(msg)
            return (
              <div key={msg.id} className={cn('flex gap-3', own ? 'flex-row-reverse' : 'flex-row')}>
                <Avatar className="h-8 w-8 shrink-0 mt-1">
                  <AvatarFallback className={cn('text-xs', getAvatarClass(msg))}>
                    {getAvatarContent(msg)}
                  </AvatarFallback>
                </Avatar>
                <div className={cn('max-w-[85%] sm:max-w-[75%] space-y-1', own ? 'items-end' : 'items-start')}>
                  <div className="flex items-center gap-2">
                    <p className={cn('text-xs font-medium text-muted-foreground', own && 'order-last')}>
                      {getSenderName(msg)}
                    </p>
                    <p className="text-xs text-muted-foreground/60">
                      {formatDateTime(msg.dateEnvoi).split(' à ')[1]}
                    </p>
                  </div>
                  <div
                    className={cn(
                      'rounded-2xl px-4 py-2.5 text-sm',
                      own
                        ? 'bg-brand-600 text-white rounded-tr-sm'
                        : msg.expediteurRole === 'medecin'
                        ? 'bg-blue-50 border border-blue-200 text-blue-900 rounded-tl-sm'
                        : 'bg-muted text-foreground rounded-tl-sm'
                    )}
                  >
                    {msg.contenu}
                  </div>
                </div>
              </div>
            )
          })}

          {isTyping && (
            <div className="flex gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-brand-100 text-brand-700 text-xs">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1 items-center">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="mt-4 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder={isPatientRole && channel === 'assistant' ? "Posez une question à l'assistant..." : 'Écrivez votre message...'}
          className="flex-1"
          disabled={!activePatient}
        />
        <Button
          variant="brand"
          size="icon"
          onClick={handleSend}
          disabled={!input.trim() || !activePatient}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      </div>
    </div>
  )
}
