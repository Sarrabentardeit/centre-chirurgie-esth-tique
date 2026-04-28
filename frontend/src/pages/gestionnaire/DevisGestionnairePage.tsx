import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus, Trash2, Save, Send, CheckCircle2, FileText, AlertCircle,
  RefreshCw, Search, Eye, EyeOff, ChevronDown, ChevronRight,
  Stethoscope, ClipboardList, Scissors, Heart, ArrowLeft, X,
  User, Mail, Phone, MapPin, Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { STATUS_COLORS, STATUS_LABELS, formatCurrency, formatDate, formatDateTime, type CurrencyUnit } from '@/lib/utils'
import { useParams } from 'react-router-dom'
import {
  gestionnaireApi,
  type Devis,
  type GestionnairePatientDetail,
  type GestionnaireRapportRow,
  type PatientListItem,
} from '@/lib/api'
import { FormulairePayloadView } from '@/components/dossier/FormulairePayloadView'
import { formatSourceConnaissanceLabel } from '@/lib/sourceConnaissance'

/* ══════════════════════════════════════════════════
   TYPES & HELPERS
══════════════════════════════════════════════════ */
interface LigneDevisForm { description: string; quantite: number; prixUnitaire: number }
type TypeSejour = 'clinique' | 'hotel' | ''
type PageView = 'list' | 'detail'

const TYPE_SEJOUR_PREFIX = 'TYPE_SEJOUR:'
const DELAIS_CONVALESCENCE_PREFIX = 'DELAIS_CONVALESCENCE:'
const STATUTS_DEVIS = [
  'rapport_genere', 'devis_preparation', 'devis_envoye', 'devis_accepte',
  'date_reservee', 'logistique', 'intervention', 'post_op', 'suivi_termine',
]

function parseSejourMeta(notes: string | null | undefined) {
  const lines = (notes ?? '').split('\n')
  const typeLine = lines.find((l) => l.startsWith(TYPE_SEJOUR_PREFIX))
  const delaiLine = lines.find((l) => l.startsWith(DELAIS_CONVALESCENCE_PREFIX))
  const raw = typeLine?.replace(TYPE_SEJOUR_PREFIX, '').trim().toLowerCase()
  const typeSejour: TypeSejour = raw === 'clinique' || raw === 'hotel' ? raw : ''
  const delaisConvalescence = delaiLine?.replace(DELAIS_CONVALESCENCE_PREFIX, '').trim() ?? ''
  const noteSejour = lines
    .filter((l) => !l.startsWith(TYPE_SEJOUR_PREFIX) && !l.startsWith(DELAIS_CONVALESCENCE_PREFIX))
    .join('\n').trim()
  return { typeSejour, delaisConvalescence, noteSejour }
}

function buildSejourNotes(i: { noteSejour: string; typeSejour: TypeSejour; delaisConvalescence: string }) {
  return [
    i.typeSejour ? `${TYPE_SEJOUR_PREFIX}${i.typeSejour}` : '',
    i.delaisConvalescence.trim() ? `${DELAIS_CONVALESCENCE_PREFIX}${i.delaisConvalescence.trim()}` : '',
    i.noteSejour.trim(),
  ].filter(Boolean).join('\n')
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '?'
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase()
}

