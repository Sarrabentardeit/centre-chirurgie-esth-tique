import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Navbar } from './Navbar'
import { BottomNav } from './BottomNav'
import { useDemoStore } from '@/store/demoStore'
import { useAuthStore } from '@/store/authStore'
import { chatApi, type ChatMessage } from '@/lib/api'
import { playMessageSound, unlockNotificationAudio } from '@/lib/notificationSounds'
import { Button } from '@/components/ui/button'
import { MessageCircle, MessageSquare, Send, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

const ROUTE_TITLES: Record<string, string> = {
  '/patient/dossier': 'Mon Dossier',
  '/patient/formulaire': 'Formulaire Médical',
  '/patient/devis': 'Mes Devis',
  '/patient/agenda': 'Mon Agenda',
  '/patient/post-op': 'Suivi Post-Opératoire',
  '/patient/chat': 'Messages',
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
  const [chatUnread, setChatUnread] = useState(0)
  const prevChatUnreadRef = useRef<number | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const ensurePatientForUser = useDemoStore((s) => s.ensurePatientForUser)

  const title = Object.entries(ROUTE_TITLES).find(([path]) =>
    location.pathname.startsWith(path)
  )?.[1]

  const isChatRoute = location.pathname.endsWith('/chat')

  // Autoriser le son après le premier clic / touche (politique navigateurs)
  useEffect(() => {
    const unlock = () => unlockNotificationAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setChatUnread(0)
      prevChatUnreadRef.current = null
      return
    }
    // Sur la page chat, les messages sont marqués lus → badge à 0
    if (isChatRoute) {
      setChatUnread(0)
      prevChatUnreadRef.current = 0
      return
    }
    let cancelled = false
    const load = () => {
      void chatApi
        .getUnread()
        .then((r) => {
          if (cancelled) return
          const prev = prevChatUnreadRef.current
          if (prev !== null && r.unread > prev) {
            playMessageSound()
          }
          prevChatUnreadRef.current = r.unread
          setChatUnread(r.unread)
        })
        .catch(() => {
          if (!cancelled) setChatUnread(0)
        })
    }
    load()
    const id = window.setInterval(load, 8000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [user?.id, user?.role, isChatRoute, location.pathname])

  // Démo "envoi auto" du questionnaire à J+1 (24h après retour).
  useEffect(() => {
    const tick = () => {
      const st = useDemoStore.getState()
      const now = Date.now()

      for (const sp of st.suiviPostOp) {
        const q = sp.questionnaireSatisfaction
        if (!q) continue
        if (sp.questionnaireDisponibiliteEnvoyee) continue
        if (q.repondu) continue

        const readyAt = new Date(`${q.dateEnvoi}T00:00:00`).getTime()
        if (now >= readyAt) {
          st.sendQuestionnaireIfReady(sp.patientId)
        }
      }
    }

    tick()
    const intervalId = window.setInterval(tick, 20000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!user || user.role !== 'patient') return
    ensurePatientForUser(user, { sourceContact: 'direct' })
  }, [ensurePatientForUser, user])

  const loadWidgetMessages = useCallback(async () => {
    if (!user || user.role !== 'patient') return
    try {
      const res = await chatApi.getMessages()
      setWidgetMessages(res.messages.slice(-8))
    } catch {
      /* silent */
    }
  }, [user])

  useEffect(() => {
    if (!chatOpen || user?.role !== 'patient') return
    void loadWidgetMessages()
    const id = window.setInterval(() => void loadWidgetMessages(), 5000)
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
          <div className="animate-fade-in px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-6">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />

      {!isChatRoute && user?.role === 'patient' && (
        <>
          {chatOpen && (
            <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 rounded-2xl border border-border bg-white shadow-xl overflow-hidden lg:bottom-6 lg:left-auto lg:right-6 lg:w-[340px] lg:max-w-[calc(100vw-2rem)]">
              <div className="flex items-center justify-between bg-brand-600 px-4 py-3 text-white">
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

              <ScrollArea className="h-64 p-3">
                <div className="space-y-2">
                  {widgetMessages.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      Écrivez pour contacter l’équipe.
                    </p>
                  ) : (
                    widgetMessages.map((m) => {
                      const own = m.expediteurId === user?.id
                      return (
                        <div
                          key={m.id}
                          className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                            own
                              ? 'ml-auto bg-brand-600 text-white'
                              : 'mr-auto bg-muted text-foreground'
                          }`}
                        >
                          {m.contenu}
                        </div>
                      )
                    })
                  )}
                </div>
              </ScrollArea>

              <div className="p-3 border-t border-border flex items-center gap-2">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleWidgetSend()
                  }}
                  placeholder="Écrivez votre message…"
                  disabled={sending}
                />
                <Button
                  size="sm"
                  variant="brand"
                  onClick={() => void handleWidgetSend()}
                  disabled={sending || !chatInput.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <button
                type="button"
                className="w-full text-center text-xs text-brand-700 py-2 border-t border-border hover:bg-muted"
                onClick={() => {
                  setChatOpen(false)
                  navigate('/patient/chat')
                }}
              >
                Ouvrir la conversation complète
              </button>
            </div>
          )}

          <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-3 z-40 sm:right-4 lg:bottom-6 lg:right-6">
            <Button
              variant="brand"
              size="icon"
              className="relative h-12 w-12 rounded-full shadow-lg lg:h-14 lg:w-14"
              onClick={() => setChatOpen((v) => !v)}
              aria-label={chatUnread > 0 ? `Ouvrir le chat, ${chatUnread} non lu(s)` : 'Ouvrir le chat'}
            >
              <MessageCircle className="h-6 w-6" />
              <ChatUnreadBadge count={chatUnread} />
            </Button>
          </div>
        </>
      )}

      {!isChatRoute && (user?.role === 'medecin' || user?.role === 'gestionnaire') && (
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
      )}
    </div>
  )
}
