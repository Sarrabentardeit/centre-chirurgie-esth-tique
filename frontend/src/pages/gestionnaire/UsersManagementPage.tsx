import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  CalendarDays, CheckCircle2, Eye, EyeOff, Mail, MapPin,
  RefreshCw, Search, ShieldCheck, Stethoscope, User, UserPlus, Users,
  AlertCircle, Pencil, Trash2, Save, X, ChevronLeft, ChevronRight,
} from 'lucide-react'
import {
  gestionnaireApi,
  type GestionnaireUserRow,
  type GestionnaireUsersPagination,
  type GestionnaireUsersStats,
} from '@/lib/api'
import { formatRelative, cn } from '@/lib/utils'

type Role = 'patient' | 'medecin' | 'gestionnaire'

const ROLES: {
  value: Role; label: string; description: string; icon: React.ElementType
  activeClass: string; badgeClass: string
}[] = [
  { value: 'patient',      label: 'Patient',      description: 'Dossier créé automatiquement', icon: User,        activeClass: 'bg-blue-600 text-white border-blue-600',    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'medecin',      label: 'Médecin',      description: 'Accès dossiers & rapports',    icon: Stethoscope, activeClass: 'bg-amber-500 text-white border-amber-500',  badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'gestionnaire', label: 'Gestionnaire', description: 'Administration complète',       icon: ShieldCheck, activeClass: 'bg-purple-600 text-white border-purple-600', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
]

const STATUS_LABELS: Record<string, { label: string; dot: string }> = {
  nouveau:             { label: 'Nouveau',        dot: 'bg-gray-400' },
  formulaire_en_cours: { label: 'Form. en cours', dot: 'bg-yellow-400' },
  formulaire_complete: { label: 'À analyser',     dot: 'bg-amber-400' },
  en_analyse:          { label: 'En analyse',     dot: 'bg-indigo-400' },
  rapport_genere:      { label: 'Rapport',        dot: 'bg-violet-400' },
  rapport_modifie:     { label: 'Rapport modifié',dot: 'bg-amber-400' },
  devis_envoye:        { label: 'Devis envoyé',   dot: 'bg-blue-400' },
  devis_accepte:       { label: 'Devis accepté',  dot: 'bg-emerald-400' },
  date_reservee:       { label: 'RDV fixé',       dot: 'bg-teal-400' },
  logistique:          { label: 'Logistique',     dot: 'bg-orange-400' },
  operation:           { label: 'Opération',      dot: 'bg-red-400' },
  post_op:             { label: 'Post-op',        dot: 'bg-rose-400' },
  suivi_termine:       { label: 'Terminé',        dot: 'bg-slate-400' },
  archive:             { label: 'Archivé',        dot: 'bg-slate-300' },
  abstention:          { label: 'Abstention',     dot: 'bg-slate-300' },
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function UserAvatar({ name, role }: { name: string; role: Role }) {
  const initials = name.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase()
  const cls: Record<Role, string> = {
    patient:      'bg-blue-100 text-blue-700',
    medecin:      'bg-amber-100 text-amber-700',
    gestionnaire: 'bg-purple-100 text-purple-700',
  }
  return (
    <span className={cn('inline-flex items-center justify-center w-9 h-9 rounded-xl font-bold text-sm shrink-0 select-none', cls[role])}>
      {initials || <User className="h-4 w-4" />}
    </span>
  )
}

// ─── Modal Créer un compte ────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [prenom,   setPrenom]   = useState('')
  const [nom,      setNom]      = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [role,     setRole]     = useState<Role>('patient')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [success,  setSuccess]  = useState<string | null>(null)

  const isValid = prenom.trim() && nom.trim() && email.includes('@') && password.length >= 8

  const handleCreate = async () => {
    if (!isValid) return
    setSaving(true); setError(null)
    try {
      const res = await gestionnaireApi.createUser({
        fullName: `${prenom.trim()} ${nom.trim()}`,
        email:    email.trim().toLowerCase(),
        password, role,
      })
      setSuccess(
        role === 'patient'
          ? `Compte créé${res.user.dossierNumber ? ` · dossier ${res.user.dossierNumber}` : ''}. Lien patient : ${window.location.origin}/acces-patient`
          : `Compte ${role} créé avec succès.`
      )
      setPrenom(''); setNom(''); setEmail(''); setPassword('')
      onCreated()
      setTimeout(() => { setSuccess(null) }, 8000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la création.')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md max-h-[min(90dvh,90vh)] flex flex-col bg-white rounded-2xl shadow-2xl border overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center">
              <UserPlus className="h-4 w-4 text-brand-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm leading-none">Nouveau compte</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Ajouter un membre à la plateforme</p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto min-h-0">

          {/* Sélection rôle */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Type de compte</p>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map(({ value, label, description, icon: Icon, activeClass }) => (
                <button key={value} type="button" onClick={() => setRole(value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-xs font-semibold transition-all duration-150',
                    role === value ? activeClass : 'bg-white border-border text-muted-foreground hover:border-brand-200 hover:text-foreground'
                  )}>
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                  <span className={cn('text-[9px] font-normal text-center leading-tight', role === value ? 'opacity-80' : 'text-muted-foreground/70')}>
                    {description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Champs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-slate-500">Prénom <span className="text-red-400">*</span></Label>
              <Input placeholder="Sarra" value={prenom} onChange={(e) => setPrenom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-slate-500">Nom <span className="text-red-400">*</span></Label>
              <Input placeholder="Ben Tardeit" value={nom} onChange={(e) => setNom(e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-slate-500">Email <span className="text-red-400">*</span></Label>
            <Input placeholder="email@exemple.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-slate-500">Mot de passe <span className="text-red-400">*</span></Label>
            <div className="relative">
              <Input placeholder="Min. 8 caractères" type={showPwd ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)} className="pr-9 h-9" />
              <button type="button" onClick={() => setShowPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            {password.length > 0 && password.length < 8 && (
              <p className="text-[11px] text-red-500">8 caractères minimum</p>
            )}
          </div>

          {/* Note patient */}
          {role === 'patient' && (
            <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 leading-relaxed">
              Un dossier patient est créé automatiquement. Le patient se connecte avec ces identifiants et remplit son formulaire médical.
            </p>
          )}

          {/* Feedback */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-xs text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span className="break-all">{success}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t bg-muted/20 flex items-center justify-end gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="brand" size="sm" disabled={!isValid || saving} onClick={() => void handleCreate()} className="gap-1.5 px-5">
            <UserPlus className="h-3.5 w-3.5" />
            {saving ? 'Création…' : 'Créer le compte'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function UsersManagementPage() {
  const [users, setUsers]           = useState<GestionnaireUserRow[]>([])
  const [stats, setStats]           = useState<GestionnaireUsersStats>({ all: 0, patients: 0, medecins: 0, gestionnaires: 0 })
  const [pagination, setPagination] = useState<GestionnaireUsersPagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 })
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]   = useState(false)

  const [query,         setQuery]         = useState('')
  const [roleFilter,    setRoleFilter]    = useState<'all' | Role>('all')
  const [page,          setPage]          = useState(1)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editFullName,  setEditFullName]  = useState('')
  const [editEmail,     setEditEmail]     = useState('')
  const [editPassword,  setEditPassword]  = useState('')
  const [editShowPwd,   setEditShowPwd]   = useState(false)
  const [actionUserId,  setActionUserId]  = useState<string | null>(null)
  const [listErr,       setListErr]       = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await gestionnaireApi.getUsers({ search: query.trim() || undefined, role: roleFilter, page, pageSize: 20 })
      setUsers(r.users); setStats(r.stats); setPagination(r.pagination)
    } catch { /* silent */ }
    setLoading(false)
  }
  useEffect(() => { void load() }, [query, roleFilter, page])

  const beginEdit = (u: GestionnaireUserRow) => {
    setEditingUserId(u.id); setEditFullName(u.fullName); setEditEmail(u.email)
    setEditPassword(''); setEditShowPwd(false); setListErr(null)
  }
  const cancelEdit = () => { setEditingUserId(null); setEditFullName(''); setEditEmail(''); setEditPassword('') }

  const handleSaveEdit = async (u: GestionnaireUserRow) => {
    const fn  = editFullName.trim()
    const em  = editEmail.trim().toLowerCase()
    const pwd = editPassword.trim()
    if (!fn || !em.includes('@')) { setListErr('Nom et email valide requis.'); return }
    if (pwd && pwd.length < 8)    { setListErr('Mot de passe : 8 caractères min.'); return }
    setActionUserId(u.id); setListErr(null)
    try {
      await gestionnaireApi.updateUser(u.id, {
        fullName: fn !== u.fullName ? fn : undefined,
        email:    em !== u.email.toLowerCase() ? em : undefined,
        password: pwd || undefined,
      })
      cancelEdit(); await load()
    } catch (e: unknown) { setListErr(e instanceof Error ? e.message : 'Erreur.') }
    finally { setActionUserId(null) }
  }

  const handleDelete = async (u: GestionnaireUserRow) => {
    if (!window.confirm(`Supprimer "${u.fullName}" ?`)) return
    setActionUserId(u.id); setListErr(null)
    try {
      await gestionnaireApi.deleteUser(u.id)
      if (editingUserId === u.id) cancelEdit()
      await load()
    } catch (e: unknown) { setListErr(e instanceof Error ? e.message : 'Erreur.') }
    finally { setActionUserId(null) }
  }

  return (
    <div className="max-w-5xl mx-auto pb-10 space-y-4">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Comptes utilisateurs</h2>
          <div className="flex items-center gap-4 mt-1 flex-wrap">
            {[
              { label: 'Total',         value: stats.all,           icon: Users,       cls: 'text-slate-500' },
              { label: 'Patients',      value: stats.patients,      icon: User,        cls: 'text-blue-600' },
              { label: 'Médecins',      value: stats.medecins,      icon: Stethoscope, cls: 'text-amber-600' },
              { label: 'Gestionnaires', value: stats.gestionnaires, icon: ShieldCheck, cls: 'text-purple-600' },
            ].map(({ label, value, icon: Icon, cls }) => (
              <div key={label} className="flex items-center gap-1.5">
                <Icon className={cn('h-3.5 w-3.5', cls)} />
                <span className={cn('text-sm font-bold', cls)}>{loading ? '—' : value}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Actualiser</span>
          </Button>
          <Button variant="brand" size="sm" onClick={() => setShowModal(true)} className="gap-1.5">
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Ajouter un compte</span>
            <span className="sm:hidden">Ajouter</span>
          </Button>
        </div>
      </div>

      {/* ── Annuaire ──────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">

        {/* Filtres */}
        <div className="px-4 sm:px-5 py-3.5 border-b flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Rechercher nom, email, n° dossier…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1) }}
              className="w-full pl-10 pr-9 py-2.5 text-sm border border-border rounded-xl bg-muted/20 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand-300/40 focus:border-brand-400 transition-shadow"
            />
            {query && (
              <button onClick={() => { setQuery(''); setPage(1) }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex bg-muted/50 rounded-xl p-1 gap-0.5 sm:w-auto">
            {([
              { value: 'all',           label: 'Tous' },
              { value: 'patient',       label: 'Patients' },
              { value: 'medecin',       label: 'Médecins' },
              { value: 'gestionnaire',  label: 'Gest.' },
            ] as const).map((opt) => (
              <button key={opt.value} type="button"
                onClick={() => { setRoleFilter(opt.value); setPage(1) }}
                className={cn(
                  'flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150',
                  roleFilter === opt.value ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Erreur */}
        {listErr && (
          <div className="flex items-center gap-2 mx-4 my-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {listErr}
            <button onClick={() => setListErr(null)} className="ml-auto"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {/* Liste */}
        <div className="divide-y divide-border/40">
          {loading && (
            <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin opacity-40" />
              <p className="text-xs">Chargement…</p>
            </div>
          )}
          {!loading && users.length === 0 && (
            <div className="py-16 flex flex-col items-center gap-3 text-center px-4">
              <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
                <Users className="h-7 w-7 text-muted-foreground opacity-50" />
              </div>
              <div>
                <p className="font-semibold text-sm">Aucun compte trouvé</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {query ? `Aucun résultat pour "${query}"` : 'Ajoutez un premier compte via le bouton ci-dessus'}
                </p>
              </div>
              {query && (
                <Button variant="outline" size="sm" onClick={() => setQuery('')}>Effacer la recherche</Button>
              )}
            </div>
          )}

          {users.map((u) => {
            const roleMeta  = ROLES.find((r) => r.value === u.role)!
            const statusDef = u.patient?.status ? STATUS_LABELS[u.patient.status] : null
            const isEditing = editingUserId === u.id
            const isActing  = actionUserId === u.id

            return (
              <div key={u.id} className={cn('transition-colors', isEditing && 'bg-slate-50/80')}>
                {/* Row */}
                <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-muted/20">
                  <UserAvatar name={u.fullName} role={u.role} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{u.fullName}</span>
                      <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold rounded-md px-1.5 py-0.5 border', roleMeta.badgeClass)}>
                        <roleMeta.icon className="h-2.5 w-2.5" /> {roleMeta.label}
                      </span>
                      {u.patient?.dossierNumber && (
                        <span className="text-[10px] font-bold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-md">
                          {u.patient.dossierNumber}
                        </span>
                      )}
                      {statusDef && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', statusDef.dot)} />
                          {statusDef.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1 min-w-0">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{u.email}</span>
                      </span>
                      {(u.patient?.ville || u.patient?.pays) && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {[u.patient.ville, u.patient.pays].filter(Boolean).join(', ')}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1 sm:ml-auto">
                        <CalendarDays className="h-3 w-3" /> {formatRelative(u.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {isEditing ? (
                      <>
                        <button onClick={cancelEdit} disabled={isActing}
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <Button size="sm" variant="brand" className="h-8 px-3 gap-1.5 text-xs"
                          onClick={() => void handleSaveEdit(u)} disabled={isActing}>
                          <Save className="h-3.5 w-3.5" />
                          {isActing ? '…' : 'Enregistrer'}
                        </Button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => beginEdit(u)} disabled={Boolean(actionUserId)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Modifier">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => void handleDelete(u)} disabled={Boolean(actionUserId)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Supprimer">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Inline edit panel */}
                {isEditing && (
                  <div className="px-5 pb-4 pt-3 border-t border-dashed border-border/60">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Modifier le compte</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold text-slate-500">Nom complet</Label>
                        <Input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold text-slate-500">Email</Label>
                        <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold text-slate-500">Nouveau mot de passe <span className="font-normal text-muted-foreground">(optionnel)</span></Label>
                        <div className="relative">
                          <Input type={editShowPwd ? 'text' : 'password'} placeholder="Laisser vide pour conserver"
                            value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="pr-9 h-9 text-sm" />
                          <button type="button" onClick={() => setEditShowPwd((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {editShowPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t bg-muted/20">
            <span className="text-xs text-muted-foreground">
              Page <strong className="text-foreground">{page}</strong> sur <strong className="text-foreground">{pagination.totalPages}</strong>
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={page === pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal création ────────────────────────────────────────────────── */}
      {showModal && (
        <CreateModal
          onClose={() => setShowModal(false)}
          onCreated={() => void load()}
        />
      )}
    </div>
  )
}
