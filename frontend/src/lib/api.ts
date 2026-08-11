import { useAuthStore } from '@/store/authStore'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

// ─── Token helpers ───────────────────────────────────────────────────────────
// localStorage = source de vérité (multi-onglets + sync immédiate après refresh)

type AuthPersistShape = {
  state?: {
    token?: string | null
    refreshToken?: string | null
    isAuthenticated?: boolean
    user?: unknown
  }
  version?: number
}

function getTokens() {
  try {
    const raw = localStorage.getItem('auth-storage')
    if (raw) {
      const parsed = JSON.parse(raw) as AuthPersistShape
      const access = parsed.state?.token ?? null
      const refresh = parsed.state?.refreshToken ?? null
      if (access || refresh) return { access, refresh }
    }
  } catch { /* ignore */ }
  const { token, refreshToken } = useAuthStore.getState()
  return { access: token, refresh: refreshToken }
}

function saveTokens(accessToken: string, refreshToken?: string) {
  useAuthStore.getState().setTokens(accessToken, refreshToken)
  // Écriture synchrone : le persist Zustand est async et peut laisser un vieux refresh
  try {
    const raw = localStorage.getItem('auth-storage')
    const parsed: AuthPersistShape = raw ? JSON.parse(raw) as AuthPersistShape : { state: {} }
    if (!parsed.state) parsed.state = {}
    parsed.state.token = accessToken
    if (refreshToken !== undefined) parsed.state.refreshToken = refreshToken
    parsed.state.isAuthenticated = true
    localStorage.setItem('auth-storage', JSON.stringify(parsed))
  } catch { /* ignore */ }
}

function forceSessionExpired() {
  // Le handler useAuth lit le rôle puis appelle logout()
  window.dispatchEvent(new Event('auth:logout'))
}

function getJwtExpMs(token: string): number | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
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

const SESSION_EXPIRED_MSG = 'Session expirée. Veuillez vous reconnecter.'

/** Messages techniques auth → message clair pour le client. */
function toUserFacingAuthError(code?: string, message?: string): { code: string; message: string } {
  const raw = (message ?? '').toLowerCase()
  const isLoginFailure =
    code === 'INVALID_CREDENTIALS' ||
    raw.includes('mot de passe') ||
    raw.includes('email ou')
  if (isLoginFailure) {
    return { code: code ?? 'INVALID_CREDENTIALS', message: message ?? 'Email ou mot de passe incorrect.' }
  }
  if (
    code === 'UNAUTHORIZED' ||
    code === 'INVALID_TOKEN' ||
    code === 'SESSION_EXPIRED' ||
    code === 'SESSION_NOT_FOUND' ||
    code === 'INVALID_REFRESH_TOKEN' ||
    raw.includes('token manquant') ||
    raw.includes('token invalide') ||
    raw.includes('session')
  ) {
    return { code: 'SESSION_EXPIRED', message: SESSION_EXPIRED_MSG }
  }
  return { code: code ?? 'UNAUTHORIZED', message: message ?? SESSION_EXPIRED_MSG }
}

let isRefreshing = false
let refreshQueue: Array<(token: string | null) => void> = []

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
    if (!res.ok) {
      refreshQueue.forEach((cb) => cb(null))
      refreshQueue = []
      return null
    }
    const data = (await res.json()) as { accessToken: string; refreshToken?: string }
    // Important : le backend fait une rotation du refresh token — il faut le persister
    saveTokens(data.accessToken, data.refreshToken)
    refreshQueue.forEach((cb) => cb(data.accessToken))
    refreshQueue = []
    return data.accessToken
  } catch {
    refreshQueue.forEach((cb) => cb(null))
    refreshQueue = []
    return null
  } finally {
    isRefreshing = false
  }
}

