import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Navbar } from './Navbar'
import { useDemoStore } from '@/store/demoStore'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { MessageCircle, Send, X, Bot } from 'lucide-react'
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
  '/gestionnaire/chat': 'Messages',
  '/gestionnaire/communications': 'Communication & Templates',
  '/gestionnaire/logistique': 'Logistique Séjours',
  '/gestionnaire/notifications': 'Notifications',
  '/gestionnaire/analytics': 'Analytics',
}

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [typing, setTyping] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const patients = useDemoStore((s) => s.patients)
  const messagesStore = useDemoStore((s) => s.messages)
  const ensurePatientForUser = useDemoStore((s) => s.ensurePatientForUser)
  const addChatMessage = useDemoStore((s) => s.addChatMessage)

  const title = Object.entries(ROUTE_TITLES).find(([path]) =>
    location.pathname.startsWith(path)
  )?.[1]

  // Démo "envoi auto" du questionnaire à J+1 (24h après retour).
  // Important : ça ne dépend plus du fait que `PostOpPage` soit ouverte.
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

    tick() // exécution immédiate au montage
    const intervalId = window.setInterval(tick, 20000) // toutes les 20s (démo)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!user || user.role !== 'patient') return
    ensurePatientForUser(user, { sourceContact: 'direct' })
  }, [ensurePatientForUser, user])

  const patient = useMemo(() => {
    if (!user || user.role !== 'patient') return undefined
    return patients.find((p) => p.userId === user.id)
  }, [patients, user?.id, user?.role])

  const widgetMessages = useMemo(() => {
    if (!patient) return []
    return messagesStore
      .filter((m) => m.dossierPatientId === patient.id)
      .slice()
      .sort((a, b) => new Date(a.dateEnvoi).getTime() - new Date(b.dateEnvoi).getTime())
      .slice(-8)
  }, [messagesStore, patient?.id])

  const getChatPath = () => {
    if (!user) return '/acces-patient'
    if (user.role === 'patient') return '/patient/chat'
    if (user.role === 'medecin') return '/medecin/chat'
    return '/gestionnaire/chat'
  }

  const isChatRoute = location.pathname.endsWith('/chat')

  const handleWidgetSend = () => {
    if (!chatInput.trim() || !user || !patient) return
    addChatMessage(patient.id, user.id, user.role, chatInput.trim())
    setChatInput('')
    setTyping(true)
    window.setTimeout(() => {
      setTyping(false)
      addChatMessage(
        patient.id,
        'bot',
        'bot',
        "Merci pour votre message. Je l'ai bien reçu et je le transmets à l'équipe."
      )
    }, 1000)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Navbar onMenuClick={() => setSidebarOpen(true)} title={title} />
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-6 animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>

      {!isChatRoute && user?.role === 'patient' && (
        <>
          {chatOpen && (
            <div className="fixed bottom-20 left-3 right-3 z-40 rounded-2xl border border-border bg-white shadow-xl overflow-hidden sm:bottom-24 sm:left-auto sm:right-6 sm:w-[340px] sm:max-w-[calc(100vw-2rem)]">
              <div className="flex items-center justify-between bg-brand-600 px-4 py-3 text-white">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  <p className="font-semibold text-sm">Assistant clinique</p>
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
                  {widgetMessages.map((m) => {
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
                  })}
                  {typing && (
                    <div className="max-w-[85%] rounded-xl px-3 py-2 text-sm mr-auto bg-muted text-foreground">
                      ...
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="p-3 border-t border-border flex items-center gap-2">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleWidgetSend()
                  }}
                  placeholder="Écrivez votre question..."
                />
                <Button size="sm" variant="brand" onClick={handleWidgetSend} disabled={!chatInput.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <Button
            variant="brand"
            size="icon"
            className="fixed bottom-4 right-4 h-12 w-12 rounded-full shadow-lg z-40 sm:bottom-6 sm:right-6 sm:h-14 sm:w-14"
            onClick={() => setChatOpen((v) => !v)}
            aria-label="Ouvrir le chat"
          >
            <MessageCircle className="h-6 w-6" />
          </Button>
        </>
      )}

      {!isChatRoute && (user?.role === 'medecin' || user?.role === 'gestionnaire') && (
        <Button
          variant="brand"
          size="icon"
          className="fixed bottom-4 right-4 h-12 w-12 rounded-full shadow-lg z-40 sm:bottom-6 sm:right-6 sm:h-14 sm:w-14"
          onClick={() => navigate(getChatPath())}
          aria-label="Ouvrir le chat"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}
    </div>
  )
}