/* ══════════════════════════════════════════════════
   COMPOSANT : Section repliable (Dossier)
══════════════════════════════════════════════════ */
function Section({
  icon, title, count, children, defaultOpen = false,
}: {
  icon: React.ReactNode; title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/80 transition-colors"
      >
        <span className="text-slate-400 shrink-0">{icon}</span>
        <span className="text-sm font-semibold text-slate-800 flex-1 text-left">{title}</span>
        {count !== undefined && (
          <span className="text-xs font-medium text-slate-400 bg-slate-100 rounded-full px-2.5 py-0.5 mr-2">{count}</span>
        )}
        {open
          ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
          : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
      </button>
      {open && <div className="border-t border-slate-100 px-5 py-5">{children}</div>}
    </div>
  )
}

/* ══════════════════════════════════════════════════
   COMPOSANT : Rapport (dans dossier)
══════════════════════════════════════════════════ */
function RapportView({ r, currency }: { r: GestionnaireRapportRow; currency: CurrencyUnit }) {
  const interventions = r.interventionsRecommandees ?? []
  const examens = r.examensDemandes ?? []
  return (
    <div className="space-y-4">
      {r.diagnostic?.trim() && (
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">
            <Heart className="h-3 w-3 text-rose-400" /> Diagnostic
          </p>
          <p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-4 py-3 leading-relaxed">{r.diagnostic}</p>
        </div>
      )}
      {interventions.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">
            <Scissors className="h-3 w-3 text-indigo-400" /> Interventions recommandées
          </p>
          <div className="flex flex-wrap gap-2">
            {interventions.map((v) => (
              <span key={v} className="text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5">
                {v}
              </span>
            ))}
          </div>
        </div>
      )}
      {(r.nuitsClinique != null || r.anesthesieGenerale != null) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-cyan-700 mb-1">Nuits clinique</p>
            <p className="text-sm font-semibold text-cyan-900">
              {r.nuitsClinique != null ? `${r.nuitsClinique} nuit(s)` : 'Non précisé'}
            </p>
          </div>
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-indigo-700 mb-1">Anesthésie générale</p>
            <p className="text-sm font-semibold text-indigo-900">
              {r.anesthesieGenerale == null ? 'Non précisé' : r.anesthesieGenerale ? 'Oui' : 'Non'}
            </p>
          </div>
        </div>
      )}
      {examens.length > 0 && (
        <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3">
          <p className="text-xs font-semibold text-sky-700 mb-2">Examens médicaux demandés</p>
          <ul className="space-y-1.5">
            {examens.map((examen) => (
              <li key={examen} className="text-sm text-sky-900 flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-sky-600" />
                <span>{examen}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.valeurMedicale?.trim() && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
          <p className="text-xs font-semibold text-amber-700 mb-1">Valorisation médicale</p>
          <p className="text-sm text-amber-800 leading-relaxed">{r.valeurMedicale}</p>
        </div>
      )}
      {r.forfaitPropose != null && r.forfaitPropose > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-brand-50 border border-brand-100 px-4 py-3">
          <span className="text-sm font-medium text-brand-600">Forfait suggéré</span>
          <span className="text-xl font-bold text-brand-700">{formatCurrency(r.forfaitPropose, currency)}</span>
        </div>
      )}
      {r.notes?.trim() && (
        <p className="text-sm text-slate-400 italic bg-slate-50 rounded-xl px-4 py-3">{r.notes}</p>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════
   COMPOSANT : Modal Devis
══════════════════════════════════════════════════ */
interface DevisModalProps {
  onClose: () => void
  patientName: string
  existingDevis: Devis | null
  isEditing: boolean
  lignes: LigneDevisForm[]
  addLigne: () => void
  removeLigne: (i: number) => void
  updateLigne: (i: number, f: keyof LigneDevisForm, v: string | number) => void
  total: number
  notesSejour: string; setNotesSejour: (v: string) => void
  typeSejour: TypeSejour; setTypeSejour: (v: TypeSejour) => void
  delaisConvalescence: string; setDelaisConvalescence: (v: string) => void
  sent: boolean; savedDraft: boolean; actionLoading: boolean
  onSend: () => void; onSaveDraft: () => void
  currency: CurrencyUnit
}

function DevisModal({
  onClose, patientName, existingDevis, isEditing,
  lignes, addLigne, removeLigne, updateLigne, total,
  notesSejour, setNotesSejour, typeSejour, setTypeSejour,
  delaisConvalescence, setDelaisConvalescence,
  sent, savedDraft, actionLoading, onSend, onSaveDraft, currency,
}: DevisModalProps) {
  // Fermer sur Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

      {/* Carte modale */}
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {existingDevis?.statut === 'brouillon' || isEditing ? 'Modifier le devis' : 'Nouveau devis'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{patientName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corps scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Tableau des prestations */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Prestations</p>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 bg-slate-50 px-4 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                <div className="col-span-5">Désignation</div>
                <div className="col-span-2 text-center">Qté</div>
                <div className="col-span-2 text-right">P.U. (TND)</div>
                <div className="col-span-2 text-right">Total</div>
                <div className="col-span-1" />
              </div>
              <div className="divide-y divide-slate-100">
                {lignes.map((ligne, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1.5 px-3 py-2 items-center">
                    <Input
                      className="col-span-5 h-8 text-sm border-slate-200 focus:border-brand-400"
                      placeholder="Description de la prestation"
                      value={ligne.description}
                      onChange={(e) => updateLigne(i, 'description', e.target.value)}
                    />
                    <Input
                      className="col-span-2 h-8 text-sm text-center border-slate-200"
                      type="number" min={1} value={ligne.quantite}
                      onChange={(e) => updateLigne(i, 'quantite', parseInt(e.target.value, 10) || 1)}
                    />
                    <Input
                      className="col-span-2 h-8 text-sm text-right border-slate-200"
                      type="number" min={0} value={ligne.prixUnitaire}
                      onChange={(e) => updateLigne(i, 'prixUnitaire', parseInt(e.target.value, 10) || 0)}
                    />
                    <div className="col-span-2 text-right text-xs font-semibold text-slate-600 pr-1">
                      {formatCurrency(ligne.quantite * ligne.prixUnitaire, currency)}
                    </div>
                    <button
                      type="button" onClick={() => removeLigne(i)}
                      className="col-span-1 flex justify-center text-slate-300 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between px-4 py-3 bg-slate-900">
                <span className="text-xs font-semibold text-slate-400">TOTAL ESTIMATIF</span>
                <span className="text-base font-bold text-white">{formatCurrency(total, currency)}</span>
              </div>
            </div>

            <button
              type="button" onClick={addLigne}
              className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Ajouter une ligne
            </button>
          </div>

          {/* Informations séjour */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Informations séjour</p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {(['clinique', 'hotel'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeSejour(typeSejour === t ? '' : t)}
                    className={`h-10 rounded-xl border text-sm font-semibold transition-all ${
                      typeSejour === t
                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {t === 'clinique' ? '🏥 Séjour clinique' : '🏨 Hôtel'}
                  </button>
                ))}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">Délais de convalescence</label>
                <Input
                  className="h-9 text-sm border-slate-200"
                  placeholder="Ex : 10 à 14 jours de repos"
                  value={delaisConvalescence}
                  onChange={(e) => setDelaisConvalescence(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">Notes séjour</label>
                <Textarea
                  rows={3}
                  className="text-sm resize-none border-slate-200"
                  placeholder="Organisation du séjour, transport, accompagnement..."
                  value={notesSejour}
                  onChange={(e) => setNotesSejour(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer avec actions */}
        <div className="shrink-0 border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row gap-2.5 bg-slate-50/60">
          <Button
            variant="brand"
            className="flex-1 h-10 gap-2 font-semibold"
            onClick={onSend}
            disabled={actionLoading}
          >
            {sent
              ? <><CheckCircle2 className="h-4 w-4" /> Devis envoyé !</>
              : <><Send className="h-4 w-4" /> Valider et envoyer au patient</>}
          </Button>
          <Button
            variant="outline"
            className="sm:w-auto h-10 gap-2 border-slate-200"
            onClick={onSaveDraft}
            disabled={actionLoading}
          >
            <Save className="h-4 w-4 text-slate-400" />
            {savedDraft ? 'Sauvegardé !' : 'Brouillon'}
          </Button>
          <Button variant="ghost" className="sm:w-auto h-10 text-slate-500" onClick={onClose}>
            Annuler
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════
   PAGE PRINCIPALE
══════════════════════════════════════════════════ */
export default function DevisGestionnairePage() {
  const { id: patientIdFromUrl } = useParams<{ id?: string }>()
  const currency: CurrencyUnit = 'TND'

  /* State global */
  const [patients, setPatients]           = useState<PatientListItem[]>([])
  const [listLoading, setListLoading]     = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [pageError, setPageError]         = useState<string | null>(null)
  const [search, setSearch]               = useState('')
  const [view, setView]                   = useState<PageView>('list')
  const [selectedPatient, setSelectedPatient] = useState('')
  const [patientDetail, setPatientDetail] = useState<GestionnairePatientDetail | null>(null)
  const [showModal, setShowModal]         = useState(false)

  /* State devis form */
  const [lignes, setLignes]                   = useState<LigneDevisForm[]>([{ description: '', quantite: 1, prixUnitaire: 0 }])
  const [notesSejour, setNotesSejour]         = useState('')
  const [typeSejour, setTypeSejour]           = useState<TypeSejour>('')
  const [delaisConvalescence, setDelaisConvalescence] = useState('')
  const [isEditingExisting, setIsEditingExisting] = useState(false)
  const [sent, setSent]                       = useState(false)
  const [savedDraft, setSavedDraft]           = useState(false)
  const [actionLoading, setActionLoading]     = useState(false)

  const patientsFiltered = useMemo(() => {
    const all = patients.filter((p) => STATUTS_DEVIS.includes(p.status))
    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter((p) =>
      p.user.fullName.toLowerCase().includes(q) || p.dossierNumber.toLowerCase().includes(q)
    )
  }, [patients, search])

  const loadPatients = useCallback(async () => {
    setListLoading(true); setPageError(null)
    try { const r = await gestionnaireApi.getPatients(); setPatients(r.patients) }
    catch (e) { setPageError(e instanceof Error ? e.message : 'Impossible de charger.') }
    finally { setListLoading(false) }
  }, [])

  const loadPatientDetail = useCallback(async (id: string) => {
    if (!id) return
    setDetailLoading(true); setPageError(null)
    try { const r = await gestionnaireApi.getPatient(id); setPatientDetail(r.patient) }
    catch (e) { setPatientDetail(null); setPageError(e instanceof Error ? e.message : 'Erreur.') }
    finally { setDetailLoading(false) }
  }, [])

  useEffect(() => { void loadPatients() }, [loadPatients])

  useEffect(() => {
    if (patientIdFromUrl) {
      setSelectedPatient(patientIdFromUrl)
      setView('detail')
    }
  }, [patientIdFromUrl])

  const openDetail = (id: string) => {
    setSelectedPatient(id); setView('detail')
    setIsEditingExisting(false); setSent(false); setSavedDraft(false)
  }

  const goBackToList = () => {
    setView('list'); setSelectedPatient(''); setPatientDetail(null); setShowModal(false)
  }

  useEffect(() => {
    if (view === 'detail' && selectedPatient) void loadPatientDetail(selectedPatient)
  }, [view, selectedPatient, loadPatientDetail])

  const existingDevis: Devis | null = useMemo(() => {
    const list = patientDetail?.devis ?? []
    return (
      list.find((d) => d.statut === 'brouillon') ??
      list.find((d) => d.statut === 'envoye' || d.statut === 'accepte') ??
      null
    )
  }, [patientDetail])

  const rapportsList = patientDetail?.rapports ?? []
  const patientRow   = patients.find((p) => p.id === selectedPatient)
  const total        = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)

  const openModal = (editing = false) => {
    if (editing && existingDevis) {
      setLignes(existingDevis.lignes.map((l) => ({ description: l.description, quantite: l.quantite, prixUnitaire: l.prixUnitaire })))
      const p = parseSejourMeta(existingDevis.notesSejour ?? existingDevis.planningMedical ?? '')
      setNotesSejour(p.noteSejour); setTypeSejour(p.typeSejour); setDelaisConvalescence(p.delaisConvalescence)
      setIsEditingExisting(true)
    } else {
      setLignes([{ description: '', quantite: 1, prixUnitaire: 0 }])
      setNotesSejour(''); setTypeSejour(''); setDelaisConvalescence('')
      setIsEditingExisting(false)
    }
    setSent(false); setSavedDraft(false)
    setShowModal(true)
  }

  const buildPayload = () => {
    const ls = lignes.map((l) => ({ ...l, total: l.quantite * l.prixUnitaire }))
    return {
      dateValidite: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      lignes: ls, total: ls.reduce((s, x) => s + x.total, 0),
      planningMedical: null,
      notesSejour: buildSejourNotes({ noteSejour: notesSejour, typeSejour, delaisConvalescence }) || null,
      currency,
    }
  }

  const handleSaveDraft = async () => {
    if (!selectedPatient) return
    setActionLoading(true); setPageError(null)
    try {
      await gestionnaireApi.upsertDevisDraft(selectedPatient, buildPayload())
      setSavedDraft(true); setTimeout(() => setSavedDraft(false), 2000)
      await loadPatientDetail(selectedPatient); await loadPatients()
    } catch (e) { setPageError(e instanceof Error ? e.message : 'Erreur.') }
    finally { setActionLoading(false) }
  }

  const handleSend = async () => {
    if (!selectedPatient) return
    setActionLoading(true); setPageError(null)
    try {
      const r = await gestionnaireApi.upsertDevisDraft(selectedPatient, buildPayload())
      await gestionnaireApi.sendDevis(r.devis.id)
      setSent(true); setTimeout(() => { setSent(false); setShowModal(false) }, 2000)
      setIsEditingExisting(false)
      await loadPatientDetail(selectedPatient); await loadPatients()
    } catch (e) { setPageError(e instanceof Error ? e.message : 'Erreur.') }
    finally { setActionLoading(false) }
  }

  const handleRefuse = async () => {
    if (!existingDevis) return
    const reason = window.prompt('Motif de refus (optionnel)') ?? ''
    setActionLoading(true); setPageError(null)
    try {
      await gestionnaireApi.refuseDevis(existingDevis.id, { reason: reason.trim() || undefined })
      await loadPatientDetail(selectedPatient); await loadPatients()
    } catch (e) { setPageError(e instanceof Error ? e.message : 'Erreur.') }
    finally { setActionLoading(false) }
  }

  /* ══════ RENDER : Vue liste ══════ */
  const renderList = () => (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8">

        {/* Barre de recherche */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              className="w-full pl-9 pr-4 h-10 text-sm rounded-xl border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition shadow-sm"
              placeholder="Rechercher un patient ou dossier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="text-sm text-slate-400 font-medium shrink-0">
            {patientsFiltered.length} patient{patientsFiltered.length > 1 ? 's' : ''}
          </span>
        </div>

        {/* Skeleton loading */}
        {listLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, k) => (
              <div key={k} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
                <Skeleton className="h-11 w-11 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48 rounded" />
                  <Skeleton className="h-3 w-32 rounded" />
                </div>
                <Skeleton className="h-7 w-24 rounded-full" />
                <Skeleton className="h-7 w-28 rounded-full" />
              </div>
            ))}
          </div>
        )}

        {/* Vide */}
        {!listLoading && patientsFiltered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
              <FileText className="h-7 w-7 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-500">Aucun patient trouvé</p>
            <p className="text-xs text-slate-400 max-w-xs">
              Les patients apparaissent ici une fois leur rapport médical généré.
            </p>
          </div>
        )}

        {/* Liste */}
        {!listLoading && patientsFiltered.length > 0 && (
          <div className="space-y-2.5">
            {patientsFiltered.map((p) => {
              const lastDevis = p.devis[0]
              const devisStatut = lastDevis?.statut
              const hasDevis = !!devisStatut
              const isRead    = !!lastDevis?.vuParPatientAt

              /* Config badge devis */
              const devisConfig = {
                accepte:  { label: 'Accepté',  cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
                refuse:   { label: 'Refusé',   cls: 'bg-red-100 text-red-600 border-red-200',             dot: 'bg-red-500'     },
                envoye:   { label: 'Envoyé',   cls: 'bg-blue-100 text-blue-700 border-blue-200',           dot: 'bg-blue-500'    },
                brouillon:{ label: 'Brouillon', cls: 'bg-amber-100 text-amber-700 border-amber-200',       dot: 'bg-amber-400'   },
              }[devisStatut ?? ''] ?? { label: 'Pas de devis', cls: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-300' }

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openDetail(p.id)}
                  className="w-full bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all text-left px-5 py-4 flex items-center gap-4 group"
                >
                  {/* Avatar */}
                  <Avatar className="h-11 w-11 shrink-0">
                    <AvatarFallback className="bg-brand-50 text-brand-700 font-bold text-sm">
                      {initials(p.user.fullName)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Info principale */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-900">{p.user.fullName}</p>
                      <span className="text-xs font-mono text-slate-400">{p.dossierNumber}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge className={`text-[10px] font-medium ${STATUS_COLORS[p.status as keyof typeof STATUS_COLORS] ?? ''}`}>
                        {STATUS_LABELS[p.status as keyof typeof STATUS_LABELS] ?? p.status}
                      </Badge>
                      {p.user.email && <span className="text-xs text-slate-400 hidden sm:inline">{p.user.email}</span>}
                    </div>
                  </div>

                  {/* Bloc devis — statut + indicateurs lecture/décision */}
                  <div className="hidden sm:flex flex-col items-end gap-1.5 shrink-0 min-w-[200px]">

                    {/* Badge statut */}
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${devisConfig.dot}`} />
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${devisConfig.cls}`}>
                        {devisConfig.label}
                        {lastDevis?.dateCreation && hasDevis && (
                          <span className="font-normal ml-1 opacity-70">
                            · {formatDate(lastDevis.dateCreation)}
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Indicateur lecture :
                        - envoye  → affiche "Lu le…" ou "Non consulté"
                        - accepte/refuse → affiche "Lu le…" seulement si vuParPatientAt est renseigné
                          (un devis accepté/refusé a forcément été vu, mais l'horodatage peut manquer
                           pour les dossiers antérieurs à la fonctionnalité) */}
                    {devisStatut === 'envoye' && (
                      <span className={`flex items-center gap-1 text-[11px] font-medium ${isRead ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {isRead
                          ? <><Eye className="h-3 w-3" /> Lu le {formatDateTime(lastDevis!.vuParPatientAt!)}</>
                          : <><EyeOff className="h-3 w-3" /> Non consulté</>}
                      </span>
                    )}
                    {(devisStatut === 'accepte' || devisStatut === 'refuse') && isRead && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                        <Eye className="h-3 w-3" /> Lu le {formatDateTime(lastDevis!.vuParPatientAt!)}
                      </span>
                    )}

                    {/* Indicateur décision (accepté / refusé avec horodatage) */}
                    {devisStatut === 'accepte' && lastDevis?.updatedAt && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> Accepté le {formatDateTime(lastDevis.updatedAt)}
                      </span>
                    )}
                    {devisStatut === 'refuse' && lastDevis?.updatedAt && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-red-500">
                        <X className="h-3 w-3" /> Refusé le {formatDateTime(lastDevis.updatedAt)}
                      </span>
                    )}

                    {!hasDevis && (
                      <span className="text-[11px] text-slate-400">Créer un devis →</span>
                    )}
                  </div>

                  {/* Flèche */}
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 shrink-0 transition-colors" />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  /* ══════ RENDER : Vue dossier ══════ */
  const renderDetail = () => {
    if (!patientRow) return null

    const devisStatut = existingDevis?.statut
    const isRead = !!existingDevis?.vuParPatientAt

    const devisActionLabel =
      !existingDevis || existingDevis.statut === 'refuse'
        ? 'Créer un devis'
        : existingDevis.statut === 'brouillon'
          ? 'Modifier le brouillon'
          : 'Modifier le devis'

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header dossier */}
        <div className="shrink-0 bg-white border-b border-slate-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-8 py-4">
            {/* Navigation */}
            <button
              onClick={goBackToList}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-700 transition-colors mb-4"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Retour à la liste
            </button>

            {/* Identité + actions */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 shrink-0">
                  <AvatarFallback className="bg-brand-100 text-brand-700 text-lg font-bold">
                    {initials(patientRow.user.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{patientRow.user.fullName}</h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-sm font-mono text-slate-400">{patientRow.dossierNumber}</span>
                    <Badge className={`text-xs font-medium ${STATUS_COLORS[patientRow.status as keyof typeof STATUS_COLORS] ?? ''}`}>
                      {STATUS_LABELS[patientRow.status as keyof typeof STATUS_LABELS] ?? patientRow.status}
                    </Badge>
                    {patientRow.user.email && (
                      <span className="text-sm text-slate-400 hidden sm:inline">{patientRow.user.email}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* CTA Devis */}
              <div className="flex flex-col items-end gap-2 shrink-0">
                <Button
                  variant="brand"
                  className="gap-2 px-5 h-10 text-sm font-semibold"
                  onClick={() => openModal(!!existingDevis && existingDevis.statut !== 'refuse')}
                  disabled={detailLoading}
                >
                  <FileText className="h-4 w-4" />
                  {devisActionLabel}
                </Button>

                {/* Statut lecture — "Non consulté" uniquement si envoyé et pas encore ouvert */}
                {devisStatut === 'envoye' && (
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${isRead ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {isRead
                      ? <><Eye className="h-3.5 w-3.5" /> Vu le {formatDateTime(existingDevis!.vuParPatientAt!)}</>
                      : <><EyeOff className="h-3.5 w-3.5" /> Pas encore consulté</>}
                  </div>
                )}
                {devisStatut === 'accepte' && (
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Accepté par le patient
                    </span>
                    {isRead && (
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Eye className="h-3 w-3" /> Lu le {formatDateTime(existingDevis!.vuParPatientAt!)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Contenu scrollable */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 space-y-4 pb-12">

            {detailLoading && (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full rounded-2xl" />
                <Skeleton className="h-14 w-full rounded-2xl" />
                <Skeleton className="h-14 w-full rounded-2xl" />
                <Skeleton className="h-14 w-full rounded-2xl" />
              </div>
            )}

            {!detailLoading && (
              <>
                {/* Identité */}
                <Section icon={<User className="h-4 w-4" />} title="Identité & coordonnées" defaultOpen>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                    {([
                      [<User key="u" className="h-3.5 w-3.5" />, 'Nom complet', patientDetail?.user.fullName],
                      [<Mail key="m" className="h-3.5 w-3.5" />, 'Email', patientDetail?.user.email],
                      [<Phone key="p" className="h-3.5 w-3.5" />, 'Téléphone', patientDetail?.phone],
                      [<MapPin key="mp" className="h-3.5 w-3.5" />, 'Ville / Pays', [patientDetail?.ville, patientDetail?.pays].filter(Boolean).join(', ') || null],
                      [<User key="n" className="h-3.5 w-3.5" />, 'Nationalité', patientDetail?.nationalite],
                      [<User key="s" className="h-3.5 w-3.5" />, 'Source', patientDetail?.sourceContact ? formatSourceConnaissanceLabel(patientDetail.sourceContact) : null],
                      [<Calendar key="c" className="h-3.5 w-3.5" />, 'Compte créé le', patientDetail?.user.createdAt ? formatDate(patientDetail.user.createdAt) : null],
                    ] as [React.ReactNode, string, string | null | undefined][]).map(([icon, label, value]) => (
                      <div key={label} className="flex items-start gap-2.5">
                        <span className="text-slate-300 mt-0.5 shrink-0">{icon}</span>
                        <div>
                          <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">{label}</p>
                          <p className="text-sm font-medium text-slate-800 mt-0.5">{value || <span className="text-slate-300">—</span>}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>

                {/* Formulaires */}
                <Section
                  icon={<ClipboardList className="h-4 w-4" />}
                  title="Formulaires médicaux"
                  count={patientDetail?.formulaires.length ?? 0}
                  defaultOpen
                >
                  {!patientDetail?.formulaires.length ? (
                    <p className="text-sm text-slate-400 text-center py-4">Aucun formulaire soumis.</p>
                  ) : (
                    <div className="space-y-6">
                      {patientDetail.formulaires.map((f, idx) => (
                        <div key={f.id}>
                          {idx > 0 && <hr className="border-slate-100 mb-6" />}
                          <div className="flex items-center gap-3 mb-4">
                            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${f.status === 'submitted' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                            <p className="text-sm font-semibold text-slate-700">
                              Formulaire {idx + 1}
                              <span className="font-normal text-slate-400 ml-2">· {formatDate(f.createdAt)}</span>
                            </p>
                            <span className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-full ${
                              f.status === 'submitted' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                              {f.status === 'submitted' ? 'Soumis' : 'Brouillon'}
                            </span>
                          </div>
                          <FormulairePayloadView
                            status={f.status}
                            submittedAt={f.submittedAt}
                            createdAt={f.createdAt}
                            payload={(f.payload ?? {}) as Record<string, unknown>}
                            showStatusBanner={false}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* Rapports */}
                <Section
                  icon={<Stethoscope className="h-4 w-4" />}
                  title="Rapports médicaux"
                  count={rapportsList.length}
                  defaultOpen
                >
                  {!rapportsList.length ? (
                    <p className="text-sm text-slate-400 text-center py-4">Aucun rapport disponible.</p>
                  ) : (
                    <div className="space-y-6">
                      {rapportsList.map((r, idx) => (
                        <div key={r.id}>
                          {idx > 0 && <hr className="border-slate-100 mb-6" />}
                          <p className="text-sm font-semibold text-slate-600 mb-4">
                            Rapport du {formatDate(r.createdAt)}
                          </p>
                          <RapportView r={r} currency={currency} />
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* Historique devis */}
                <Section
                  icon={<FileText className="h-4 w-4" />}
                  title="Historique des devis"
                  count={patientDetail?.devis.length ?? 0}
                  defaultOpen
                >
                  {!patientDetail?.devis.length ? (
                    <p className="text-sm text-slate-400 text-center py-4">Aucun devis créé.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {patientDetail.devis.map((d) => {
                        const sc = {
                          accepte:   { label: 'Accepté',  cls: 'bg-emerald-100 text-emerald-700' },
                          refuse:    { label: 'Refusé',   cls: 'bg-red-100 text-red-600' },
                          envoye:    { label: 'Envoyé',   cls: 'bg-blue-100 text-blue-700' },
                          brouillon: { label: 'Brouillon',cls: 'bg-slate-100 text-slate-600' },
                        }[d.statut] ?? { label: d.statut, cls: 'bg-slate-100 text-slate-600' }
                        return (
                          <div key={d.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${sc.cls}`}>{sc.label}</span>
                            <span className="text-slate-400 text-xs">Version {d.version}</span>
                            <span className="font-bold text-slate-800 ml-auto">{formatCurrency(d.total, currency)}</span>
                            <span className="text-xs text-slate-400">{formatDate(d.dateCreation)}</span>
                            {d.statut === 'envoye' && (
                              <span className={`flex items-center gap-1.5 text-xs font-medium ${d.vuParPatientAt ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {d.vuParPatientAt
                                  ? <><Eye className="h-3.5 w-3.5" /> Vu le {formatDate(d.vuParPatientAt)}</>
                                  : <><EyeOff className="h-3.5 w-3.5" /> Non consulté</>}
                              </span>
                            )}
                            {d.statut === 'envoye' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-red-500 hover:bg-red-50 h-7 px-2.5"
                                onClick={() => void handleRefuse()}
                                disabled={actionLoading}
                              >
                                Marquer refusé
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Section>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  /* ══════ RENDER PRINCIPAL ══════ */
  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col -mx-4 -mt-2 sm:-mx-6 sm:-mt-4 bg-slate-50">

      {/* Barre haute */}
      <div className="shrink-0 flex items-center justify-between px-4 sm:px-8 py-3 bg-white border-b border-slate-200">
        <h1 className="text-sm font-bold text-slate-900">
          {view === 'list' ? 'Gestion des devis' : 'Dossier patient'}
        </h1>
        <button
          onClick={() => { void loadPatients(); if (view === 'detail' && selectedPatient) void loadPatientDetail(selectedPatient) }}
          disabled={listLoading || detailLoading}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${(listLoading || detailLoading) ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Actualiser</span>
        </button>
      </div>

      {pageError && (
        <div className="shrink-0 mx-4 sm:mx-8 mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {pageError}
        </div>
      )}

      {view === 'list' ? renderList() : renderDetail()}

      {/* Modal devis */}
      {showModal && patientRow && (
        <DevisModal
          onClose={() => setShowModal(false)}
          patientName={patientRow.user.fullName}
          existingDevis={existingDevis}
          isEditing={isEditingExisting}
          lignes={lignes}
          addLigne={() => setLignes((p) => [...p, { description: '', quantite: 1, prixUnitaire: 0 }])}
          removeLigne={(i) => setLignes((p) => p.filter((_, idx) => idx !== i))}
          updateLigne={(i, f, v) => setLignes((p) => p.map((l, idx) => (idx === i ? { ...l, [f]: v } : l)))}
          total={total}
          notesSejour={notesSejour} setNotesSejour={setNotesSejour}
          typeSejour={typeSejour} setTypeSejour={setTypeSejour}
          delaisConvalescence={delaisConvalescence} setDelaisConvalescence={setDelaisConvalescence}
          sent={sent} savedDraft={savedDraft} actionLoading={actionLoading}
          onSend={() => void handleSend()}
          onSaveDraft={() => void handleSaveDraft()}
          currency={currency}
        />
      )}
    </div>
  )
}
