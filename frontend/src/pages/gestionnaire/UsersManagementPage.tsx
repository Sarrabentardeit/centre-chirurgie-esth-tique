import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  CalendarDays, CheckCircle2, Eye, EyeOff, Mail, MapPin,
  RefreshCw, Search, ShieldCheck, Stethoscope, User, UserPlus, Users, AlertCircle,
} from 'lucide-react'
import {
  gestionnaireApi,
  type GestionnaireUserRow,
  type GestionnaireUsersPagination,
  type GestionnaireUsersStats,
} from '@/lib/api'
import { formatRelative, cn } from '@/lib/utils'

// ─── Rôle config ──────────────────────────────────────────────────────────────

type Role = 'patient' | 'medecin' | 'gestionnaire'

const ROLES: { value: Role; label: string; icon: React.ElementType; color: string; bg: string; border: string }[] = [
  { value: 'patient',      label: 'Patient',       icon: User,        color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-300' },
  { value: 'medecin',      label: 'Médecin',       icon: Stethoscope, color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-300' },
  { value: 'gestionnaire', label: 'Gestionnaire',  icon: ShieldCheck, color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-300' },
]

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  nouveau:             { label: 'Nouveau',           color: 'bg-gray-100 text-gray-600' },
  formulaire_en_cours: { label: 'Form. en cours',    color: 'bg-yellow-100 text-yellow-700' },
  formulaire_complete: { label: 'Form. complété',    color: 'bg-green-100 text-green-700' },
  devis_envoye:        { label: 'Devis envoyé',      color: 'bg-blue-100 text-blue-700' },
  devis_accepte:       { label: 'Devis accepté',     color: 'bg-emerald-100 text-emerald-700' },
  date_reservee:       { label: 'Date réservée',     color: 'bg-indigo-100 text-indigo-700' },
  logistique:          { label: 'Logistique',        color: 'bg-orange-100 text-orange-700' },
  operation:           { label: 'Opération',         color: 'bg-red-100 text-red-700' },
  post_op:             { label: 'Post-op',           color: 'bg-purple-100 text-purple-700' },
  archive:             { label: 'Archivé',           color: 'bg-gray-200 text-gray-500' },
}

// ─── Avatar initiales ─────────────────────────────────────────────────────────

function Avatar({ name, role }: { name: string; role: Role }) {
  const initials = name.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase()
  const cls: Record<Role, string> = {
    patient:      'bg-blue-100 text-blue-700',
    medecin:      'bg-amber-100 text-amber-700',
    gestionnaire: 'bg-purple-100 text-purple-700',
  }
  return (
    <span className={cn('inline-flex items-center justify-center w-9 h-9 rounded-full font-bold text-sm shrink-0 select-none', cls[role])}>
      {initials || <User className="h-4 w-4" />}
    </span>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function UsersManagementPage() {
  // ── Data ──
  const [users, setUsers]     = useState<GestionnaireUserRow[]>([])
  const [stats, setStats]     = useState<GestionnaireUsersStats>({
    all: 0,
    patients: 0,
    medecins: 0,
    gestionnaires: 0,
  })
  const [pagination, setPagination] = useState<GestionnaireUsersPagination>({
    page: 1,
    pageSize: 12,
    total: 0,
    totalPages: 1,
  })
  const [loading, setLoading] = useState(true)

  // ── Create form ──
  const [prenom,   setPrenom]   = useState('')
  const [nom,      setNom]      = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [role,     setRole]     = useState<Role>('patient')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [success,  setSuccess]  = useState<string | null>(null)

  // ── Directory ──
  const [query,      setQuery]      = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all')
  const [page,       setPage]       = useState(1)
  const PAGE_SIZE = 12

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true)
    try {
      const r = await gestionnaireApi.getUsers({
        search: query.trim() || undefined,
        role: roleFilter,
        page,
        pageSize: PAGE_SIZE,
      })
      setUsers(r.users)
      setStats(r.stats)
      setPagination(r.pagination)
    }
    catch { /* silent */ }
    setLoading(false)
  }
  useEffect(() => { void load() }, [query, roleFilter, page])

  // ── Create ────────────────────────────────────────────────────────────────

  const isValid = prenom.trim() && nom.trim() && email.includes('@') && password.length >= 8

  const handleCreate = async () => {
    if (!isValid) return
    setSaving(true); setError(null); setSuccess(null)
    try {
      const res = await gestionnaireApi.createUser({
        fullName: `${prenom.trim()} ${nom.trim()}`,
        email:    email.trim().toLowerCase(),
        password,
        role,
      })
      const patientLoginUrl = `${window.location.origin}/acces-patient`
      const label = role === 'patient'
        ? `Compte patient créé${res.user.dossierNumber ? ` — dossier ${res.user.dossierNumber}` : ''}. Partagez ce lien de connexion avec le patient : ${patientLoginUrl}`
        : `Compte ${role} créé avec succès.`
      setSuccess(label)
      setPrenom(''); setNom(''); setEmail(''); setPassword('')
      void load()
      setTimeout(() => setSuccess(null), 8000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la création.')
    }
    setSaving(false)
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',         value: stats.all,           color: 'text-foreground',    icon: Users },
          { label: 'Patients',      value: stats.patients,      color: 'text-blue-700',      icon: User },
          { label: 'Médecins',      value: stats.medecins,      color: 'text-amber-700',     icon: Stethoscope },
          { label: 'Gestionnaires', value: stats.gestionnaires, color: 'text-purple-700',    icon: ShieldCheck },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="rounded-xl border bg-white p-4 flex items-center gap-3 shadow-sm">
            <Icon className={cn('h-5 w-5', color)} />
            <div>
              <p className="text-xs text-muted-foreground leading-none">{label}</p>
              <p className={cn('text-2xl font-bold mt-1', color)}>{loading ? '—' : value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Création ──────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b bg-gray-50/60">
          <UserPlus className="h-4 w-4 text-brand-600" />
          <h3 className="font-semibold text-sm">Créer un compte</h3>
        </div>

        <div className="p-5 space-y-5">
          {/* Sélection rôle */}
          <div className="flex gap-2 flex-wrap">
            {ROLES.map(({ value, label, icon: Icon, color, bg, border }) => (
              <button key={value} type="button"
                onClick={() => setRole(value)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all',
                  role === value
                    ? `${bg} ${color} ${border} shadow-sm`
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                )}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          {/* Champs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Prénom <span className="text-red-500">*</span></Label>
              <Input placeholder="ex : Sarra" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Nom <span className="text-red-500">*</span></Label>
              <Input placeholder="ex : Ben Tardeit" value={nom} onChange={(e) => setNom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Email <span className="text-red-500">*</span></Label>
              <Input placeholder="email@exemple.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Mot de passe <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Input
                  placeholder="Min. 8 caractères"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPwd((v) => !v)}>
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password.length > 0 && password.length < 8 && (
                <p className="text-xs text-red-500">Au moins 8 caractères requis</p>
              )}
            </div>
          </div>

          {/* Info contextuelle */}
          {role === 'patient' && (
            <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-800">
              <User className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Un dossier patient est créé automatiquement. Le patient se connecte ensuite avec ces identifiants et remplit lui-même son formulaire médical.</span>
            </div>
          )}

          {/* Feedback */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {success}
            </div>
          )}

          {/* Action */}
          <div className="flex justify-end pt-1">
            <Button
              variant="brand"
              disabled={!isValid || saving}
              onClick={() => void handleCreate()}
              className="px-6">
              {saving ? 'Création en cours...' : 'Créer le compte'}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Annuaire ──────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b bg-gray-50/60 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Annuaire des comptes</h3>
            <span className="text-xs text-muted-foreground">({pagination.total})</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading} className="text-xs">
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} /> Actualiser
          </Button>
        </div>

        {/* Filtres */}
        <div className="px-5 py-3 border-b flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input className="pl-9 h-9 text-sm" placeholder="Rechercher nom, email, n° dossier..."
              value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} />
          </div>
          <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v as typeof roleFilter); setPage(1) }}>
            <SelectTrigger className="w-full sm:w-44 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les rôles</SelectItem>
              <SelectItem value="patient">Patients</SelectItem>
              <SelectItem value="medecin">Médecins</SelectItem>
              <SelectItem value="gestionnaire">Gestionnaires</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Liste */}
        <div className="divide-y">
          {loading && (
            <div className="py-10 text-center text-sm text-muted-foreground">Chargement...</div>
          )}
          {!loading && users.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">Aucun compte trouvé.</div>
          )}
          {users.map((u) => {
            const roleMeta = ROLES.find((r) => r.value === u.role)!
            const statusInfo = u.patient?.status ? STATUS_LABELS[u.patient.status] : null
            const RoleIcon = roleMeta.icon
            return (
              <div key={u.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors">
                <Avatar name={u.fullName} role={u.role} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{u.fullName}</span>
                    <Badge variant="outline" className={cn('text-[11px] px-2 py-0 h-5 gap-1', roleMeta.color, roleMeta.bg, roleMeta.border)}>
                      <RoleIcon className="h-3 w-3" /> {roleMeta.label}
                    </Badge>
                    {statusInfo && (
                      <span className={cn('text-[11px] rounded-full px-2 py-0.5 font-medium', statusInfo.color)}>
                        {statusInfo.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {u.email}
                    </span>
                    {u.patient?.dossierNumber && (
                      <span className="text-xs font-semibold text-brand-600">{u.patient.dossierNumber}</span>
                    )}
                    {(u.patient?.ville || u.patient?.pays) && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {[u.patient.ville, u.patient.pays].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[11px] text-gray-400 flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" /> {formatRelative(u.createdAt)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 px-5 py-3 border-t">
            <button
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              ← Précédent
            </button>
            <span className="text-xs text-muted-foreground">Page {page} / {pagination.totalPages}</span>
            <button
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={page === pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
              Suivant →
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