/** Renouvelle l’access avant expiration (évite les rafales de 401). */
export function startSessionKeepAlive(): () => void {
  const tick = () => {
    const { access, refresh } = getTokens()
    if (!access || !refresh) return
    const expMs = getJwtExpMs(access)
    if (expMs == null) return
    if (expMs - Date.now() < 10 * 60 * 1000) {
      void tryRefreshToken()
    }
  }
  tick()
  const id = window.setInterval(tick, 60_000)

  const onStorage = (e: StorageEvent) => {
    if (e.key !== 'auth-storage' || !e.newValue) return
    try {
      const parsed = JSON.parse(e.newValue) as AuthPersistShape
      const access = parsed.state?.token
      const refresh = parsed.state?.refreshToken
      if (access) useAuthStore.getState().setTokens(access, refresh ?? undefined)
    } catch { /* ignore */ }
  }
  window.addEventListener('storage', onStorage)

  return () => {
    window.clearInterval(id)
    window.removeEventListener('storage', onStorage)
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
    const { access: currentToken, refresh } = getTokens()
    const isAuthLoginRoute = path.startsWith('/auth/login') || path.startsWith('/auth/register')
    // Login / routes publiques : pas de session à rafraîchir
    if (!currentToken && !refresh) {
      const data401 = await res.json().catch(() => ({})) as ApiError
      if (isAuthLoginRoute) {
        throw new ApiRequestError(
          401,
          data401.code ?? 'INVALID_CREDENTIALS',
          data401.message ?? 'Email ou mot de passe incorrect.',
        )
      }
      const friendly = toUserFacingAuthError(data401.code, data401.message)
      forceSessionExpired()
      throw new ApiRequestError(401, friendly.code, friendly.message)
    }
    const newToken = await tryRefreshToken()
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      const retry = await fetch(url, { ...options, headers })
      const retryData = await retry.json() as ApiError
      if (!retry.ok) {
        if (retry.status === 401) {
          const friendly = toUserFacingAuthError(retryData.code, retryData.message)
          forceSessionExpired()
          throw new ApiRequestError(401, friendly.code, friendly.message)
        }
        throw new ApiRequestError(retry.status, retryData.code, retryData.message)
      }
      return retryData as T
    }
    forceSessionExpired()
    throw new ApiRequestError(401, 'SESSION_EXPIRED', SESSION_EXPIRED_MSG)
  }

  const raw = await res.text()
  let data: unknown
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    if (res.status === 413 || /Request Entity Too Large/i.test(raw)) {
      throw new ApiRequestError(
        413,
        'PAYLOAD_TOO_LARGE',
        'Données trop volumineuses. Réduisez la taille des photos/documents et réessayez.',
      )
    }
    throw new ApiRequestError(
      res.status || 502,
      'INVALID_RESPONSE',
      'Réponse serveur invalide. Réessayez dans un instant.',
    )
  }
  if (!res.ok) {
    const err = data as ApiError
    if (res.status === 401) {
      const friendly = toUserFacingAuthError(err.code, err.message)
      throw new ApiRequestError(401, friendly.code, friendly.message, err.issues)
    }
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
    nationalite: string
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
  numeroDevis?: string | null
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
  customContent?: string | null
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

export interface ChatMessage {
  id: string
  dossierPatientId: string
  patientId: string
  expediteurId: string
  expediteurRole: 'patient' | 'medecin' | 'gestionnaire'
  expediteurNom?: string | null
  contenu: string
  pieceJointeUrl?: string | null
  pieceJointeNom?: string | null
  dateEnvoi: string
  lu: boolean
}

export interface ChatConversation {
  patientId: string
  dossierNumber: string
  fullName: string
  email: string
  unreadCount: number
  lastMessageAt: string
  lastMessagePreview: string
  lastExpediteurRole: string | null
}

export interface ChatPatientOption {
  id: string
  dossierNumber: string
  fullName: string
  email: string
  hasConversation: boolean
}

export const chatApi = {
  getUnread: () =>
    request<{ ok: true; unread: number }>('/chat/unread'),

  getConversations: () =>
    request<{ ok: true; conversations: ChatConversation[] }>('/chat/conversations'),

  searchPatients: (search?: string) => {
    const q = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''
    return request<{ ok: true; patients: ChatPatientOption[] }>(`/chat/patients${q}`)
  },

  getMessages: (patientId?: string) => {
    const q = patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''
    return request<{ ok: true; patientId: string; messages: ChatMessage[] }>(`/chat/messages${q}`)
  },

  sendMessage: (body: {
    contenu: string
    patientId?: string
    pieceJointeUrl?: string
    pieceJointeNom?: string
  }) =>
    request<{ ok: true; message: ChatMessage }>('/chat/messages', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  markRead: (patientId?: string) =>
    request<{ ok: true }>('/chat/messages/read', {
      method: 'POST',
      body: JSON.stringify(patientId ? { patientId } : {}),
    }),

  upload: async (file: File) => {
    const prepared = await compressImageForUpload(file)
    const { access } = getTokens()
    const formData = new FormData()
    formData.append('file', prepared)
    const headers: Record<string, string> = {}
    if (access) headers['Authorization'] = `Bearer ${access}`

    const res = await fetch(`${BASE_URL}/chat/upload`, { method: 'POST', headers, body: formData })
    if (res.status === 401) {
      const newToken = await tryRefreshToken()
      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`
        const retry = await fetch(`${BASE_URL}/chat/upload`, { method: 'POST', headers, body: formData })
        if (!retry.ok) await readUploadError(retry)
        return (await retry.json()) as { ok: true; url: string; name: string; size: number }
      }
      forceSessionExpired()
      throw new ApiRequestError(401, 'SESSION_EXPIRED', SESSION_EXPIRED_MSG)
    }
    if (!res.ok) await readUploadError(res)
    return (await res.json()) as { ok: true; url: string; name: string; size: number }
  },
}

export const patientApi = {
  updateProfil: (body: { phone?: string; nationalite?: string; ville?: string; pays?: string }) =>
    request<{ ok: true; patient: unknown }>('/patient/profil', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  getNotifications: () =>
    request<{ ok: true; notifications: GestionnaireNotificationRow[] }>('/patient/notifications'),

  markNotificationRead: (id: string) =>
    request<{ ok: true }>(`/patient/notifications/${id}/lu`, { method: 'PATCH' }),

  markAllNotificationsRead: () =>
    request<{ ok: true }>('/patient/notifications/lu-toutes', { method: 'POST' }),

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

  /** Même moteur Chromium que l’export gestionnaire / envoi chat. */
  renderDevisPdf: async (html: string): Promise<Blob> => {
    const { access } = getTokens()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (access) headers['Authorization'] = `Bearer ${access}`

    const res = await fetch(`${BASE_URL}/patient/devis/render-pdf`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ html }),
    })

    if (res.status === 401) {
      const newToken = await tryRefreshToken()
      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`
        const retry = await fetch(`${BASE_URL}/patient/devis/render-pdf`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ html }),
        })
        if (!retry.ok) {
          const err = await retry.json().catch(() => ({})) as { message?: string; code?: string }
          throw new ApiRequestError(retry.status, err.code ?? 'PDF_ERROR', err.message ?? 'Export PDF impossible.')
        }
        return retry.blob()
      }
      forceSessionExpired()
      throw new ApiRequestError(401, 'SESSION_EXPIRED', SESSION_EXPIRED_MSG)
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string; code?: string }
      throw new ApiRequestError(res.status, err.code ?? 'PDF_ERROR', err.message ?? 'Export PDF impossible.')
    }
    return res.blob()
  },

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

