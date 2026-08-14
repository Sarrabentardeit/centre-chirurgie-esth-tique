import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Navbar } from './Navbar'
import { BottomNav } from './BottomNav'
import { useAuthStore } from '@/store/authStore'
import { useChatUnreadStore } from '@/store/chatUnreadStore'
import { chatApi, type ChatMessage } from '@/lib/api'
import { useChatRealtime } from '@/lib/chatRealtime'
import { playMessageSound, unlockNotificationAudio } from '@/lib/notificationSounds'
import { Button } from '@/components/ui/button'
import { Download, FileText, MessageCircle, MessageSquare, Send, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  downloadAttachment,
  isImageUrl,
  isPdfUrl,
  resolveAttachmentUrl,
} from '@/lib/chatAttachments'
import { scheduleRoleWarmup } from '@/lib/routePrefetch'
import { PageLoader } from '@/components/PageLoader'

const ROUTE_TITLES: Record<string, string> = {
  '/patient/dossier': 'Mon Dossier',
  '/patient/formulaire': 'Formulaire Médical',
  '/patient/devis': 'Mes Devis',
  '/patient/agenda': 'Mon Agenda',
  '/patient/planning-sejour': 'Mon planning de séjour',
  '/patient/post-op': 'Suivi Post-Opératoire',
  '/patient/chat': 'Messages',
  '/patient/notifications': 'Notifications',
  '/medecin/dashboard': 'Tableau de Bord',
  '/medecin/patients': 'Mes Patients',
  '/medecin/rapports': 'Rapports Médicaux',
  '/medecin/agenda': 'Agenda',
  '/medecin/post-op': 'Suivi Post-Op',
  '/medecin/chat': 'Messages',
  '/gestionnaire/dashboard': 'Tableau de Bord',
  '/gestionnaire/users': 'Comptes Utilisateurs',
  '/gestionnaire/patients': 'Patients',
  '/gestionnaire/agenda': 'Agenda Médecin',
  '/gestionnaire/devis': 'Gestion Devis',
  '/gestionnaire/planning-sejour': 'Planning Séjour',
  '/gestionnaire/chat': 'Messages',
  '/gestionnaire/communications': 'Communication & Templates',
  '/gestionnaire/logistique': 'Logistique Séjours',
  '/gestionnaire/notifications': 'Notifications',
  '/gestionnaire/analytics': 'Analytics',
  '/gestionnaire/audit': 'Journal d’audit',
}

function ChatUnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow ring-2 ring-white">
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [widgetMessages, setWidgetMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)
  const chatUnread = useChatUnreadStore((s) => s.unread)
  const setChatUnread = useChatUnreadStore((s) => s.setUnread)
  const prevChatUnreadRef = useRef<number | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const title = Object.entries(ROUTE_TITLES).find(([path]) =>
    location.pathname.startsWith(path)
  )?.[1]

  const isChatRoute = location.pathname.endsWith('/chat')

  // Autoriser le son après interaction (politique navigateurs) — reste actif
  useEffect(() => {
    const unlock = () => unlockNotificationAudio()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // Chauffe les chunks sidebar + listes API en arrière-plan (évite le délai au clic)
  useEffect(() => {
    if (!user?.role) return
    return scheduleRoleWarmup(user.role)
  }, [user?.role])

  const loadWidgetMessages = useCallback(async () => {
    if (!user || user.role !== 'patient') return
    try {
      const res = await chatApi.getMessages()
      setWidgetMessages(res.messages.slice(-16))
    } catch {
      /* silent */
    }
  }, [user])

  const refreshChatUnread = useCallback(() => {
    if (!user) {
      setChatUnread(0)
      prevChatUnreadRef.current = null
      return
    }
    if (isChatRoute) {
      // Badge masqué sur la page chat — ne pas remettre le baseline à 0
      // (sinon un bip part en quittant la page alors qu’il n’y a rien de nouveau).
      setChatUnread(0)
      return
    }
    void chatApi
      .getUnread()
      .then((r) => {
        prevChatUnreadRef.current = r.unread
        setChatUnread(r.unread)
      })
      .catch(() => setChatUnread(0))
  }, [user, isChatRoute, setChatUnread])

  useEffect(() => {
    refreshChatUnread()
    const id = window.setInterval(refreshChatUnread, 90_000)
    return () => window.clearInterval(id)
  }, [refreshChatUnread, location.pathname])

  useChatRealtime((event) => {
    // Son UNIQUEMENT à l’arrivée d’un message d’un autre utilisateur (pas soi-même, pas au chargement)
    if (event.type === 'chat:message') {
      const fromOther = !event.senderId || event.senderId !== user?.id
      if (fromOther && !isChatRoute) {
        unlockNotificationAudio()
        playMessageSound()
      }
      refreshChatUnread()
      if (chatOpen && user?.role === 'patient') void loadWidgetMessages()
      return
    }
    if (event.type === 'chat:unread') {
      refreshChatUnread()
      if (chatOpen && user?.role === 'patient') void loadWidgetMessages()
    }
    if (event.type === 'chat:thread' && chatOpen && user?.role === 'patient') {
      void loadWidgetMessages()
    }
  }, Boolean(user))

  useEffect(() => {
    if (!chatOpen || user?.role !== 'patient') return
    void loadWidgetMessages()
    // SSE rafraîchit le widget ; polling lent en secours
    const id = window.setInterval(() => void loadWidgetMessages(), 60_000)
    return () => window.clearInterval(id)
  }, [chatOpen, user?.role, loadWidgetMessages])

  const getChatPath = () => {
    if (!user) return '/acces-patient'
    if (user.role === 'patient') return '/patient/chat'
    if (user.role === 'medecin') return '/medecin/chat'
    return '/gestionnaire/chat'
  }

  const handleWidgetSend = async () => {
    const contenu = chatInput.trim()
    if (!contenu || !user || user.role !== 'patient') return
    setSending(true)
    try {
      const res = await chatApi.sendMessage({ contenu })
      setWidgetMessages((prev) => [...prev.slice(-7), res.message])
      setChatInput('')
    } catch {
      /* silent — page chat complète pour le détail d’erreur */
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-[100dvh] max-w-[100vw] overflow-hidden bg-slate-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Navbar onMenuClick={() => setSidebarOpen(true)} title={title} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div
            key={location.pathname}
            className="animate-page-enter px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5 pb-app-nav"
          >
            {/* Suspense ici : la sidebar reste visible pendant le chargement du chunk */}
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
      <BottomNav />

      {/* FAB chat : desktop uniquement — sur mobile le chat est dans la BottomNav */}
      {!isChatRoute && user?.role === 'patient' && (
        <>
          {chatOpen && (
            <div className="hidden lg:flex fixed bottom-6 right-6 z-40 w-[440px] max-w-[calc(100vw-2rem)] h-[min(640px,calc(100dvh-5rem))] flex-col rounded-2xl border border-border bg-white shadow-xl overflow-hidden">
              <div className="flex items-center justify-between bg-brand-600 px-4 py-3.5 text-white shrink-0">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  <p className="font-semibold text-sm">Messages cabinet</p>
                </div>
                <button
                  className="rounded p-1 hover:bg-white/20"
                  onClick={() => setChatOpen(false)}
                  aria-label="Fermer le widget chat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <ScrollArea className="flex-1 min-h-0 p-3">
                <div className="space-y-2.5 pr-2">
                  {widgetMessages.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      Écrivez pour contacter l’équipe.
                    </p>
                  ) : (
                    widgetMessages.map((m) => {
                      const own = m.expediteurId === user?.id
                      const hasFile = Boolean(m.pieceJointeUrl)
                      const showText =
                        Boolean(m.contenu?.trim()) &&
                        !(m.contenu.startsWith('Pièce jointe') && hasFile)
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            'max-w-[92%] rounded-xl px-3 py-2.5 text-sm shadow-sm',
                            own
                              ? 'ml-auto bg-brand-600 text-white'
                              : 'mr-auto bg-muted text-foreground',
                          )}
                        >
                          {hasFile && m.pieceJointeUrl && (
                            <div className={cn(showText && 'mb-2')}>
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
                                    className="max-h-40 rounded-lg object-cover"
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
                                    'w-full text-left inline-flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer',
                                    own
                                      ? 'bg-white/15 hover:bg-white/25'
                                      : isPdfUrl(m.pieceJointeUrl, m.pieceJointeNom)
                                        ? 'bg-[#fdeada] hover:bg-[#f8e4d0] border border-[#e4c8bd] text-[#062a30]'
                                        : 'bg-white hover:bg-slate-50 border border-slate-200',
                                  )}
                                >
                                  <span
                                    className={cn(
                                      'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
                                      own ? 'bg-white/20' : 'bg-white border border-[#e4c8bd]',
                                    )}
                                  >
                                    <FileText
                                      className={cn('h-4 w-4', own ? 'text-white' : 'text-[#81572d]')}
                                    />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block font-semibold truncate">
                                      {m.pieceJointeNom ?? 'Document PDF'}
                                    </span>
                                    <span
                                      className={cn(
                                        'block text-[10px] mt-0.5',
                                        own ? 'text-white/75' : 'text-[#81572d]',
                                      )}
                                    >
                                      Cliquer pour télécharger
                                    </span>
                                  </span>
                                  <Download
                                    className={cn(
                                      'h-4 w-4 shrink-0',
                                      own ? 'text-white/90' : 'text-[#81572d]',
                                    )}
                                  />
                                </button>
                              )}
                            </div>
                          )}
                          {showText && (
                            <p className="whitespace-pre-wrap leading-relaxed">{m.contenu}</p>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </ScrollArea>

              <div className="p-3 border-t border-border flex items-center gap-2 shrink-0">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleWidgetSend()
                  }}
                  placeholder="Écrivez votre message…"
                  disabled={sending}
                  className="h-11"
                />
                <Button
                  size="icon"
                  variant="brand"
                  className="h-11 w-11 shrink-0"
                  onClick={() => void handleWidgetSend()}
                  disabled={sending || !chatInput.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <button
                type="button"
                className="w-full text-center text-xs text-brand-700 py-2.5 border-t border-border hover:bg-muted shrink-0"
                onClick={() => {
                  setChatOpen(false)
                  navigate('/patient/chat')
                }}
              >
                Ouvrir la conversation complète
              </button>
            </div>
          )}

          {/* Desktop : FAB widget (masqué quand le popup est ouvert). Mobile = onglet Chat BottomNav. */}
          {!chatOpen && (
            <div className="fixed bottom-6 right-6 z-40 hidden lg:block">
              <Button
                variant="brand"
                size="icon"
                className="relative h-14 w-14 rounded-full shadow-lg"
                onClick={() => setChatOpen(true)}
                aria-label={chatUnread > 0 ? `Ouvrir le chat, ${chatUnread} non lu(s)` : 'Ouvrir le chat'}
              >
                <MessageCircle className="h-6 w-6" />
                <ChatUnreadBadge count={chatUnread} />
              </Button>
            </div>
          )}
        </>
      )}

      {!isChatRoute && (user?.role === 'medecin' || user?.role === 'gestionnaire') && (
        <>
          {/* Desktop */}
          <div className="fixed bottom-6 right-6 z-40 hidden lg:block">
            <Button
              variant="brand"
              size="icon"
              className="relative h-14 w-14 rounded-full shadow-lg"
              onClick={() => navigate(getChatPath())}
              aria-label={chatUnread > 0 ? `Ouvrir le chat, ${chatUnread} non lu(s)` : 'Ouvrir le chat'}
            >
              <MessageCircle className="h-6 w-6" />
              <ChatUnreadBadge count={chatUnread} />
            </Button>
          </div>
          {/* Mobile — bouton flottant visible au-dessus de la barre */}
          <div className="fixed bottom-[calc(var(--bottom-nav-h)+var(--safe-bottom)+0.75rem)] right-3 z-[60] lg:hidden">
            <Button
              variant="brand"
              size="icon"
              className="relative h-12 w-12 rounded-full shadow-lg"
              onClick={() => navigate(getChatPath())}
              aria-label={chatUnread > 0 ? `Ouvrir le chat, ${chatUnread} non lu(s)` : 'Ouvrir le chat'}
            >
              <MessageCircle className="h-6 w-6" />
              <ChatUnreadBadge count={chatUnread} />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
