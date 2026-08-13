import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

import { AppLayout } from './components/layout/AppLayout'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { ScrollToTop } from './components/layout/ScrollToTop'
import { PageLoader } from './components/PageLoader'
import { queryClient } from './lib/queryClient'

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

// Auth — chargés immédiatement (entrée app)
import LoginPage from './pages/auth/LoginPage'
import InscriptionPage from './pages/auth/InscriptionPage'
import PatientAccessPage from './pages/auth/PatientAccessPage'

// Pages métier — chunks séparés (chargés à la navigation)
const FormulairePage = lazy(() => import('./pages/patient/FormulairePage'))
const DossierPage = lazy(() => import('./pages/patient/DossierPage'))
const FormulaireRecapPage = lazy(() => import('./pages/patient/FormulaireRecapPage'))
const DevisPage = lazy(() => import('./pages/patient/DevisPage'))
const AgendaPage = lazy(() => import('./pages/patient/AgendaPage'))
const ChatPage = lazy(() => import('./pages/patient/ChatPage'))
const PostOpPage = lazy(() => import('./pages/patient/PostOpPage'))
const PatientNotificationsPage = lazy(() => import('./pages/patient/NotificationsPage'))
const PlanningSejourPatientPage = lazy(() => import('./pages/patient/PlanningSejourPage'))

const DashboardMedecinPage = lazy(() => import('./pages/medecin/DashboardMedecinPage'))
const PatientsPage = lazy(() => import('./pages/medecin/PatientsPage'))
const DossierPatientPage = lazy(() => import('./pages/medecin/DossierPatientPage'))
const RapportsPage = lazy(() => import('./pages/medecin/RapportsPage'))
const AgendaMedecinPage = lazy(() => import('./pages/medecin/AgendaMedecinPage'))
const NouveauPatientPage = lazy(() => import('./pages/medecin/NouveauPatientPage'))
const DevisMedecinPage = lazy(() => import('./pages/medecin/DevisMedecinPage'))