export interface DossierBucketCounts {
  non_traites: number
  traites: number
  abstention: number
  actifs: number
}

export interface PatientListItem {
  id: string
  dossierNumber: string
  phone: string | null
  status: string
  statusBeforeAbstention?: string | null
  ville: string | null
  pays: string | null
  nationalite: string | null
  sourceContact: string | null
  createdAt: string
  updatedAt: string
  user: { id?: string; fullName: string; email: string; createdAt: string }
  formulaires: Array<{ id: string; status: string; submittedAt: string | null }>
  devis: Array<{ id: string; statut: string; total: number; dateCreation: string; numeroDevis?: string | null; updatedAt?: string; vuParPatientAt?: string | null }>
  rapports?: Array<{
    id: string
    diagnostic: string | null
    examensDemandes?: string[]
    interventionsRecommandees: string[]
    valeurMedicale: string | null
    forfaitPropose: number | null
    nuitsPreoperatoires?: number | null
    nuitsClinique?: number | null
    nuitsHotel?: number | null
    vetementContention?: boolean | null
    anesthesieGenerale?: boolean | null
    dureeSejourTunisie?: number | null
    nbAdultesSejour?: number | null
    nbEnfantsSejour?: number | null
    notes: string | null
    createdAt: string
  }>
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
  heureFin?: string
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

export interface DevisWithPatient extends Devis {
  patient: {
    id: string
    dossierNumber: string
    fullName: string
  }
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
    return request<{
      ok: true
      patients: PatientListItem[]
      counts?: DossierBucketCounts
    }>(`/medecin/patients${qs ? `?${qs}` : ''}`)
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
        nuitsPreoperatoires?: number | null
        nuitsClinique?: number | null
        nuitsHotel?: number | null
        vetementContention?: boolean | null
        anesthesieGenerale?: boolean | null
        dureeSejourTunisie?: number | null
        nbAdultesSejour?: number | null
        nbEnfantsSejour?: number | null
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
    forfaitPropose: number
    nuitsPreoperatoires: number
    nuitsClinique: number
    nuitsHotel: number
    vetementContention: boolean
    anesthesieGenerale?: boolean
    dureeSejourTunisie?: number
    nbAdultesSejour?: number
    nbEnfantsSejour?: number
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

