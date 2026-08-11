import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import {
  Plus, Trash2, Save, Send, CheckCircle2, FileText, AlertCircle,
  RefreshCw, Search, Eye, EyeOff, ChevronDown, ChevronRight,
  Stethoscope, ClipboardList, Scissors, Heart, ArrowLeft, X, FilePenLine,
  User, Mail, Phone, MapPin, Calendar, MessageSquare, Ban,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader, KpiStrip } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/lib/statusUi'
import { toast } from '@/store/toastStore'
import { formatCurrency, formatDate, formatDateTime, formatDevisListName, type CurrencyUnit } from '@/lib/utils'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { formatEuroApprox, DEFAULT_TND_PER_EUR } from '@/lib/moneyWords'
import { DEVIS_CHARTE } from '@/lib/devisCharte'
import {
  gestionnaireApi,
  chatApi,
  ApiRequestError,
  type Devis,
  type GestionnairePatientDetail,
  type GestionnaireRapportRow,
  type TndEurRateResponse,
  type PatientListItem,
} from '@/lib/api'
import { FormulairePayloadView } from '@/components/dossier/FormulairePayloadView'
import { formatSourceConnaissanceLabel } from '@/lib/sourceConnaissance'
import {
  buildSejourNotes,
  cliniqueNomFromChoice,
  hotelNomFromChoice,
  parseSejourMeta,
  resolveCliniqueFromNom,
  resolveHotelFromNom,
  devisSejourDefaultsFromRapport,
  joursSejourFromNuits,
} from '@/lib/devisSejourNotes'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ConfirmDialog'

/* ══════════════════════════════════════════════════
   TYPES & HELPERS
══════════════════════════════════════════════════ */
interface LigneDevisForm { description: string; quantite: number; prixUnitaire: number }
type PageView = 'list' | 'detail'

const PRESTATIONS_PAR_DEFAUT = [
  'Honoraires Chirurgiens et clinique (nbr de nuitées)',
  'Supp Clinique accompagnateur',
  'Transferts',
  'Hôtel (nbr de nuitées)',
  'Supp Hôtel Accompagnateur',
  'Vêtement de contention (à préciser)',
  'Drainage (nbr de séances)',
  'Soins infirmiers (nbr de passages)',
  'Medicaments',
  'Frais de dossier',
  'Divers et imprévus',
] as const

/** Float DB / JSON (ex. 4999.999999999999) → dinars entiers affichés correctement. */
function normalizeTndDinars(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(Number(n.toFixed(2)))
}

/** P.U. de la 1re ligne = forfait proposé par le médecin (rapport), si disponible. */
function buildDefaultLignes(honorairesChirCliniquePu?: number): LigneDevisForm[] {
  const pu0 =
    typeof honorairesChirCliniquePu === 'number' &&
    Number.isFinite(honorairesChirCliniquePu) &&
    honorairesChirCliniquePu > 0
      ? normalizeTndDinars(honorairesChirCliniquePu)
      : 0
  return PRESTATIONS_PAR_DEFAUT.map((description, i) => ({
    description,
    quantite: 1,
    prixUnitaire: i === 0 ? pu0 : 0,
  }))
}

const STATUTS_DEVIS = [
  'rapport_genere', 'devis_preparation', 'devis_envoye', 'devis_accepte',
  'date_reservee', 'logistique', 'intervention', 'post_op', 'suivi_termine',
]

/** Message d’abstention prérempli (modifiable avant envoi chat). */
const ABSTENTION_MESSAGE_TEMPLATE = `Chère Madame,
Merci encore pour votre intérêt et la confiance que vous témoignez envers le cabinet du Dr CHENNOUFI.
Après un examen attentif de vos photos et de votre dossier médical, nous sommes au regret de vous informer que le Dr CHENNOUFI a pris la décision de ne pas intervenir dans votre cas.
Cette décision relève d’une démarche éthique et professionnelle, guidée par son exigence de sécurité, de résultats cohérents et d’adéquation avec sa pratique chirurgicale.
Nous vous remercions de votre compréhension et vous souhaitons le meilleur dans la poursuite de votre démarche.
Je vous souhaite une excellente journée.
Bien cordialement,
Houda Chennoufi
Conciergerie & coordination patients
Cabinet du Dr Mehdi Chennoufi
Chirurgie Esthétique, Plastique et Réparatrice
SCULPTURE, SMOOTH & SMILE`

/** Aligné sur `assertPatientReadyForDevis` (backend). */
const DEVIS_READY_STATUSES = [
  'rapport_genere',
  'devis_preparation',
  'devis_envoye',
  'devis_accepte',
] as const

function canPatientHaveDevis(status: string): boolean {
  return (DEVIS_READY_STATUSES as readonly string[]).includes(status)
}

