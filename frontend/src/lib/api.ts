const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

// ─── Token helpers (localStorage via authStore persist) ─────────────────────

function getTokens() {
  try {
    const raw = localStorage.getItem('auth-storage')
    if (!raw) return { access: null, refresh: null }
    const parsed = JSON.parse(raw) as { state?: { token?: string; refreshToken?: string } }
    return {
      access: parsed.state?.token ?? null,
      refresh: parsed.state?.refreshToken ?? null,
    }
  } catch {
    return { access: null, refresh: null }
  }
}

function setAccessToken(token: string) {
  try {
    const raw = localStorage.getItem('auth-storage')
    if (!raw) return
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> }
    if (parsed.state) {
      parsed.state['token'] = token
      localStorage.setItem('auth-storage', JSON.stringify(parsed))
    }
  } catch { /* silent */ }
}

// ─── Core fetcher ────────────────────────────────────────────────────────────

interface ApiError {
  ok: false
  code: string
  message: string
  issues?: Record<string, string[]>
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly issues?: Record<string, string[]>
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

async function tryRefreshToken(): Promise<string | null> {
  const { refresh } = getTokens()
  if (!refresh) return null

  if (isRefreshing) {
    return new Promise((resolve) => {
      refreshQueue.push(resolve)
    })
  }

  isRefreshing = true
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { accessToken: string; refreshToken?: string }
    setAccessToken(data.accessToken)
    refreshQueue.forEach((cb) => cb(data.accessToken))
    refreshQueue = []
    return data.accessToken
  } catch {
    return null
  } finally {
    isRefreshing = false
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { _retry?: boolean } = {}
): Promise<T> {
  const { access } = getTokens()
  const url = `${BASE_URL}${path}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (access && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${access}`
  }

  const res = await fetch(url, { ...options, headers })

  // Auto-refresh sur 401
  if (res.status === 401 && !options._retry) {
    // Ne pas tenter le refresh ni expulser si l'utilisateur n'est pas encore connecté
    // (ex: tentative de login avec mauvais mot de passe)
    const { access: currentToken } = getTokens()
    if (!currentToken) {
      const data401 = await res.json()
      throw new ApiRequestError(401, (data401 as ApiError).code ?? 'UNAUTHORIZED', (data401 as ApiError).message ?? 'Email ou mot de passe incorrect.')
    }
    const newToken = await tryRefreshToken()
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      const retry = await fetch(url, { ...options, headers })
      const retryData = await retry.json()
      if (!retry.ok) throw new ApiRequestError(retry.status, (retryData as ApiError).code, (retryData as ApiError).message)
      return retryData as T
    }
    // Refresh échoué → expulser l'utilisateur authentifié
    localStorage.removeItem('auth-storage')
    window.dispatchEvent(new Event('auth:logout'))
    throw new ApiRequestError(401, 'SESSION_EXPIRED', 'Session expirée. Veuillez vous reconnecter.')
  }

  const data = await res.json()
  if (!res.ok) {
    const err = data as ApiError
    throw new ApiRequestError(res.status, err.code ?? 'API_ERROR', err.message ?? 'Erreur serveur.', err.issues)
  }

  return data as T
}

// ─── Auth API ────────────────────────────────────────────────────────────────

export interface AuthResponse {
  ok: true
  user: { id: string; email: string; role: string; name: string }
  accessToken: string
  refreshToken: string
  dossierNumber: string | null
}

export interface MeResponse {
  ok: true
  user: { id: string; email: string; role: string; name: string; avatar: string | null }
  patient: {
    id: string
    dossierNumber: string
    phone: string
    dateNaissance: string | null
    nationalite: string | null
    ville: string | null
    pays: string | null
    status: string
  } | null
}

