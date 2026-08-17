import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Check, CheckCheck, Download, EyeOff, FileText, Filter, Image as ImageIcon,
  Mail, MessageSquare, MoreVertical, Paperclip, Pin, PinOff, Search, Send,
  Stethoscope, Trash2, Users, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuthStore } from '@/store/authStore'
import {
  chatApi,
  EQUIPE_THREAD_ID,
  type ChatConversation,
  type ChatMessage,
  type ChatPatientOption,
} from '@/lib/api'
import { formatDateTime, cn } from '@/lib/utils'
import {
  downloadAttachment,
  isImageUrl,
  isPdfUrl,
  resolveAttachmentUrl,
} from '@/lib/chatAttachments'
import { playMessageSound } from '@/lib/notificationSounds'
import { useChatRealtime } from '@/lib/chatRealtime'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { BottomSheet } from '@/components/BottomSheet'
import { PullToRefresh } from '@/components/PullToRefresh'
import { feedbackSuccess, toast } from '@/store/toastStore'

type StaffTab = 'patient' | 'equipe' | 'nouveau'
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

function lastSenderShort(role: string | null | undefined, myRole?: string) {
  if (!role) return null
  if (myRole && role === myRole) return 'Vous'
  if (role === 'medecin') return 'Dr'
  if (role === 'patient') return 'Patiente'
  if (role === 'gestionnaire') return 'Houda'
  return roleLabel(role)
}

function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        'ml-1 inline-flex min-w-[16px] h-4 px-1 items-center justify-center rounded-full bg-red-600 text-white text-[9px] font-bold leading-none',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