function apiErrorMessage(e: unknown): string {
  if (e instanceof ApiRequestError) {
    if (e.code === 'PATIENT_NOT_READY') return e.message
    if (e.issues) {
      const parts = Object.entries(e.issues).flatMap(([field, msgs]) =>
        msgs.map((m) => `${field}: ${m}`),
      )
      if (parts.length) return parts.join(' · ')
    }
    return e.message
  }
  return e instanceof Error ? e.message : 'Erreur.'
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
      {(r.nuitsClinique != null || r.nuitsPreoperatoires != null || r.nuitsHotel != null || r.vetementContention != null || r.anesthesieGenerale != null || r.dureeSejourTunisie != null || r.nbAdultesSejour != null) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-cyan-700 mb-1">Nuits préopératoires</p>
            <p className="text-sm font-semibold text-cyan-900">
              {r.nuitsPreoperatoires != null ? `${r.nuitsPreoperatoires} nuit(s)` : 'Non précisé'}
            </p>
          </div>
          <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-cyan-700 mb-1">Nuits postopératoires</p>
            <p className="text-sm font-semibold text-cyan-900">
              {r.nuitsClinique != null ? `${r.nuitsClinique} nuit(s)` : 'Non précisé'}
            </p>
          </div>
          <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-cyan-700 mb-1">Nuits hôtel</p>
            <p className="text-sm font-semibold text-cyan-900">
              {r.nuitsHotel != null ? `${r.nuitsHotel} nuit(s)` : 'Non précisé'}
            </p>
          </div>
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-indigo-700 mb-1">Anesthésie générale</p>
            <p className="text-sm font-semibold text-indigo-900">
              {r.anesthesieGenerale ? 'Oui' : 'Non'}
            </p>
          </div>
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-indigo-700 mb-1">Vêtement de contention</p>
            <p className="text-sm font-semibold text-indigo-900">
              {r.vetementContention == null ? 'Non précisé' : r.vetementContention ? 'Oui' : 'Non'}
            </p>
          </div>
          {r.dureeSejourTunisie != null && (
            <div className="rounded-lg border border-teal-100 bg-teal-50/70 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide font-semibold text-teal-700 mb-1">Séjour global Tunisie</p>
              <p className="text-sm font-semibold text-teal-900">
                {r.dureeSejourTunisie} jour(s)
              </p>
            </div>
          )}
          {(r.nbAdultesSejour != null || r.nbEnfantsSejour != null) && (
            <div className="rounded-lg border border-violet-100 bg-violet-50/70 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide font-semibold text-violet-700 mb-1">Accompagnants</p>
              <p className="text-sm font-semibold text-violet-900">
                {r.nbAdultesSejour ?? '—'} adulte(s) · {r.nbEnfantsSejour ?? 0} enfant(s)
              </p>
            </div>
          )}
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
  cliniqueChoice: string; setCliniqueChoice: (v: string) => void
  cliniqueAutre: string; setCliniqueAutre: (v: string) => void
  cliniqueNuits: string; setCliniqueNuits: (v: string) => void
  hotelChoice: string; setHotelChoice: (v: string) => void
  hotelAutre: string; setHotelAutre: (v: string) => void
  hotelNuits: string; setHotelNuits: (v: string) => void
  nbAdultes: string; setNbAdultes: (v: string) => void
  nbEnfants: string; setNbEnfants: (v: string) => void
  dureeSejourTotale: string; setDureeSejourTotale: (v: string) => void
  notesSejour: string; setNotesSejour: (v: string) => void
  sent: boolean; savedDraft: boolean; actionLoading: boolean
  onSend: () => void; onSaveDraft: () => void
  onDelete: () => void
  canDelete: boolean
  onCustomize: () => void
  currency: CurrencyUnit
  tauxEur: TndEurRateResponse | null
}

function DevisModal({
  onClose, patientName, existingDevis, isEditing,
  lignes, addLigne, removeLigne, updateLigne, total,
  cliniqueChoice, setCliniqueChoice, cliniqueAutre, setCliniqueAutre,
  cliniqueNuits, setCliniqueNuits,
  hotelChoice, setHotelChoice, hotelAutre, setHotelAutre,
  hotelNuits, setHotelNuits,
  nbAdultes, setNbAdultes,
  nbEnfants, setNbEnfants,
  dureeSejourTotale,
  notesSejour, setNotesSejour,
  sent, savedDraft, actionLoading, onSend, onSaveDraft, onDelete, canDelete, onCustomize, currency,
  tauxEur,
}: DevisModalProps) {
  const tndPerEur = tauxEur?.tndPerEur ?? DEFAULT_TND_PER_EUR
  const euroLabel = formatEuroApprox(total, tndPerEur)
  // Fermer sur Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

      {/* Carte modale */}
      <div className="relative z-10 w-full max-w-5xl max-h-[min(94dvh,94vh)] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 shrink-0">
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
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-6">

          {/* Tableau des prestations */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Prestations</p>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="hidden sm:grid grid-cols-12 bg-slate-50 px-4 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                <div className="col-span-5">Désignation</div>
                <div className="col-span-2 text-center">Qté</div>
                <div className="col-span-2 text-right">P.U. (TND)</div>
                <div className="col-span-2 text-right">Total</div>
                <div className="col-span-1" />
              </div>
              <div className="divide-y divide-slate-100">
                {lignes.map((ligne, i) => (
                  <div key={i} className="flex flex-col gap-2 p-3 sm:grid sm:grid-cols-12 sm:gap-1.5 sm:items-center">
                    <Input
                      className="sm:col-span-5 h-10 sm:h-8 text-sm border-slate-200 focus:border-brand-400"
                      placeholder="Description de la prestation"
                      value={ligne.description}
                      onChange={(e) => updateLigne(i, 'description', e.target.value)}
                    />
                    <div className="grid grid-cols-3 gap-2 sm:contents">
                      <div className="sm:col-span-2">
                        <label className="text-[10px] text-slate-400 sm:hidden mb-0.5 block">Qté</label>
                        <Input
                          className="h-10 sm:h-8 text-sm text-center border-slate-200"
                          type="number" min={1} value={ligne.quantite}
                          onChange={(e) => updateLigne(i, 'quantite', parseInt(e.target.value, 10) || 1)}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[10px] text-slate-400 sm:hidden mb-0.5 block">P.U.</label>
                        <Input
                          className="h-10 sm:h-8 text-sm text-right border-slate-200"
                          type="number" min={0} step={1} value={ligne.prixUnitaire}
                          onChange={(e) => {
                            const raw = e.target.value
                            const v = raw === '' ? 0 : Number.parseFloat(raw)
                            updateLigne(
                              i,
                              'prixUnitaire',
                              Number.isFinite(v) ? normalizeTndDinars(v) : 0
                            )
                          }}
                        />
                      </div>
                      <div className="sm:col-span-2 flex flex-col justify-center text-right">
                        <label className="text-[10px] text-slate-400 sm:hidden mb-0.5 block">Total</label>
                        <span className="text-xs font-semibold text-slate-600 pr-1">
                          {formatCurrency(ligne.quantite * ligne.prixUnitaire, currency)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button" onClick={() => removeLigne(i)}
                      className="sm:col-span-1 flex justify-end sm:justify-center text-slate-300 hover:text-red-400 transition-colors min-h-10 sm:min-h-0 items-center"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="text-xs ml-1 sm:hidden">Supprimer</span>
                    </button>
                  </div>
                ))}
              </div>
              <div
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-4 py-3"
                style={{ backgroundColor: DEVIS_CHARTE.teal }}
              >
                <span className="text-xs font-semibold" style={{ color: DEVIS_CHARTE.rose }}>TOTAL ESTIMATIF</span>
                <div className="text-right">
                  <span className="text-base font-bold" style={{ color: DEVIS_CHARTE.white }}>{formatCurrency(total, currency)}</span>
                  {total > 0 && (
                    <p className="text-sm font-medium mt-0.5" style={{ color: DEVIS_CHARTE.cream }}>
                      ≈ {euroLabel}
                      <span className="font-normal text-xs ml-1.5 opacity-80" style={{ color: DEVIS_CHARTE.rose }}>
                        (taux du {tauxEur?.date ?? '…'}
                        {tauxEur?.source === 'fallback' ? ', indicatif' : ''})
                      </span>
                    </p>
                  )}
                </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">🏥 Séjour clinique</p>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Nom de la clinique</label>
                    <Select
                      value={cliniqueChoice || undefined}
                      onValueChange={(v) => {
                        setCliniqueChoice(v)
                        if (v !== 'autre') setCliniqueAutre('')
                      }}
                    >
                      <SelectTrigger className="h-9 text-sm border-slate-200 bg-white">
                        <SelectValue placeholder="Choisir une clinique" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="didon">Didon Clinic Soukra</SelectItem>
                        <SelectItem value="amen">Clinique Amen La Marsa</SelectItem>
                        <SelectItem value="autre">Autre</SelectItem>
                      </SelectContent>
                    </Select>
                    {cliniqueChoice === 'autre' && (
                      <Input
                        className="h-9 text-sm border-slate-200 bg-white mt-2"
                        placeholder="Nom de la clinique"
                        value={cliniqueAutre}
                        onChange={(e) => setCliniqueAutre(e.target.value)}
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Nombre de nuits</label>
                    <Input
                      className="h-9 text-sm border-slate-200 bg-white"
                      type="number"
                      min={0}
                      step={1}
                      placeholder="Ex. : 2"
                      value={cliniqueNuits}
                      onChange={(e) => setCliniqueNuits(e.target.value)}
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Nuits en clinique</p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">🏨 Hôtel</p>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Nom de l&apos;hôtel</label>
                    <Select
                      value={hotelChoice || undefined}
                      onValueChange={(v) => {
                        setHotelChoice(v)
                        if (v !== 'autre') setHotelAutre('')
                      }}
                    >
                      <SelectTrigger className="h-9 text-sm border-slate-200 bg-white">
                        <SelectValue placeholder="Choisir un hôtel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mouradi">Mouradi Gammarth</SelectItem>
                        <SelectItem value="darMarsa">Hotel Dar Marsa La Marsa</SelectItem>
                        <SelectItem value="autre">Autre</SelectItem>
                      </SelectContent>
                    </Select>
                    {hotelChoice === 'autre' && (
                      <Input
                        className="h-9 text-sm border-slate-200 bg-white mt-2"
                        placeholder="Nom de l'hôtel"
                        value={hotelAutre}
                        onChange={(e) => setHotelAutre(e.target.value)}
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Nombre de nuits</label>
                    <Input
                      className="h-9 text-sm border-slate-200 bg-white"
                      type="number"
                      min={0}
                      step={1}
                      placeholder="Ex. : 5"
                      value={hotelNuits}
                      onChange={(e) => setHotelNuits(e.target.value)}
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Nuits à l&apos;hôtel</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1.5">Séjour total (jours)</label>
                  <Input
                    className="h-9 text-sm border-slate-200 bg-slate-50 text-slate-800 font-semibold"
                    type="number"
                    min={0}
                    step={1}
                    readOnly
                    value={dureeSejourTotale}
                    title="Calculé automatiquement : nuits clinique + nuits hôtel"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Auto : nuits clinique + nuits hôtel</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1.5">Nombre d&apos;adultes</label>
                  <Input
                    className="h-9 text-sm border-slate-200 bg-white"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Ex. : 1"
                    value={nbAdultes}
                    onChange={(e) => setNbAdultes(e.target.value)}
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Depuis le rapport médecin.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1.5">Nbr enfants (2 – 12 ans)</label>
                  <Input
                    className="h-9 text-sm border-slate-200 bg-white"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Ex. : 0"
                    value={nbEnfants}
                    onChange={(e) => setNbEnfants(e.target.value)}
                  />
                </div>
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
        <div className="shrink-0 border-t border-slate-200 px-4 sm:px-6 py-4 flex flex-col sm:flex-row gap-2.5 bg-slate-50/60">
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
            className="sm:w-auto h-10 gap-2 border-slate-200 text-slate-700"
            onClick={onCustomize}
            disabled={actionLoading}
          >
            <FilePenLine className="h-4 w-4" />
            Personnaliser le devis
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
          {canDelete && (
            <Button
              variant="ghost"
              className="sm:w-auto h-10 gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={onDelete}
              disabled={actionLoading}
            >
              <Trash2 className="h-4 w-4" />
              Supprimer
            </Button>
          )}
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
  const navigate = useNavigate()
  const location = useLocation()
  const currency: CurrencyUnit = 'TND'

  /* State global */
  const [patients, setPatients]           = useState<PatientListItem[]>([])
  const [listLoading, setListLoading]     = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [pageError, setPageError]         = useState<string | null>(null)
  const [search, setSearch]               = useState('')
  const [devisFilter, setDevisFilter]     = useState<'all' | 'aucun' | 'brouillon' | 'envoye' | 'accepte' | 'refuse'>('all')
  const [view, setView]                   = useState<PageView>('list')
  const [selectedPatient, setSelectedPatient] = useState('')
  const [patientDetail, setPatientDetail] = useState<GestionnairePatientDetail | null>(null)
  const [showModal, setShowModal]         = useState(false)
  const [tauxEur, setTauxEur]             = useState<TndEurRateResponse | null>(null)

  /* State devis form */
  const [lignes, setLignes]                   = useState<LigneDevisForm[]>(buildDefaultLignes())
  const [cliniqueChoice, setCliniqueChoice]   = useState('')
  const [cliniqueAutre, setCliniqueAutre]     = useState('')
  const [cliniqueNuits, setCliniqueNuits]     = useState('')
  const [hotelChoice, setHotelChoice]         = useState('')
  const [hotelAutre, setHotelAutre]           = useState('')
  const [hotelNuits, setHotelNuits]           = useState('')
  const [nbAdultes, setNbAdultes]             = useState('1')
  const [nbEnfants, setNbEnfants]             = useState('0')
  const [dureeSejourTotale, setDureeSejourTotale] = useState('')
  const [notesSejour, setNotesSejour]         = useState('')
  const [isEditingExisting, setIsEditingExisting] = useState(false)
  const [sent, setSent]                       = useState(false)
  const [savedDraft, setSavedDraft]           = useState(false)
  const [actionLoading, setActionLoading]     = useState(false)
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: 'devis'; devisId: string }
    | { kind: 'dossier'; patientId: string; patientName: string }
    | null
  >(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [abstentionMsgOpen, setAbstentionMsgOpen] = useState(false)
  const [abstentionMsg, setAbstentionMsg] = useState(ABSTENTION_MESSAGE_TEMPLATE)
  const [abstentionMsgSending, setAbstentionMsgSending] = useState(false)
  const [consultVersionsOpen, setConsultVersionsOpen] = useState(false)
  const [abstentionMsgError, setAbstentionMsgError] = useState<string | null>(null)

  // Séjour total (jours) = nuits clinique + nuits hôtel
  useEffect(() => {
    setDureeSejourTotale(joursSejourFromNuits(cliniqueNuits, hotelNuits))
  }, [cliniqueNuits, hotelNuits])

  const patientsFiltered = useMemo(() => {
    const all = patients.filter((p) => STATUTS_DEVIS.includes(p.status))
    const q = search.trim().toLowerCase()
    const bySearch = !q ? all : all.filter((p) =>
      p.user.fullName.toLowerCase().includes(q) || p.dossierNumber.toLowerCase().includes(q)
    )
    if (devisFilter === 'all') return bySearch
    return bySearch.filter((p) => {
      const statut = p.devis[0]?.statut ?? null
      if (devisFilter === 'aucun') return !statut
      return statut === devisFilter
    })
  }, [patients, search, devisFilter])

  const loadTauxEur = useCallback(async () => {
    try {
      const r = await gestionnaireApi.getTauxEur()
      setTauxEur(r)
    } catch {
      setTauxEur(null)
    }
  }, [])

  useEffect(() => {
    void loadTauxEur()
  }, [loadTauxEur])

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
      return
    }
    // Retour liste (sidebar / URL / Retour) — toujours resynchroniser
    setView('list')
    setSelectedPatient('')
    setPatientDetail(null)
    setShowModal(false)
    setIsEditingExisting(false)
    setSent(false)
    setSavedDraft(false)
    // location.key : reclic sidebar sur /devis alors qu’un dossier est ouvert
  }, [patientIdFromUrl, location.key])

  const openDetail = (id: string) => {
    setSelectedPatient(id)
    setView('detail')
    setIsEditingExisting(false)
    setSent(false)
    setSavedDraft(false)
    navigate(`/gestionnaire/devis/${id}`)
  }

  const goBackToList = () => {
    setView('list')
    setSelectedPatient('')
    setPatientDetail(null)
    setShowModal(false)
    navigate('/gestionnaire/devis')
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

  const devisVersions = useMemo(() => {
    const list = [...(patientDetail?.devis ?? [])]
    return list.sort((a, b) => b.version - a.version)
  }, [patientDetail])

  const openConsultDevis = (devisId: string) => {
    if (!selectedPatient) return
    setConsultVersionsOpen(false)
    navigate(`/gestionnaire/devis/${selectedPatient}/personnaliser?devisId=${encodeURIComponent(devisId)}`)
  }

  const rapportsList = patientDetail?.rapports ?? []
  /** Liste active OU détail API (ex. abstention hors liste devis). */
  const patientRow: PatientListItem | GestionnairePatientDetail | null = useMemo(() => {
    const fromList = patients.find((p) => p.id === selectedPatient)
    if (fromList) return fromList
    if (patientDetail && (!selectedPatient || patientDetail.id === selectedPatient)) {
      return patientDetail
    }
    return null
  }, [patients, selectedPatient, patientDetail])
  const total        = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)

  const openModal = (editing = false) => {
    const status = patientRow?.status ?? patientDetail?.status
    if (!status || !canPatientHaveDevis(status)) {
      setPageError(
        'Impossible de créer un devis : le rapport médical du médecin doit d’abord être généré (statut « rapport généré » ou suivant).',
      )
      return
    }
    const formPayload = (patientDetail?.formulaires?.[0]?.payload ?? {}) as Record<string, unknown>
    const rap = patientDetail?.rapports?.[0]
    const fromRapport = devisSejourDefaultsFromRapport(rap, formPayload)

    if (editing && existingDevis) {
      setLignes(
        existingDevis.lignes.map((l) => ({
          description: l.description,
          quantite: l.quantite,
          prixUnitaire: normalizeTndDinars(l.prixUnitaire),
        }))
      )
      const p = parseSejourMeta(existingDevis.notesSejour ?? existingDevis.planningMedical ?? '')
      const clinique = resolveCliniqueFromNom(p.cliniqueNom)
      const hotel = resolveHotelFromNom(p.hotelNom)
      setCliniqueChoice(clinique.choice)
      setCliniqueAutre(clinique.autre)
      setCliniqueNuits(p.cliniqueNuits !== '' ? p.cliniqueNuits : fromRapport.cliniqueNuits)
      setHotelChoice(hotel.choice)
      setHotelAutre(hotel.autre)
      setHotelNuits(p.hotelNuits !== '' ? p.hotelNuits : fromRapport.hotelNuits)
      setNbAdultes(p.nbAdultes !== '' ? p.nbAdultes : fromRapport.nbAdultes)
      setNbEnfants(p.nbEnfants !== '' ? p.nbEnfants : fromRapport.nbEnfants)
      setDureeSejourTotale(p.dureeSejourTotale !== '' ? p.dureeSejourTotale : fromRapport.dureeSejourTotale)
      setNotesSejour(p.noteSejour)
      setIsEditingExisting(true)
    } else {
      const fp = rapportsList[0]?.forfaitPropose
      const honoraires =
        typeof fp === 'number' && Number.isFinite(fp) && fp > 0 ? fp : undefined
      setLignes(buildDefaultLignes(honoraires))
      setCliniqueChoice(''); setCliniqueAutre('')
      setCliniqueNuits(fromRapport.cliniqueNuits)
      setHotelChoice(''); setHotelAutre('')
      setHotelNuits(fromRapport.hotelNuits)
      setNbAdultes(fromRapport.nbAdultes)
      setNbEnfants(fromRapport.nbEnfants)
      setDureeSejourTotale(fromRapport.dureeSejourTotale)
      setNotesSejour('')
      setIsEditingExisting(false)
    }
    setSent(false); setSavedDraft(false)
    setShowModal(true)
  }

  const buildPayload = () => {
    const ls = lignes
      .filter((l) => l.description.trim().length > 0)
      .map((l) => ({
        description: l.description.trim(),
        quantite: Math.max(1, Math.round(l.quantite)),
        prixUnitaire: l.prixUnitaire,
        total: Math.max(1, Math.round(l.quantite)) * l.prixUnitaire,
      }))
    return {
      dateValidite: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      lignes: ls, total: ls.reduce((s, x) => s + x.total, 0),
      planningMedical: null,
      notesSejour:
        buildSejourNotes({
          cliniqueNom: cliniqueNomFromChoice(cliniqueChoice, cliniqueAutre),
          cliniqueNuits,
          hotelNom: hotelNomFromChoice(hotelChoice, hotelAutre),
          hotelNuits,
          nbAdultes,
          nbEnfants,
          dureeSejourTotale,
          noteSejour: notesSejour,
        }) || null,
      currency,
    }
  }

  const handleSaveDraft = async () => {
    if (!selectedPatient) return
    const status = patientRow?.status ?? patientDetail?.status
    if (!status || !canPatientHaveDevis(status)) {
      setPageError(
        'Impossible d’enregistrer : le rapport médical du médecin doit d’abord être généré.',
      )
      return
    }
    if (buildPayload().lignes.length === 0) {
      setPageError('Ajoutez au moins une prestation avec une désignation.')
      return
    }
    setActionLoading(true); setPageError(null)
    try {
      await gestionnaireApi.upsertDevisDraft(selectedPatient, buildPayload())
      setSavedDraft(true); setTimeout(() => setSavedDraft(false), 2000)
      await loadPatientDetail(selectedPatient); await loadPatients()
    } catch (e) { setPageError(apiErrorMessage(e)) }
    finally { setActionLoading(false) }
  }

  const handleSend = async () => {
    if (!selectedPatient) return
    const status = patientRow?.status ?? patientDetail?.status
    if (!status || !canPatientHaveDevis(status)) {
      setPageError(
        'Impossible d’envoyer : le rapport médical du médecin doit d’abord être généré.',
      )
      return
    }
    if (buildPayload().lignes.length === 0) {
      setPageError('Ajoutez au moins une prestation avec une désignation.')
      return
    }
    setActionLoading(true); setPageError(null)
    try {
      const payload = buildPayload()
      const r = await gestionnaireApi.upsertDevisDraft(selectedPatient, payload)
      await gestionnaireApi.sendDevis(r.devis.id)
      // Le PDF personnalisé est joint depuis la page Personnalisation (même rendu que « Exporter PDF »)
      toast({ title: 'Devis envoyé', description: 'Le patient a reçu le devis dans son espace.', variant: 'success' })
      setSent(true); setTimeout(() => { setSent(false); setShowModal(false) }, 2000)
      setIsEditingExisting(false)
      await loadPatientDetail(selectedPatient); await loadPatients()
    } catch (e) { setPageError(apiErrorMessage(e)) }
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

  const handleCustomize = async () => {
    if (!selectedPatient) return
    setActionLoading(true); setPageError(null)
    try {
      // Sauvegarder d'abord le brouillon pour s'assurer que le devisId existe
      await gestionnaireApi.upsertDevisDraft(selectedPatient, buildPayload())
      setShowModal(false)
      navigate(`/gestionnaire/devis/${selectedPatient}/personnaliser`)
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Erreur.')
    } finally {
      setActionLoading(false)
    }
  }

  const closeDeleteDialog = () => {
    if (deleteLoading) return
    setPendingDelete(null)
    setDeleteError(null)
  }

  const requestDeleteDevis = (devisId: string) => {
    setDeleteError(null)
    setPendingDelete({ kind: 'devis', devisId })
  }

  const requestRemoveFromDevisList = (patientId: string, patientName: string) => {
    setDeleteError(null)
    setPendingDelete({ kind: 'dossier', patientId, patientName })
  }

  const confirmPendingDelete = async () => {
    if (!pendingDelete) return
    setDeleteLoading(true)
    setDeleteError(null)
    setActionLoading(true)
    setPageError(null)
    try {
      if (pendingDelete.kind === 'devis') {
        await gestionnaireApi.deleteDevis(pendingDelete.devisId)
        setShowModal(false)
        setIsEditingExisting(false)
        if (selectedPatient) await loadPatientDetail(selectedPatient)
      } else {
        // Retire le dossier de la file devis (historique conservé, réouverture possible)
        await gestionnaireApi.updatePatientStatus(pendingDelete.patientId, 'abstention')
        if (selectedPatient === pendingDelete.patientId) goBackToList()
        toast.success('Dossier retiré de la liste des devis.')
      }
      await loadPatients()
      setPendingDelete(null)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Erreur lors de la suppression.')
    } finally {
      setDeleteLoading(false)
      setActionLoading(false)
    }
  }

  const handleDeleteDevis = () => {
    if (!existingDevis) return
    requestDeleteDevis(existingDevis.id)
  }

  const handleDeleteDevisFromList = (e: MouseEvent, devisId: string) => {
    e.stopPropagation()
    requestDeleteDevis(devisId)
  }

  const handleRemoveDossierFromList = (e: MouseEvent, patientId: string, patientName: string) => {
    e.stopPropagation()
    requestRemoveFromDevisList(patientId, patientName)
  }

  const openAbstentionMessage = () => {
    setAbstentionMsg(ABSTENTION_MESSAGE_TEMPLATE)
    setAbstentionMsgError(null)
    setAbstentionMsgOpen(true)
  }

  const sendAbstentionMessage = async () => {
    if (!selectedPatient) return
    const contenu = abstentionMsg.trim()
    if (!contenu) {
      setAbstentionMsgError('Le message ne peut pas être vide.')
      return
    }
    setAbstentionMsgSending(true)
    setAbstentionMsgError(null)
    try {
      await chatApi.sendMessage({ patientId: selectedPatient, contenu })
      setAbstentionMsgOpen(false)
      toast.success('Message envoyé à la patiente.')
    } catch (e) {
      setAbstentionMsgError(e instanceof Error ? e.message : 'Envoi impossible.')
    } finally {
      setAbstentionMsgSending(false)
    }
  }

  /* ══════ RENDER : Vue liste ══════ */
  const renderList = () => {
    const allDevisPatients = patients.filter((p) => STATUTS_DEVIS.includes(p.status))
    const kpi = {
      total:     allDevisPatients.length,
      aucun:     allDevisPatients.filter((p) => !p.devis[0]?.statut).length,
      brouillon: allDevisPatients.filter((p) => p.devis[0]?.statut === 'brouillon').length,
      envoye:    allDevisPatients.filter((p) => p.devis[0]?.statut === 'envoye').length,
      accepte:   allDevisPatients.filter((p) => p.devis[0]?.statut === 'accepte').length,
      refuse:    allDevisPatients.filter((p) => p.devis[0]?.statut === 'refuse').length,
    }

    return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 space-y-5">

        <PageHeader
          title="Gestion des devis"
          description="Préparez, personnalisez et envoyez les devis patients."
          actions={
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void loadPatients()} disabled={listLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${listLoading ? 'animate-spin' : ''}`} /> Actualiser
            </Button>
          }
        />

        <KpiStrip
          items={[
            { key: 'all', label: 'Total', value: listLoading ? '—' : kpi.total, tone: 'slate', active: devisFilter === 'all', onClick: () => setDevisFilter('all') },
            { key: 'aucun', label: 'Sans devis', value: listLoading ? '—' : kpi.aucun, tone: 'violet', active: devisFilter === 'aucun', onClick: () => setDevisFilter('aucun') },
            { key: 'brouillon', label: 'Brouillon', value: listLoading ? '—' : kpi.brouillon, tone: 'amber', active: devisFilter === 'brouillon', onClick: () => setDevisFilter('brouillon') },
            { key: 'envoye', label: 'Envoyé', value: listLoading ? '—' : kpi.envoye, tone: 'sky', active: devisFilter === 'envoye', onClick: () => setDevisFilter('envoye') },
            { key: 'accepte', label: 'Accepté', value: listLoading ? '—' : kpi.accepte, tone: 'emerald', active: devisFilter === 'accepte', onClick: () => setDevisFilter('accepte') },
            { key: 'refuse', label: 'Refusé', value: listLoading ? '—' : kpi.refuse, tone: 'rose', active: devisFilter === 'refuse', onClick: () => setDevisFilter('refuse') },
          ]}
        />

        {/* ── Barre de recherche + filtres ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                className="w-full pl-10 pr-9 py-2.5 text-sm rounded-xl border border-slate-200 bg-muted/20 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30 focus:border-brand-400 transition"
                placeholder="Rechercher nom, n° dossier…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex bg-muted/50 rounded-xl p-1 gap-0.5 w-full sm:w-auto overflow-x-auto scrollbar-none">
              {([
                { key: 'all'       as const, label: 'Tous' },
                { key: 'aucun'     as const, label: 'Sans devis' },
                { key: 'brouillon' as const, label: 'Brouillon' },
                { key: 'envoye'    as const, label: 'Envoyé' },
                { key: 'accepte'   as const, label: 'Accepté' },
                { key: 'refuse'    as const, label: 'Refusé' },
              ]).map(({ key, label }) => (
                <button key={key} type="button"
                  onClick={() => setDevisFilter(key)}
                  className={`shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
                    devisFilter === key ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-2 bg-muted/10">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{patientsFiltered.length}</span> patient{patientsFiltered.length > 1 ? 's' : ''}
              {devisFilter !== 'all' || search ? ' (filtrés)' : ''}
            </p>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => void loadPatients()} disabled={listLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${listLoading ? 'animate-spin' : ''}`} /> Actualiser
            </Button>
          </div>

          {/* Skeleton loading */}
          {listLoading && (
            <div className="divide-y divide-border/40">
              {Array.from({ length: 5 }).map((_, k) => (
                <div key={k} className="px-5 py-4 flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48 rounded" />
                    <Skeleton className="h-3 w-32 rounded" />
                  </div>
                  <Skeleton className="h-6 w-24 rounded-lg hidden sm:block" />
                </div>
              ))}
            </div>
          )}

          {/* Vide */}
          {!listLoading && patientsFiltered.length === 0 && (
            <EmptyState
              icon={FileText}
              title="Aucun patient trouvé"
              description={
                search
                  ? `Aucun résultat pour « ${search} »`
                  : devisFilter !== 'all'
                    ? 'Aucun devis dans cette catégorie'
                    : 'Les patients apparaissent ici une fois leur rapport médical généré.'
              }
              actionLabel={search || devisFilter !== 'all' ? 'Effacer les filtres' : undefined}
              onAction={
                search || devisFilter !== 'all'
                  ? () => { setSearch(''); setDevisFilter('all') }
                  : undefined
              }
            />
          )}

          {/* Liste */}
          {!listLoading && patientsFiltered.length > 0 && (
            <div className="divide-y divide-border/40">
              {patientsFiltered.map((p) => {
              const lastDevis = p.devis[0]
              const devisStatut = lastDevis?.statut
              const hasDevis = !!devisStatut
              const isRead    = !!lastDevis?.vuParPatientAt

              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-muted/20 group transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => openDetail(p.id)}
                    className="flex-1 min-w-0 flex items-center gap-3 text-left"
                  >
                  {/* Avatar */}
                  <Avatar className="h-9 w-9 sm:h-10 sm:w-10 shrink-0">
                    <AvatarFallback className="bg-brand-50 text-brand-700 font-bold text-xs rounded-xl">
                      {initials(p.user.fullName)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Info principale */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900 truncate">{p.user.fullName}</p>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-md shrink-0">{p.dossierNumber}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <StatusBadge kind="dossier" value={p.status} />
                      {p.user.email && <span className="text-[11px] text-slate-400 hidden md:inline truncate max-w-[180px]">{p.user.email}</span>}
                    </div>
                  </div>

                  {/* Bloc devis */}
                  <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 min-w-[190px]">
                    <div className="flex items-center gap-1.5">
                      {hasDevis && devisStatut
                        ? <StatusBadge kind="devis" value={devisStatut} />
                        : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200">Pas de devis</span>}
                      {lastDevis?.dateCreation && hasDevis && (
                        <span className="text-[10px] text-muted-foreground">· {formatDate(lastDevis.dateCreation)}</span>
                      )}
                    </div>
                    {devisStatut === 'envoye' && (
                      <span className={`flex items-center gap-1 text-[11px] font-medium ${isRead ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {isRead
                          ? <><Eye className="h-3 w-3" /> Lu le {formatDateTime(lastDevis!.vuParPatientAt!)}</>
                          : <><EyeOff className="h-3 w-3" /> Non consulté</>}
                      </span>
                    )}
                    {(devisStatut === 'accepte' || devisStatut === 'refuse') && isRead && (
                      <span className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Eye className="h-3 w-3" /> Lu le {formatDateTime(lastDevis!.vuParPatientAt!)}
                      </span>
                    )}
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

                  <div className="sm:hidden shrink-0">
                    {hasDevis && devisStatut
                      ? <StatusBadge kind="devis" value={devisStatut} />
                      : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500">Sans devis</span>}
                  </div>

                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 shrink-0 transition-colors" />
                  </button>

                  {/* Supprimer devis OU retirer le dossier sans devis */}
                  <button
                    type="button"
                    title={lastDevis ? 'Supprimer le devis' : 'Retirer de la liste des devis'}
                    disabled={actionLoading}
                    onClick={(e) =>
                      lastDevis
                        ? handleDeleteDevisFromList(e, lastDevis.id)
                        : handleRemoveDossierFromList(e, p.id, p.user.fullName)
                    }
                    className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
            </div>
          )}
        </div>

      </div>
    </div>
    )
  }

  /* ══════ RENDER : Vue dossier ══════ */
  const renderDetail = () => {
    if (detailLoading && !patientRow) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
          <RefreshCw className="h-5 w-5 text-slate-400 animate-spin" />
          <p className="text-sm text-slate-500">Chargement du dossier…</p>
        </div>
      )
    }

    if (!patientRow) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <EmptyState
            icon={FileText}
            title="Dossier introuvable"
            description="Ce patient n’est plus accessible ou a été supprimé."
            actionLabel="Retour à la liste"
            onAction={goBackToList}
          />
        </div>
      )
    }

    const devisStatut = existingDevis?.statut
    const isRead = !!existingDevis?.vuParPatientAt

    const devisActionLabel =
      !existingDevis || existingDevis.statut === 'refuse'
        ? 'Créer un devis'
        : existingDevis.statut === 'brouillon'
          ? 'Modifier le brouillon'
          : 'Modifier le devis'

    const devisAllowed = canPatientHaveDevis(patientRow.status)
    const isAbstention = patientRow.status === 'abstention'

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

            {isAbstention && (
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                Ce dossier est classé en <span className="font-semibold">abstention</span> et reste consultable.
                Réouverture possible depuis Patients → Abstention.
              </div>
            )}

              {/* Identité + actions — colonne sur mobile, rangée sur desktop */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar className="h-10 w-10 sm:h-14 sm:w-14 shrink-0">
                  <AvatarFallback className="bg-brand-100 text-brand-700 text-base sm:text-lg font-bold">
                    {initials(patientRow.user.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base sm:text-xl font-bold text-slate-900 truncate">{patientRow.user.fullName}</h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs sm:text-sm font-mono text-slate-400">{patientRow.dossierNumber}</span>
                    <StatusBadge kind="dossier" value={patientRow.status} />
                    {patientRow.user.email && (
                      <span className="text-xs text-slate-400 hidden sm:inline truncate">{patientRow.user.email}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* CTA — abstention : message patient ; sinon devis */}
              <div className="flex flex-col gap-2 w-full sm:items-end">
                <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:justify-end gap-2 w-full">
                  {isAbstention ? (
                    <Button
                      variant="brand"
                      className="gap-2 w-full sm:w-auto h-11 sm:h-10 text-sm font-semibold justify-center"
                      onClick={openAbstentionMessage}
                      disabled={detailLoading}
                    >
                      <MessageSquare className="h-4 w-4" />
                      Envoyer message
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="brand"
                        className="gap-2 w-full sm:w-auto h-11 sm:h-10 text-sm font-semibold justify-center"
                        onClick={() => openModal(!!existingDevis && existingDevis.statut !== 'refuse')}
                        disabled={detailLoading || !devisAllowed}
                        title={
                          devisAllowed
                            ? undefined
                            : 'En attente du rapport médical (médecin) avant devis.'
                        }
                      >
                        <FileText className="h-4 w-4" />
                        {devisActionLabel}
                      </Button>
                      {existingDevis && (
                        <Button
                          type="button"
                          variant="outline"
                          className="gap-1.5 w-full sm:w-auto h-11 sm:h-10 text-sm text-slate-700 border-slate-200 hover:bg-slate-50 justify-center"
                          onClick={() => {
                            if (devisVersions.length === 1) {
                              openConsultDevis(devisVersions[0].id)
                              return
                            }
                            setConsultVersionsOpen(true)
                          }}
                        >
                          <Eye className="h-4 w-4" />
                          Consulter le devis
                          {devisVersions.length > 1 && (
                            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                          )}
                        </Button>
                      )}
                      {existingDevis && (
                        <Button
                          type="button"
                          variant="outline"
                          className="gap-1.5 w-full sm:w-auto h-11 sm:h-10 text-sm text-destructive border-destructive/30 hover:bg-destructive/10 justify-center"
                          disabled={actionLoading}
                          onClick={() => handleDeleteDevis()}
                        >
                          <Trash2 className="h-4 w-4" />
                          Supprimer devis
                        </Button>
                      )}
                    </>
                  )}
                </div>
                {isAbstention ? (
                  <p className="text-xs text-slate-500 sm:text-right">
                    Transmettre la décision du médecin à la patiente.
                  </p>
                ) : !devisAllowed ? (
                  <p className="text-xs text-amber-700 sm:text-right">
                    Rapport médical requis avant devis.
                  </p>
                ) : null}

                {devisStatut === 'envoye' && (
                  <div className={`flex items-center gap-1.5 text-xs font-medium sm:justify-end ${isRead ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {isRead
                      ? <><Eye className="h-3.5 w-3.5" /> Vu le {formatDateTime(existingDevis!.vuParPatientAt!)}</>
                      : <><EyeOff className="h-3.5 w-3.5" /> Pas encore consulté</>}
                  </div>
                )}
                {devisStatut === 'accepte' && (
                  <div className="flex flex-col gap-0.5 sm:items-end">
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
                  count={isAbstention ? Math.max(rapportsList.length, 1) : rapportsList.length}
                  defaultOpen
                >
                  {isAbstention && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 mb-4">
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-full bg-slate-200/80 flex items-center justify-center shrink-0">
                          <Ban className="h-4 w-4 text-slate-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800">
                            Décision médicale : abstention
                          </p>
                          <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                            Après examen du dossier, le Dr Chennoufi a décidé de ne pas intervenir.
                            Aucun devis ne sera établi. Vous pouvez notifier la patiente par message.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {!rapportsList.length && !isAbstention ? (
                    <p className="text-sm text-slate-400 text-center py-4">Aucun rapport disponible.</p>
                  ) : rapportsList.length > 0 ? (
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
                  ) : null}
                </Section>

                {/* Historique devis */}
                <Section
                  icon={<FileText className="h-4 w-4" />}
                  title="Historique des devis"
                  count={patientDetail?.devis.length ?? 0}
                  defaultOpen
                >
                  {!devisVersions.length ? (
                    <p className="text-sm text-slate-400 text-center py-4">Aucun devis créé.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {devisVersions.map((d) => {
                        const sc = {
                          accepte:   { label: 'Accepté',  cls: 'bg-emerald-100 text-emerald-700' },
                          refuse:    { label: 'Refusé',   cls: 'bg-red-100 text-red-600' },
                          envoye:    { label: 'Envoyé',   cls: 'bg-blue-100 text-blue-700' },
                          brouillon: { label: 'Brouillon',cls: 'bg-slate-100 text-slate-600' },
                        }[d.statut] ?? { label: d.statut, cls: 'bg-slate-100 text-slate-600' }
                        const devisName = formatDevisListName(
                          patientRow.dossierNumber,
                          patientRow.user.fullName,
                          d.version,
                        )
                        return (
                          <div key={d.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${sc.cls}`}>{sc.label}</span>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-slate-800 truncate">{devisName}</p>
                              <p className="text-slate-400 text-xs">Version {d.version}</p>
                            </div>
                            <span className="font-bold text-slate-800">{formatCurrency(d.total, currency)}</span>
                            <span className="text-xs text-slate-400">{formatDate(d.dateCreation)}</span>
                            {d.statut === 'envoye' && (
                              <span className={`flex items-center gap-1.5 text-xs font-medium ${d.vuParPatientAt ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {d.vuParPatientAt
                                  ? <><Eye className="h-3.5 w-3.5" /> Vu le {formatDate(d.vuParPatientAt)}</>
                                  : <><EyeOff className="h-3.5 w-3.5" /> Non consulté</>}
                              </span>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs text-brand-700 hover:bg-brand-50 h-7 px-2.5 gap-1"
                              onClick={() => openConsultDevis(d.id)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Consulter
                            </Button>
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
          cliniqueChoice={cliniqueChoice} setCliniqueChoice={setCliniqueChoice}
          cliniqueAutre={cliniqueAutre} setCliniqueAutre={setCliniqueAutre}
          cliniqueNuits={cliniqueNuits} setCliniqueNuits={setCliniqueNuits}
          hotelChoice={hotelChoice} setHotelChoice={setHotelChoice}
          hotelAutre={hotelAutre} setHotelAutre={setHotelAutre}
          hotelNuits={hotelNuits} setHotelNuits={setHotelNuits}
          nbAdultes={nbAdultes} setNbAdultes={setNbAdultes}
          nbEnfants={nbEnfants} setNbEnfants={setNbEnfants}
          dureeSejourTotale={dureeSejourTotale} setDureeSejourTotale={setDureeSejourTotale}
          notesSejour={notesSejour} setNotesSejour={setNotesSejour}
          sent={sent} savedDraft={savedDraft} actionLoading={actionLoading}
          onSend={() => void handleSend()}
          onSaveDraft={() => void handleSaveDraft()}
          onDelete={() => handleDeleteDevis()}
          canDelete={!!existingDevis && existingDevis.statut !== 'accepte'}
          onCustomize={handleCustomize}
          currency={currency}
          tauxEur={tauxEur}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={closeDeleteDialog}
        title={
          pendingDelete?.kind === 'dossier'
            ? 'Retirer ce dossier de la liste ?'
            : 'Supprimer ce devis ?'
        }
        description={
          pendingDelete?.kind === 'dossier'
            ? `${pendingDelete.patientName} sera retiré(e) de la liste des devis (classé en abstention). L’historique reste consultable dans Patients.`
            : 'Cette action est irréversible. Le devis sera définitivement effacé.'
        }
        confirmLabel={pendingDelete?.kind === 'dossier' ? 'Retirer de la liste' : 'Supprimer le devis'}
        loading={deleteLoading}
        error={deleteError}
        onConfirm={confirmPendingDelete}
        icon={
          <div className="h-11 w-11 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
            <Trash2 className="h-5 w-5 text-destructive" />
          </div>
        }
      />

      {/* Choix de version à consulter */}
      {consultVersionsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setConsultVersionsOpen(false)}
            aria-label="Fermer"
          />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl border border-border flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">Consulter un devis</p>
                <p className="text-xs text-muted-foreground truncate">
                  Choisissez la version à ouvrir
                </p>
              </div>
              <button
                type="button"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"
                onClick={() => setConsultVersionsOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-3 py-3 flex-1 min-h-0 overflow-y-auto space-y-1">
              {devisVersions.map((d) => {
                const sc = {
                  accepte:   { label: 'Accepté',  cls: 'bg-emerald-100 text-emerald-700' },
                  refuse:    { label: 'Refusé',   cls: 'bg-red-100 text-red-600' },
                  envoye:    { label: 'Envoyé',   cls: 'bg-blue-100 text-blue-700' },
                  brouillon: { label: 'Brouillon',cls: 'bg-slate-100 text-slate-600' },
                }[d.statut] ?? { label: d.statut, cls: 'bg-slate-100 text-slate-600' }
                const devisName = formatDevisListName(
                  patientRow?.dossierNumber,
                  patientRow?.user.fullName,
                  d.version,
                )
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => openConsultDevis(d.id)}
                    className="w-full text-left rounded-xl border border-slate-100 hover:border-brand-200 hover:bg-brand-50/40 px-3.5 py-3 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate">{devisName}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${sc.cls}`}>{sc.label}</span>
                          <span className="text-xs text-slate-400">Version {d.version}</span>
                          <span className="text-xs text-slate-400">{formatDate(d.dateCreation)}</span>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-slate-800 shrink-0">
                        {formatCurrency(d.total, currency)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Message abstention → chat patient */}
      {abstentionMsgOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !abstentionMsgSending && setAbstentionMsgOpen(false)}
            aria-label="Fermer"
          />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl border border-border flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">Envoyer un message</p>
                <p className="text-xs text-muted-foreground truncate">
                  {patientRow?.user.fullName ?? 'Patiente'} — modèle de réponse, à adapter si besoin
                </p>
              </div>
              <button
                type="button"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"
                disabled={abstentionMsgSending}
                onClick={() => setAbstentionMsgOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 flex-1 min-h-0 overflow-y-auto space-y-3">
              <Textarea
                value={abstentionMsg}
                onChange={(e) => setAbstentionMsg(e.target.value)}
                rows={14}
                className="text-sm leading-relaxed resize-y min-h-[240px]"
                disabled={abstentionMsgSending}
              />
              {abstentionMsgError && (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {abstentionMsgError}
                </p>
              )}
            </div>
            <div className="px-5 py-4 border-t border-border flex flex-col-reverse sm:flex-row gap-2 sm:justify-end shrink-0">
              <Button
                type="button"
                variant="outline"
                disabled={abstentionMsgSending}
                onClick={() => setAbstentionMsgOpen(false)}
              >
                Annuler
              </Button>
              <Button
                type="button"
                variant="brand"
                className="gap-2"
                disabled={abstentionMsgSending}
                onClick={() => void sendAbstentionMessage()}
              >
                {abstentionMsgSending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Envoyer à la patiente
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