  getGoogleCalendarStatus: () =>
    request<{
      ok: true
      configured: boolean
      linked: boolean
      googleCalendarId?: string | null
      pushCalendarSummary?: string | null
      syncCalendarCount?: number
      lastSyncAt?: string | null
      needsReconnect?: boolean
      message?: string
    }>('/medecin/google/status'),

  listGoogleCalendars: () =>
    request<{
      ok: true
      calendars: { id: string; summary: string; primary: boolean; selected: boolean }[]
      syncCalendarIds: string[]
      pushCalendarId: string
    }>('/medecin/google/calendars'),

  setGooglePushCalendar: (calendarId: string) =>
    request<{ ok: true; pushCalendarId: string; pushCalendarSummary?: string }>(
      '/medecin/google/push-calendar',
      { method: 'PUT', body: JSON.stringify({ calendarId }) },
    ),

  getGoogleConnectUrl: () =>
    request<{ ok: true; url: string }>('/medecin/google/connect'),

  disconnectGoogleCalendar: () =>
    request<{ ok: true; disconnected: boolean }>('/medecin/google/disconnect', { method: 'POST' }),

  syncGoogleCalendarNow: () =>
    request<{
      ok: true
      stats: { imported: number; updated: number; removed: number }
      pushed: number
      failed: number
    }>('/medecin/google/sync-now', { method: 'POST' }),

  pushAllEventsToGoogle: () =>
    request<{ ok: true; pushed: number; failed: number }>('/medecin/google/push-all', {
      method: 'POST',
    }),

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

