import { useEffect, useState, useCallback } from 'react'
import {
  Search, Users, AlertCircle,
  RefreshCw, ChevronRight, UserPlus, Phone, Mail, MapPin,
  Trash2, Pencil, X, Save, Archive, RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { PageHeader, KpiStrip } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/lib/statusUi'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getPatientDisplayReference } from '@/lib/utils'
import type { DossierStatus } from '@/types'
import { medecinApi, gestionnaireApi } from '@/lib/api'
import { formatSourceConnaissanceLabel } from '@/lib/sourceConnaissance'
import type { DossierBucketCounts, PatientListItem } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

// ─── Constantes ───────────────────────────────────────────────────────────────

type ListFilter = DossierStatus | 'all' | 'non_traites' | 'traites'

const BUCKET_FILTERS: Array<{ key: ListFilter; label: string; color: string }> = [
  { key: 'non_traites', label: 'Non traités', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { key: 'traites', label: 'Traités', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  { key: 'abstention', label: 'Abstention', color: 'text-slate-700 bg-slate-100 border-slate-300' },
  { key: 'all', label: 'Tous (actifs)', color: '' },
]

const DETAIL_FILTERS: Array<{ key: DossierStatus; label: string; color: string }> = [
  { key: 'formulaire_complete', label: 'À analyser', color: 'text-amber-700  bg-amber-50  border-amber-200' },
  { key: 'rapport_genere', label: 'Rapport généré', color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  { key: 'devis_envoye', label: 'Devis envoyé', color: 'text-blue-700   bg-blue-50   border-blue-200' },
  { key: 'date_reservee', label: 'RDV fixé', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  { key: 'post_op', label: 'Post-Op', color: 'text-rose-700   bg-rose-50   border-rose-200' },
]

const SOURCE_STYLES: Record<string, { label: string; color: string }> = {
  facebook:  { label: 'Facebook',  color: 'bg-blue-50 text-blue-800 border border-blue-200' },
  instagram: { label: 'Instagram', color: 'bg-gradient-to-r from-purple-50 to-pink-50 text-pink-700 border border-pink-200' },
  radio:     { label: 'Radio',       color: 'bg-amber-50 text-amber-800 border border-amber-200' },
  tv:        { label: 'TV',          color: 'bg-violet-50 text-violet-800 border border-violet-200' },
  amie:      { label: 'Entourage',   color: 'bg-teal-50 text-teal-800 border border-teal-200' },
  autre:     { label: 'Autre',       color: 'bg-slate-100 text-slate-700 border border-slate-200' },
  whatsapp:  { label: 'WhatsApp',  color: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  google:    { label: 'Google',    color: 'bg-blue-50 text-blue-700 border border-blue-200' },
  direct:    { label: 'Direct',    color: 'bg-slate-100 text-slate-600 border border-slate-200' },
}

const AVATAR_COLOR: Record<string, string> = {
  formulaire_complete: 'bg-amber-100 text-amber-700 ring-2 ring-amber-300',
  en_analyse:          'bg-indigo-100 text-indigo-700',
  rapport_genere:      'bg-violet-100 text-violet-700',
  devis_envoye:        'bg-blue-100 text-blue-700',
  date_reservee:       'bg-emerald-100 text-emerald-700',
  post_op:             'bg-rose-100 text-rose-700',
  suivi_termine:       'bg-slate-100 text-slate-600',
  abstention:          'bg-slate-200 text-slate-500',
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function parseInitialFilter(raw: string | null): ListFilter {
  if (!raw) return 'non_traites'
  if (raw === 'all' || raw === 'non_traites' || raw === 'traites' || raw === 'abstention') return raw
  return raw as DossierStatus
}

function reopenStatusFor(patient: PatientListItem, isGestionnaire: boolean): string {
  if (patient.statusBeforeAbstention && patient.statusBeforeAbstention !== 'abstention') {
    return patient.statusBeforeAbstention
  }
  return isGestionnaire ? 'rapport_genere' : 'formulaire_complete'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md max-h-[min(90dvh,90vh)] flex flex-col rounded-2xl border bg-background shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div>
            <p className="font-bold text-base">Modifier le patient</p>
            <p className="text-xs text-muted-foreground mt-0.5">{getPatientDisplayReference(patient)}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-3 overflow-y-auto min-h-0">
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

        <div className="px-5 py-4 border-t flex items-center justify-end gap-2 shrink-0">
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

function DeleteModal({ patient, asGestionnaire, onClose, onDeleted }: {
  patient: PatientListItem
  asGestionnaire: boolean
  onClose: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [err, setErr]           = useState<string | null>(null)

  const handleDelete = async () => {
    setDeleting(true); setErr(null)
    try {
      if (asGestionnaire) await gestionnaireApi.deletePatient(patient.id)
      else await medecinApi.deletePatient(patient.id)
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
            <p className="text-xs text-muted-foreground">{patient.user.email} · {getPatientDisplayReference(patient)}</p>
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

// ─── Modal Abstention ─────────────────────────────────────────────────────────

function AbstentionModal({ patient, asGestionnaire, mode, onClose, onDone }: {
  patient: PatientListItem
  asGestionnaire: boolean
  mode: 'classer' | 'reouvrir'
  onClose: () => void
  onDone: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handleConfirm = async () => {
    setSaving(true); setErr(null)
    try {
      const nextStatus = mode === 'classer'
        ? 'abstention'
        : reopenStatusFor(patient, asGestionnaire)
      if (asGestionnaire) await gestionnaireApi.updatePatientStatus(patient.id, nextStatus)
      else await medecinApi.updatePatientStatus(patient.id, nextStatus)
      onDone()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur lors de la mise à jour.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border bg-background shadow-2xl overflow-hidden mx-4">
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
              mode === 'classer' ? 'bg-slate-100' : 'bg-emerald-50'
            }`}>
              {mode === 'classer'
                ? <Archive className="h-5 w-5 text-slate-600" />
                : <RotateCcw className="h-5 w-5 text-emerald-600" />}
            </div>
            <div>
              <p className="font-bold text-sm">
                {mode === 'classer' ? 'Classer en abstention ?' : 'Réouvrir ce dossier ?'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {mode === 'classer'
                  ? 'Le dossier disparaît du fil actif ; l’historique est conservé.'
                  : 'Le dossier revient dans le fil des non traités / traités.'}
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-muted/50 border px-4 py-3">
            <p className="font-semibold text-sm">{patient.user.fullName}</p>
            <p className="text-xs text-muted-foreground">{getPatientDisplayReference(patient)}</p>
          </div>
          {err && (
            <div className="flex items-center gap-2 mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" /> {err}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button
            variant={mode === 'classer' ? 'outline' : 'brand'}
            size="sm"
            onClick={() => void handleConfirm()}
            disabled={saving}
          >
            {saving
              ? 'Enregistrement...'
              : mode === 'classer'
                ? 'Classer en abstention'
                : 'Réouvrir'}
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
  const initialStatus  = parseInitialFilter(searchParams.get('status'))

  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState<ListFilter>(initialStatus)
  const [patients, setPatients]         = useState<PatientListItem[]>([])
  const [counts, setCounts]             = useState<DossierBucketCounts | null>(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [editTarget, setEditTarget]     = useState<PatientListItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PatientListItem | null>(null)
  const [abstentionTarget, setAbstentionTarget] = useState<{
    patient: PatientListItem
    mode: 'classer' | 'reouvrir'
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = {
        search: search || undefined,
        status: statusFilter,
      }
      const res = isGestionnaire
        ? await gestionnaireApi.getPatients(params)
        : await medecinApi.getPatients(params)
      setPatients(res.patients)
      if (res.counts) setCounts(res.counts)
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
    nonTraites: counts?.non_traites ?? 0,
    traites:    counts?.traites ?? 0,
    abstention: counts?.abstention ?? 0,
    actifs:     counts?.actifs ?? patients.length,
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-5">

      <PageHeader
        title="Patients"
        description={
          loading
            ? 'Chargement des dossiers…'
            : `${stats.actifs} dossier${stats.actifs > 1 ? 's' : ''} actif${stats.actifs > 1 ? 's' : ''}${stats.abstention > 0 ? ` · ${stats.abstention} en abstention` : ''}`
        }
        actions={
          <>
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
          </>
        }
      />

      <KpiStrip
        items={[
          { key: 'non_traites', label: 'Non traités', value: loading ? '—' : stats.nonTraites, tone: 'amber', active: statusFilter === 'non_traites', onClick: () => setStatusFilter('non_traites') },
          { key: 'traites', label: 'Traités', value: loading ? '—' : stats.traites, tone: 'emerald', active: statusFilter === 'traites', onClick: () => setStatusFilter('traites') },
          { key: 'abstention', label: 'Abstention', value: loading ? '—' : stats.abstention, tone: 'slate', active: statusFilter === 'abstention', onClick: () => setStatusFilter('abstention') },
          { key: 'all', label: 'Tous actifs', value: loading ? '—' : stats.actifs, tone: 'sky', active: statusFilter === 'all', onClick: () => setStatusFilter('all') },
        ]}
      />

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">

        {/* ── Barre de recherche + filtres ── */}
        <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-border bg-white space-y-3">

          {/* Ligne 1 : Recherche */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Rechercher par nom, n° dossier, opération…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 text-sm border border-border rounded-xl bg-muted/30 placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-brand-300/50 focus:border-brand-400 transition-shadow"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Ligne 2 : Filtres bucket (tabs) — scroll horizontal sur mobile */}
          <div className="flex bg-muted/50 rounded-xl p-1 gap-0.5 overflow-x-auto scrollbar-none">
            {BUCKET_FILTERS.map((f) => {
              const count = !loading && counts
                ? f.key === 'non_traites' ? counts.non_traites
                  : f.key === 'traites' ? counts.traites
                  : f.key === 'abstention' ? counts.abstention
                  : counts.actifs
                : null
              const isActive = statusFilter === f.key
              const shortLabel =
                f.key === 'non_traites' ? 'Non traités'
                : f.key === 'traites' ? 'Traités'
                : f.key === 'abstention' ? 'Abstention'
                : 'Tous'
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStatusFilter(f.key)}
                  className={`shrink-0 py-2 sm:py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
                    isActive
                      ? 'bg-white shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="sm:hidden">{shortLabel}</span>
                  <span className="hidden sm:inline">{f.label}</span>
                  {count !== null && (
                    <span className={`ml-1 text-[10px] font-bold ${isActive ? 'opacity-70' : 'opacity-50'}`}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Ligne 3 : Filtres rapides par étape */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Étape spécifique</p>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              {DETAIL_FILTERS.map((f) => {
                const isActive = statusFilter === f.key
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setStatusFilter(isActive ? 'non_traites' : f.key)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold border transition-all duration-150 ${
                      isActive
                        ? f.color + ' shadow-sm'
                        : 'border-border/60 text-muted-foreground bg-background hover:border-brand-200 hover:text-brand-700 hover:bg-brand-50/40'
                    }`}
                  >
                    {f.label}
                    {isActive && <X className="inline h-2.5 w-2.5 ml-1.5 opacity-70" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 mx-4 my-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void load()}>Réessayer</Button>
          </div>
        )}

        {loading ? (
          <ListSkeleton />
        ) : patients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Aucun patient trouvé"
            description={
              search
                ? `Aucun résultat pour « ${search} »`
                : statusFilter === 'abstention'
                  ? 'Aucun dossier classé en abstention'
                  : statusFilter === 'non_traites'
                    ? 'Aucun dossier à traiter pour le moment'
                    : isGestionnaire
                      ? 'Modifiez le filtre pour afficher d’autres dossiers'
                      : 'Modifiez le filtre ou ajoutez un nouveau patient'
            }
            actionLabel={!isGestionnaire && !search ? 'Nouveau patient' : 'Voir les non traités'}
            onAction={() => {
              if (!isGestionnaire && !search && statusFilter === 'all') navigate('/medecin/patients/nouveau')
              else { setSearch(''); setStatusFilter('non_traites') }
            }}
          />
        ) : (
          <div className="divide-y divide-border/50">
            {patients.map((p, idx) => {
              const isUrgent = isGestionnaire
                ? ['nouveau', 'formulaire_en_cours', 'formulaire_complete', 'en_analyse', 'rapport_genere', 'devis_preparation'].includes(p.status)
                : p.status === 'formulaire_complete' || p.status === 'en_analyse'
              const isAbstention = p.status === 'abstention'
              const avatarCls  = AVATAR_COLOR[p.status] ?? 'bg-brand-100 text-brand-700'
              const srcKey = (p.sourceContact ?? '').toLowerCase()
              const source = p.sourceContact
                ? (SOURCE_STYLES[srcKey] ?? {
                    label: formatSourceConnaissanceLabel(p.sourceContact),
                    color: 'bg-muted text-muted-foreground border border-border',
                  })
                : null

              return (
                <div
                  key={p.id}
                  className={`group flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4 cursor-pointer transition-all duration-150
                    ${isAbstention ? 'bg-slate-50/80 hover:bg-slate-100/80 opacity-90' : isUrgent ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-muted/40'}
                    ${idx === 0 ? '' : ''}`}
                  onClick={() =>
                    navigate(
                      isGestionnaire
                        ? `/gestionnaire/patients/${p.id}`
                        : `/medecin/patients/${p.id}`,
                    )
                  }
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-9 w-9 sm:h-11 sm:w-11">
                      <AvatarFallback className={`text-xs sm:text-sm font-bold ${avatarCls}`}>
                        {getInitials(p.user.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    {isUrgent && !isAbstention && (
                      <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-amber-500 border-2 border-white animate-pulse" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-semibold text-sm leading-snug truncate">{p.user.fullName}</p>
                    <p className="text-[10px] font-mono text-brand-700 bg-brand-50 border border-brand-100 px-1.5 py-0.5 rounded w-fit whitespace-nowrap">
                      {getPatientDisplayReference(p)}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusBadge kind="dossier" value={p.status} />
                      {source && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${source.color}`}>
                          {source.label}
                        </span>
                      )}
                    </div>
                    <div className="hidden sm:flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground min-w-0">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[180px]">{p.user.email}</span>
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

                  <div className="shrink-0 flex items-center gap-0.5 sm:gap-1">
                    {!isGestionnaire && (
                      <button
                        type="button"
                        className="h-10 w-10 sm:h-8 sm:w-8 flex items-center justify-center rounded-xl sm:rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Modifier"
                        onClick={(e) => { e.stopPropagation(); setEditTarget(p) }}
                      >
                        <Pencil className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                      </button>
                    )}
                    {isAbstention ? (
                      <button
                        type="button"
                        className="h-10 w-10 sm:h-8 sm:w-8 flex items-center justify-center rounded-xl sm:rounded-lg hover:bg-emerald-50 text-muted-foreground hover:text-emerald-700 transition-colors"
                        title="Réouvrir le dossier"
                        aria-label="Réouvrir le dossier"
                        onClick={(e) => {
                          e.stopPropagation()
                          setAbstentionTarget({ patient: p, mode: 'reouvrir' })
                        }}
                      >
                        <RotateCcw className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="h-10 w-10 sm:h-8 sm:w-8 flex items-center justify-center rounded-xl sm:rounded-lg hover:bg-slate-100 text-muted-foreground hover:text-slate-700 transition-colors"
                        title="Classer en abstention"
                        aria-label="Classer en abstention"
                        onClick={(e) => {
                          e.stopPropagation()
                          setAbstentionTarget({ patient: p, mode: 'classer' })
                        }}
                      >
                        <Archive className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="h-10 w-10 sm:h-8 sm:w-8 flex items-center justify-center rounded-xl sm:rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Supprimer le patient"
                      aria-label="Supprimer le patient"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(p) }}
                    >
                      <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                    </button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors hidden sm:block" />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && patients.length > 0 && (
          <div className="px-5 py-3 border-t border-border/60 bg-muted/10 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {patients.length} patient{patients.length > 1 ? 's' : ''}
              {statusFilter !== 'non_traites' ? ' · filtre actif' : ''}
            </p>
            {statusFilter !== 'non_traites' && (
              <button
                className="text-xs text-brand-600 hover:underline"
                onClick={() => setStatusFilter('non_traites')}
              >
                Voir les non traités
              </button>
            )}
          </div>
        )}
      </div>

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
          asGestionnaire={isGestionnaire}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setPatients((prev) => prev.filter((p) => p.id !== deleteTarget.id))
            setDeleteTarget(null)
            void load()
          }}
        />
      )}
      {abstentionTarget && (
        <AbstentionModal
          patient={abstentionTarget.patient}
          asGestionnaire={isGestionnaire}
          mode={abstentionTarget.mode}
          onClose={() => setAbstentionTarget(null)}
          onDone={() => {
            setAbstentionTarget(null)
            void load()
          }}
        />
      )}
    </div>
  )
}
