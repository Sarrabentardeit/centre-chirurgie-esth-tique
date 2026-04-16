import { useEffect, useState, useCallback } from 'react'
import {
  Search, Users, Clock, CheckCircle2, AlertTriangle, AlertCircle,
  RefreshCw, ChevronRight, UserPlus, Phone, Mail, MapPin, Filter,
  Trash2, Pencil, X, Save,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { STATUS_LABELS, STATUS_COLORS, formatRelative } from '@/lib/utils'
import type { DossierStatus } from '@/types'
import { medecinApi, gestionnaireApi } from '@/lib/api'
import type { PatientListItem } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATUS_FILTERS: Array<{ key: DossierStatus | 'all'; label: string; color: string }> = [
  { key: 'all',                 label: 'Tous',            color: '' },
  { key: 'formulaire_complete', label: 'À analyser',      color: 'text-amber-700  bg-amber-50  border-amber-200' },
  { key: 'rapport_genere',      label: 'Rapport généré',  color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  { key: 'devis_envoye',        label: 'Devis envoyé',    color: 'text-blue-700   bg-blue-50   border-blue-200' },
  { key: 'date_reservee',       label: 'RDV fixé',        color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  { key: 'post_op',             label: 'Post-Op',         color: 'text-rose-700   bg-rose-50   border-rose-200' },
]

const SOURCE_STYLES: Record<string, { label: string; color: string }> = {
  instagram: { label: 'Instagram', color: 'bg-gradient-to-r from-purple-50 to-pink-50 text-pink-700 border border-pink-200' },
  whatsapp:  { label: 'WhatsApp',  color: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  google:    { label: 'Google',    color: 'bg-blue-50 text-blue-700 border border-blue-200' },
  direct:    { label: 'Direct',    color: 'bg-slate-100 text-slate-600 border border-slate-200' },
}

// Couleur de l'avatar selon le statut
const AVATAR_COLOR: Record<string, string> = {
  formulaire_complete: 'bg-amber-100 text-amber-700 ring-2 ring-amber-300',
  en_analyse:          'bg-indigo-100 text-indigo-700',
  rapport_genere:      'bg-violet-100 text-violet-700',
  devis_envoye:        'bg-blue-100 text-blue-700',
  date_reservee:       'bg-emerald-100 text-emerald-700',
  post_op:             'bg-rose-100 text-rose-700',
  suivi_termine:       'bg-slate-100 text-slate-600',
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <div className="divide-y divide-border/60">
      {[1,2,3,4,5].map((i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="h-11 w-11 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-6 w-24 hidden sm:block" />
          <Skeleton className="h-4 w-4" />
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Modal Modifier ───────────────────────────────────────────────────────────

function EditModal({ patient, onClose, onSaved }: {
  patient: PatientListItem
  onClose: () => void
  onSaved: (updated: PatientListItem) => void
}) {
  const [form, setForm] = useState({
    fullName:      patient.user.fullName,
    email:         patient.user.email,
    phone:         patient.phone ?? '',
    ville:         patient.ville ?? '',
    pays:          patient.pays ?? '',
    nationalite:   patient.nationalite ?? '',
    sourceContact: patient.sourceContact ?? '',
  })
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState<string | null>(null)

  const handleSave = async () => {
    if (!form.fullName.trim() || !form.email.trim()) return
    setSaving(true); setErr(null)
    try {
      const res = await medecinApi.updatePatient(patient.id, {
        fullName:      form.fullName      || undefined,
        email:         form.email         || undefined,
        phone:         form.phone         || undefined,
        ville:         form.ville         || undefined,
        pays:          form.pays          || undefined,
        nationalite:   form.nationalite   || undefined,
        sourceContact: form.sourceContact || undefined,
      })
      onSaved(res.patient)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur lors de la modification.')
    } finally {
      setSaving(false)
    }
  }

  const Field = ({ label, field, type = 'text' }: { label: string; field: keyof typeof form; type?: string }) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={form[field]}
        onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
        className="h-9 text-sm"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border bg-background shadow-2xl overflow-hidden mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <p className="font-bold text-base">Modifier le patient</p>
            <p className="text-xs text-muted-foreground mt-0.5">{patient.dossierNumber}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {err && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" /> {err}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><Field label="Nom complet *" field="fullName" /></div>
            <div className="sm:col-span-2"><Field label="Email *" field="email" type="email" /></div>
            <Field label="Téléphone" field="phone" />
            <Field label="Ville" field="ville" />
            <Field label="Pays" field="pays" />
            <Field label="Nationalité" field="nationalite" />
            <div className="sm:col-span-2">
              <Label className="text-xs">Source contact</Label>
              <select
                value={form.sourceContact}
                onChange={(e) => setForm((f) => ({ ...f, sourceContact: e.target.value }))}
                className="mt-1.5 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Aucune —</option>
                <option value="instagram">Instagram</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="google">Google</option>
                <option value="direct">Direct</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="brand" onClick={() => void handleSave()} disabled={saving || !form.fullName.trim() || !form.email.trim()}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Confirmer Suppression ─────────────────────────────────────────────

function DeleteModal({ patient, onClose, onDeleted }: {
  patient: PatientListItem
  onClose: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [err, setErr]           = useState<string | null>(null)

  const handleDelete = async () => {
    setDeleting(true); setErr(null)
    try {
      await medecinApi.deletePatient(patient.id)
      onDeleted()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur lors de la suppression.')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border bg-background shadow-2xl overflow-hidden mx-4">
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
              <Trash2 className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="font-bold text-sm">Supprimer ce patient ?</p>
              <p className="text-xs text-muted-foreground mt-0.5">Cette action est irréversible.</p>
            </div>
          </div>
          <div className="rounded-xl bg-muted/50 border px-4 py-3">
            <p className="font-semibold text-sm">{patient.user.fullName}</p>
            <p className="text-xs text-muted-foreground">{patient.user.email} · {patient.dossierNumber}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Le compte, le dossier, le formulaire, les rapports et tous les fichiers associés seront définitivement supprimés.
          </p>
          {err && (
            <div className="flex items-center gap-2 mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" /> {err}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="destructive" size="sm" onClick={() => void handleDelete()} disabled={deleting}>
            <Trash2 className="h-4 w-4 mr-2" />
            {deleting ? 'Suppression...' : 'Supprimer définitivement'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PatientsPage() {
  const navigate      = useNavigate()
  const { user }      = useAuthStore()
  const isGestionnaire = user?.role === 'gestionnaire'
  const [searchParams] = useSearchParams()
  const initialStatus  = (searchParams.get('status') ?? 'all') as DossierStatus | 'all'

  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState<DossierStatus | 'all'>(initialStatus)
  const [patients, setPatients]         = useState<PatientListItem[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [editTarget, setEditTarget]     = useState<PatientListItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PatientListItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = {
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      }
      const res = isGestionnaire
        ? await gestionnaireApi.getPatients(params)
        : await medecinApi.getPatients(params)
      setPatients(res.patients)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, isGestionnaire])

  useEffect(() => {
    const t = setTimeout(() => { void load() }, search ? 400 : 0)
    return () => clearTimeout(t)
  }, [load])

  const stats = {
    total:     patients.length,
    aAnalyser: patients.filter((p) => p.status === 'formulaire_complete').length,
    enCours:   patients.filter((p) => ['en_analyse', 'rapport_genere', 'devis_preparation', 'devis_envoye'].includes(p.status)).length,
    termines:  patients.filter((p) => ['devis_accepte', 'date_reservee', 'intervention', 'post_op', 'suivi_termine'].includes(p.status)).length,
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5 p-4 sm:p-6">

      {/* ── Header ── */}
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Patients</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? '—' : `${stats.total} patient${stats.total > 1 ? 's' : ''} enregistré${stats.total > 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="ml-2 hidden sm:inline">Actualiser</span>
          </Button>
          {!isGestionnaire && (
            <Button variant="brand" size="sm" className="gap-2" onClick={() => navigate('/medecin/patients/nouveau')}>
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Nouveau patient</span>
              <span className="sm:hidden">Nouveau</span>
            </Button>
          )}
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Total patients',
            value: stats.total,
            icon: Users,
            iconClass: 'text-brand-600',
            bgClass: 'bg-brand-50/60',
            borderClass: 'border-brand-100',
          },
          {
            label: 'À analyser',
            value: stats.aAnalyser,
            icon: AlertTriangle,
            iconClass: stats.aAnalyser > 0 ? 'text-amber-600' : 'text-slate-400',
            bgClass: stats.aAnalyser > 0 ? 'bg-amber-50' : 'bg-slate-50',
            borderClass: stats.aAnalyser > 0 ? 'border-amber-200' : 'border-slate-200',
            pulse: stats.aAnalyser > 0,
          },
          {
            label: 'En cours',
            value: stats.enCours,
            icon: Clock,
            iconClass: 'text-indigo-600',
            bgClass: 'bg-indigo-50/60',
            borderClass: 'border-indigo-100',
          },
          {
            label: 'Finalisés',
            value: stats.termines,
            icon: CheckCircle2,
            iconClass: 'text-emerald-600',
            bgClass: 'bg-emerald-50/60',
            borderClass: 'border-emerald-100',
          },
        ].map(({ label, value, icon: Icon, iconClass, bgClass, borderClass, pulse }) => (
          <div
            key={label}
            className={`relative rounded-2xl border ${borderClass} ${bgClass} px-4 py-4 flex items-center gap-3 overflow-hidden`}
          >
            <div className={`rounded-xl p-2.5 bg-white/80 shadow-sm ${iconClass} shrink-0`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold leading-none">{loading ? '—' : value}</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{label}</p>
            </div>
            {pulse && (
              <span className="absolute top-3 right-3 h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </div>
        ))}
      </div>

      {/* ── Panel principal ── */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">

        {/* Barre de recherche + filtres */}
        <div className="px-4 sm:px-5 py-4 border-b border-border bg-muted/20 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nom, n° dossier, date, mot-clé opération..."
                className="pl-9 h-9 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Filtrer :</span>
            </div>
          </div>

          {/* Filtres pill */}
          <div className="flex gap-1.5 flex-wrap">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                  statusFilter === f.key
                    ? f.key === 'all'
                      ? 'bg-foreground text-background border-foreground'
                      : f.color + ' font-semibold'
                    : 'border-border text-muted-foreground hover:border-brand-300 hover:text-brand-700 bg-background'
                }`}
              >
                {f.label}
                {f.key !== 'all' && !loading && (
                  <span className="ml-1.5 opacity-70">
                    {patients.filter((p) => p.status === f.key).length > 0
                      ? `(${patients.filter((p) => p.status === f.key).length})`
                      : ''}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div className="flex items-center gap-2 mx-4 my-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void load()}>Réessayer</Button>
          </div>
        )}

        {/* Liste */}
        {loading ? (
          <ListSkeleton />
        ) : patients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">Aucun patient trouvé</p>
              <p className="text-xs text-muted-foreground mt-1">
                {search
                  ? `Aucun résultat pour "${search}"`
                  : isGestionnaire
                    ? 'Modifiez le filtre pour afficher d’autres dossiers'
                    : 'Modifiez le filtre ou ajoutez un nouveau patient'}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setSearch(''); setStatusFilter('all') }}>
              Réinitialiser les filtres
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {patients.map((p, idx) => {
              const isUrgent   = p.status === 'formulaire_complete'
              const avatarCls  = AVATAR_COLOR[p.status] ?? 'bg-brand-100 text-brand-700'
              const source     = p.sourceContact ? (SOURCE_STYLES[p.sourceContact] ?? { label: p.sourceContact, color: 'bg-muted text-muted-foreground border border-border' }) : null

              return (
                <div
                  key={p.id}
                  className={`group flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 cursor-pointer transition-all duration-150
                    ${isUrgent ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-muted/40'}
                    ${idx === 0 ? '' : ''}`}
                  onClick={() =>
                    navigate(isGestionnaire ? `/gestionnaire/devis/${p.id}` : `/medecin/patients/${p.id}`)
                  }
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <Avatar className="h-11 w-11">
                      <AvatarFallback className={`text-sm font-bold ${avatarCls}`}>
                        {getInitials(p.user.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    {isUrgent && (
                      <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-amber-500 border-2 border-white animate-pulse" />
                    )}
                  </div>

                  {/* Infos principales */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm leading-tight">{p.user.fullName}</p>
                      <span className="text-[11px] font-mono text-brand-700 bg-brand-50 border border-brand-100 px-1.5 py-0.5 rounded">
                        {p.dossierNumber}
                      </span>
                      {source && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${source.color}`}>
                          {source.label}
                        </span>
                      )}
                    </div>

                    {/* Coordonnées */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[160px]">{p.user.email}</span>
                      </span>
                      {p.phone && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Phone className="h-3 w-3 shrink-0" />
                          {p.phone}
                        </span>
                      )}
                      {(p.ville || p.pays) && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {[p.ville, p.pays].filter(Boolean).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Statut + dates */}
                  <div className="shrink-0 hidden sm:flex flex-col items-end gap-1.5">
                    <Badge className={`text-[11px] font-medium ${STATUS_COLORS[p.status as keyof typeof STATUS_COLORS] ?? ''}`}>
                      {STATUS_LABELS[p.status as keyof typeof STATUS_LABELS] ?? p.status}
                    </Badge>
                    <p className="text-[10px] text-muted-foreground">{formatRelative(p.updatedAt)}</p>
                  </div>

                  {/* Badge mobile uniquement */}
                  <div className="shrink-0 sm:hidden">
                    <Badge className={`text-[10px] ${STATUS_COLORS[p.status as keyof typeof STATUS_COLORS] ?? ''}`}>
                      {STATUS_LABELS[p.status as keyof typeof STATUS_LABELS] ?? p.status}
                    </Badge>
                  </div>

                  {/* Actions (visibles au hover) */}
                  <div className="shrink-0 flex items-center gap-1">
                    {!isGestionnaire && (
                      <>
                        <button
                          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Modifier"
                          onClick={(e) => { e.stopPropagation(); setEditTarget(p) }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Supprimer"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(p) }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors hidden sm:block" />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        {!loading && patients.length > 0 && (
          <div className="px-5 py-3 border-t border-border/60 bg-muted/10 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {patients.length} patient{patients.length > 1 ? 's' : ''}
              {statusFilter !== 'all' ? ` · filtre actif` : ''}
            </p>
            {statusFilter !== 'all' && (
              <button
                className="text-xs text-brand-600 hover:underline"
                onClick={() => setStatusFilter('all')}
              >
                Voir tous les patients
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {editTarget && (
        <EditModal
          patient={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            setPatients((prev) => prev.map((p) => p.id === updated.id ? { ...p, ...updated } : p))
          }}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          patient={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setPatients((prev) => prev.filter((p) => p.id !== deleteTarget.id))
            setDeleteTarget(null)
          }}
        />
      )}
    </div>
  )
}