export const authApi = {
  register: (body: {
    email: string
    password: string
    fullName: string
    phone: string
    dateNaissance?: string
    nationalite?: string
    ville?: string
    pays?: string
    sourceContact?: string
  }) => request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  refresh: (refreshToken: string) =>
    request<{ ok: true; accessToken: string; refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  logout: (refreshToken: string) =>
    request<{ ok: true }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  me: () => request<MeResponse>('/auth/me'),
}

// ─── Formulaire API ──────────────────────────────────────────────────────────

export const formulaireApi = {
  submit: (body: { status: 'draft' | 'submitted'; payload: Record<string, unknown> }) =>
    request<{ ok: true; formulaire: unknown }>('/patient/formulaire', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getLatest: () =>
    request<{ ok: true; formulaire: unknown | null }>('/patient/formulaire/latest'),
}

// ─── Patient API ──────────────────────────────────────────────────────────────

export interface DevisLigne {
  description: string
  quantite: number
  prixUnitaire: number
  total: number
}

export interface Devis {
  id: string
  statut: 'brouillon' | 'envoye' | 'accepte' | 'refuse'
  version: number
  lignes: DevisLigne[]
  total: number
  currency: string
  planningMedical: string | null
  notesSejour: string | null
  dateValidite: string | null
  dateCreation: string
  updatedAt?: string
  vuParPatientAt?: string | null
}

export interface RendezVous {
  id: string
  date: string
  heure: string
  type: string
  motif: string | null
  notes: string | null
  statut: 'planifie' | 'confirme' | 'annule'
  patientDecision?: 'accepte' | 'autre_date' | null
  patientDecisionMessage?: string | null
  createdAt: string
}

// ─── Post-Op types ────────────────────────────────────────────────────────────

export interface PostOpPhoto {
  url: string
  note?: string
  date: string
}

export interface PostOpQuestionnaire {
  note: number
  commentaire: string | null
  reponduAt: string
}

export interface SuiviPostOp {
  patientId: string
  dateIntervention: string
  compteRendu: string | null
  photos: PostOpPhoto[]
  questionnaire: PostOpQuestionnaire | null
  createdAt: string
  updatedAt: string
}

export interface PostOpPatient {
  id: string
  dossierNumber: string
  status: string
  phone: string | null
  ville: string | null
  pays: string | null
  createdAt: string
  updatedAt: string
  user: { fullName: string; email: string; createdAt: string }
  suiviPostOp: SuiviPostOp | null
}

export const patientApi = {
  updateProfil: (body: { phone?: string; nationalite?: string; ville?: string; pays?: string }) =>
    request<{ ok: true; patient: unknown }>('/patient/profil', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  getDevis: () =>
    request<{ ok: true; devis: Devis[] }>('/patient/devis'),

  enregistrerConsultationDevis: (id: string) =>
    request<{ ok: true; devis: Devis }>(`/patient/devis/${id}/consultation`, {
      method: 'POST',
    }),

  repondreDevis: (id: string, body: { reponse: 'accepte' | 'refuse'; commentaire?: string }) =>
    request<{ ok: true; devis: Devis }>(`/patient/devis/${id}/repondre`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getRendezVous: () =>
    request<{ ok: true; rendezvous: RendezVous[] }>('/patient/rendezvous'),

  getAvailableRendezVousSlots: () =>
    request<{ ok: true; canBook: boolean; slots: Array<{ date: string; slots: string[] }>; reason?: string }>('/patient/rendezvous/disponibilites'),

  reserveRendezVous: (body: { date: string; heure: string }) =>
    request<{ ok: true; rdv: RendezVous }>('/patient/rendezvous/reserver', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  respondRendezVous: (rdvId: string, body: { decision: 'accepter' | 'autre_date'; message?: string }) =>
    request<{ ok: true; rdv: RendezVous }>(`/patient/rendezvous/${rdvId}/decision`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getMyPostOp: () =>
    request<{ ok: true; suivi: SuiviPostOp | null; patient: { id: string; status: string } }>('/patient/post-op'),

  submitQuestionnaire: (body: { note: number; commentaire?: string }) =>
    request<{ ok: true; suivi: SuiviPostOp }>('/patient/post-op/questionnaire', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}

// ─── Médecin API ──────────────────────────────────────────────────────────────

export interface PatientListItem {
  id: string
  dossierNumber: string
  phone: string | null
  status: string
  ville: string | null
  pays: string | null
  nationalite: string | null
  sourceContact: string | null
  createdAt: string
  updatedAt: string
  user: { fullName: string; email: string; createdAt: string }
  formulaires: Array<{ id: string; status: string; submittedAt: string | null }>
  devis: Array<{ id: string; statut: string; total: number; dateCreation: string; updatedAt?: string; vuParPatientAt?: string | null }>
}

export interface AgendaEvent {
  id: string
  type: 'rdv' | 'blocage' | 'vacances'
  title: string | null
  motif: string | null
  dateDebut: string
  dateFin: string
  allDay: boolean
  patientId: string | null
  statut: 'planifie' | 'confirme' | 'annule' | null
  notes: string | null
}

export interface RdvMedecin {
  id: string
  date: string
  heure: string
  type: string
  motif: string | null
  statut: string
  patient: {
    id: string
    dossierNumber: string
    user: { fullName: string }
  } | null
}

export interface DashboardMonthStat {
  key: string
  mois: string
  patients: number
}

export interface DashboardSourceStat {
  source: string
  count: number
}

export interface DashboardAlerte {
  id: string
  severity: 'info' | 'warning' | 'error'
  title: string
  count: number
}

export const medecinApi = {
  getDashboard: () =>
    request<{
      ok: true
      stats: { totalPatients: number; aAnalyser: number; rdvAujourdhui: number; rdvCetteSemaine: number }
      derniersPatients: PatientListItem[]
      prochainRdv: RdvMedecin[]
      evolutionPatients: DashboardMonthStat[]
      sourcesContact: DashboardSourceStat[]
    }>('/medecin/dashboard'),

  getDashboardAlertes: () =>
    request<{ ok: true; alertes: DashboardAlerte[] }>('/medecin/dashboard/alertes'),

  getPatients: (params?: { search?: string; status?: string }) => {
    const q = new URLSearchParams()
    if (params?.search) q.set('search', params.search)
    if (params?.status) q.set('status', params.status)
    const qs = q.toString()
    return request<{ ok: true; patients: PatientListItem[] }>(`/medecin/patients${qs ? `?${qs}` : ''}`)
  },

  createPreDossier: (body: {
    fullName: string
    email?: string
    phone?: string
    ville?: string
    pays?: string
    nationalite?: string
    sourceContact?: string
    noteMedicale?: string
  }) =>
    request<{ ok: true; patient: { id: string; dossierNumber: string; user: { fullName: string; email: string } } }>(
      '/medecin/patients',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),

  getPatient: (id: string) =>
    request<{ ok: true; patient: PatientListItem & {
      formulaires: Array<{ id: string; status: string; submittedAt: string | null; payload: Record<string, unknown> }>
      devis: Devis[]
      rendezvous: RendezVous[]
      rapports: Array<{
        id: string
        diagnostic: string | null
        examensDemandes?: string[]
        interventionsRecommandees: string[]
        valeurMedicale: string | null
        forfaitPropose: number | null
        nuitsClinique?: number | null
        anesthesieGenerale?: boolean | null
        notes: string | null
        createdAt: string
      }>
    } }>(`/medecin/patients/${id}`),

  updatePatient: (id: string, body: {
    fullName?: string; email?: string; phone?: string
    ville?: string; pays?: string; nationalite?: string; sourceContact?: string
  }) =>
    request<{ ok: true; patient: PatientListItem }>(`/medecin/patients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deletePatient: (id: string) =>
    request<{ ok: true; deleted: true }>(`/medecin/patients/${id}`, { method: 'DELETE' }),

  updatePatientStatus: (id: string, status: string) =>
    request<{ ok: true; patient: unknown }>(`/medecin/patients/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  upsertRapport: (patientId: string, body: {
    diagnostic?: string
    examensDemandes?: string[]
    interventionsRecommandees?: string[]
    valeurMedicale?: string
    forfaitPropose?: number
    nuitsClinique?: number
    anesthesieGenerale?: boolean
    notes?: string
  }) =>
    request<{ ok: true; rapport: unknown }>(`/medecin/patients/${patientId}/rapport`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  createRdv: (patientId: string, body: { date: string; heure: string; type: string; motif?: string; notes?: string }) =>
    request<{ ok: true; rdv: unknown }>(`/medecin/patients/${patientId}/rdv`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getAgenda: (params?: { from?: string; to?: string }) => {
    const q = new URLSearchParams()
    if (params?.from) q.set('from', params.from)
    if (params?.to) q.set('to', params.to)
    const qs = q.toString()
    return request<{ ok: true; events: AgendaEvent[]; rdvs: RdvMedecin[] }>(`/medecin/agenda${qs ? `?${qs}` : ''}`)
  },

  createAgendaEvent: (body: { type: string; title?: string; motif?: string; dateDebut: string; dateFin: string; allDay?: boolean; patientId?: string; statut?: string; notes?: string }) =>
    request<{ ok: true; event: AgendaEvent }>('/medecin/agenda', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateAgendaEvent: (id: string, body: Partial<{ type: string; title: string; motif: string; dateDebut: string; dateFin: string; statut: string; notes: string }>) =>
    request<{ ok: true; event: AgendaEvent }>(`/medecin/agenda/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteAgendaEvent: (id: string) =>
    request<{ ok: true; deleted: true }>(`/medecin/agenda/${id}`, { method: 'DELETE' }),

  getPostOpPatients: () =>
    request<{ ok: true; patients: PostOpPatient[] }>('/medecin/post-op'),

  getPostOp: (patientId: string) =>
    request<{ ok: true; suivi: SuiviPostOp | null }>(`/medecin/post-op/${patientId}`),

  upsertPostOp: (patientId: string, body: { dateIntervention: string; compteRendu?: string }) =>
    request<{ ok: true; suivi: SuiviPostOp }>(`/medecin/post-op/${patientId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  addPostOpPhoto: (patientId: string, body: { url: string; note?: string }) =>
    request<{ ok: true; suivi: SuiviPostOp }>(`/medecin/post-op/${patientId}/photos`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}

// ─── Gestionnaire API ─────────────────────────────────────────────────────────

export interface GestionnaireDashboardStats {
  totalPatients: number
  devisEnCours: number
  logistique: number
  notifications: number
}

export interface GestionnaireFunnelStep {
  step: string
  count: number
}

export interface GestionnairePatientSummary {
  id: string
  dossierNumber: string
  status: string
  updatedAt: string
  ville?: string | null
  pays?: string | null
  user: { fullName: string }
}

export interface GestionnaireRapportRow {
  id: string
  patientId: string
  medecinId: string
  diagnostic: string | null
  examensDemandes?: string[]
  interventionsRecommandees: string[]
  valeurMedicale: string | null
  forfaitPropose: number | null
  nuitsClinique?: number | null
  anesthesieGenerale?: boolean | null
  notes: string | null
  createdAt: string
}

export interface GestionnaireFormulaireRow {
  id: string
  status: string
  submittedAt: string | null
  createdAt: string
  payload: Record<string, unknown>
}

export interface GestionnairePatientDetail extends Omit<PatientListItem, 'formulaires'> {
  formulaires: GestionnaireFormulaireRow[]
  rapports: GestionnaireRapportRow[]
  devis: Devis[]
}

export interface GestionnaireNotificationRow {
  id: string
  userId: string
  titre: string
  message: string
  type: string
  lu: boolean
  dateCreation: string
  lienAction?: string | null
}

export interface GestionnaireLogistiqueChecklist {
  passport: boolean
  billet: boolean
  hebergementConfirme: boolean
  transfertAeroport: boolean
}

export interface GestionnaireLogistiqueRow {
  dateArrivee: string | null
  dateDepart: string | null
  hebergement: string | null
  transport: string | null
  accompagnateur: string | null
  checklist: GestionnaireLogistiqueChecklist
  notes: string
}

export interface GestionnaireLogistiquePatient {
  id: string
  dossierNumber: string
  status: string
  ville: string | null
  pays: string | null
  user: { fullName: string; email: string }
  logistique: GestionnaireLogistiqueRow | null
}

export interface GestionnaireTemplate {
  key: 'formulaireAck' | 'devisSent' | 'refus'
  title: string
  content: string
  channel: 'chat' | 'notification' | 'both'
  active: boolean
  updatedAt: string
  updatedBy: string
}

export interface GestionnaireAnalyticsStatus {
  status: string
  count: number
}

export interface GestionnaireAnalyticsMonthly {
  key: string
  mois: string
  total: number
  envoye: number
  accepte: number
}

export interface GestionnaireUserRow {
  id: string
  fullName: string
  email: string
  role: 'patient' | 'medecin' | 'gestionnaire'
  createdAt: string
  patient: {
    id: string
    dossierNumber: string
    phone: string | null
    status: string
    ville: string | null
    pays: string | null
    createdAt: string
  } | null
}

export interface GestionnaireUsersPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface GestionnaireUsersStats {
  all: number
  patients: number
  medecins: number
  gestionnaires: number
}

export const gestionnaireApi = {
  getDashboard: () =>
    request<{
      ok: true
      stats: GestionnaireDashboardStats
      devisATraiter: GestionnairePatientSummary[]
      patientsLogistique: GestionnairePatientSummary[]
      funnel: GestionnaireFunnelStep[]
    }>('/gestionnaire/dashboard'),

  getPatients: (params?: { search?: string; status?: string }) => {
    const q = new URLSearchParams()
    if (params?.search) q.set('search', params.search)
    if (params?.status) q.set('status', params.status)
    const qs = q.toString()
    return request<{ ok: true; patients: PatientListItem[] }>(`/gestionnaire/patients${qs ? `?${qs}` : ''}`)
  },

  getPatient: (id: string) =>
    request<{ ok: true; patient: GestionnairePatientDetail }>(`/gestionnaire/patients/${id}`),

  upsertDevisDraft: (
    patientId: string,
    body: {
      dateValidite?: string | null
      lignes: DevisLigne[]
      total: number
      planningMedical?: string | null
      notesSejour?: string | null
      currency?: string
    }
  ) =>
    request<{ ok: true; devis: Devis }>(`/gestionnaire/patients/${patientId}/devis/brouillon`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  sendDevis: (devisId: string) =>
    request<{ ok: true; devis: Devis }>(`/gestionnaire/devis/${devisId}/envoyer`, { method: 'POST' }),

  refuseDevis: (devisId: string, body?: { reason?: string }) =>
    request<{ ok: true; devis: Devis }>(`/gestionnaire/devis/${devisId}/refuser`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),

  getNotifications: () =>
    request<{ ok: true; notifications: GestionnaireNotificationRow[] }>('/gestionnaire/notifications'),

  markNotificationRead: (id: string) =>
    request<{ ok: true }>(`/gestionnaire/notifications/${id}/lu`, { method: 'PATCH' }),

  markAllNotificationsRead: () =>
    request<{ ok: true }>('/gestionnaire/notifications/lu-toutes', { method: 'POST' }),

  getLogistique: () =>
    request<{ ok: true; patients: GestionnaireLogistiquePatient[] }>('/gestionnaire/logistique'),

  updateLogistique: (
    patientId: string,
    body: {
      passport: boolean
      billet: boolean
      hebergementConfirme: boolean
      transfertAeroport: boolean
      notes?: string
      dateArrivee?: string | null
      dateDepart?: string | null
      hebergement?: string | null
      transport?: string | null
      accompagnateur?: string | null
    }
  ) =>
    request<{ ok: true }>(`/gestionnaire/logistique/${patientId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  getCommunicationTemplates: () =>
    request<{ ok: true; templates: GestionnaireTemplate[] }>('/gestionnaire/communication/templates'),

  updateCommunicationTemplate: (
    key: 'formulaireAck' | 'devisSent' | 'refus',
    body: { content: string; channel: 'chat' | 'notification' | 'both'; active: boolean }
  ) =>
    request<{ ok: true }>(`/gestionnaire/communication/templates/${key}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  resetCommunicationTemplate: (key: 'formulaireAck' | 'devisSent' | 'refus') =>
    request<{ ok: true }>(`/gestionnaire/communication/templates/${key}/reset`, { method: 'POST' }),

  resetAllCommunicationTemplates: () =>
    request<{ ok: true }>('/gestionnaire/communication/templates/reset-all', { method: 'POST' }),

  getAnalytics: () =>
    request<{
      ok: true
      funnel: GestionnaireFunnelStep[]
      statusDistribution: GestionnaireAnalyticsStatus[]
      monthlyDevis: GestionnaireAnalyticsMonthly[]
      kpis: { acceptanceRate: number; rdvRate: number }
    }>('/gestionnaire/analytics'),

  getAgenda: (params?: { from?: string; to?: string; medecinId?: string }) => {
    const q = new URLSearchParams()
    if (params?.from) q.set('from', params.from)
    if (params?.to) q.set('to', params.to)
    if (params?.medecinId) q.set('medecinId', params.medecinId)
    const qs = q.toString()
    return request<{ ok: true; medecinId: string; events: AgendaEvent[]; rdvs: RdvMedecin[] }>(`/gestionnaire/agenda${qs ? `?${qs}` : ''}`)
  },

  createAgendaEvent: (
    body: { type: 'rdv' | 'blocage' | 'vacances'; title?: string; motif?: string; dateDebut: string; dateFin: string; allDay?: boolean; patientId?: string; statut?: 'planifie' | 'confirme' | 'annule'; notes?: string },
    params?: { medecinId?: string }
  ) => {
    const q = new URLSearchParams()
    if (params?.medecinId) q.set('medecinId', params.medecinId)
    const qs = q.toString()
    return request<{ ok: true; event: AgendaEvent }>(`/gestionnaire/agenda${qs ? `?${qs}` : ''}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  updateAgendaEvent: (id: string, body: Partial<{ type: 'rdv' | 'blocage' | 'vacances'; title: string; motif: string; dateDebut: string; dateFin: string; statut: 'planifie' | 'confirme' | 'annule'; notes: string }>) =>
    request<{ ok: true; event: AgendaEvent }>(`/gestionnaire/agenda/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteAgendaEvent: (id: string) =>
    request<{ ok: true; deleted: true }>(`/gestionnaire/agenda/${id}`, { method: 'DELETE' }),

  getUsers: (params?: {
    search?: string
    role?: 'all' | 'patient' | 'medecin' | 'gestionnaire'
    page?: number
    pageSize?: number
  }) => {
    const q = new URLSearchParams()
    if (params?.search) q.set('search', params.search)
    if (params?.role && params.role !== 'all') q.set('role', params.role)
    if (params?.page) q.set('page', String(params.page))
    if (params?.pageSize) q.set('pageSize', String(params.pageSize))
    const qs = q.toString()
    return request<{
      ok: true
      users: GestionnaireUserRow[]
      pagination: GestionnaireUsersPagination
      stats: GestionnaireUsersStats
    }>(`/gestionnaire/users${qs ? `?${qs}` : ''}`)
  },

  createUser: (body: {
    fullName: string
    email: string
    password: string
    role: 'patient' | 'medecin' | 'gestionnaire'
    phone?: string
    dateNaissance?: string
    nationalite?: string
    ville?: string
    pays?: string
    sourceContact?: string
    formulairePayload?: {
      poids?: string
      taille?: string
      periodeSouhaitee?: string
      antecedents?: string[]
      traitementEnCours?: boolean
      traitementDetails?: string
      fumeur?: boolean
      detailsTabac?: string
      alcool?: boolean
      detailsAlcool?: string
      drogue?: boolean
      autresMaladiesChroniques?: string
      chirurgiesAnterieures?: boolean
      chirurgiesRows?: Array<{ intervention: string; date: string }>
      allergies?: string
      groupeSanguin?: string
      interventionsSouhaitees?: string[]
      descriptionDemande?: string
      dateSouhaitee?: string
    }
  }) =>
    request<{ ok: true; user: { id: string; fullName: string; email: string; role: string; dossierNumber: string | null } }>(
      '/gestionnaire/users',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),
}

// ─── Upload API ───────────────────────────────────────────────────────────────

export interface UploadResponse {
  ok: true
  url: string
  name: string
  size: number
}

export async function uploadMedecinFile(file: File): Promise<UploadResponse> {
  const { access } = getTokens()
  const formData = new FormData()
  formData.append('file', file)
  const headers: Record<string, string> = {}
  if (access) headers['Authorization'] = `Bearer ${access}`

  const res = await fetch(`${BASE_URL}/medecin/upload`, { method: 'POST', headers, body: formData })
  if (res.status === 401) {
    const newToken = await tryRefreshToken()
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      const retry = await fetch(`${BASE_URL}/medecin/upload`, { method: 'POST', headers, body: formData })
      if (!retry.ok) throw new ApiRequestError(retry.status, 'UPLOAD_ERROR', 'Erreur upload fichier.')
      return (await retry.json()) as UploadResponse
    }
    throw new ApiRequestError(401, 'SESSION_EXPIRED', 'Session expirée.')
  }
  if (!res.ok) {
    const err = await res.json() as { code?: string; message?: string }
    throw new ApiRequestError(res.status, err.code ?? 'UPLOAD_ERROR', err.message ?? 'Erreur upload.')
  }
  return (await res.json()) as UploadResponse
}

export async function uploadPostOpPhoto(file: File, note?: string): Promise<UploadResponse & { suivi?: SuiviPostOp }> {
  const { access } = getTokens()
  const formData = new FormData()
  formData.append('file', file)
  if (note) formData.append('note', note)

  const headers: Record<string, string> = {}
  if (access) headers['Authorization'] = `Bearer ${access}`

  const res = await fetch(`${BASE_URL}/patient/post-op/photos`, { method: 'POST', headers, body: formData })
  if (res.status === 401) {
    const newToken = await tryRefreshToken()
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      const retry = await fetch(`${BASE_URL}/patient/post-op/photos`, { method: 'POST', headers, body: formData })
      if (!retry.ok) throw new ApiRequestError(retry.status, 'UPLOAD_ERROR', 'Erreur upload photo.')
      return (await retry.json()) as UploadResponse & { suivi?: SuiviPostOp }
    }
    throw new ApiRequestError(401, 'SESSION_EXPIRED', 'Session expirée.')
  }
  if (!res.ok) {
    const err = await res.json() as { code?: string; message?: string }
    throw new ApiRequestError(res.status, err.code ?? 'UPLOAD_ERROR', err.message ?? 'Erreur upload.')
  }
  return (await res.json()) as UploadResponse & { suivi?: SuiviPostOp }
}

export async function uploadFile(file: File): Promise<UploadResponse> {
  const { access } = getTokens()
  const formData = new FormData()
  formData.append('file', file)

  const headers: Record<string, string> = {}
  if (access) headers['Authorization'] = `Bearer ${access}`

  const res = await fetch(`${BASE_URL}/patient/upload`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (res.status === 401) {
    const newToken = await tryRefreshToken()
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      const retry = await fetch(`${BASE_URL}/patient/upload`, {
        method: 'POST',
        headers,
        body: formData,
      })
      if (!retry.ok) throw new ApiRequestError(retry.status, 'UPLOAD_ERROR', 'Erreur upload fichier.')
      return (await retry.json()) as UploadResponse
    }
    throw new ApiRequestError(401, 'SESSION_EXPIRED', 'Session expirée.')
  }

  if (!res.ok) {
    const err = await res.json() as { code?: string; message?: string }
    throw new ApiRequestError(res.status, err.code ?? 'UPLOAD_ERROR', err.message ?? 'Erreur upload.')
  }

  return (await res.json()) as UploadResponse
}

/** Upload sans JWT (formulaire public avant inscription). Mêmes types que l’upload patient. */
export async function uploadFilePublic(file: File): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${BASE_URL}/public/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json() as { code?: string; message?: string }
    throw new ApiRequestError(res.status, err.code ?? 'UPLOAD_ERROR', err.message ?? 'Erreur upload.')
  }

  return (await res.json()) as UploadResponse
}
