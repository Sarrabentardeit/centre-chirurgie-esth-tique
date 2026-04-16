import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Layouts
import { AppLayout } from './components/layout/AppLayout'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { ScrollToTop } from './components/layout/ScrollToTop'

// Auth
import LoginPage from './pages/auth/LoginPage'
import InscriptionPage from './pages/auth/InscriptionPage'
import PatientAccessPage from './pages/auth/PatientAccessPage'

// Patient pages
import DossierPage from './pages/patient/DossierPage'
import FormulairePage from './pages/patient/FormulairePage'
import FormulaireRecapPage from './pages/patient/FormulaireRecapPage'
import DevisPage from './pages/patient/DevisPage'
import AgendaPage from './pages/patient/AgendaPage'
import ChatPage from './pages/patient/ChatPage'
import PostOpPage from './pages/patient/PostOpPage'

// Medecin pages
import DashboardMedecinPage from './pages/medecin/DashboardMedecinPage'
import PatientsPage from './pages/medecin/PatientsPage'
import DossierPatientPage from './pages/medecin/DossierPatientPage'
import RapportsPage from './pages/medecin/RapportsPage'
import AgendaMedecinPage from './pages/medecin/AgendaMedecinPage'
import NouveauPatientPage from './pages/medecin/NouveauPatientPage'

// Gestionnaire pages
import DashboardGestionnairePage from './pages/gestionnaire/DashboardGestionnairePage'
import DevisGestionnairePage from './pages/gestionnaire/DevisGestionnairePage'
import LogistiquePage from './pages/gestionnaire/LogistiquePage'
import NotificationsPage from './pages/gestionnaire/NotificationsPage'
import CommunicationPage from './pages/gestionnaire/CommunicationPage'
import AnalyticsPage from './pages/gestionnaire/AnalyticsPage'
import UsersManagementPage from './pages/gestionnaire/UsersManagementPage'
import AgendaGestionnairePage from './pages/gestionnaire/AgendaGestionnairePage'
import NotFoundPage from './pages/NotFoundPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
})

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
          <Route path="/formulaire" element={<FormulairePage />} />
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
              path="/gestionnaire/logistique"
              element={
                <ProtectedRoute allowedRoles={['gestionnaire']}>
                  <LogistiquePage />
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
          </Route>

          {/* 404 fallback */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
