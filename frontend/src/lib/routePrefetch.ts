import type { UserRole } from '@/types'
import { queryClient } from './queryClient'
import { queryKeys } from './queryKeys'
import { gestionnaireApi, medecinApi, patientApi } from './api'

/**
 * Mêmes chemins d’import que App.tsx (lazy) — Vite partage le chunk.
 * Précharger = le clic sidebar n’attend plus le téléchargement JS.
 */
const ROUTE_IMPORTS: Record<string, () => Promise<unknown>> = {
  '/patient/dossier': () => import('../pages/patient/DossierPage'),
  '/patient/formulaire': () => import('../pages/patient/FormulaireRecapPage'),
  '/patient/devis': () => import('../pages/patient/DevisPage'),
  '/patient/agenda': () => import('../pages/patient/AgendaPage'),
  '/patient/planning-sejour': () => import('../pages/patient/PlanningSejourPage'),
  '/patient/post-op': () => import('../pages/patient/PostOpPage'),
  '/patient/chat': () => import('../pages/patient/ChatPage'),
  '/patient/notifications': () => import('../pages/patient/NotificationsPage'),

  '/medecin/dashboard': () => import('../pages/medecin/DashboardMedecinPage'),
  '/medecin/patients': () => import('../pages/medecin/PatientsPage'),
  '/medecin/rapports': () => import('../pages/medecin/RapportsPage'),
  '/medecin/devis': () => import('../pages/medecin/DevisMedecinPage'),
  '/medecin/agenda': () => import('../pages/medecin/AgendaMedecinPage'),
  '/medecin/post-op': () => import('../pages/patient/PostOpPage'),
  '/medecin/chat': () => import('../pages/patient/ChatPage'),
  '/medecin/notifications': () => import('../pages/gestionnaire/NotificationsPage'),

  '/gestionnaire/dashboard': () => import('../pages/gestionnaire/DashboardGestionnairePage'),
  '/gestionnaire/patients': () => import('../pages/medecin/PatientsPage'),
  '/gestionnaire/devis': () => import('../pages/gestionnaire/DevisGestionnairePage'),
  '/gestionnaire/agenda': () => import('../pages/gestionnaire/AgendaGestionnairePage'),
  '/gestionnaire/planning-sejour': () => import('../pages/gestionnaire/PlanningSejourPage'),
  '/gestionnaire/chat': () => import('../pages/patient/ChatPage'),
  '/gestionnaire/logistique': () => import('../pages/gestionnaire/LogistiquePage'),
  '/gestionnaire/communications': () => import('../pages/gestionnaire/CommunicationPage'),
  '/gestionnaire/notifications': () => import('../pages/gestionnaire/NotificationsPage'),
  '/gestionnaire/analytics': () => import('../pages/gestionnaire/AnalyticsPage'),
  '/gestionnaire/audit': () => import('../pages/gestionnaire/AuditPage'),
  '/gestionnaire/users': () => import('../pages/gestionnaire/UsersManagementPage'),
}

const ROLE_ROUTES: Record<UserRole, string[]> = {
  patient: [
    '/patient/dossier',
    '/patient/formulaire',
    '/patient/devis',
    '/patient/agenda',
    '/patient/planning-sejour',
    '/patient/post-op',
    '/patient/chat',
    '/patient/notifications',
  ],
  medecin: [
    '/medecin/dashboard',
    '/medecin/patients',
    '/medecin/rapports',
    '/medecin/devis',
    '/medecin/agenda',
    '/medecin/post-op',
    '/medecin/chat',
    '/medecin/notifications',
  ],
  gestionnaire: [
    '/gestionnaire/dashboard',
    '/gestionnaire/patients',
    '/gestionnaire/devis',
    '/gestionnaire/agenda',
    '/gestionnaire/planning-sejour',
    '/gestionnaire/chat',
    '/gestionnaire/logistique',
    '/gestionnaire/communications',
    '/gestionnaire/notifications',
    '/gestionnaire/analytics',
    '/gestionnaire/audit',
    '/gestionnaire/users',
  ],
}

const warmed = new Set<string>()

export function prefetchRoute(href: string) {
  const path = href.split('?')[0]
  const loader = ROUTE_IMPORTS[path]
  if (!loader || warmed.has(path)) return
  warmed.add(path)
  void loader().catch(() => {
    warmed.delete(path)
  })
}

export function prefetchRoleRoutes(role: UserRole) {
  for (const href of ROLE_ROUTES[role]) prefetchRoute(href)
}

/** Précharge aussi les listes API fréquentes (retour page = données déjà là). */
export function prefetchRoleData(role: UserRole) {
  if (role === 'medecin') {
    void queryClient.prefetchQuery({
      queryKey: [...queryKeys.medecinPatientsAll()],
      queryFn: () => medecinApi.getPatients(),
    })
    void queryClient.prefetchQuery({
      queryKey: [...queryKeys.medecinDevis()],
      queryFn: () => medecinApi.getAllDevis(),
    })
    void queryClient.prefetchQuery({
      queryKey: [...queryKeys.notifications('medecin')],
      queryFn: () => medecinApi.getNotifications(),
    })
  } else if (role === 'gestionnaire') {
    void queryClient.prefetchQuery({
      queryKey: [...queryKeys.gestionnairePatients()],
      queryFn: () => gestionnaireApi.getPatients(),
    })
    void queryClient.prefetchQuery({
      queryKey: [...queryKeys.notifications('gestionnaire')],
      queryFn: () => gestionnaireApi.getNotifications(),
    })
    void queryClient.prefetchQuery({
      queryKey: [...queryKeys.logistique()],
      queryFn: () => gestionnaireApi.getLogistique(),
    })
    void queryClient.prefetchQuery({
      queryKey: [...queryKeys.planningSejour()],
      queryFn: () => gestionnaireApi.getPlanningSejour(),
    })
  } else if (role === 'patient') {
    void queryClient.prefetchQuery({
      queryKey: [...queryKeys.notifications('patient')],
      queryFn: () => patientApi.getNotifications(),
    })
  }
}

/** Au montage du shell : chauffe JS + données sans bloquer l’UI. */
export function scheduleRoleWarmup(role: UserRole) {
  const run = () => {
    prefetchRoleRoutes(role)
    prefetchRoleData(role)
  }

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    const id = window.requestIdleCallback(run, { timeout: 600 })
    const t = window.setTimeout(run, 200)
    return () => {
      window.clearTimeout(t)
      window.cancelIdleCallback?.(id)
    }
  }

  const t = window.setTimeout(run, 200)
  return () => window.clearTimeout(t)
}
