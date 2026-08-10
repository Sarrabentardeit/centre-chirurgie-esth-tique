import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Check, CheckCheck, FileText, Filter, Image as ImageIcon,
  MessageSquare, Paperclip, Search, Send, Stethoscope, User, Users, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuthStore } from '@/store/authStore'
import {
  chatApi,
  type ChatConversation,
  type ChatMessage,
  type ChatPatientOption,
} from '@/lib/api'
import { formatDateTime, cn } from '@/lib/utils'
import { playMessageSound } from '@/lib/notificationSounds'
import { toast } from '@/store/toastStore'

type StaffTab = 'conversations' | 'nouveau'
type ListFilter = 'all' | 'unread'

function normalizeSearch(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function matchesQuery(q: string, p: { fullName: string; email: string; dossierNumber: string }) {
  if (!q) return true
  const nq = normalizeSearch(q)
  return (
    normalizeSearch(p.fullName).includes(nq) ||
    normalizeSearch(p.email).includes(nq) ||
    normalizeSearch(p.dossierNumber).includes(nq)
  )
}

function initials(name: string) {
  return name.split(/\s+/).map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function roleLabel(role: string) {
  if (role === 'medecin') return 'Médecin'
  if (role === 'gestionnaire') return 'Gestionnaire'
  return 'Patiente'
}

function relativeTime(iso: string) {
  const d = new Date(iso).getTime()
  const diff = Date.now() - d
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'maintenant'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days} j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function dayKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (dayKey(iso) === dayKey(today.toISOString())) return 'Aujourd’hui'
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return 'Hier'
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function isImageUrl(url: string) {
  return /\.(jpe?g|png|webp)(\?|$)/i.test(url)
}

type ThreadItem =
  | { type: 'day'; key: string; label: string }
  | { type: 'msg'; message: ChatMessage }

export default function ChatPage() {
  const { user } = useAuthStore()
  const isPatient = user?.role === 'patient'
  const isStaff = user?.role === 'medecin' || user?.role === 'gestionnaire'

  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [directory, setDirectory] = useState<ChatPatientOption[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [directoryLoading, setDirectoryLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [directoryError, setDirectoryError] = useState<string | null>(null)
  const [searchPatient, setSearchPatient] = useState('')
  const [threadSearch, setThreadSearch] = useState('')
  const [showThreadSearch, setShowThreadSearch] = useState(false)
  const [mobileShowThread, setMobileShowThread] = useState(false)
  const [staffTab, setStaffTab] = useState<StaffTab>('conversations')
  const [listFilter, setListFilter] = useState<ListFilter>('all')
  const [pendingFile, setPendingFile] = useState<{ file: File; previewUrl?: string } | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<number | null>(null)
  const lastMessageIdRef = useRef<string | null>(null)
  const searchTimerRef = useRef<number | null>(null)

  const activeConversation = conversations.find((c) => c.patientId === selectedPatientId)
  const activeDirectory = directory.find((p) => p.id === selectedPatientId)
  const unreadTotal = useMemo(
    () => conversations.reduce((n, c) => n + c.unreadCount, 0),
    [conversations],
  )

  const loadConversations = useCallback(async (opts?: { keepSelection?: boolean }) => {
    if (!isStaff) return
    try {
      const res = await chatApi.getConversations()
      setConversations(res.conversations)
      if (!opts?.keepSelection) {
        setSelectedPatientId((prev) => prev || res.conversations[0]?.patientId || '')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de charger les conversations.')
    }
  }, [isStaff])

  const loadDirectory = useCallback(async (search?: string) => {
    if (!isStaff) return
    setDirectoryLoading(true)
    setDirectoryError(null)
    try {
      const res = await chatApi.searchPatients(search)
      setDirectory(res.patients)
    } catch (e) {
      setDirectoryError(e instanceof Error ? e.message : 'Impossible de charger les patients.')
    } finally {
      setDirectoryLoading(false)
    }
  }, [isStaff])

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
          prev.map((c) => (c.patientId === patientId ? { ...c, unreadCount: 0 } : c)),
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

  useEffect(() => {
    lastMessageIdRef.current = null
  }, [selectedPatientId, isPatient])

  useEffect(() => {
    void loadConversations()
    void loadDirectory()
  }, [loadConversations, loadDirectory])

  useEffect(() => {
    if (!isStaff) return
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current)
    searchTimerRef.current = window.setTimeout(() => {
      void loadDirectory(searchPatient.trim() || undefined)
    }, 280)
    return () => {
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current)
    }
  }, [searchPatient, isStaff, loadDirectory])

  useEffect(() => {
    if (isPatient) {
      void loadMessages()
      return
    }
    if (selectedPatientId) void loadMessages(selectedPatientId)
    else {
      setMessages([])
      setLoading(false)
    }
  }, [isPatient, selectedPatientId, loadMessages])

  useEffect(() => {
    const tick = () => {
      if (isPatient) void loadMessages(undefined, true)
      else if (selectedPatientId) {
        void loadMessages(selectedPatientId, true)
        void loadConversations({ keepSelection: true })
      } else {
        void loadConversations({ keepSelection: true })
      }
    }
    pollRef.current = window.setInterval(tick, 10000)
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [isPatient, selectedPatientId, loadMessages, loadConversations])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, selectedPatientId])

  const clearPendingFile = () => {
    if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl)
    setPendingFile(null)
  }

  const selectPatient = (patientId: string) => {
    setSelectedPatientId(patientId)
    setMobileShowThread(true)
    setStaffTab('conversations')
    setError(null)
    setInput('')
    setThreadSearch('')
    setShowThreadSearch(false)
    clearPendingFile()
    window.setTimeout(() => inputRef.current?.focus(), 80)
  }

  const onPickFile = (file: File | null) => {
    if (!file) return
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)
    if (!ok) {
      setError('Formats acceptés : JPG, PNG, WEBP, PDF (max 12 Mo).')
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('Fichier trop volumineux (max 12 Mo).')
      return
    }
    clearPendingFile()
    setPendingFile({
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    })
    setError(null)
  }

  const handleSend = async () => {
    const contenu = input.trim()
    if ((!contenu && !pendingFile) || !user) return
    if (isStaff && !selectedPatientId) {
      setError('Sélectionnez une patiente pour envoyer un message.')
      return
    }
    setSending(true)
    setError(null)
    try {
      let pieceJointeUrl: string | undefined
      let pieceJointeNom: string | undefined
      if (pendingFile) {
        setUploading(true)
        const up = await chatApi.upload(pendingFile.file)
        pieceJointeUrl = up.url
        pieceJointeNom = up.name
        setUploading(false)
      }
      const res = await chatApi.sendMessage({
        contenu,
        patientId: isStaff ? selectedPatientId : undefined,
        pieceJointeUrl,
        pieceJointeNom,
      })
      setMessages((prev) => [...prev, res.message])
      setInput('')
      clearPendingFile()
      if (isStaff) void loadConversations({ keepSelection: true })
      toast({ title: 'Message envoyé', variant: 'success' })
      inputRef.current?.focus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Envoi impossible.')
      toast({ title: 'Envoi impossible', description: e instanceof Error ? e.message : undefined, variant: 'error' })
      setUploading(false)
    } finally {
      setSending(false)
    }
  }

  const filteredConversations = useMemo(() => {
    const q = searchPatient.trim()
    let list = q ? conversations.filter((c) => matchesQuery(q, c)) : conversations
    if (listFilter === 'unread') list = list.filter((c) => c.unreadCount > 0)
    return [...list].sort((a, b) => {
      if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    })
  }, [conversations, searchPatient, listFilter])

  const newPatients = useMemo(() => {
    const fromConv = new Set(conversations.map((c) => c.patientId))
    const q = searchPatient.trim()
    return directory
      .filter((p) => !fromConv.has(p.id))
      .filter((p) => matchesQuery(q, p))
      .slice(0, q ? 40 : 20)
  }, [directory, conversations, searchPatient])

  const threadItems = useMemo((): ThreadItem[] => {
    const q = threadSearch.trim()
    const msgs = q
      ? messages.filter((m) =>
          normalizeSearch(m.contenu).includes(normalizeSearch(q)) ||
          normalizeSearch(m.pieceJointeNom ?? '').includes(normalizeSearch(q)),
        )
      : messages
    const items: ThreadItem[] = []
    let lastDay = ''
    for (const m of msgs) {
      const dk = dayKey(m.dateEnvoi)
      if (dk !== lastDay) {
        items.push({ type: 'day', key: dk, label: dayLabel(m.dateEnvoi) })
        lastDay = dk
      }
      items.push({ type: 'msg', message: m })
    }
    return items
  }, [messages, threadSearch])

  const headerTitle = isPatient
    ? 'Cabinet Dr Chennoufi'
    : activeConversation?.fullName ?? activeDirectory?.fullName ?? 'Messagerie'

  const headerSub = isPatient
    ? 'Échange sécurisé avec le médecin et la gestionnaire'
    : activeConversation
      ? `${activeConversation.dossierNumber} · ${activeConversation.email}`
      : activeDirectory
        ? `${activeDirectory.dossierNumber} · ${activeDirectory.email}`
        : 'Fil partagé équipe ↔ patiente'

  const staffSidebar = (
    <aside
      className={cn(
        'w-full shrink-0 flex flex-col min-h-0 rounded-2xl border border-border/80 bg-white shadow-sm overflow-hidden',
        'lg:w-[360px]',
        mobileShowThread ? 'hidden lg:flex' : 'flex',
        'max-h-[min(54vh,460px)] lg:max-h-none lg:h-full',
      )}
    >
      <div className="px-4 pt-4 pb-3 border-b border-border/70 bg-gradient-to-b from-slate-50 to-white shrink-0">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <p className="text-sm font-bold text-slate-900">Messagerie</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {conversations.length} conversation{conversations.length > 1 ? 's' : ''}
              {unreadTotal > 0 ? ` · ${unreadTotal} non lu${unreadTotal > 1 ? 's' : ''}` : ''}
            </p>
          </div>
          {unreadTotal > 0 && (
            <span className="rounded-full bg-brand-600 text-white text-[11px] font-bold px-2.5 py-1">
              {unreadTotal}
            </span>
          )}
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchPatient}
            onChange={(e) => setSearchPatient(e.target.value)}
            placeholder="Nom, email, nº dossier…"
            className="h-11 pl-9 text-sm rounded-xl bg-white"
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100/80">
          <button
            type="button"
            onClick={() => setStaffTab('conversations')}
            className={cn(
              'h-9 rounded-lg text-xs font-semibold transition-colors',
              staffTab === 'conversations' ? 'bg-white text-slate-900 shadow-sm' : 'text-muted-foreground hover:text-slate-700',
            )}
          >
            Conversations
          </button>
          <button
            type="button"
            onClick={() => setStaffTab('nouveau')}
            className={cn(
              'h-9 rounded-lg text-xs font-semibold transition-colors',
              staffTab === 'nouveau' ? 'bg-white text-slate-900 shadow-sm' : 'text-muted-foreground hover:text-slate-700',
            )}
          >
            Nouvelle
          </button>
        </div>

        {staffTab === 'conversations' && (
          <div className="flex items-center gap-1.5 mt-2.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              type="button"
              onClick={() => setListFilter('all')}
              className={cn(
                'text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors',
                listFilter === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              Tous
            </button>
            <button
              type="button"
              onClick={() => setListFilter('unread')}
              className={cn(
                'text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors',
                listFilter === 'unread' ? 'bg-brand-600 text-white border-brand-600' : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              Non lus
            </button>
          </div>
        )}

        {directoryError && (
          <p className="text-[11px] text-destructive mt-2">
            {directoryError}{' '}
            <button type="button" className="underline font-medium" onClick={() => void loadDirectory(searchPatient || undefined)}>
              Réessayer
            </button>
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {staffTab === 'conversations' ? (
          filteredConversations.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/35 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {listFilter === 'unread' ? 'Aucun message non lu.' : searchPatient.trim() ? 'Aucun résultat.' : 'Aucune conversation.'}
              </p>
              <button
                type="button"
                className="mt-3 text-xs font-semibold text-brand-700 hover:underline"
                onClick={() => setStaffTab('nouveau')}
              >
                Démarrer une conversation →
              </button>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredConversations.map((c) => (
                <button
                  key={c.patientId}
                  type="button"
                  onClick={() => selectPatient(c.patientId)}
                  className={cn(
                    'w-full text-left rounded-xl px-3 py-3 transition-all',
                    selectedPatientId === c.patientId
                      ? 'bg-brand-50 ring-1 ring-brand-200 shadow-sm'
                      : 'hover:bg-slate-50',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-brand-100 text-brand-800 text-xs font-bold">
                          {initials(c.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      {c.unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-brand-600 ring-2 ring-white" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn('truncate text-[13px]', c.unreadCount > 0 ? 'font-bold text-slate-900' : 'font-semibold text-slate-800')}>
                          {c.fullName}
                        </p>
                        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                          {relativeTime(c.lastMessageAt)}
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate">{c.dossierNumber}</p>
                      <p className={cn('text-[12px] truncate mt-1', c.unreadCount > 0 ? 'text-slate-700 font-medium' : 'text-muted-foreground')}>
                        {c.lastMessagePreview || '—'}
                      </p>
                    </div>
                    {c.unreadCount > 0 && (
                      <span className="shrink-0 mt-1 rounded-full bg-brand-600 text-white text-[10px] font-bold min-w-5 h-5 px-1.5 flex items-center justify-center">
                        {c.unreadCount > 99 ? '99+' : c.unreadCount}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )
        ) : directoryLoading && directory.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3 py-8 text-center">Chargement des patientes…</p>
        ) : newPatients.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3 py-8 text-center">
            {searchPatient.trim()
              ? 'Déjà en conversation, ou aucun résultat.'
              : 'Recherchez une patiente pour démarrer.'}
          </p>
        ) : (
          <div className="space-y-0.5">
            {newPatients.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPatient(p.id)}
                className={cn(
                  'w-full text-left rounded-xl px-3 py-3 transition-all',
                  selectedPatientId === p.id ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-slate-50',
                )}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-slate-100 text-slate-700 text-xs font-bold">
                      {initials(p.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-semibold text-[13px] truncate text-slate-900">{p.fullName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{p.dossierNumber} · {p.email}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )

  const threadPane = (
    <section
      className={cn(
        'flex-1 flex flex-col min-h-0 min-w-0 rounded-2xl border border-border/80 bg-white shadow-sm overflow-hidden',
        isStaff && !mobileShowThread ? 'hidden lg:flex' : 'flex',
      )}
    >
      <header className="px-3 sm:px-4 py-3 border-b border-border/70 bg-white/95 backdrop-blur shrink-0 flex items-center gap-2.5">
        {isStaff && (
          <button
            type="button"
            className="lg:hidden h-10 w-10 rounded-xl border border-border flex items-center justify-center shrink-0 hover:bg-muted"
            onClick={() => setMobileShowThread(false)}
            aria-label="Retour"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className={cn(
            'text-xs font-bold',
            isPatient ? 'bg-brand-100 text-brand-800' : 'bg-brand-100 text-brand-800',
          )}>
            {isPatient ? <Stethoscope className="h-4 w-4" /> : initials(headerTitle)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-slate-900 truncate">{headerTitle}</p>
          <p className="text-[11px] text-muted-foreground truncate">{headerSub}</p>
        </div>
        {(isStaff ? !!selectedPatientId : true) && (
          <button
            type="button"
            className={cn(
              'h-10 w-10 rounded-xl border border-border flex items-center justify-center shrink-0 hover:bg-muted',
              showThreadSearch && 'bg-muted',
            )}
            onClick={() => setShowThreadSearch((v) => !v)}
            aria-label="Rechercher dans la conversation"
          >
            <Search className="h-4 w-4" />
          </button>
        )}
      </header>

      {showThreadSearch && (
        <div className="px-3 py-2 border-b border-border/60 bg-slate-50 shrink-0">
          <Input
            value={threadSearch}
            onChange={(e) => setThreadSearch(e.target.value)}
            placeholder="Chercher dans les messages…"
            className="h-9 text-sm bg-white"
            autoFocus
          />
        </div>
      )}

      {error && (
        <div className="mx-3 mt-3 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive shrink-0 flex items-start gap-2">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <ScrollArea className="flex-1 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_40%)]">
        <div className="p-3 sm:p-4 space-y-3">
          {loading && messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">Chargement…</p>
          ) : threadItems.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-brand-50 flex items-center justify-center">
                <MessageSquare className="h-6 w-6 text-brand-700/70" />
              </div>
              <p className="text-sm font-medium text-slate-800">
                {threadSearch.trim()
                  ? 'Aucun message trouvé.'
                  : isPatient
                    ? 'Commencez la conversation avec l’équipe.'
                    : selectedPatientId
                      ? 'Envoyez le premier message.'
                      : 'Sélectionnez une patiente.'}
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                Médecin et gestionnaire partagent le même fil avec chaque patiente.
              </p>
            </div>
          ) : (
            threadItems.map((item) => {
              if (item.type === 'day') {
                return (
                  <div key={`day-${item.key}`} className="flex items-center justify-center py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-full shadow-sm">
                      {item.label}
                    </span>
                  </div>
                )
              }
              const m = item.message
              const own = m.expediteurId === user?.id
              return (
                <div key={m.id} className={cn('flex gap-2', own ? 'flex-row-reverse' : 'flex-row')}>
                  <Avatar className="h-8 w-8 shrink-0 mt-1">
                    <AvatarFallback className={cn(
                      'text-[10px]',
                      m.expediteurRole === 'medecin' ? 'bg-sky-100 text-sky-800' :
                        m.expediteurRole === 'gestionnaire' ? 'bg-violet-100 text-violet-800' :
                          'bg-slate-100 text-slate-700',
                    )}>
                      {m.expediteurRole === 'medecin' ? <Stethoscope className="h-3.5 w-3.5" /> :
                        m.expediteurRole === 'gestionnaire' ? <Users className="h-3.5 w-3.5" /> :
                          <User className="h-3.5 w-3.5" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className={cn('max-w-[88%] sm:max-w-[72%] space-y-1', own ? 'items-end' : 'items-start')}>
                    <div className={cn('flex items-center gap-1.5 px-1 flex-wrap', own && 'justify-end')}>
                      <span className="text-[11px] font-semibold text-slate-600">
                        {own ? 'Vous' : (m.expediteurNom ?? roleLabel(m.expediteurRole))}
                      </span>
                      {!own && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 font-medium">
                          {roleLabel(m.expediteurRole)}
                        </span>
                      )}
                    </div>
                    <div className={cn(
                      'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words shadow-sm',
                      own
                        ? 'bg-brand-700 text-white rounded-tr-md'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-tl-md',
                    )}>
                      {m.pieceJointeUrl && (
                        <div className="mb-2">
                          {isImageUrl(m.pieceJointeUrl) ? (
                            <a href={m.pieceJointeUrl} target="_blank" rel="noreferrer" className="block">
                              <img
                                src={m.pieceJointeUrl}
                                alt={m.pieceJointeNom ?? 'Image'}
                                className="max-h-56 rounded-xl object-cover border border-white/20"
                              />
                            </a>
                          ) : (
                            <a
                              href={m.pieceJointeUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={cn(
                                'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium',
                                own ? 'bg-white/15 hover:bg-white/25' : 'bg-slate-100 hover:bg-slate-200',
                              )}
                            >
                              <FileText className="h-4 w-4" />
                              {m.pieceJointeNom ?? 'Document PDF'}
                            </a>
                          )}
                        </div>
                      )}
                      {m.contenu && !m.contenu.startsWith('Pièce jointe') && (
                        <p className="whitespace-pre-wrap">{m.contenu}</p>
                      )}
                      {m.contenu.startsWith('Pièce jointe') && !m.pieceJointeUrl && (
                        <p className="whitespace-pre-wrap">{m.contenu}</p>
                      )}
                    </div>
                    <div className={cn('flex items-center gap-1 px-1', own ? 'justify-end' : 'justify-start')}>
                      <span className="text-[10px] text-muted-foreground">{formatDateTime(m.dateEnvoi)}</span>
                      {own && (
                        m.lu
                          ? <CheckCheck className="h-3.5 w-3.5 text-sky-500" aria-label="Lu" />
                          : <Check className="h-3.5 w-3.5 text-muted-foreground" aria-label="Envoyé" />
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <footer className="border-t border-border/70 p-2.5 sm:p-3 bg-white shrink-0">
        {pendingFile && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            {pendingFile.previewUrl ? (
              <img src={pendingFile.previewUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
            ) : (
              <FileText className="h-5 w-5 text-slate-500" />
            )}
            <p className="text-xs font-medium truncate flex-1">{pendingFile.file.name}</p>
            <button type="button" onClick={clearPendingFile} className="h-8 w-8 rounded-lg hover:bg-white flex items-center justify-center" aria-label="Retirer">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-xl"
            disabled={sending || uploading || (isStaff && !selectedPatientId)}
            onClick={() => fileRef.current?.click()}
            aria-label="Joindre un fichier"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            ref={inputRef}
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
                ? 'Sélectionnez une patiente…'
                : 'Écrire un message… (Entrée pour envoyer)'
            }
            disabled={sending || uploading || (isStaff && !selectedPatientId)}
            className="min-h-11 max-h-32 resize-none flex-1 rounded-xl text-sm py-2.5"
            rows={1}
            maxLength={4000}
          />
          <Button
            variant="brand"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-xl"
            onClick={() => void handleSend()}
            disabled={sending || uploading || (!input.trim() && !pendingFile) || (isStaff && !selectedPatientId)}
            aria-label="Envoyer"
          >
            {uploading ? <ImageIcon className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
          Pièces jointes : JPG, PNG, WEBP, PDF · max 12 Mo
        </p>
      </footer>
    </section>
  )

  return (
    <div
      className={cn(
        'mx-auto flex w-full gap-3 lg:gap-4',
        isPatient
          ? 'max-w-3xl flex-col h-[calc(100dvh-8.5rem)] lg:h-[calc(100dvh-6rem)]'
          : 'max-w-6xl flex-col lg:flex-row h-[calc(100dvh-8.5rem)] lg:h-[calc(100dvh-6rem)]',
      )}
    >
      {isStaff && staffSidebar}
      {threadPane}
    </div>
  )
}