/** Bouton dossier : messages auto (abstention, demande rapport), pas un « salut ». */
function isDossierActionMessage(m: { dossierLink?: boolean; contenu?: string; staffOnly?: boolean }) {
  if (!m.staffOnly) return false
  if (m.dossierLink) return true
  const t = (m.contenu ?? '').toLowerCase()
  return (
    t.includes('dossier classé en abstention')
    || t.includes('nouveau rapport')
    || t.includes('pouvez-vous générer')
    || t.includes('le devis v1 reste conservé')
  )
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

type ThreadItem =
  | { type: 'day'; key: string; label: string }
  | { type: 'msg'; message: ChatMessage }

export default function ChatPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isPatient = user?.role === 'patient'
  const isStaff = user?.role === 'medecin' || user?.role === 'gestionnaire'
  const isMedecin = user?.role === 'medecin'

  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [directory, setDirectory] = useState<ChatPatientOption[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState(() => {
    if (searchParams.get('channel') === 'equipe') return EQUIPE_THREAD_ID
    return searchParams.get('patientId') ?? ''
  })
  /** Dossier concerné dans le fil unifié Houda (réponse / bouton Dossier). */
  const [equipeFocusPatientId, setEquipeFocusPatientId] = useState(
    () => (searchParams.get('channel') === 'equipe' ? (searchParams.get('patientId') ?? '') : ''),
  )
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
  const [staffTab, setStaffTab] = useState<StaffTab>(() => {
    const ch = searchParams.get('channel')
    if (ch === 'equipe') return 'equipe'
    if (ch === 'patient') return 'patient'
    // Médecin : ouvrir sur les demandes gestionnaire ; gestionnaire : canal patiente
    return useAuthStore.getState().user?.role === 'medecin' ? 'equipe' : 'patient'
  })
  const [listFilter, setListFilter] = useState<ListFilter>('all')
  const [equipeUnread, setEquipeUnread] = useState(0)
  const [patientUnread, setPatientUnread] = useState(0)
  const [pendingFile, setPendingFile] = useState<{ file: File; previewUrl?: string } | null>(null)
  const [menu, setMenu] = useState<{
    messageId: string
    top: number
    left: number
    placeAbove: boolean
    mobileSheet: boolean
  } | null>(null)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const [pendingDeleteAll, setPendingDeleteAll] = useState<ChatMessage | null>(null)
  const [deleteAllLoading, setDeleteAllLoading] = useState(false)
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null)

  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<number | null>(null)
  const lastMessageIdRef = useRef<string | null>(null)
  const searchTimerRef = useRef<number | null>(null)
  const skipAutoReadUntilRef = useRef(0)
  const conversationsRef = useRef<ChatConversation[]>([])
  const loadSeqRef = useRef(0)
  const convSeqRef = useRef(0)
  const staffTabRef = useRef(staffTab)
  const lastPatientIdRef = useRef('')
  staffTabRef.current = staffTab

  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])
  const MENU_WIDTH = 224
  const MENU_EST_HEIGHT = 200

  const closeMessageMenu = useCallback(() => setMenu(null), [])

  const openMessageMenu = useCallback((messageId: string, anchor: HTMLElement, alignRight: boolean) => {
    setMenu((prev) => {
      if (prev?.messageId === messageId) return null
      const isMobile = window.matchMedia('(max-width: 1023px)').matches
      if (isMobile) {
        return {
          messageId,
          top: 0,
          left: 0,
          placeAbove: true,
          mobileSheet: true,
        }
      }
      const rect = anchor.getBoundingClientRect()
      const vv = window.visualViewport
      const viewH = vv?.height ?? window.innerHeight
      const viewW = vv?.width ?? window.innerWidth
      const viewOffsetTop = vv?.offsetTop ?? 0
      const viewOffsetLeft = vv?.offsetLeft ?? 0
      const spaceBelow = viewOffsetTop + viewH - rect.bottom
      const spaceAbove = rect.top - viewOffsetTop
      const placeAbove = spaceBelow < MENU_EST_HEIGHT + 12 && spaceAbove > spaceBelow
      const width = Math.min(MENU_WIDTH, viewW - 16)
      let left = alignRight ? rect.right - width : rect.left
      left = Math.max(viewOffsetLeft + 8, Math.min(left, viewOffsetLeft + viewW - width - 8))
      const top = placeAbove ? rect.top - 6 : rect.bottom + 6
      return { messageId, top, left, placeAbove, mobileSheet: false }
    })
  }, [])

  const activeConversation = conversations.find((c) => c.patientId === selectedPatientId)
  const activeDirectory = directory.find((p) => p.id === selectedPatientId)
  const unreadTotal = useMemo(
    () => conversations.reduce((n, c) => n + c.unreadCount, 0),
    [conversations],
  )

  const loadConversations = useCallback(async (opts?: { keepSelection?: boolean }) => {
    if (!isStaff) return
    const tab = staffTabRef.current
    if (tab === 'nouveau') return
    const channel = tab === 'equipe' ? 'equipe' : 'patient'
    const seq = ++convSeqRef.current
    try {
      const res = await chatApi.getConversations(channel)
      if (seq !== convSeqRef.current) return
      if (staffTabRef.current !== tab) return
      setConversations(res.conversations)
      if (tab === 'equipe') {
        setSelectedPatientId(EQUIPE_THREAD_ID)
        if (!opts?.keepSelection) setMobileShowThread(true)
        return
      }
      const fromUrl = searchParams.get('patientId')
      setSelectedPatientId((prev) => {
        const validPrev = prev && prev !== EQUIPE_THREAD_ID ? prev : ''
        if (opts?.keepSelection && validPrev) return validPrev
        if (validPrev) return validPrev
        if (lastPatientIdRef.current) return lastPatientIdRef.current
        if (fromUrl && fromUrl !== EQUIPE_THREAD_ID) return fromUrl
        return res.conversations[0]?.patientId || ''
      })
    } catch (e) {
      if (seq !== convSeqRef.current) return
      setError(e instanceof Error ? e.message : 'Impossible de charger les conversations.')
    }
  }, [isStaff, searchParams])

  const refreshChannelBadges = useCallback(async () => {
    if (!isStaff) return
    try {
      const r = await chatApi.getUnread()
      setPatientUnread(r.patientUnread ?? 0)
      setEquipeUnread(r.equipeUnread ?? 0)
    } catch {
      /* silencieux */
    }
  }, [isStaff])

  useEffect(() => {
    if (!isStaff) return
    void refreshChannelBadges()
  }, [isStaff, refreshChannelBadges, staffTab, conversations])

  useEffect(() => {
    if (!isStaff || isMedecin) return
    if (searchParams.get('channel')) return
    if (searchParams.get('patientId')) return
    void chatApi.getUnread().then((r) => {
      if ((r.equipeUnread ?? 0) > 0) {
        setStaffTab('equipe')
        setSelectedPatientId(EQUIPE_THREAD_ID)
        setListFilter('all')
        setMobileShowThread(true)
      }
    }).catch(() => undefined)
  }, [isStaff, isMedecin, searchParams])

  useEffect(() => {
    const fromUrl = searchParams.get('patientId')
    const ch = searchParams.get('channel')
    if (ch === 'nouveau') {
      setStaffTab('nouveau')
      setSelectedPatientId('')
      setMessages([])
      setLoading(false)
      return
    }
    if (ch === 'equipe') {
      setStaffTab('equipe')
      setSelectedPatientId(EQUIPE_THREAD_ID)
      setListFilter('all')
      setMobileShowThread(true)
      if (fromUrl && fromUrl !== EQUIPE_THREAD_ID) setEquipeFocusPatientId(fromUrl)
      return
    }
    if (ch === 'patient') {
      setStaffTab('patient')
    }
    if (fromUrl && isStaff && fromUrl !== EQUIPE_THREAD_ID) {
      lastPatientIdRef.current = fromUrl
      setSelectedPatientId((prev) => (prev === EQUIPE_THREAD_ID ? fromUrl : (prev || fromUrl)))
    }
  }, [searchParams, isStaff])

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
    const tab = staffTabRef.current
    const channel = isPatient ? 'all' : tab === 'equipe' ? 'equipe' : 'patient'
    const requestPatientId = isPatient
      ? undefined
      : tab === 'equipe'
        ? EQUIPE_THREAD_ID
        : patientId && patientId !== EQUIPE_THREAD_ID
          ? patientId
          : undefined

    if (!isPatient && (tab === 'nouveau' || !requestPatientId)) {
      setMessages([])
      setLoading(false)
      return
    }

    const seq = ++loadSeqRef.current
    if (!silent) setLoading(true)
    try {
      const res = await chatApi.getMessages(requestPatientId, channel)
      if (seq !== loadSeqRef.current) return
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
      if (tab === 'equipe' && isStaff) {
        setEquipeFocusPatientId((prev) => {
          if (prev) return prev
          const fromUrl = searchParams.get('patientId')
          if (fromUrl && fromUrl !== EQUIPE_THREAD_ID) return fromUrl
          const lastWithPatient = [...res.messages].reverse().find((m) => m.patientId)
          return lastWithPatient?.patientId ?? ''
        })
      }
      const canAutoRead = Date.now() >= skipAutoReadUntilRef.current
      if (canAutoRead) {
        if (isStaff && requestPatientId) {
          const prevUnread = conversationsRef.current.find((c) => c.patientId === requestPatientId)?.unreadCount
            ?? conversationsRef.current.reduce((n, c) => n + c.unreadCount, 0)
          await chatApi.markRead(requestPatientId, channel === 'equipe' ? 'equipe' : 'patient')
          if (seq !== loadSeqRef.current) return
          if (channel === 'equipe') setEquipeUnread(0)
          else setPatientUnread(0)
          void refreshChannelBadges()
          setConversations((prev) =>
            prev.map((c) =>
              channel === 'equipe' || c.patientId === requestPatientId
                ? { ...c, unreadCount: 0 }
                : c,
            ),
          )
          if (!silent && prevUnread > 0) {
            feedbackSuccess(
              prevUnread === 1 ? 'Message marqué comme lu' : 'Messages marqués comme lus',
            )
          }
        } else if (isPatient) {
          const hadUnread = res.messages.some((m) => !m.lu && m.expediteurId !== user?.id)
          await chatApi.markRead()
          if (seq !== loadSeqRef.current) return
          if (!silent && hadUnread) {
            feedbackSuccess('Messages marqués comme lus')
          }
        }
      }
      setError(null)
    } catch (e) {
      if (seq !== loadSeqRef.current) return
      if (!silent) setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      if (seq === loadSeqRef.current && !silent) setLoading(false)
    }
  }, [isPatient, isStaff, user?.id, staffTab, refreshChannelBadges, searchParams])

  useEffect(() => {
    lastMessageIdRef.current = null
  }, [selectedPatientId, isPatient])

  useEffect(() => {
    void loadConversations()
    void loadDirectory()
  }, [loadConversations, loadDirectory])

  // Changement Patient ↔ Équipe / Nouvelle : recharger la liste du bon canal
  useEffect(() => {
    if (!isStaff) return
    setListFilter('all')
    setThreadSearch('')
    setShowThreadSearch(false)
    setSearchPatient('')
    if (staffTab === 'equipe') {
      setSelectedPatientId(EQUIPE_THREAD_ID)
      setMessages([])
      setLoading(true)
      void loadConversations({ keepSelection: true })
    } else if (staffTab === 'nouveau') {
      setSelectedPatientId('')
      setMessages([])
      setLoading(false)
    } else {
      setMessages([])
      setLoading(true)
      void loadConversations({ keepSelection: true })
    }
  }, [staffTab]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const refreshThread = useCallback(async () => {
    if (isPatient) {
      await loadMessages(undefined, true)
      return
    }
    if (selectedPatientId) {
      await Promise.all([
        loadMessages(selectedPatientId, true),
        loadConversations({ keepSelection: true }),
      ])
      return
    }
    await loadConversations({ keepSelection: true })
  }, [isPatient, selectedPatientId, loadMessages, loadConversations])

  useChatRealtime((event) => {
    if (event.type === 'chat:message' || event.type === 'chat:thread') {
      if (isPatient) {
        void loadMessages(undefined, true)
        return
      }
      if (staffTab === 'equipe') {
        refreshThread()
        return
      }
      if (!event.patientId || event.patientId === selectedPatientId) {
        refreshThread()
      } else {
        void loadConversations({ keepSelection: true })
      }
      return
    }
    if (event.type === 'chat:unread' && isStaff) {
      void loadConversations({ keepSelection: true })
    }
  })

  // Filet de sécurité si SSE indisponible
  useEffect(() => {
    pollRef.current = window.setInterval(refreshThread, 60_000)
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [refreshThread])

  useEffect(() => {
    const root = messagesScrollRef.current
    if (!root) return
    root.scrollTop = root.scrollHeight
  }, [messages.length, selectedPatientId])

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMessageMenu()
    }
    const onRepositionClose = () => closeMessageMenu()
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onRepositionClose)
    if (menu.mobileSheet) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
        window.removeEventListener('keydown', onKey)
        window.removeEventListener('resize', onRepositionClose)
      }
    }
    window.addEventListener('click', closeMessageMenu)
    messagesScrollRef.current?.addEventListener('scroll', onRepositionClose, { passive: true })
    return () => {
      window.removeEventListener('click', closeMessageMenu)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onRepositionClose)
      messagesScrollRef.current?.removeEventListener('scroll', onRepositionClose)
    }
  }, [menu, closeMessageMenu])

  const clearPendingFile = () => {
    if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl)
    setPendingFile(null)
  }

  const selectPatient = (patientId: string) => {
    setListFilter('all')
    if (patientId === EQUIPE_THREAD_ID) {
      setStaffTab('equipe')
      setSelectedPatientId(EQUIPE_THREAD_ID)
      setMobileShowThread(true)
      setError(null)
      setInput('')
      setThreadSearch('')
      setShowThreadSearch(false)
      clearPendingFile()
      navigate(
        { pathname: window.location.pathname, search: '?channel=equipe' },
        { replace: true },
      )
      return
    }

    lastPatientIdRef.current = patientId
    setSelectedPatientId(patientId)
    setMobileShowThread(true)
    if (staffTab === 'nouveau' || staffTab === 'equipe') {
      setStaffTab('patient')
    }
    setError(null)
    setInput('')
    setThreadSearch('')
    setShowThreadSearch(false)
    clearPendingFile()
    navigate(
      {
        pathname: window.location.pathname,
        search: `?patientId=${encodeURIComponent(patientId)}&channel=patient`,
      },
      { replace: true },
    )
    window.setTimeout(() => inputRef.current?.focus(), 80)
  }

  const goToStaffTab = (tab: StaffTab) => {
    setListFilter('all')
    setError(null)
    if (staffTab === 'patient' && selectedPatientId && selectedPatientId !== EQUIPE_THREAD_ID) {
      lastPatientIdRef.current = selectedPatientId
    }
    setStaffTab(tab)
    if (tab === 'equipe') {
      setSelectedPatientId(EQUIPE_THREAD_ID)
      setMobileShowThread(true)
      navigate(
        { pathname: window.location.pathname, search: '?channel=equipe' },
        { replace: true },
      )
      return
    }
    if (tab === 'nouveau') {
      setSelectedPatientId('')
      setMessages([])
      setLoading(false)
      setMobileShowThread(false)
      navigate(
        { pathname: window.location.pathname, search: '?channel=nouveau' },
        { replace: true },
      )
      return
    }
    const restore = lastPatientIdRef.current
    if (restore) setSelectedPatientId(restore)
    navigate(
      {
        pathname: window.location.pathname,
        search: restore
          ? `?patientId=${encodeURIComponent(restore)}&channel=patient`
          : '?channel=patient',
      },
      { replace: true },
    )
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

  const runMessageAction = async (
    messageId: string,
    action: () => Promise<void>,
    successTitle: string,
  ) => {
    setActionBusyId(messageId)
    closeMessageMenu()
    try {
      await action()
      toast({ title: successTitle, variant: 'success' })
    } catch (e) {
      toast({
        title: 'Action impossible',
        description: e instanceof Error ? e.message : undefined,
        variant: 'error',
      })
    } finally {
      setActionBusyId(null)
    }
  }

  const requestDeleteForAll = (m: ChatMessage) => {
    closeMessageMenu()
    setDeleteAllError(null)
    setPendingDeleteAll(m)
  }

  const confirmDeleteForAll = async () => {
    const m = pendingDeleteAll
    if (!m) return
    setDeleteAllLoading(true)
    setDeleteAllError(null)
    setActionBusyId(m.id)
    try {
      const res = await chatApi.deleteForAll(m.id)
      setMessages((prev) => prev.map((x) => (x.id === m.id ? res.message : x)))
      if (isStaff) void loadConversations({ keepSelection: true })
      setPendingDeleteAll(null)
      toast({ title: 'Message supprimé pour tout le monde', variant: 'success' })
    } catch (e) {
      setDeleteAllError(e instanceof Error ? e.message : 'Suppression impossible.')
    } finally {
      setDeleteAllLoading(false)
      setActionBusyId(null)
    }
  }

  const handleDeleteForMe = (m: ChatMessage) =>
    void runMessageAction(
      m.id,
      async () => {
        await chatApi.deleteForMe(m.id)
        setMessages((prev) => prev.filter((x) => x.id !== m.id))
        if (isStaff) void loadConversations({ keepSelection: true })
      },
      'Message supprimé pour vous',
    )

  const handleTogglePin = (m: ChatMessage) =>
    void runMessageAction(
      m.id,
      async () => {
        const nextPinned = !m.pinned
        setMessages((prev) =>
          prev.map((x) =>
            x.id === m.id
              ? {
                  ...x,
                  pinned: nextPinned,
                  pinnedAt: nextPinned ? new Date().toISOString() : null,
                }
              : x,
          ),
        )
        const res = await chatApi.setPinned(m.id, nextPinned)
        setMessages((prev) =>
          prev.map((x) => (x.id === m.id ? { ...x, ...res.message } : x)),
        )
      },
      m.pinned ? 'Message désépinglé' : 'Message épinglé',
    )

  const scrollToMessage = (messageId: string) => {
    const root = messagesScrollRef.current
    const el = document.getElementById(`msg-${messageId}`)
    if (!root || !el) return
    const rootRect = root.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const offset = elRect.top - rootRect.top - root.clientHeight / 2 + elRect.height / 2
    root.scrollTo({ top: root.scrollTop + offset, behavior: 'smooth' })
  }

  const handleMarkUnread = (m: ChatMessage) =>
    void runMessageAction(
      m.id,
      async () => {
        skipAutoReadUntilRef.current = Date.now() + 60_000
        await chatApi.markUnread(m.id)
        setMessages((prev) =>
          prev.map((x) =>
            x.id === m.id ||
            (x.dateEnvoi >= m.dateEnvoi &&
              x.expediteurId !== user?.id &&
              !x.deletedForAll)
              ? { ...x, lu: false }
              : x,
          ),
        )
        if (isStaff) {
          setConversations((prev) =>
            prev.map((c) =>
              c.patientId === m.patientId
                ? { ...c, unreadCount: Math.max(1, c.unreadCount) }
                : c,
            ),
          )
          void loadConversations({ keepSelection: true })
        }
      },
      'Marqué comme non lu',
    )

  const handleSend = async () => {
    const contenu = input.trim()
    if ((!contenu && !pendingFile) || !user) return
    if (isStaff && !selectedPatientId) {
      setError('Sélectionnez une patiente pour envoyer un message.')
      return
    }
    const sendPatientId =
      isStaff && staffTab === 'equipe'
        ? (equipeFocusPatientId ||
            [...messages].reverse().find((m) => m.patientId && m.patientId !== EQUIPE_THREAD_ID)?.patientId ||
            '')
        : selectedPatientId
    if (isStaff && staffTab === 'equipe' && !sendPatientId) {
      setError('Impossible de répondre : aucune demande liée à un dossier.')
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
        patientId: isStaff ? sendPatientId : undefined,
        pieceJointeUrl,
        pieceJointeNom,
        staffOnly: isStaff && staffTab === 'equipe',
      })
      setMessages((prev) => [...prev, res.message])
      if (res.message.patientId) setEquipeFocusPatientId(res.message.patientId)
      setInput('')
      clearPendingFile()
      if (isStaff) void loadConversations({ keepSelection: true })
      feedbackSuccess('Message envoyé')
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
    if (staffTab === 'equipe') {
      const equipe = conversations.filter((c) => c.patientId === EQUIPE_THREAD_ID || c.unified)
      if (equipe.length > 0) return equipe
      return [{
        patientId: EQUIPE_THREAD_ID,
        dossierNumber: 'Équipe',
        fullName: isMedecin ? 'Houda' : 'Dr Chennoufi',
        email: isMedecin ? 'Gestionnaire' : 'Médecin',
        unreadCount: equipeUnread,
        lastMessageAt: new Date(0).toISOString(),
        lastMessagePreview: '',
        lastExpediteurRole: null,
        channel: 'equipe' as const,
        unified: true,
      }]
    }
    const q = searchPatient.trim()
    let list = q ? conversations.filter((c) => matchesQuery(q, c)) : conversations
    if (listFilter === 'unread') {
      list = list.filter((c) => c.unreadCount > 0)
    }
    return [...list].sort((a, b) => {
      if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    })
  }, [conversations, searchPatient, listFilter, staffTab, isMedecin, equipeUnread])

  const newPatients = useMemo(() => {
    const fromConv = new Set(conversations.map((c) => c.patientId))
    const q = searchPatient.trim()
    return directory
      .filter((p) => !fromConv.has(p.id))
      .filter((p) => matchesQuery(q, p))
      .slice(0, q ? 40 : 20)
  }, [directory, conversations, searchPatient])

  const pinnedMessages = useMemo(
    () => messages.filter((m) => m.pinned && !m.deletedForAll),
    [messages],
  )

  const threadItems = useMemo((): ThreadItem[] => {
    const q = threadSearch.trim()
    const msgs = q
      ? messages.filter((m) =>
          !m.deletedForAll && (
            normalizeSearch(m.contenu).includes(normalizeSearch(q)) ||
            normalizeSearch(m.pieceJointeNom ?? '').includes(normalizeSearch(q)) ||
            normalizeSearch(m.patientNom ?? '').includes(normalizeSearch(q)) ||
            normalizeSearch(m.dossierNumber ?? '').includes(normalizeSearch(q))
          ),
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
    : staffTab === 'equipe'
      ? (isMedecin ? 'Houda' : 'Dr Chennoufi')
      : activeConversation?.fullName ?? activeDirectory?.fullName ?? 'Messagerie'

  const headerSub = isPatient
    ? 'Échange sécurisé avec le cabinet'
    : staffTab === 'equipe'
      ? isMedecin
        ? 'Discussion unique · demandes gestionnaire'
        : 'Discussion unique · canal médecin'
      : activeConversation
        ? `${activeConversation.dossierNumber} · ${activeConversation.email}`
        : activeDirectory
          ? `${activeDirectory.dossierNumber} · ${activeDirectory.email}`
          : isMedecin
            ? 'Écrire à la patiente (sans le fil Houda)'
            : 'Chat avec la patiente'

  const openPatientDossier = (patientId?: string) => {
    const pid = patientId || (staffTab === 'equipe' ? equipeFocusPatientId : selectedPatientId)
    if (!pid || pid === EQUIPE_THREAD_ID) {
      toast({
        title: 'Choisissez un dossier',
        description: 'Ouvrez le lien « dossier » sur une demande, ou répondez depuis une demande.',
        variant: 'error',
      })
      return
    }
    if (user?.role === 'medecin') {
      navigate(`/medecin/patients/${pid}?tab=rapport&nouveau=1`)
      return
    }
    if (user?.role === 'gestionnaire') {
      navigate(`/gestionnaire/devis/${pid}`)
    }
  }

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
              {staffTab === 'equipe'
                ? isMedecin
                  ? '1 discussion avec Houda'
                  : '1 discussion avec le médecin'
                : staffTab === 'nouveau'
                  ? 'Nouvelle conversation'
                  : isMedecin
                    ? 'Écrire à une patiente'
                    : 'Canal patiente'}
              {staffTab === 'patient' && (
                <>
                  {' · '}
                  {conversations.length} conversation{conversations.length > 1 ? 's' : ''}
                  {unreadTotal > 0 ? ` · ${unreadTotal} non lu${unreadTotal > 1 ? 's' : ''}` : ''}
                </>
              )}
              {staffTab === 'equipe' && unreadTotal > 0 && (
                <> · {unreadTotal} non lu{unreadTotal > 1 ? 's' : ''}</>
              )}
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

        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100/80">
          <button
            type="button"
            onClick={() => goToStaffTab(isMedecin ? 'equipe' : 'patient')}
            className={cn(
              'h-9 rounded-lg text-[11px] font-semibold transition-colors inline-flex items-center justify-center',
              (isMedecin ? staffTab === 'equipe' : staffTab === 'patient')
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-muted-foreground hover:text-slate-700',
            )}
          >
            {isMedecin ? 'Demandes' : 'Patientes'}
            <UnreadBadge count={isMedecin ? equipeUnread : patientUnread} />
          </button>
          <button
            type="button"
            onClick={() => goToStaffTab(isMedecin ? 'patient' : 'equipe')}
            className={cn(
              'h-9 rounded-lg text-[11px] font-semibold transition-colors inline-flex items-center justify-center',
              (isMedecin ? staffTab === 'patient' : staffTab === 'equipe')
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-muted-foreground hover:text-slate-700',
            )}
          >
            {isMedecin ? 'Patients' : 'Dr'}
            <UnreadBadge count={isMedecin ? patientUnread : equipeUnread} />
          </button>
          <button
            type="button"
            onClick={() => goToStaffTab('nouveau')}
            className={cn(
              'h-9 rounded-lg text-[11px] font-semibold transition-colors',
              staffTab === 'nouveau'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-muted-foreground hover:text-slate-700',
            )}
          >
            Nouvelle
          </button>
        </div>

        {staffTab === 'patient' && (
          <div className="flex items-center gap-1.5 mt-2.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              type="button"
              onClick={() => setListFilter('all')}
              className={cn(
                'text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors',
                listFilter === 'all'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              Tous
            </button>
            <button
              type="button"
              onClick={() => setListFilter('unread')}
              className={cn(
                'text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors',
                listFilter === 'unread'
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'border-border text-muted-foreground hover:bg-muted',
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
        {staffTab === 'patient' || staffTab === 'equipe' ? (
          filteredConversations.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/35 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {listFilter === 'unread'
                  ? 'Aucun message non lu.'
                  : searchPatient.trim()
                    ? 'Aucun résultat.'
                    : staffTab === 'equipe'
                      ? isMedecin
                        ? 'Aucune demande pour le moment.'
                        : 'Aucun message interne.'
                      : isMedecin
                        ? 'Aucun chat patient. Choisissez « Nouvelle » pour écrire.'
                        : 'Aucune conversation.'}
              </p>
              {staffTab === 'patient' && (
              <button
                type="button"
                className="mt-3 text-xs font-semibold text-brand-700 hover:underline"
                onClick={() => goToStaffTab('nouveau')}
              >
                Démarrer une conversation →
              </button>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredConversations.map((c) => {
                const fromDoctor = c.lastExpediteurRole === 'medecin'
                const sender = lastSenderShort(c.lastExpediteurRole, user?.role)
                return (
                <button
                  key={c.patientId}
                  type="button"
                  onClick={() => selectPatient(c.patientId)}
                  className={cn(
                    'w-full text-left rounded-xl px-3 py-3 transition-all',
                    selectedPatientId === c.patientId
                      ? 'bg-brand-50 ring-1 ring-brand-200 shadow-sm'
                      : fromDoctor && c.unreadCount > 0
                        ? 'bg-sky-50/80 hover:bg-sky-50'
                        : 'hover:bg-slate-50',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className={cn(
                          'text-xs font-bold',
                          staffTab === 'equipe'
                            ? 'bg-violet-100 text-violet-800'
                            : fromDoctor
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-brand-100 text-brand-800',
                        )}>
                          {staffTab === 'equipe'
                            ? (isMedecin ? <Users className="h-4 w-4" /> : <Stethoscope className="h-4 w-4" />)
                            : fromDoctor
                              ? <Stethoscope className="h-4 w-4" />
                              : initials(c.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      {c.unreadCount > 0 && (
                        <span className={cn(
                          'absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white',
                          fromDoctor ? 'bg-sky-600' : 'bg-brand-600',
                        )} />
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
                      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                        {fromDoctor && (
                          <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-sky-800 bg-sky-100 px-1.5 py-0.5 rounded-md">
                            <Stethoscope className="h-2.5 w-2.5" />
                            Dr
                          </span>
                        )}
                        <p className="text-[10px] text-muted-foreground truncate">
                          {staffTab === 'equipe'
                            ? (sender ? `Dernier : ${sender}` : (isMedecin ? 'Gestionnaire' : 'Médecin'))
                            : c.dossierNumber}
                        </p>
                      </div>
                      <p className={cn('text-[12px] truncate mt-1', c.unreadCount > 0 ? 'text-slate-700 font-medium' : 'text-muted-foreground')}>
                        {sender ? `${sender} : ` : ''}{c.lastMessagePreview || '—'}
                      </p>
                    </div>
                    {c.unreadCount > 0 && (
                      <span className={cn(
                        'shrink-0 mt-1 rounded-full text-white text-[10px] font-bold min-w-5 h-5 px-1.5 flex items-center justify-center',
                        fromDoctor ? 'bg-sky-600' : 'bg-brand-600',
                      )}>
                        {c.unreadCount > 99 ? '99+' : c.unreadCount}
                      </span>
                    )}
                  </div>
                </button>
                )
              })}
            </div>
          )
        ) : directoryLoading && directory.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3 py-8 text-center">Chargement des patientes…</p>
        ) : newPatients.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3 py-8 text-center">
            {searchPatient.trim()
              ? 'Déjà en conversation, ou aucun résultat.'
              : isMedecin
                ? 'Recherchez une patiente pour lui écrire.'
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
            staffTab === 'equipe'
              ? (isMedecin ? 'bg-violet-100 text-violet-800' : 'bg-sky-100 text-sky-800')
              : 'bg-brand-100 text-brand-800',
          )}>
            {isPatient || (staffTab === 'equipe' && !isMedecin)
              ? <Stethoscope className="h-4 w-4" />
              : staffTab === 'equipe'
                ? <Users className="h-4 w-4" />
                : initials(headerTitle)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-slate-900 truncate">{headerTitle}</p>
          <p className="text-[11px] text-muted-foreground truncate">{headerSub}</p>
        </div>
        {isStaff && selectedPatientId && staffTab !== 'equipe' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 gap-1.5 shrink-0 text-xs font-semibold border-brand-200 text-brand-800 hover:bg-brand-50"
            onClick={() => openPatientDossier()}
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Dossier</span>
          </Button>
        )}
        {isStaff && staffTab === 'equipe' && !!equipeFocusPatientId && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 gap-1.5 shrink-0 text-xs font-semibold border-brand-200 text-brand-800 hover:bg-brand-50"
            onClick={() => openPatientDossier(equipeFocusPatientId)}
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Dossier</span>
          </Button>
        )}
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

      {pinnedMessages.length > 0 && (
        <div className="shrink-0 border-b border-amber-200/70 bg-amber-50 px-3 py-2 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800/80 flex items-center gap-1">
            <Pin className="h-3 w-3" /> Messages épinglés
          </p>
          {pinnedMessages.map((pm) => {
            const preview = (pm.contenu?.trim() || pm.pieceJointeNom || 'Pièce jointe').replace(/\s+/g, ' ')
            const who = pm.expediteurId === user?.id ? 'Vous' : (pm.expediteurNom ?? roleLabel(pm.expediteurRole))
            return (
              <button
                key={`pin-${pm.id}`}
                type="button"
                className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-amber-100/80 transition-colors"
                onClick={() => scrollToMessage(pm.id)}
              >
                <span className="block text-[11px] font-semibold text-amber-900/90">{who}</span>
                <span className="block text-xs text-slate-700 line-clamp-2 break-words">{preview}</span>
              </button>
            )
          })}
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

      <div
        ref={messagesScrollRef}
        className="flex-1 min-h-0 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_40%)]"
      >
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
                    : staffTab === 'equipe'
                      ? 'Aucun message interne pour le moment.'
                      : selectedPatientId
                        ? 'Envoyez le premier message.'
                        : 'Sélectionnez une patiente.'}
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                {isPatient
                  ? 'Vos messages sont reçus par le cabinet.'
                  : staffTab === 'equipe'
                    ? 'Canal interne — invisible pour la patiente.'
                    : isMedecin
                      ? 'Fil privé avec la patiente. Les messages de Houda ne s’affichent pas ici. Utilisez « Nouvelle » pour lui écrire.'
                      : 'Échanges avec la patiente. Les demandes internes sont dans « Dr ».'}
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
              const deleted = Boolean(m.deletedForAll)
              const menuOpen = menu?.messageId === m.id
              const busy = actionBusyId === m.id
              const dossierAction = isDossierActionMessage(m)
              return (
                <div
                  id={`msg-${m.id}`}
                  key={m.id}
                  className={cn('group flex gap-2', own ? 'flex-row-reverse' : 'flex-row')}
                >
                  <Avatar className="h-8 w-8 shrink-0 mt-1">
                    <AvatarFallback className={cn(
                      'text-[10px] font-semibold',
                      dossierAction && m.expediteurRole === 'medecin' ? 'bg-sky-100 text-sky-800' :
                        dossierAction && m.expediteurRole === 'gestionnaire' ? 'bg-violet-100 text-violet-800' :
                        own ? 'bg-brand-100 text-brand-800' :
                          m.expediteurRole === 'medecin' ? 'bg-sky-100 text-sky-800' :
                            m.expediteurRole === 'gestionnaire' ? 'bg-violet-100 text-violet-800' :
                              'bg-slate-100 text-slate-700',
                    )}>
                      {dossierAction && m.expediteurRole === 'medecin' ? <Stethoscope className="h-3.5 w-3.5" /> :
                        dossierAction && m.expediteurRole === 'gestionnaire' ? <Users className="h-3.5 w-3.5" /> :
                          initials(own ? (user?.name ?? 'Vous') : (m.expediteurNom ?? roleLabel(m.expediteurRole)))}
                    </AvatarFallback>
                  </Avatar>
                  <div className={cn('max-w-[88%] sm:max-w-[72%] flex flex-col space-y-1', own ? 'items-end' : 'items-start')}>
                    <div className={cn('flex items-center gap-1.5 px-1 flex-wrap', own && 'justify-end')}>
                      <span className="text-[11px] font-semibold text-slate-600">
                        {own ? 'Vous' : (m.expediteurNom ?? roleLabel(m.expediteurRole))}
                      </span>
                      {!own && (
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-md font-semibold',
                          m.expediteurRole === 'medecin'
                            ? 'bg-sky-100 text-sky-800'
                            : m.expediteurRole === 'patient'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-violet-100 text-violet-800',
                        )}>
                          {roleLabel(m.expediteurRole)}
                        </span>
                      )}
                      {dossierAction && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 font-medium">
                          Interne
                        </span>
                      )}
                      {dossierAction && (m.patientNom || m.dossierNumber) && (
                        <button
                          type="button"
                          className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded-md font-medium border transition-colors',
                            equipeFocusPatientId === m.patientId
                              ? 'bg-brand-100 border-brand-300 text-brand-900'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                          )}
                          onClick={() => {
                            setEquipeFocusPatientId(m.patientId)
                          }}
                          title="Dossier concerné par cette demande"
                        >
                          {m.patientNom ?? 'Patiente'}
                          {m.dossierNumber ? ` · ${m.dossierNumber}` : ''}
                        </button>
                      )}
                      {m.pinned && !deleted && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 font-medium inline-flex items-center gap-0.5">
                          <Pin className="h-2.5 w-2.5" /> Épinglé
                        </span>
                      )}
                    </div>
                    <div className={cn('relative flex items-start gap-1', own && 'flex-row-reverse')}>
                      <div className={cn(
                        'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words shadow-sm',
                        deleted
                          ? 'bg-slate-100 border border-dashed border-slate-300 text-slate-500 italic rounded-2xl'
                          : dossierAction
                            ? 'bg-amber-50 border border-amber-200 text-slate-800 rounded-tl-md'
                          : own
                            ? 'bg-brand-700 text-white rounded-tr-md'
                          : m.expediteurRole === 'medecin'
                            ? 'bg-sky-50 border border-sky-200 text-slate-900 rounded-tl-md'
                            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-md',
                      )}>
                        {deleted ? (
                          <p className="text-xs not-italic text-slate-500">Message supprimé</p>
                        ) : (
                          <>
                            {m.pieceJointeUrl && (
                              <div className="mb-2">
                                {isImageUrl(m.pieceJointeUrl) ? (
                                  <a
                                    href={resolveAttachmentUrl(m.pieceJointeUrl)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block"
                                  >
                                    <img
                                      src={resolveAttachmentUrl(m.pieceJointeUrl)}
                                      alt={m.pieceJointeNom ?? 'Image'}
                                      className="max-h-56 rounded-xl object-cover border border-white/20"
                                    />
                                  </a>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void downloadAttachment(
                                        m.pieceJointeUrl!,
                                        m.pieceJointeNom ?? 'document.pdf',
                                      )
                                    }
                                    className={cn(
                                      'w-full text-left inline-flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer',
                                      own
                                        ? 'bg-white/15 hover:bg-white/25'
                                        : isPdfUrl(m.pieceJointeUrl, m.pieceJointeNom)
                                          ? 'bg-[#fdeada] hover:bg-[#f8e4d0] border border-[#e4c8bd] text-[#062a30]'
                                          : 'bg-slate-100 hover:bg-slate-200',
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
                                        own ? 'bg-white/20' : 'bg-white border border-[#e4c8bd]',
                                      )}
                                    >
                                      <FileText className={cn('h-4 w-4', own ? 'text-white' : 'text-[#81572d]')} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block font-semibold truncate">
                                        {m.pieceJointeNom ?? 'Document PDF'}
                                      </span>
                                      <span className={cn('block text-[10px] mt-0.5', own ? 'text-white/75' : 'text-[#81572d]')}>
                                        Cliquer pour télécharger
                                      </span>
                                    </span>
                                    <Download className={cn('h-4 w-4 shrink-0', own ? 'text-white/90' : 'text-[#81572d]')} />
                                  </button>
                                )}
                              </div>
                            )}
                            {m.contenu && !m.contenu.startsWith('Pièce jointe') && (
                              <p className="whitespace-pre-wrap">{m.contenu}</p>
                            )}
                            {!!m.contenu?.startsWith('Pièce jointe') && !m.pieceJointeUrl && (
                              <p className="whitespace-pre-wrap">{m.contenu}</p>
                            )}
                            {isStaff && dossierAction && (
                              <Button
                                type="button"
                                variant="brand"
                                size="sm"
                                className="mt-2 h-8 gap-1.5"
                                onClick={() => {
                                  setEquipeFocusPatientId(m.patientId)
                                  openPatientDossier(m.patientId)
                                }}
                              >
                                <FileText className="h-3.5 w-3.5" />
                                Ouvrir le dossier
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                      <div className="relative shrink-0 pt-0.5">
                        <button
                          type="button"
                          disabled={busy}
                          className={cn(
                            'h-7 w-7 rounded-lg border border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-100 hover:border-slate-200 flex items-center justify-center transition-opacity',
                            menuOpen ? 'opacity-100 bg-slate-100 border-slate-200' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100',
                          )}
                          aria-label="Actions du message"
                          aria-expanded={menuOpen}
                          onClick={(e) => {
                            e.stopPropagation()
                            openMessageMenu(m.id, e.currentTarget, own)
                          }}
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className={cn('flex items-center gap-1 px-1', own ? 'justify-end' : 'justify-start')}>
                      <span className="text-[10px] text-muted-foreground">{formatDateTime(m.dateEnvoi)}</span>
                      {own && !deleted && (
                        m.lu
                          ? <CheckCheck className="h-3.5 w-3.5 text-brand-600 animate-success-pop" aria-label="Lu" />
                          : <Check className="h-3.5 w-3.5 text-muted-foreground" aria-label="Envoyé" />
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

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
                  : isStaff && staffTab === 'equipe'
                  ? isMedecin
                    ? 'Répondre à Houda… (Entrée pour envoyer)'
                    : 'Écrire au médecin… (Entrée pour envoyer)'
                  : isMedecin
                    ? 'Écrire à la patiente… (Entrée pour envoyer)'
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

  const menuMessage = menu ? messages.find((m) => m.id === menu.messageId) : null
  const menuOwn = menuMessage ? menuMessage.expediteurId === user?.id : false
  const menuDeleted = Boolean(menuMessage?.deletedForAll)
  const menuCanDeleteForAll = !!menuMessage && !menuDeleted && (menuOwn || isStaff)
  const menuCanMarkUnread = !!menuMessage && !menuDeleted && !menuOwn
  const menuCanPin = !!menuMessage && !menuDeleted

  const messageMenuActions = menuMessage ? (
    <>
      {menuCanPin && (
        <button
          type="button"
          role="menuitem"
          className="w-full min-h-12 px-3 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 active:bg-slate-100 flex items-center gap-3 rounded-xl"
          onClick={() => handleTogglePin(menuMessage)}
        >
          {menuMessage.pinned ? <PinOff className="h-4 w-4 shrink-0" /> : <Pin className="h-4 w-4 shrink-0" />}
          {menuMessage.pinned ? 'Désépingler' : 'Épingler le message'}
        </button>
      )}
      {menuCanMarkUnread && (
        <button
          type="button"
          role="menuitem"
          className="w-full min-h-12 px-3 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 active:bg-slate-100 flex items-center gap-3 rounded-xl"
          onClick={() => handleMarkUnread(menuMessage)}
        >
          <Mail className="h-4 w-4 shrink-0" />
          Marquer comme non lu
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className="w-full min-h-12 px-3 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 active:bg-slate-100 flex items-center gap-3 rounded-xl"
        onClick={() => handleDeleteForMe(menuMessage)}
      >
        <EyeOff className="h-4 w-4 shrink-0" />
        Supprimer pour moi
      </button>
      {menuCanDeleteForAll && (
        <button
          type="button"
          role="menuitem"
          className="w-full min-h-12 px-3 py-3 text-left text-sm font-medium text-red-700 hover:bg-red-50 active:bg-red-100 flex items-center gap-3 rounded-xl"
          onClick={() => requestDeleteForAll(menuMessage)}
        >
          <Trash2 className="h-4 w-4 shrink-0" />
          Supprimer pour tout le monde
        </button>
      )}
      <button
        type="button"
        className="w-full min-h-12 mt-1 px-3 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 active:bg-slate-100 rounded-xl"
        onClick={closeMessageMenu}
      >
        Annuler
      </button>
    </>
  ) : null

  return (
    <PullToRefresh onRefresh={refreshThread} className="h-full">
    <div
      className={cn(
        'mx-auto flex w-full gap-3 lg:gap-4 h-app-chat',
        isPatient ? 'max-w-3xl flex-col' : 'max-w-6xl flex-col lg:flex-row',
      )}
    >
      {isStaff && staffSidebar}
      {threadPane}
      {menu && menuMessage && createPortal(
        menu.mobileSheet ? (
          <BottomSheet
            open
            onClose={closeMessageMenu}
            title="Actions du message"
          >
            {messageMenuActions}
          </BottomSheet>
        ) : (
          <div
            role="menu"
            className="fixed z-[80] rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
            style={{
              top: menu.top,
              left: menu.left,
              width: MENU_WIDTH,
              maxWidth: 'calc(100vw - 16px)',
              transform: menu.placeAbove ? 'translateY(-100%)' : undefined,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {menuCanPin && (
              <button
                type="button"
                role="menuitem"
                className="w-full px-3 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                onClick={() => handleTogglePin(menuMessage)}
              >
                {menuMessage.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                {menuMessage.pinned ? 'Désépingler' : 'Épingler le message'}
              </button>
            )}
            {menuCanMarkUnread && (
              <button
                type="button"
                role="menuitem"
                className="w-full px-3 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                onClick={() => handleMarkUnread(menuMessage)}
              >
                <Mail className="h-3.5 w-3.5" />
                Marquer comme non lu
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
              onClick={() => handleDeleteForMe(menuMessage)}
            >
              <EyeOff className="h-3.5 w-3.5" />
              Supprimer pour moi
            </button>
            {menuCanDeleteForAll && (
              <button
                type="button"
                role="menuitem"
                className="w-full px-3 py-2.5 text-left text-xs font-medium text-red-700 hover:bg-red-50 flex items-center gap-2"
                onClick={() => requestDeleteForAll(menuMessage)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer pour tout le monde
              </button>
            )}
          </div>
        ),
        document.body,
      )}

      <ConfirmDialog
        open={Boolean(pendingDeleteAll)}
        onClose={() => {
          if (deleteAllLoading) return
          setPendingDeleteAll(null)
          setDeleteAllError(null)
        }}
        title="Supprimer pour tout le monde ?"
        description="Ce message sera retiré pour tous les participants. L’action est enregistrée dans le journal d’audit."
        confirmLabel="Supprimer pour tous"
        cancelLabel="Annuler"
        loading={deleteAllLoading}
        error={deleteAllError}
        onConfirm={() => void confirmDeleteForAll()}
        icon={<Trash2 className="h-5 w-5 text-red-600" />}
      />
    </div>
    </PullToRefresh>
  )
}