const DashboardGestionnairePage = lazy(() => import('./pages/gestionnaire/DashboardGestionnairePage'))
const DevisGestionnairePage = lazy(() => import('./pages/gestionnaire/DevisGestionnairePage'))
const DevisEditorPage = lazy(() => import('./pages/gestionnaire/DevisEditorPage'))
const LogistiquePage = lazy(() => import('./pages/gestionnaire/LogistiquePage'))
const PlanningSejourPage = lazy(() => import('./pages/gestionnaire/PlanningSejourPage'))
const PlanningSejourEditorPage = lazy(() => import('./pages/gestionnaire/PlanningSejourEditorPage'))
const NotificationsPage = lazy(() => import('./pages/gestionnaire/NotificationsPage'))
const CommunicationPage = lazy(() => import('./pages/gestionnaire/CommunicationPage'))
const AnalyticsPage = lazy(() => import('./pages/gestionnaire/AnalyticsPage'))
const AuditPage = lazy(() => import('./pages/gestionnaire/AuditPage'))
const UsersManagementPage = lazy(() => import('./pages/gestionnaire/UsersManagementPage'))
const AgendaGestionnairePage = lazy(() => import('./pages/gestionnaire/AgendaGestionnairePage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/acces-patient" element={<PatientAccessPage />} />
            <Route path="/inscription" element={<InscriptionPage />} />
            <Route path="/formulaire" element={<LazyPage><FormulairePage /></LazyPage>} />
            <Route path="/" element={<Navigate to="/formulaire" replace />} />

            {/* Protected App Shell */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              {/* Patient routes */}
              <Route
                path="/patient/dossier"
                element={
                  <ProtectedRoute allowedRoles={['patient']}>
                    <DossierPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/patient/formulaire"
                element={
                  <ProtectedRoute allowedRoles={['patient']}>
                    <FormulaireRecapPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/patient/devis"
                element={
                  <ProtectedRoute allowedRoles={['patient']}>
                    <DevisPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/patient/agenda"
                element={
                  <ProtectedRoute allowedRoles={['patient']}>
                    <AgendaPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/patient/chat"
                element={
                  <ProtectedRoute allowedRoles={['patient']}>
                    <ChatPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/patient/post-op"
                element={
                  <ProtectedRoute allowedRoles={['patient']}>
                    <PostOpPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/patient/notifications"
                element={
                  <ProtectedRoute allowedRoles={['patient']}>
                    <PatientNotificationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/patient/planning-sejour"
                element={
                  <ProtectedRoute allowedRoles={['patient']}>
                    <PlanningSejourPatientPage />
                  </ProtectedRoute>
                }
              />

              {/* Medecin routes */}
              <Route
                path="/medecin/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['medecin']}>
                    <DashboardMedecinPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/medecin/patients"
                element={
                  <ProtectedRoute allowedRoles={['medecin']}>
                    <PatientsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/medecin/patients/nouveau"
                element={
                  <ProtectedRoute allowedRoles={['medecin']}>
                    <NouveauPatientPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/medecin/patients/:id"
                element={
                  <ProtectedRoute allowedRoles={['medecin']}>
                    <DossierPatientPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/medecin/rapports"
                element={
                  <ProtectedRoute allowedRoles={['medecin']}>
                    <RapportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/medecin/devis"
                element={
                  <ProtectedRoute allowedRoles={['medecin']}>
                    <DevisMedecinPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/medecin/agenda"
                element={
                  <ProtectedRoute allowedRoles={['medecin']}>
                    <AgendaMedecinPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/medecin/post-op"
                element={
                  <ProtectedRoute allowedRoles={['medecin']}>
                    <PostOpPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/medecin/chat"
                element={
                  <ProtectedRoute allowedRoles={['medecin']}>
                    <ChatPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/medecin/notifications"
                element={
                  <ProtectedRoute allowedRoles={['medecin']}>
                    <NotificationsPage />
                  </ProtectedRoute>
                }
              />

              {/* Gestionnaire routes */}
              <Route
                path="/gestionnaire/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['gestionnaire']}>
                    <DashboardGestionnairePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gestionnaire/patients"
                element={
                  <ProtectedRoute allowedRoles={['gestionnaire']}>
                    <PatientsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gestionnaire/users"
                element={
                  <ProtectedRoute allowedRoles={['gestionnaire']}>
                    <UsersManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gestionnaire/agenda"
                element={
                  <ProtectedRoute allowedRoles={['gestionnaire']}>
                    <AgendaGestionnairePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gestionnaire/devis"
                element={
                  <ProtectedRoute allowedRoles={['gestionnaire']}>
                    <DevisGestionnairePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gestionnaire/devis/:id"
                element={
                  <ProtectedRoute allowedRoles={['gestionnaire']}>
                    <DevisGestionnairePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gestionnaire/devis/:patientId/personnaliser"
                element={
                  <ProtectedRoute allowedRoles={['gestionnaire']}>
                    <DevisEditorPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gestionnaire/logistique"
                element={
                  <ProtectedRoute allowedRoles={['gestionnaire']}>
                    <LogistiquePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gestionnaire/planning-sejour"
                element={
                  <ProtectedRoute allowedRoles={['gestionnaire']}>
                    <PlanningSejourPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gestionnaire/planning-sejour/:patientId/personnaliser"
                element={
                  <ProtectedRoute allowedRoles={['gestionnaire']}>
                    <PlanningSejourEditorPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gestionnaire/notifications"
                element={
                  <ProtectedRoute allowedRoles={['gestionnaire']}>
                    <NotificationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gestionnaire/communications"
                element={
                  <ProtectedRoute allowedRoles={['gestionnaire']}>
                    <CommunicationPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gestionnaire/chat"
                element={
                  <ProtectedRoute allowedRoles={['gestionnaire']}>
                    <ChatPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gestionnaire/analytics"
                element={
                  <ProtectedRoute allowedRoles={['gestionnaire']}>
                    <AnalyticsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gestionnaire/audit"
                element={
                  <ProtectedRoute allowedRoles={['gestionnaire']}>
                    <AuditPage />
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route path="*" element={<LazyPage><NotFoundPage /></LazyPage>} />
          </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