  getAllDevis: () =>
    request<{ ok: true; devis: DevisWithPatient[] }>('/medecin/devis'),
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
  nuitsPreoperatoires?: number | null
  nuitsClinique?: number | null
  nuitsHotel?: number | null
  vetementContention?: boolean | null
  anesthesieGenerale?: boolean | null
  dureeSejourTunisie?: number | null
  nbAdultesSejour?: number | null
  nbEnfantsSejour?: number | null
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

export interface GestionnairePlanningSejourSummary {
  id: string
  moisLabel: string | null
  statut: 'brouillon' | 'finalise'
  updatedAt: string
  hasContent: boolean
}

export interface GestionnairePlanningSejourPatient {
  id: string
  dossierNumber: string
  status: string
  ville: string | null
  pays: string | null
  user: { fullName: string; email: string }
  planning: GestionnairePlanningSejourSummary | null
}

export interface GestionnairePlanningSejourDetail {
  id: string
  content: string | null
  moisLabel: string | null
  statut: 'brouillon' | 'finalise'
  updatedAt: string
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

export interface TndEurRateResponse {
  ok: true
  tndPerEur: number
  eurPerTnd: number
  date: string
  source: 'exchangerate-api' | 'fallback'
}

export const gestionnaireApi = {
  /** Taux TND → EUR (cache 24 h côté serveur, gestionnaire uniquement). */
  getTauxEur: () => request<TndEurRateResponse>('/gestionnaire/taux-eur'),

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
    return request<{
      ok: true
      patients: PatientListItem[]
      counts?: DossierBucketCounts
    }>(`/gestionnaire/patients${qs ? `?${qs}` : ''}`)
  },

  getPatient: (id: string) =>
    request<{ ok: true; patient: GestionnairePatientDetail }>(`/gestionnaire/patients/${id}`),

  deletePatient: (patientId: string) =>
    request<{ ok: true; deleted: true }>(`/gestionnaire/patients/${patientId}`, {
      method: 'DELETE',
    }),

  updatePatientStatus: (id: string, status: string) =>
    request<{ ok: true; patient: unknown }>(`/gestionnaire/patients/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

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

  sendDevis: (devisId: string, body?: { html?: string }) =>
    request<{ ok: true; devis: Devis }>(`/gestionnaire/devis/${devisId}/envoyer`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),

  /** Même moteur Chromium que l’envoi chat — PDF binaire téléchargeable. */
  renderDevisPdf: async (html: string): Promise<Blob> => {
    const { access } = getTokens()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (access) headers['Authorization'] = `Bearer ${access}`

    const res = await fetch(`${BASE_URL}/gestionnaire/devis/render-pdf`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ html }),
    })

    if (res.status === 401) {
      const newToken = await tryRefreshToken()
      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`
        const retry = await fetch(`${BASE_URL}/gestionnaire/devis/render-pdf`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ html }),
        })
        if (!retry.ok) {
          const err = await retry.json().catch(() => ({})) as { message?: string; code?: string }
          throw new ApiRequestError(retry.status, err.code ?? 'PDF_ERROR', err.message ?? 'Export PDF impossible.')
        }
        return retry.blob()
      }
      forceSessionExpired()
      throw new ApiRequestError(401, 'SESSION_EXPIRED', SESSION_EXPIRED_MSG)
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string; code?: string }
      throw new ApiRequestError(res.status, err.code ?? 'PDF_ERROR', err.message ?? 'Export PDF impossible.')
    }
    return res.blob()
  },

  saveDevisCustomContent: (devisId: string, content: string) =>
    request<{ ok: true }>(`/gestionnaire/devis/${devisId}/content`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),

  refuseDevis: (devisId: string, body?: { reason?: string }) =>
    request<{ ok: true; devis: Devis }>(`/gestionnaire/devis/${devisId}/refuser`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),

  deleteDevis: (devisId: string) =>
    request<{ ok: true; deleted: true }>(`/gestionnaire/devis/${devisId}`, {
      method: 'DELETE',
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

  getPlanningSejour: () =>
    request<{ ok: true; patients: GestionnairePlanningSejourPatient[] }>('/gestionnaire/planning-sejour'),

  getPlanningSejourDetail: (patientId: string) =>
    request<{
      ok: true
      patient: Omit<GestionnairePlanningSejourPatient, 'planning'>
      planning: GestionnairePlanningSejourDetail | null
      moisLabelDefault: string
      logistique: {
        dateArrivee: string | null
        dateDepart: string | null
        hebergement: string | null
        transport: string | null
        accompagnateur: string | null
      } | null
    }>(`/gestionnaire/planning-sejour/${patientId}`),

  generatePlanningSejour: (patientId: string) =>
    request<{ ok: true; planning: GestionnairePlanningSejourDetail }>(
      `/gestionnaire/planning-sejour/${patientId}/generer`,
      { method: 'POST' }
    ),

  updatePlanningSejour: (
    patientId: string,
    body: { content?: string | null; moisLabel?: string | null; statut?: 'brouillon' | 'finalise' }
  ) =>
    request<{ ok: true; planning: GestionnairePlanningSejourDetail }>(
      `/gestionnaire/planning-sejour/${patientId}`,
      { method: 'PUT', body: JSON.stringify(body) }
    ),

  deletePlanningSejour: (patientId: string) =>
    request<{ ok: true }>(`/gestionnaire/planning-sejour/${patientId}`, { method: 'DELETE' }),

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

  getGoogleCalendarStatus: (medecinId: string) =>
    request<{
      ok: true
      configured: boolean
      linked: boolean
      googleCalendarId?: string | null
      pushCalendarSummary?: string | null
      syncCalendarCount?: number
      lastSyncAt?: string | null
      needsReconnect?: boolean
      message?: string
    }>(`/gestionnaire/google/status?medecinId=${encodeURIComponent(medecinId)}`),

  listGoogleCalendars: (medecinId: string) =>
    request<{
      ok: true
      calendars: { id: string; summary: string; primary: boolean; selected: boolean }[]
      syncCalendarIds: string[]
      pushCalendarId: string
    }>(`/gestionnaire/google/calendars?medecinId=${encodeURIComponent(medecinId)}`),

  setGooglePushCalendar: (medecinId: string, calendarId: string) =>
    request<{ ok: true; pushCalendarId: string; pushCalendarSummary?: string }>(
      `/gestionnaire/google/push-calendar?medecinId=${encodeURIComponent(medecinId)}`,
      { method: 'PUT', body: JSON.stringify({ calendarId }) },
    ),

  getGoogleConnectUrl: (medecinId: string) =>
    request<{ ok: true; url: string }>(
      `/gestionnaire/google/connect?medecinId=${encodeURIComponent(medecinId)}`,
    ),

  disconnectGoogleCalendar: (medecinId: string) =>
    request<{ ok: true; disconnected: boolean }>(
      `/gestionnaire/google/disconnect?medecinId=${encodeURIComponent(medecinId)}`,
      { method: 'POST' },
    ),

  syncGoogleCalendarNow: (medecinId: string) =>
    request<{
      ok: true
      stats: { imported: number; updated: number; removed: number }
      pushed: number
      failed: number
    }>(`/gestionnaire/google/sync-now?medecinId=${encodeURIComponent(medecinId)}`, {
      method: 'POST',
    }),

  pushAllEventsToGoogle: (medecinId: string) =>
    request<{ ok: true; pushed: number; failed: number }>(
      `/gestionnaire/google/push-all?medecinId=${encodeURIComponent(medecinId)}`,
      { method: 'POST' },
    ),

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

  updateUser: (userId: string, body: { fullName?: string; email?: string; password?: string }) =>
    request<{ ok: true; user: { id: string; fullName: string; email: string; role: 'patient' | 'medecin' | 'gestionnaire' } }>(
      `/gestionnaire/users/${userId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      }
    ),

  deleteUser: (userId: string) =>
    request<{ ok: true; deleted: true }>(`/gestionnaire/users/${userId}`, { method: 'DELETE' }),
}

// ─── Upload API ───────────────────────────────────────────────────────────────

export interface UploadResponse {
  ok: true
  url: string
  name: string
  size: number
}

async function readUploadError(res: Response): Promise<never> {
  const text = await res.text()
  let message = 'Erreur lors de l’envoi du fichier.'
  try {
    const parsed = JSON.parse(text) as { code?: string; message?: string }
    if (parsed.message) message = parsed.message
    throw new ApiRequestError(res.status, parsed.code ?? 'UPLOAD_ERROR', message)
  } catch (e) {
    if (e instanceof ApiRequestError) throw e
  }
  if (res.status === 413 || /413|Request Entity Too Large|html/i.test(text.slice(0, 200))) {
    throw new ApiRequestError(
      413,
      'FILE_TOO_LARGE',
      'Fichier trop volumineux. Choisissez une photo plus légère (idéalement < 10 Mo) ou compressez-la.',
    )
  }
  throw new ApiRequestError(res.status, 'UPLOAD_ERROR', message)
}

/** Réduit les photos téléphone trop lourdes avant upload (évite les 413 nginx). */
export async function compressImageForUpload(file: File, maxSide = 1920, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  // PDF et petits fichiers : pas de recompression
  if (file.size <= 900_000) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    )
    if (!blob || blob.size >= file.size) return file
    const base = file.name.replace(/\.[^.]+$/, '') || 'photo'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}

export async function uploadMedecinFile(file: File): Promise<UploadResponse> {
  const prepared = await compressImageForUpload(file)
  const { access } = getTokens()
  const formData = new FormData()
  formData.append('file', prepared)
  const headers: Record<string, string> = {}
  if (access) headers['Authorization'] = `Bearer ${access}`

  const res = await fetch(`${BASE_URL}/medecin/upload`, { method: 'POST', headers, body: formData })
  if (res.status === 401) {
    const newToken = await tryRefreshToken()
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      const retry = await fetch(`${BASE_URL}/medecin/upload`, { method: 'POST', headers, body: formData })
      if (!retry.ok) await readUploadError(retry)
      return (await retry.json()) as UploadResponse
    }
    forceSessionExpired()
    throw new ApiRequestError(401, 'SESSION_EXPIRED', SESSION_EXPIRED_MSG)
  }
  if (!res.ok) await readUploadError(res)
  return (await res.json()) as UploadResponse
}

export async function uploadPostOpPhoto(file: File, note?: string): Promise<UploadResponse & { suivi?: SuiviPostOp }> {
  const prepared = await compressImageForUpload(file)
  const { access } = getTokens()
  const formData = new FormData()
  formData.append('file', prepared)
  if (note) formData.append('note', note)

  const headers: Record<string, string> = {}
  if (access) headers['Authorization'] = `Bearer ${access}`

  const res = await fetch(`${BASE_URL}/patient/post-op/photos`, { method: 'POST', headers, body: formData })
  if (res.status === 401) {
    const newToken = await tryRefreshToken()
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      const retry = await fetch(`${BASE_URL}/patient/post-op/photos`, { method: 'POST', headers, body: formData })
      if (!retry.ok) await readUploadError(retry)
      return (await retry.json()) as UploadResponse & { suivi?: SuiviPostOp }
    }
    forceSessionExpired()
    throw new ApiRequestError(401, 'SESSION_EXPIRED', SESSION_EXPIRED_MSG)
  }
  if (!res.ok) await readUploadError(res)
  return (await res.json()) as UploadResponse & { suivi?: SuiviPostOp }
}

export async function uploadFile(file: File): Promise<UploadResponse> {
  const prepared = await compressImageForUpload(file)
  const { access } = getTokens()
  const formData = new FormData()
  formData.append('file', prepared)

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
      if (!retry.ok) await readUploadError(retry)
      return (await retry.json()) as UploadResponse
    }
    forceSessionExpired()
    throw new ApiRequestError(401, 'SESSION_EXPIRED', SESSION_EXPIRED_MSG)
  }

  if (!res.ok) await readUploadError(res)
  return (await res.json()) as UploadResponse
}

/** Upload sans JWT (formulaire public avant inscription). Mêmes types que l’upload patient. */
export async function uploadFilePublic(file: File): Promise<UploadResponse> {
  const prepared = await compressImageForUpload(file)
  const formData = new FormData()
  formData.append('file', prepared)

  const res = await fetch(`${BASE_URL}/public/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) await readUploadError(res)
  return (await res.json()) as UploadResponse
}
