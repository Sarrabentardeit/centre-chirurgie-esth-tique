import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import {
  Plus, Minus, Trash2, Save, Send, CheckCircle2, FileText, AlertCircle,
  RefreshCw, Search, Eye, EyeOff, ChevronDown, ChevronRight,
  Stethoscope, ClipboardList, Scissors, Heart, ArrowLeft, X, FilePenLine,
  User, Mail, Phone, MapPin, Calendar, MessageSquare, Ban, Bell,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader, KpiStrip } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/lib/statusUi'
import { feedbackSuccess, toast } from '@/store/toastStore'
import { cn, formatCurrency, formatDate, formatDateTime, formatDevisListName, getDevisDisplayNumber, STATUS_COLORS, STATUS_LABELS, dossierStatusLabel, type CurrencyUnit } from '@/lib/utils'
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
import type { DossierStatus } from '@/types'
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
import {
  DEVIS_EXCLUT_ITEMS,
  DEVIS_INCLUT_ITEMS,
  defaultDrainageNbFromRapport,
  defaultExclutIds,
  defaultInclutIds,
  toggleId,
} from '@/lib/devisOfferInclus'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PullToRefresh } from '@/components/PullToRefresh'
import { LIST_PAGE_SIZE, PaginationBar, paginateSlice } from '@/components/PaginationBar'
import { cachedFetch, hasCachedData } from '@/lib/cachedFetch'
import { queryKeys } from '@/lib/queryKeys'
import {
  buildGestionnaireDevisExportHtml,
  refreshDevisCustomContentParts,
} from '@/lib/devisExportHtml'
import { letterContextFromGestionnairePatient } from '@/lib/devisLetterHtml'
import { inlineHtmlImages } from '@/lib/pdf'

/* ══════════════════════════════════════════════════
   TYPES & HELPERS
══════════════════════════════════════════════════ */
interface LigneDevisForm { description: string; quantite: number; prixUnitaire: number }
type PageView = 'list' | 'detail'

const DOSSIER_STATUSES: DossierStatus[] = [
  'nouveau', 'formulaire_en_cours', 'formulaire_complete', 'en_analyse',
  'rapport_genere', 'rapport_modifie', 'devis_preparation', 'devis_envoye', 'devis_accepte',
  'date_reservee', 'logistique', 'intervention', 'post_op', 'suivi_termine',
  'abstention',
]

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

/** Accompagnants = adultes accompagnants + enfants (sans la patiente). */
function totalAccompagnantsQty(
  nbAdultes: string,
  nbEnfants: string,
  formPayload?: Record<string, unknown> | null,
): number {
  const accFlag = formPayload?.accompagnant
  if (accFlag === false || accFlag === 'Non' || accFlag === 'non') return 0
  if (accFlag === true || accFlag === 'Oui' || accFlag === 'oui') {
    const a = Number(formPayload?.nbAdultesAccompagnement)
    const e = Number(formPayload?.nbEnfantsAccompagnement)
    const adultesAcc = Number.isFinite(a) && a >= 0 ? Math.floor(a) : 0
    const enfants = Number.isFinite(e) && e >= 0 ? Math.floor(e) : 0
    return adultesAcc + enfants
  }
  // Rapport / notes séjour : nbAdultes = accompagnants uniquement (sans la patiente)
  const adults = Number(nbAdultes)
  const enfants = Number(nbEnfants)
  const a = Number.isFinite(adults) ? Math.floor(adults) : 0
  const e = Number.isFinite(enfants) ? Math.floor(enfants) : 0
  return Math.max(0, a + e)
}

const LIGNE_SUPP_CLINIQUE_ACCOMP = 'Supp Clinique accompagnateur'
const LIGNE_SUPP_HOTEL_ACCOMP = 'Supp Hôtel Accompagnateur'
const LIGNE_HOTEL_NUITEES = 'Hôtel (nbr de nuitées)'
const LIGNE_DRAINAGE = 'Drainage (nbr de séances)'

/** Qté drainage depuis le rapport médecin (0 si drainage non prescrit). */
function drainageQtyFromRapport(rap?: {
  drainage?: boolean | null
  nbSeancesDrainage?: number | null
} | null): number | null {
  if (!rap) return null
  if (rap.drainage === false) return 0
  if (rap.nbSeancesDrainage != null && Number.isFinite(Number(rap.nbSeancesDrainage))) {
    return Math.max(0, Math.floor(Number(rap.nbSeancesDrainage)))
  }
  return null
}

/** P.U. 1re ligne = forfait médecin ; Qté hôtel / supp / drainage = rapport + formulaire. */
function buildDefaultLignes(opts?: {
  honorairesChirCliniquePu?: number
  qteSuppCliniqueAccomp?: number
  qteHotelNuits?: number
  qteDrainage?: number
}): LigneDevisForm[] {
  const pu0 =
    typeof opts?.honorairesChirCliniquePu === 'number' &&
    Number.isFinite(opts.honorairesChirCliniquePu) &&
    opts.honorairesChirCliniquePu > 0
      ? normalizeTndDinars(opts.honorairesChirCliniquePu)
      : 0
  const qteSupp =
    typeof opts?.qteSuppCliniqueAccomp === 'number' && Number.isFinite(opts.qteSuppCliniqueAccomp)
      ? Math.max(0, Math.floor(opts.qteSuppCliniqueAccomp))
      : 1
  const qteHotel =
    typeof opts?.qteHotelNuits === 'number' && Number.isFinite(opts.qteHotelNuits)
      ? Math.max(0, Math.floor(opts.qteHotelNuits))
      : 1
  const qteDrainage =
    typeof opts?.qteDrainage === 'number' && Number.isFinite(opts.qteDrainage)
      ? Math.max(0, Math.floor(opts.qteDrainage))
      : 1

  return PRESTATIONS_PAR_DEFAUT.map((description, i) => {
    let quantite = 1
    if (description === LIGNE_SUPP_CLINIQUE_ACCOMP || description === LIGNE_SUPP_HOTEL_ACCOMP) {
      quantite = qteSupp
    }
    if (description === LIGNE_HOTEL_NUITEES) quantite = qteHotel
    if (description === LIGNE_DRAINAGE) quantite = qteDrainage
    return {
      description,
      quantite,
      prixUnitaire: i === 0 ? pu0 : 0,
    }
  })
}

/** Applique les données rapport sur les lignes existantes (conserve descriptions / PU hors forfait). */
function applyRapportToExistingLignes(
  lignes: LigneDevisForm[],
  opts: {
    honorairesChirCliniquePu?: number
    qteSuppCliniqueAccomp?: number
    qteHotelNuits?: number | null
    qteDrainage?: number | null
  },
): LigneDevisForm[] {
  return lignes.map((l, i) => {
    let quantite = l.quantite
    let prixUnitaire = l.prixUnitaire
    if (
      i === 0 &&
      typeof opts.honorairesChirCliniquePu === 'number' &&
      Number.isFinite(opts.honorairesChirCliniquePu) &&
      opts.honorairesChirCliniquePu > 0
    ) {
      prixUnitaire = normalizeTndDinars(opts.honorairesChirCliniquePu)
    }
    if (l.description === LIGNE_SUPP_CLINIQUE_ACCOMP || l.description === LIGNE_SUPP_HOTEL_ACCOMP) {
      if (typeof opts.qteSuppCliniqueAccomp === 'number' && Number.isFinite(opts.qteSuppCliniqueAccomp)) {
        quantite = Math.max(0, Math.floor(opts.qteSuppCliniqueAccomp))
      }
    }
    if (l.description === LIGNE_HOTEL_NUITEES && opts.qteHotelNuits != null && Number.isFinite(opts.qteHotelNuits)) {
      quantite = Math.max(0, Math.floor(opts.qteHotelNuits))
    }
    if (l.description === LIGNE_DRAINAGE && opts.qteDrainage != null && Number.isFinite(opts.qteDrainage)) {
      quantite = Math.max(0, Math.floor(opts.qteDrainage))
    }
    return { ...l, quantite, prixUnitaire }
  })
}

const STATUTS_DEVIS = [
  'rapport_genere', 'rapport_modifie', 'devis_preparation', 'devis_envoye', 'devis_accepte',
  'date_reservee', 'logistique', 'intervention', 'post_op', 'suivi_termine',
]

/** Repli si l’API Communication est indisponible. */
const ABSTENTION_MESSAGE_FALLBACK = `Chère Madame,
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

const DEVIS_RAPPEL_MESSAGE_FALLBACK = `Bonjour Madame,
Je me permets de revenir vers vous suite à l’envoi du devis concernant votre projet chirurgical avec le Dr Chennoufi.
N’ayant pas encore eu de retour de votre part, je souhaitais savoir si le diagnostic proposé, l’intervention envisagée ainsi que le devis transmis correspondent à vos attentes, ou si certains points mériteraient d’être clarifiés.
Nous restons bien entendu entièrement disponibles pour répondre à vos questions, vous apporter des informations complémentaires et, si vous le souhaitez, organiser un échange téléphonique afin de discuter plus sereinement de votre projet et de l’organisation de votre séjour médical.
N’hésitez pas à me faire part de votre retour, même bref; il nous est précieux pour vous accompagner au mieux.
Horaires de travail : Mardi, Mercredi & Jeudi de 09 à 15h (heure locale)
Au plaisir de vous lire,
Bien cordialement,
Houda CHENNOUFI
Conciergerie & coordination patients
Cabinet du Dr Mehdi Chennoufi
Chirurgie Esthétique, Plastique et Réparatrice
SCULPTURE, SMOOTH & SMILE`

/** Message prérempli → médecin (court). */
const DEMANDE_MAJ_RAPPORT_FALLBACK = `Bonjour Docteur,

Pouvez-vous générer un nouveau rapport médical pour la patiente {fullName} (dossier {dossier}) ?

Le devis v1 reste conservé.`

function applyTemplateVars(content: string, fullName: string, dossierNumber = '') {
  const parts = fullName.trim().split(/\s+/)
  const prenom = parts[0] ?? ''
  const nom = parts.slice(1).join(' ')
  return content
    .split('{fullName}').join(fullName.trim())
    .split('{prenom}').join(prenom)
    .split('{nom}').join(nom)
    .split('{dossier}').join(dossierNumber)
    .split('{reason}').join('')
}

/** Aligné sur `assertPatientReadyForDevis` (backend). */
const DEVIS_READY_STATUSES = [
  'rapport_genere',
  'rapport_modifie',
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
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-slate-50/90 transition-colors"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700 shrink-0">
          {icon}
        </span>
        <span className="text-sm font-semibold text-slate-900 flex-1 text-left">{title}</span>
        {count !== undefined && (
          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 rounded-full px-2.5 py-0.5 mr-1">
            {count}
          </span>
        )}
        {open
          ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
          : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 sm:px-5 py-5 bg-gradient-to-b from-white to-slate-50/40">
          {children}
        </div>
      )}
    </section>
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
      {(r.nuitsClinique != null || r.nuitsPreoperatoires != null || r.nuitsHotel != null || r.vetementContention != null || r.anesthesieGenerale != null || r.drainage != null || r.dureeSejourTunisie != null || r.nbAdultesSejour != null) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-cyan-700 mb-1">Nuit préparatoire en clinique</p>
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
            <p className="text-[11px] uppercase tracking-wide font-semibold text-cyan-700 mb-1">Nuit de convalescence à l&apos;hôtel</p>
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
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-indigo-700 mb-1">Drainage</p>
            <p className="text-sm font-semibold text-indigo-900">
              {r.drainage == null
                ? 'Non précisé'
                : r.drainage
                  ? `Oui${r.nbSeancesDrainage != null ? ` · ${r.nbSeancesDrainage} séance(s)` : ''}`
                  : 'Non'}
            </p>
          </div>
          {r.dureeSejourTunisie != null && (
            <div className="rounded-lg border border-teal-100 bg-teal-50/70 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide font-semibold text-teal-700 mb-1">Séjour global Tunisie</p>
              <p className="text-sm font-semibold text-teal-900">
                {r.dureeSejourTunisie} nuit(s)
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
  inclutIds: string[]; setInclutIds: (v: string[] | ((prev: string[]) => string[])) => void
  exclutIds: string[]; setExclutIds: (v: string[] | ((prev: string[]) => string[])) => void
  drainageNb: number; setDrainageNb: (v: number | ((prev: number) => number)) => void
  contentionDetail: string; setContentionDetail: (v: string) => void
  sent: boolean; savedDraft: boolean; autoSaving?: boolean; actionLoading: boolean
  onSend: () => void; onSaveDraft: () => void
  onDelete: () => void
  canDelete: boolean
  onCustomize: () => void
  currency: CurrencyUnit
  tauxEur: TndEurRateResponse | null
  formError?: string | null
  cliniqueNomInvalid?: boolean
  hotelNomInvalid?: boolean
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
  inclutIds, setInclutIds,
  exclutIds, setExclutIds,
  drainageNb, setDrainageNb,
  contentionDetail, setContentionDetail,
  sent, savedDraft, autoSaving = false, actionLoading, onSend, onSaveDraft, onDelete, canDelete, onCustomize, currency,
  tauxEur,
  formError = null,
  cliniqueNomInvalid = false,
  hotelNomInvalid = false,
}: DevisModalProps) {
  const tndPerEur = tauxEur?.tndPerEur ?? DEFAULT_TND_PER_EUR
  const euroLabel = formatEuroApprox(total, tndPerEur)
  const [confirmSendOpen, setConfirmSendOpen] = useState(false)
  // Fermer sur Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmSendOpen) onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, confirmSendOpen])

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
            {(autoSaving || savedDraft) && (
              <p className={`text-[11px] mt-1 font-medium ${savedDraft && !autoSaving ? 'text-emerald-600' : 'text-slate-400'}`}>
                {autoSaving ? 'Enregistrement automatique…' : 'Brouillon enregistré automatiquement'}
              </p>
            )}
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
                          type="number" min={0} value={ligne.quantite}
                          onChange={(e) => {
                            const n = parseInt(e.target.value, 10)
                            updateLigne(i, 'quantite', Number.isFinite(n) ? Math.max(0, n) : 0)
                          }}
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
                <div className={cn(
                  'rounded-xl border bg-slate-50/50 p-4 space-y-3',
                  cliniqueNomInvalid ? 'border-red-300' : 'border-slate-200',
                )}>
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">🏥 Séjour clinique</p>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">
                      Nom de la clinique <span className="text-destructive">*</span>
                    </label>
                    <Select
                      value={cliniqueChoice || undefined}
                      onValueChange={(v) => {
                        setCliniqueChoice(v)
                        if (v !== 'autre') setCliniqueAutre('')
                      }}
                    >
                      <SelectTrigger className={cn(
                        'h-9 text-sm bg-white',
                        cliniqueNomInvalid ? 'border-red-400' : 'border-slate-200',
                      )}>
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
                        className={cn(
                          'h-9 text-sm bg-white mt-2',
                          cliniqueNomInvalid ? 'border-red-400' : 'border-slate-200',
                        )}
                        placeholder="Nom de la clinique"
                        value={cliniqueAutre}
                        onChange={(e) => setCliniqueAutre(e.target.value)}
                      />
                    )}
                    {cliniqueNomInvalid && (
                      <p className="text-[11px] text-destructive mt-1">Clinique obligatoire</p>
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
                <div className={cn(
                  'rounded-xl border bg-slate-50/50 p-4 space-y-3',
                  hotelNomInvalid ? 'border-red-300' : 'border-slate-200',
                )}>
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">🏨 Hôtel</p>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">
                      Nom de l&apos;hôtel <span className="text-destructive">*</span>
                    </label>
                    <Select
                      value={hotelChoice || undefined}
                      onValueChange={(v) => {
                        setHotelChoice(v)
                        if (v !== 'autre') setHotelAutre('')
                        if (v === 'aucun') setHotelNuits('0')
                      }}
                    >
                      <SelectTrigger className={cn(
                        'h-9 text-sm bg-white',
                        hotelNomInvalid ? 'border-red-400' : 'border-slate-200',
                      )}>
                        <SelectValue placeholder="Choisir un hôtel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mouradi">Mouradi Gammarth</SelectItem>
                        <SelectItem value="darMarsa">Hotel Dar Marsa La Marsa</SelectItem>
                        <SelectItem value="aucun">Aucun (séjour géré par la patiente)</SelectItem>
                        <SelectItem value="autre">Autre</SelectItem>
                      </SelectContent>
                    </Select>
                    {hotelChoice === 'autre' && (
                      <Input
                        className={cn(
                          'h-9 text-sm bg-white mt-2',
                          hotelNomInvalid ? 'border-red-400' : 'border-slate-200',
                        )}
                        placeholder="Nom de l'hôtel"
                        value={hotelAutre}
                        onChange={(e) => setHotelAutre(e.target.value)}
                      />
                    )}
                    {hotelChoice === 'aucun' && (
                      <p className="text-[11px] text-slate-500 mt-1.5">
                        Pas d’hôtel cabinet — convalescence prise en charge par la patiente.
                      </p>
                    )}
                    {hotelNomInvalid && (
                      <p className="text-[11px] text-destructive mt-1">Hôtel obligatoire</p>
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
                    <p className="text-[11px] text-slate-400 mt-1">Nuit de convalescence à l&apos;hôtel</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1.5">Séjour total (nuits)</label>
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
                  <label className="text-xs font-semibold text-slate-500 block mb-1.5">Adultes accompagnants</label>
                  <Input
                    className="h-9 text-sm border-slate-200 bg-white"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="0"
                    value={nbAdultes}
                    onChange={(e) => setNbAdultes(e.target.value)}
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Sans la patiente — depuis le rapport.</p>
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

              {/* Offre : inclut / exclut (cases → PDF & éditeur) */}
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <div>
                  <p
                    className="text-sm font-bold mb-2"
                    style={{ color: DEVIS_CHARTE.bronze }}
                  >
                    Votre devis inclut :
                  </p>
                  <div className="space-y-2 rounded-xl border border-slate-100 bg-white px-3 py-3">
                    {DEVIS_INCLUT_ITEMS.map((item) => {
                      const checked = inclutIds.includes(item.id)
                      if (item.id === 'drainage') {
                        return (
                          <div
                            key={item.id}
                            className="flex items-start gap-2.5 text-sm text-slate-700 leading-snug"
                          >
                            <Checkbox
                              className="mt-0.5"
                              checked={checked}
                              onCheckedChange={(v) =>
                                setInclutIds((prev) => toggleId(prev, item.id, v === true))
                              }
                            />
                            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                              <div className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 shrink-0">
                                <button
                                  type="button"
                                  className="h-7 w-7 inline-flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                                  disabled={drainageNb <= 0}
                                  aria-label="Diminuer le nombre de séances"
                                  onClick={() => setDrainageNb((n) => Math.max(0, n - 1))}
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  className="h-7 w-10 border-x border-slate-200 bg-white text-center text-sm font-medium tabular-nums outline-none"
                                  value={drainageNb}
                                  onChange={(e) => {
                                    const n = Number.parseInt(e.target.value, 10)
                                    setDrainageNb(Number.isFinite(n) && n >= 0 ? n : 0)
                                  }}
                                  aria-label="Nombre de séances de drainage"
                                />
                                <button
                                  type="button"
                                  className="h-7 w-7 inline-flex items-center justify-center text-slate-600 hover:bg-slate-100"
                                  aria-label="Augmenter le nombre de séances"
                                  onClick={() => setDrainageNb((n) => n + 1)}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <span>
                                {drainageNb > 1 ? 'Séances' : 'Séance'} de drainage lymphatique :
                                massages par un kinésithérapeute,
                              </span>
                            </div>
                          </div>
                        )
                      }
                      if (item.id === 'vetement_contention') {
                        return (
                          <div
                            key={item.id}
                            className="flex items-start gap-2.5 text-sm text-slate-700 leading-snug"
                          >
                            <Checkbox
                              className="mt-0.5"
                              checked={checked}
                              onCheckedChange={(v) =>
                                setInclutIds((prev) => toggleId(prev, item.id, v === true))
                              }
                            />
                            <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                              <span className="shrink-0">Vêtement de contention :</span>
                              <input
                                type="text"
                                value={contentionDetail}
                                onChange={(e) => setContentionDetail(e.target.value)}
                                placeholder="Préciser le vêtement…"
                                className="h-8 min-w-[10rem] flex-1 max-w-md rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
                                aria-label="Préciser le vêtement de contention"
                              />
                            </div>
                          </div>
                        )
                      }
                      return (
                        <label
                          key={item.id}
                          className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer leading-snug"
                        >
                          <Checkbox
                            className="mt-0.5"
                            checked={checked}
                            onCheckedChange={(v) =>
                              setInclutIds((prev) => toggleId(prev, item.id, v === true))
                            }
                          />
                          <span>{item.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <p
                    className="text-sm font-bold mb-2"
                    style={{ color: DEVIS_CHARTE.bronze }}
                  >
                    Notre forfait exclut :
                  </p>
                  <div className="space-y-2 rounded-xl border border-slate-100 bg-white px-3 py-3">
                    {DEVIS_EXCLUT_ITEMS.map((item) => {
                      const checked = exclutIds.includes(item.id)
                      return (
                        <label
                          key={item.id}
                          className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer leading-snug"
                        >
                          <Checkbox
                            className="mt-0.5"
                            checked={checked}
                            onCheckedChange={(v) =>
                              setExclutIds((prev) => toggleId(prev, item.id, v === true))
                            }
                          />
                          <span>{item.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer avec actions */}
        <div className="shrink-0 border-t border-slate-200 px-4 sm:px-6 py-4 flex flex-col gap-2.5 bg-slate-50/60">
          {formError && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {formError}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-2.5">
          <Button
            variant="brand"
            className="flex-1 h-10 gap-2 font-semibold"
            onClick={() => {
              if (sent) return
              setConfirmSendOpen(true)
            }}
            disabled={actionLoading || sent}
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
            disabled={actionLoading || autoSaving}
          >
            <Save className={`h-4 w-4 ${autoSaving ? 'animate-pulse text-brand-600' : 'text-slate-400'}`} />
            {autoSaving ? 'Enregistrement…' : savedDraft ? 'Enregistré !' : 'Brouillon'}
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

      <ConfirmDialog
        open={confirmSendOpen}
        onClose={() => !actionLoading && setConfirmSendOpen(false)}
        title="Envoyer ce devis au patient ?"
        description={`Le devis sera validé et transmis à ${patientName}. Cette action ne peut pas être annulée facilement.`}
        confirmLabel="Envoyer"
        cancelLabel="Annuler"
        confirmVariant="brand"
        loading={actionLoading}
        onConfirm={async () => {
          setConfirmSendOpen(false)
          onSend()
        }}
        icon={
          <div className="h-11 w-11 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center">
            <Send className="h-5 w-5 text-brand-700" />
          </div>
        }
      />
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
  const [modalError, setModalError]       = useState<string | null>(null)
  const [cliniqueNomInvalid, setCliniqueNomInvalid] = useState(false)
  const [hotelNomInvalid, setHotelNomInvalid] = useState(false)
  const [search, setSearch]               = useState('')
  const [devisFilter, setDevisFilter]     = useState<'all' | 'aucun' | 'brouillon' | 'envoye' | 'accepte' | 'refuse' | 'supprime'>('all')
  const [page, setPage]                   = useState(1)
  const [view, setView]                   = useState<PageView>('list')
  const [selectedPatient, setSelectedPatient] = useState('')
  const [patientDetail, setPatientDetail] = useState<GestionnairePatientDetail | null>(null)
  const [showModal, setShowModal]         = useState(false)
  const [tauxEur, setTauxEur]             = useState<TndEurRateResponse | null>(null)
  const [deletedDevis, setDeletedDevis]   = useState<Array<{
    id: string
    numeroDevis: string | null
    statut: string
    version: number
    total: number
    currency: string
    dateCreation: string
    deletedAt: string
    patient: { id: string; dossierNumber: string; fullName: string; email: string }
  }>>([])
  const [deletedLoading, setDeletedLoading] = useState(false)

  /* State devis form */
  const [lignes, setLignes]                   = useState<LigneDevisForm[]>(buildDefaultLignes())
  const [cliniqueChoice, setCliniqueChoice]   = useState('')
  const [cliniqueAutre, setCliniqueAutre]     = useState('')
  const [cliniqueNuits, setCliniqueNuits]     = useState('')
  const [hotelChoice, setHotelChoice]         = useState('')
  const [hotelAutre, setHotelAutre]           = useState('')
  const [hotelNuits, setHotelNuits]           = useState('')
  const [nbAdultes, setNbAdultes]             = useState('0')
  const [nbEnfants, setNbEnfants]             = useState('0')
  const [dureeSejourTotale, setDureeSejourTotale] = useState('')
  const [notesSejour, setNotesSejour]         = useState('')
  const [inclutIds, setInclutIds]             = useState<string[]>(() => defaultInclutIds())
  const [exclutIds, setExclutIds]             = useState<string[]>(() => defaultExclutIds())
  const [drainageNb, setDrainageNb]           = useState(2)
  const [contentionDetail, setContentionDetail] = useState('')
  const [isEditingExisting, setIsEditingExisting] = useState(false)
  const [sent, setSent]                       = useState(false)
  const [savedDraft, setSavedDraft]           = useState(false)
  const [autoSaving, setAutoSaving]           = useState(false)
  const [actionLoading, setActionLoading]     = useState(false)
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: 'devis'; devisIds: string[] }
    | { kind: 'dossier'; patientId: string; patientName: string }
    | null
  >(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [abstentionMsgOpen, setAbstentionMsgOpen] = useState(false)
  const [abstentionMsg, setAbstentionMsg] = useState(ABSTENTION_MESSAGE_FALLBACK)
  const [abstentionMsgSending, setAbstentionMsgSending] = useState(false)
  const [rappelOpen, setRappelOpen] = useState(false)
  const [rappelMsg, setRappelMsg] = useState(DEVIS_RAPPEL_MESSAGE_FALLBACK)
  const [rappelSending, setRappelSending] = useState(false)
  const [rappelError, setRappelError] = useState<string | null>(null)
  const [rappelTarget, setRappelTarget] = useState<{
    patientId: string
    patientName: string
    devisId: string
    numeroDevis?: string | null
    version?: number
  } | null>(null)
  const [majRapportOpen, setMajRapportOpen] = useState(false)
  const [majRapportMsg, setMajRapportMsg] = useState(DEMANDE_MAJ_RAPPORT_FALLBACK)
  const [majRapportSending, setMajRapportSending] = useState(false)
  const [majRapportError, setMajRapportError] = useState<string | null>(null)
  const [consultVersionsOpen, setConsultVersionsOpen] = useState(false)
  const [deletePicker, setDeletePicker] = useState<{
    patientId: string
    patientName: string
    dossierNumber: string
    versions: Devis[]
    selectedIds: string[]
    loading: boolean
  } | null>(null)
  const [historiqueSelectedIds, setHistoriqueSelectedIds] = useState<string[]>([])
  const [abstentionMsgError, setAbstentionMsgError] = useState<string | null>(null)
  const [dossierStatusDraft, setDossierStatusDraft] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const draftSaveInFlightRef = useRef(false)
  const draftSavePendingRef = useRef(false)
  /** Une seule nouvelle version à l’ouverture « nouveau devis » ; les auto-saves suivants mettent à jour. */
  const createNewVersionOnceRef = useRef(false)
  const persistDraftSilentRef = useRef<() => Promise<boolean>>(async () => false)
  const [modalReady, setModalReady] = useState(false)

  // Séjour total (nuits) = nuits clinique + nuits hôtel
  useEffect(() => {
    setDureeSejourTotale(joursSejourFromNuits(cliniqueNuits, hotelNuits))
  }, [cliniqueNuits, hotelNuits])

  const patientsFiltered = useMemo(() => {
    if (devisFilter === 'supprime') return []
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

  const deletedFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return deletedDevis
    return deletedDevis.filter((d) =>
      d.patient.fullName.toLowerCase().includes(q)
      || d.patient.dossierNumber.toLowerCase().includes(q)
      || (d.numeroDevis ?? '').toLowerCase().includes(q),
    )
  }, [deletedDevis, search])

  const loadDeletedDevis = useCallback(async () => {
    setDeletedLoading(true)
    try {
      const r = await gestionnaireApi.getDeletedDevis()
      setDeletedDevis(r.devis)
    } catch {
      setDeletedDevis([])
    } finally {
      setDeletedLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDeletedDevis()
  }, [loadDeletedDevis])

  useEffect(() => {
    setPage(1)
  }, [search, devisFilter])

  const { slice: pagePatients, totalPages: patientTotalPages, page: patientSafePage, total: patientListTotal } = useMemo(
    () => paginateSlice(patientsFiltered, page, LIST_PAGE_SIZE),
    [patientsFiltered, page],
  )

  const { slice: pageDeleted, totalPages: deletedTotalPages, page: deletedSafePage, total: deletedListTotal } = useMemo(
    () => paginateSlice(deletedFiltered, page, LIST_PAGE_SIZE),
    [deletedFiltered, page],
  )

  const totalPages = devisFilter === 'supprime' ? deletedTotalPages : patientTotalPages
  const safePage = devisFilter === 'supprime' ? deletedSafePage : patientSafePage
  const listTotal = devisFilter === 'supprime' ? deletedListTotal : patientListTotal

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

  const loadPatients = useCallback(async (opts?: { silent?: boolean; useCache?: boolean }) => {
    const key = queryKeys.gestionnairePatients()
    const force = !opts?.useCache
    if (!opts?.silent) {
      if (opts?.useCache && hasCachedData(key)) setListLoading(false)
      else setListLoading(true)
    }
    setPageError(null)
    try {
      const r = await cachedFetch(key, () => gestionnaireApi.getPatients(), { force })
      setPatients(r.patients)
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Impossible de charger.')
    } finally {
      if (!opts?.silent) setListLoading(false)
    }
  }, [])

  const loadPatientDetail = useCallback(async (id: string) => {
    if (!id) return
    setDetailLoading(true); setPageError(null)
    try { const r = await gestionnaireApi.getPatient(id); setPatientDetail(r.patient) }
    catch (e) { setPatientDetail(null); setPageError(e instanceof Error ? e.message : 'Erreur.') }
    finally { setDetailLoading(false) }
  }, [])

  useEffect(() => { void loadPatients({ useCache: true }) }, [loadPatients])

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
    createNewVersionOnceRef.current = false
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
    setHistoriqueSelectedIds([])
    navigate(`/gestionnaire/devis/${id}`)
  }

  const goBackToList = () => {
    setView('list')
    setSelectedPatient('')
    setPatientDetail(null)
    setShowModal(false)
    setHistoriqueSelectedIds([])
    navigate('/gestionnaire/devis')
  }

  useEffect(() => {
    if (view === 'detail' && selectedPatient) void loadPatientDetail(selectedPatient)
  }, [view, selectedPatient, loadPatientDetail])

  const existingDevis: Devis | null = useMemo(() => {
    const list = [...(patientDetail?.devis ?? [])]
    const editable = list.filter(
      (d) => d.statut === 'brouillon' || d.statut === 'envoye' || d.statut === 'accepte',
    )
    if (editable.length === 0) return null
    // Toujours la dernière version remplie (pas la première / un vieux brouillon).
    return editable.sort(
      (a, b) =>
        b.version - a.version ||
        +new Date(b.dateCreation) - +new Date(a.dateCreation),
    )[0]!
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

  useEffect(() => {
    if (patientRow?.status) {
      setDossierStatusDraft(patientRow.status)
      setStatusError(null)
    }
  }, [patientRow?.status, selectedPatient])

  const handleApplyDossierStatus = async () => {
    if (!selectedPatient || !dossierStatusDraft) return
    if (dossierStatusDraft === patientRow?.status) return
    setStatusSaving(true)
    setStatusError(null)
    try {
      await gestionnaireApi.updatePatientStatus(selectedPatient, dossierStatusDraft)
      setPatients((prev) =>
        prev.map((p) => (p.id === selectedPatient ? { ...p, status: dossierStatusDraft } : p)),
      )
      setPatientDetail((prev) =>
        prev && prev.id === selectedPatient ? { ...prev, status: dossierStatusDraft } : prev,
      )
      toast({ title: 'Statut dossier mis à jour', variant: 'success' })
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : 'Impossible de mettre à jour le statut.')
    } finally {
      setStatusSaving(false)
    }
  }

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
    const rap = patientDetail?.rapports?.[0] ?? rapportsList[0]
    const fromRapport = devisSejourDefaultsFromRapport(rap, formPayload)
    const qteAccomp = totalAccompagnantsQty(
      fromRapport.nbAdultes,
      fromRapport.nbEnfants,
      formPayload,
    )
    const qteHotelRaw = Number(fromRapport.hotelNuits)
    const qteHotel = Number.isFinite(qteHotelRaw) ? Math.max(0, Math.floor(qteHotelRaw)) : null
    const qteDrainage = drainageQtyFromRapport(rap)
    const fp = rap?.forfaitPropose ?? rapportsList[0]?.forfaitPropose
    const honoraires =
      typeof fp === 'number' && Number.isFinite(fp) && fp > 0 ? fp : undefined
    /** Ancien comportement « sync même fiche » retiré : un nouveau rapport → nouveau devis. */
    const syncFromRapport = false

    if (editing && existingDevis) {
      const baseLignes = existingDevis.lignes.map((l) => ({
        description: l.description,
        quantite: l.quantite,
        prixUnitaire: normalizeTndDinars(l.prixUnitaire),
      }))
      setLignes(
        syncFromRapport
          ? applyRapportToExistingLignes(baseLignes, {
              honorairesChirCliniquePu: honoraires,
              qteSuppCliniqueAccomp: qteAccomp,
              qteHotelNuits: qteHotel,
              qteDrainage,
            })
          : baseLignes,
      )
      const p = parseSejourMeta(existingDevis.notesSejour ?? existingDevis.planningMedical ?? '')
      const clinique = resolveCliniqueFromNom(p.cliniqueNom)
      const hotel = resolveHotelFromNom(p.hotelNom)
      setCliniqueChoice(clinique.choice)
      setCliniqueAutre(clinique.autre)
      setCliniqueNuits(syncFromRapport ? fromRapport.cliniqueNuits : (p.cliniqueNuits !== '' ? p.cliniqueNuits : fromRapport.cliniqueNuits))
      setHotelChoice(hotel.choice)
      setHotelAutre(hotel.autre)
      setHotelNuits(syncFromRapport ? fromRapport.hotelNuits : (p.hotelNuits !== '' ? p.hotelNuits : fromRapport.hotelNuits))
      setNbAdultes(syncFromRapport ? fromRapport.nbAdultes : (p.nbAdultes !== '' ? p.nbAdultes : fromRapport.nbAdultes))
      setNbEnfants(syncFromRapport ? fromRapport.nbEnfants : (p.nbEnfants !== '' ? p.nbEnfants : fromRapport.nbEnfants))
      setDureeSejourTotale(syncFromRapport ? fromRapport.dureeSejourTotale : (p.dureeSejourTotale !== '' ? p.dureeSejourTotale : fromRapport.dureeSejourTotale))
      setNotesSejour(p.noteSejour)
      setInclutIds(p.inclutIds ?? defaultInclutIds())
      setExclutIds(p.exclutIds ?? defaultExclutIds())
      setDrainageNb(syncFromRapport ? defaultDrainageNbFromRapport(rap) : (p.drainageNb ?? defaultDrainageNbFromRapport(rap)))
      setContentionDetail(p.contentionDetail ?? '')
      setIsEditingExisting(true)
      createNewVersionOnceRef.current = false
    } else {
      setLignes(
        buildDefaultLignes({
          honorairesChirCliniquePu: honoraires,
          qteSuppCliniqueAccomp: qteAccomp,
          qteHotelNuits: qteHotel ?? undefined,
          qteDrainage: qteDrainage ?? undefined,
        }),
      )
      setCliniqueChoice(''); setCliniqueAutre('')
      setCliniqueNuits(fromRapport.cliniqueNuits)
      setHotelChoice(''); setHotelAutre('')
      setHotelNuits(fromRapport.hotelNuits)
      setNbAdultes(fromRapport.nbAdultes)
      setNbEnfants(fromRapport.nbEnfants)
      setDureeSejourTotale(fromRapport.dureeSejourTotale)
      setNotesSejour('')
      setInclutIds(defaultInclutIds())
      setExclutIds(defaultExclutIds())
      setDrainageNb(defaultDrainageNbFromRapport(rap))
      setContentionDetail('')
      setIsEditingExisting(false)
      createNewVersionOnceRef.current = devisVersions.length > 0
    }
    setSent(false); setSavedDraft(false)
    setModalError(null)
    setCliniqueNomInvalid(false)
    setHotelNomInvalid(false)
    setShowModal(true)
  }

  const buildPayload = () => {
    const ls = lignes
      .filter((l) => l.description.trim().length > 0)
      .map((l) => {
        const quantite = Math.max(0, Math.round(l.quantite))
        return {
          description: l.description.trim(),
          quantite,
          prixUnitaire: l.prixUnitaire,
          total: quantite * l.prixUnitaire,
        }
      })
    const latestRapportId = (patientDetail?.rapports?.[0] ?? rapportsList[0])?.id ?? null
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
          inclutIds,
          exclutIds,
          drainageNb,
          contentionDetail,
        }) || null,
      currency,
      // Nouvelle fiche : 1er save = nouvelle version ; les suivants mettent à jour ce brouillon
      nouvelleVersion: createNewVersionOnceRef.current && devisVersions.length > 0,
      rapportId: latestRapportId,
    }
  }

  const validateSejourNoms = (): boolean => {
    const cliniqueOk = cliniqueNomFromChoice(cliniqueChoice, cliniqueAutre).trim().length > 0
    const hotelOk = hotelNomFromChoice(hotelChoice, hotelAutre).trim().length > 0
    setCliniqueNomInvalid(!cliniqueOk)
    setHotelNomInvalid(!hotelOk)
    if (!cliniqueOk || !hotelOk) {
      const missing = [
        !cliniqueOk ? 'nom de la clinique' : null,
        !hotelOk ? "nom de l'hôtel" : null,
      ].filter(Boolean)
      setModalError(`Champ(s) obligatoire(s) : ${missing.join(' et ')}.`)
      return false
    }
    setModalError(null)
    return true
  }

  /** Persiste le brouillon (manuel ou auto). Silent = pas de validation noms / pas de reload complet. */
  const persistDraft = useCallback(async (opts?: {
    silent?: boolean
    requireNoms?: boolean
  }): Promise<boolean> => {
    const silent = opts?.silent ?? false
    const requireNoms = opts?.requireNoms ?? !silent
    if (!selectedPatient) return false
    const status = patientRow?.status ?? patientDetail?.status
    if (!status || !canPatientHaveDevis(status)) {
      if (!silent) {
        setModalError(
          'Impossible d’enregistrer : le rapport médical du médecin doit d’abord être généré.',
        )
      }
      return false
    }
    if (requireNoms && !validateSejourNoms()) return false

    const payload = buildPayload()
    if (payload.lignes.length === 0) {
      if (!silent) setModalError('Ajoutez au moins une prestation avec une désignation.')
      return false
    }

    if (draftSaveInFlightRef.current) {
      if (silent) draftSavePendingRef.current = true
      return false
    }
    draftSaveInFlightRef.current = true
    if (silent) setAutoSaving(true)
    else {
      setActionLoading(true)
      setModalError(null)
      setPageError(null)
    }

    try {
      const r = await gestionnaireApi.upsertDevisDraft(selectedPatient, payload)
      let savedDevis = r.devis
      const existingContent =
        r.devis.customContent
        ?? patientDetail?.devis?.find((d) => d.id === r.devis.id)?.customContent
        ?? null
      if (existingContent?.trim()) {
        const detail = patientDetail?.id === selectedPatient
          ? patientDetail
          : (await gestionnaireApi.getPatient(selectedPatient)).patient
        const devisForSync: Devis = {
          ...r.devis,
          lignes: payload.lignes,
          total: payload.total,
          notesSejour: payload.notesSejour,
          currency: payload.currency,
          dateValidite: payload.dateValidite,
          planningMedical: payload.planningMedical,
          customContent: existingContent,
        }
        const letterCtx = letterContextFromGestionnairePatient(
          {
            ...detail,
            devis: detail.devis?.some((d) => d.id === r.devis.id)
              ? detail.devis.map((d) => (d.id === r.devis.id ? devisForSync : d))
              : [...(detail.devis ?? []), devisForSync],
          },
          devisForSync,
        )
        const { contentToSave } = refreshDevisCustomContentParts({
          customContent: existingContent,
          devis: devisForSync,
          letterContext: letterCtx,
          tndPerEur: tauxEur?.tndPerEur ?? DEFAULT_TND_PER_EUR,
        })
        await gestionnaireApi.saveDevisCustomContent(r.devis.id, contentToSave)
        savedDevis = { ...r.devis, customContent: contentToSave }
      }

      setPatientDetail((prev) => {
        if (!prev || prev.id !== selectedPatient) return prev
        const rest = (prev.devis ?? []).filter((d) => d.id !== savedDevis.id)
        return { ...prev, devis: [savedDevis, ...rest] }
      })
      createNewVersionOnceRef.current = false
      setIsEditingExisting(true)
      setSavedDraft(true)
      window.setTimeout(() => setSavedDraft(false), 2200)

      if (!silent) {
        await loadPatientDetail(selectedPatient)
        await loadPatients()
      }
      return true
    } catch (e) {
      if (!silent) setModalError(apiErrorMessage(e))
      else console.error('[devis] auto-save échoué', e)
      return false
    } finally {
      draftSaveInFlightRef.current = false
      if (silent) setAutoSaving(false)
      else setActionLoading(false)
      if (silent && draftSavePendingRef.current) {
        draftSavePendingRef.current = false
        window.setTimeout(() => { void persistDraftSilentRef.current() }, 200)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- buildPayload/validate lisent l’état courant
  }, [
    selectedPatient,
    patientRow?.status,
    patientDetail,
    tauxEur?.tndPerEur,
    loadPatientDetail,
    loadPatients,
    lignes,
    cliniqueChoice,
    cliniqueAutre,
    cliniqueNuits,
    hotelChoice,
    hotelAutre,
    hotelNuits,
    nbAdultes,
    nbEnfants,
    dureeSejourTotale,
    notesSejour,
    inclutIds,
    exclutIds,
    drainageNb,
    contentionDetail,
    currency,
  ])

  persistDraftSilentRef.current = () => persistDraft({ silent: true, requireNoms: false })

  const draftFormSnapshot = useMemo(
    () =>
      JSON.stringify({
        lignes,
        cliniqueChoice,
        cliniqueAutre,
        cliniqueNuits,
        hotelChoice,
        hotelAutre,
        hotelNuits,
        nbAdultes,
        nbEnfants,
        dureeSejourTotale,
        notesSejour,
        inclutIds,
        exclutIds,
        drainageNb,
        contentionDetail,
      }),
    [
      lignes,
      cliniqueChoice,
      cliniqueAutre,
      cliniqueNuits,
      hotelChoice,
      hotelAutre,
      hotelNuits,
      nbAdultes,
      nbEnfants,
      dureeSejourTotale,
      notesSejour,
      inclutIds,
      exclutIds,
      drainageNb,
      contentionDetail,
    ],
  )

  // Après ouverture du modal : ignorer le premier snapshot (hydratation), puis auto-save
  useEffect(() => {
    if (!showModal) {
      setModalReady(false)
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)
      setAutoSaving(false)
      return
    }
    setModalReady(false)
    const ready = window.setTimeout(() => setModalReady(true), 600)
    return () => clearTimeout(ready)
  }, [showModal])

  useEffect(() => {
    if (!showModal || !modalReady) return
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)
    draftSaveTimerRef.current = setTimeout(() => {
      void persistDraftSilentRef.current()
    }, 900)
    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)
    }
  }, [showModal, modalReady, draftFormSnapshot])

  const flushDraftAndCloseModal = useCallback(() => {
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)
    void (async () => {
      if (modalReady) await persistDraftSilentRef.current()
      setShowModal(false)
      setModalReady(false)
    })()
  }, [modalReady])

  const handleSaveDraft = async () => {
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)
    await persistDraft({ silent: false, requireNoms: true })
  }

  const handleSend = async () => {
    if (!selectedPatient) return
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)
    const status = patientRow?.status ?? patientDetail?.status
    if (!status || !canPatientHaveDevis(status)) {
      setModalError(
        'Impossible d’envoyer : le rapport médical du médecin doit d’abord être généré.',
      )
      return
    }
    if (!validateSejourNoms()) return
    if (buildPayload().lignes.length === 0) {
      setModalError('Ajoutez au moins une prestation avec une désignation.')
      return
    }
    setActionLoading(true); setModalError(null); setPageError(null)
    try {
      const payload = buildPayload()
      const r = await gestionnaireApi.upsertDevisDraft(selectedPatient, payload)
      // PDF chat = même HTML rafraîchi que l’éditeur / espace patient / médecin
      const detail = patientDetail?.id === selectedPatient
        ? patientDetail
        : (await gestionnaireApi.getPatient(selectedPatient)).patient
      const devisForPdf: Devis = {
        ...r.devis,
        lignes: payload.lignes,
        total: payload.total,
        notesSejour: payload.notesSejour,
        currency: payload.currency,
        dateValidite: payload.dateValidite,
        planningMedical: payload.planningMedical,
        customContent:
          r.devis.customContent
          ?? detail.devis?.find((d) => d.id === r.devis.id)?.customContent
          ?? null,
      }
      const patientForPdf = {
        ...detail,
        devis: detail.devis?.some((d) => d.id === r.devis.id)
          ? detail.devis.map((d) => (d.id === r.devis.id ? devisForPdf : d))
          : [...(detail.devis ?? []), devisForPdf],
      }
      const rate = tauxEur?.tndPerEur ?? DEFAULT_TND_PER_EUR
      const letterCtx = letterContextFromGestionnairePatient(patientForPdf, devisForPdf)
      const { topHtml, botHtml, contentToSave } = refreshDevisCustomContentParts({
        customContent: devisForPdf.customContent,
        devis: devisForPdf,
        letterContext: letterCtx,
        tndPerEur: rate,
      })
      // Persister le modèle rafraîchi (sinon patient/médecin gardent l’ancienne lettre TipTap)
      await gestionnaireApi.saveDevisCustomContent(r.devis.id, contentToSave)
      const fullHtml = await inlineHtmlImages(
        buildGestionnaireDevisExportHtml({
          devis: { ...devisForPdf, customContent: contentToSave },
          patient: patientForPdf,
          topHtml,
          botHtml,
          tndPerEur: rate,
        }),
      )
      await gestionnaireApi.sendDevis(r.devis.id, { html: fullHtml })
      feedbackSuccess('Devis envoyé', 'Le patient a reçu le devis (PDF joint au chat).')
      setSent(true); setTimeout(() => { setSent(false); setShowModal(false) }, 2000)
      setIsEditingExisting(false)
      await loadPatientDetail(selectedPatient); await loadPatients()
    } catch (e) { setModalError(apiErrorMessage(e)) }
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
    if (!validateSejourNoms()) return
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)
    setActionLoading(true); setModalError(null); setPageError(null)
    try {
      // Sauvegarder brouillon + synchroniser immédiatement le HTML lettre (inclut/exclut)
      const payload = buildPayload()
      const r = await gestionnaireApi.upsertDevisDraft(selectedPatient, payload)
      const detail = patientDetail?.id === selectedPatient
        ? patientDetail
        : (await gestionnaireApi.getPatient(selectedPatient)).patient
      const devisForSync: Devis = {
        ...r.devis,
        lignes: payload.lignes,
        total: payload.total,
        notesSejour: payload.notesSejour,
        currency: payload.currency,
        dateValidite: payload.dateValidite,
        planningMedical: payload.planningMedical,
        customContent: r.devis.customContent
          ?? detail.devis?.find((d) => d.id === r.devis.id)?.customContent
          ?? null,
      }
      const letterCtx = letterContextFromGestionnairePatient(
        {
          ...detail,
          devis: detail.devis?.some((d) => d.id === r.devis.id)
            ? detail.devis.map((d) => (d.id === r.devis.id ? devisForSync : d))
            : [...(detail.devis ?? []), devisForSync],
        },
        devisForSync,
      )
      const { contentToSave } = refreshDevisCustomContentParts({
        customContent: devisForSync.customContent,
        devis: devisForSync,
        letterContext: letterCtx,
        tndPerEur: tauxEur?.tndPerEur ?? DEFAULT_TND_PER_EUR,
      })
      await gestionnaireApi.saveDevisCustomContent(r.devis.id, contentToSave)
      setShowModal(false)
      setModalReady(false)
      navigate(
        `/gestionnaire/devis/${selectedPatient}/personnaliser?devisId=${encodeURIComponent(r.devis.id)}`,
      )
    } catch (e) {
      setModalError(e instanceof Error ? e.message : 'Erreur.')
    } finally {
      setActionLoading(false)
    }
  }

  const closeDeleteDialog = () => {
    if (deleteLoading) return
    setPendingDelete(null)
    setDeleteError(null)
  }

  const requestDeleteDevis = (devisIds: string | string[]) => {
    const ids = (Array.isArray(devisIds) ? devisIds : [devisIds]).filter(Boolean)
    if (ids.length === 0) return
    setDeleteError(null)
    setPendingDelete({ kind: 'devis', devisIds: ids })
  }

  const requestRemoveFromDevisList = (patientId: string, patientName: string) => {
    setDeleteError(null)
    setPendingDelete({ kind: 'dossier', patientId, patientName })
  }

  const devisDisplayName = (
    d: { numeroDevis?: string | null; version: number },
    dossierNumber: string | null | undefined,
    patientName: string,
  ) =>
    formatDevisListName(
      getDevisDisplayNumber(d, dossierNumber) || dossierNumber,
      patientName,
      d.version,
    )

  /** Ouvre la popup de choix de version(s) à supprimer. */
  const openDeleteVersionPicker = async (
    e: MouseEvent | null,
    patientId: string,
    patientName: string,
    preferredDevisId?: string,
  ) => {
    e?.stopPropagation()
    setDeleteError(null)
    setDeletePicker({
      patientId,
      patientName,
      dossierNumber: '',
      versions: [],
      selectedIds: preferredDevisId ? [preferredDevisId] : [],
      loading: true,
    })
    try {
      const r = await gestionnaireApi.getPatient(patientId)
      const dossierNumber = r.patient.dossierNumber ?? ''
      const versions = [...(r.patient.devis ?? [])]
        .sort((a, b) => b.version - a.version || +new Date(b.dateCreation) - +new Date(a.dateCreation))
      if (versions.length === 0) {
        setDeletePicker(null)
        requestRemoveFromDevisList(patientId, patientName)
        return
      }
      if (versions.length === 1) {
        setDeletePicker(null)
        requestDeleteDevis(versions[0]!.id)
        return
      }
      const selectedIds =
        preferredDevisId && versions.some((d) => d.id === preferredDevisId)
          ? [preferredDevisId]
          : [versions[0]!.id]
      setDeletePicker({
        patientId,
        patientName,
        dossierNumber,
        versions,
        selectedIds,
        loading: false,
      })
    } catch (err) {
      setDeletePicker(null)
      setPageError(err instanceof Error ? err.message : 'Impossible de charger les versions.')
    }
  }

  const toggleDeletePickerId = (id: string) => {
    setDeletePicker((prev) => {
      if (!prev) return prev
      const has = prev.selectedIds.includes(id)
      return {
        ...prev,
        selectedIds: has
          ? prev.selectedIds.filter((x) => x !== id)
          : [...prev.selectedIds, id],
      }
    })
  }

  const confirmDeletePickerSelection = () => {
    if (!deletePicker?.selectedIds.length) return
    const ids = [...deletePicker.selectedIds]
    setDeletePicker(null)
    requestDeleteDevis(ids)
  }

  const confirmPendingDelete = async () => {
    if (!pendingDelete) return
    setDeleteLoading(true)
    setDeleteError(null)
    setActionLoading(true)
    setPageError(null)
    try {
      if (pendingDelete.kind === 'devis') {
        for (const id of pendingDelete.devisIds) {
          await gestionnaireApi.deleteDevis(id)
        }
        setShowModal(false)
        setIsEditingExisting(false)
        setHistoriqueSelectedIds([])
        if (selectedPatient) await loadPatientDetail(selectedPatient)
        const n = pendingDelete.devisIds.length
        toast({
          title: n > 1 ? `${n} devis déplacés dans « Supprimés »` : 'Devis déplacé dans « Supprimés »',
          description: n > 1
            ? 'Ces versions sont retirées de l’espace patient et du chat.'
            : 'Cette version est retirée de l’espace patient et du chat.',
          variant: 'success',
        })
        await loadDeletedDevis()
      } else {
        await gestionnaireApi.updatePatientStatus(pendingDelete.patientId, 'abstention')
        if (selectedPatient === pendingDelete.patientId) goBackToList()
        toast({ title: 'Dossier retiré de la liste des devis.', variant: 'success' })
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
    if (!selectedPatient || !patientRow) return
    void openDeleteVersionPicker(
      null,
      selectedPatient,
      patientRow.user.fullName,
      existingDevis?.id,
    )
  }

  const handleDeleteDevisFromList = (e: MouseEvent, patientId: string, patientName: string, devisId?: string) => {
    void openDeleteVersionPicker(e, patientId, patientName, devisId)
  }

  const handleRemoveDossierFromList = (e: MouseEvent, patientId: string, patientName: string) => {
    e.stopPropagation()
    requestRemoveFromDevisList(patientId, patientName)
  }

  const openAbstentionMessage = () => {
    setAbstentionMsgError(null)
    setAbstentionMsgOpen(true)
    const fullName = patientRow?.user.fullName ?? patientDetail?.user.fullName ?? ''
    setAbstentionMsg(applyTemplateVars(ABSTENTION_MESSAGE_FALLBACK, fullName))
    void gestionnaireApi
      .getCommunicationTemplates()
      .then((res) => {
        const tpl = res.templates.find((t) => t.key === 'abstention')
        if (!tpl?.active || !tpl.content.trim()) return
        setAbstentionMsg(applyTemplateVars(tpl.content, fullName))
      })
      .catch(() => {
        // Repli déjà appliqué
      })
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
      toast({ title: 'Message envoyé à la patiente.', variant: 'success' })
    } catch (e) {
      setAbstentionMsgError(e instanceof Error ? e.message : 'Envoi impossible.')
    } finally {
      setAbstentionMsgSending(false)
    }
  }

  const openRappelDevis = (
    e: MouseEvent | null,
    patientId: string,
    patientName: string,
    devis: { id: string; numeroDevis?: string | null; version?: number },
  ) => {
    e?.stopPropagation()
    setRappelError(null)
    setRappelTarget({
      patientId,
      patientName,
      devisId: devis.id,
      numeroDevis: devis.numeroDevis,
      version: devis.version,
    })
    setRappelMsg(applyTemplateVars(DEVIS_RAPPEL_MESSAGE_FALLBACK, patientName))
    setRappelOpen(true)
    void gestionnaireApi
      .getCommunicationTemplates()
      .then((res) => {
        const tpl = res.templates.find((t) => t.key === 'devisRappel')
        if (!tpl?.active || !tpl.content.trim()) return
        setRappelMsg(applyTemplateVars(tpl.content, patientName))
      })
      .catch(() => {
        /* repli déjà appliqué */
      })
  }

  const sendRappelDevis = async () => {
    if (!rappelTarget) return
    const contenu = rappelMsg.trim()
    if (!contenu) {
      setRappelError('Le message ne peut pas être vide.')
      return
    }
    setRappelSending(true)
    setRappelError(null)
    try {
      const detail =
        patientDetail?.id === rappelTarget.patientId
          ? patientDetail
          : (await gestionnaireApi.getPatient(rappelTarget.patientId)).patient
      const devisForPdf =
        detail.devis?.find((d) => d.id === rappelTarget.devisId)
        ?? detail.devis?.find((d) => d.statut === 'envoye')
        ?? null
      if (!devisForPdf) {
        setRappelError('Aucun devis envoyé trouvé pour cette patiente.')
        return
      }
      const rate = tauxEur?.tndPerEur ?? DEFAULT_TND_PER_EUR
      const letterCtx = letterContextFromGestionnairePatient(detail, devisForPdf)
      const { topHtml, botHtml, contentToSave } = refreshDevisCustomContentParts({
        customContent: devisForPdf.customContent,
        devis: devisForPdf,
        letterContext: letterCtx,
        tndPerEur: rate,
      })
      const fullHtml = await inlineHtmlImages(
        buildGestionnaireDevisExportHtml({
          devis: { ...devisForPdf, customContent: contentToSave },
          patient: detail,
          topHtml,
          botHtml,
          tndPerEur: rate,
        }),
      )
      const r = await gestionnaireApi.sendDevisRappel(devisForPdf.id, {
        contenu,
        html: fullHtml,
      })
      setRappelOpen(false)
      setRappelTarget(null)
      toast({
        title: 'Rappel envoyé',
        description: r.pdfAttached
          ? 'Message + PDF dans le chat, email envoyé à la patiente.'
          : 'Message envoyé (PDF non joint), email envoyé à la patiente.',
        variant: 'success',
      })
    } catch (e) {
      setRappelError(e instanceof Error ? e.message : 'Envoi impossible.')
    } finally {
      setRappelSending(false)
    }
  }

  const openMajRapport = () => {
    if (!patientRow) return
    setMajRapportError(null)
    setMajRapportMsg(
      applyTemplateVars(
        DEMANDE_MAJ_RAPPORT_FALLBACK,
        patientRow.user.fullName,
        patientRow.dossierNumber,
      ),
    )
    setMajRapportOpen(true)
  }

  const sendMajRapport = async () => {
    if (!patientRow) return
    const message = majRapportMsg.trim()
    if (!message) {
      setMajRapportError('Le message ne peut pas être vide.')
      return
    }
    setMajRapportSending(true)
    setMajRapportError(null)
    try {
      await gestionnaireApi.requestRapportUpdate(patientRow.id, { message })
      setMajRapportOpen(false)
      feedbackSuccess(
        'Message envoyé au médecin',
        'Dans le chat du dossier (interne) + notification. Ouvrir Messages côté médecin.',
      )
    } catch (e) {
      setMajRapportError(e instanceof Error ? e.message : 'Envoi impossible.')
    } finally {
      setMajRapportSending(false)
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
      supprime:  deletedDevis.length,
    }
    const listBusy = devisFilter === 'supprime' ? deletedLoading : listLoading
    const showingDeleted = devisFilter === 'supprime'
    const refreshList = () => {
      if (showingDeleted) void loadDeletedDevis()
      else void loadPatients()
    }

    return (
    <div className="flex-1 overflow-y-auto">
      <PullToRefresh onRefresh={async () => {
        if (showingDeleted) await loadDeletedDevis()
        else await loadPatients({ silent: true })
      }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 space-y-5">

        <PageHeader
          title="Gestion des devis"
          description="Préparez, personnalisez et envoyez les devis patients."
          actions={
            <Button variant="outline" size="sm" className="gap-1.5" onClick={refreshList} disabled={listBusy}>
              <RefreshCw className={`h-3.5 w-3.5 ${listBusy ? 'animate-spin' : ''}`} /> Actualiser
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
            { key: 'supprime', label: 'Supprimés', value: deletedLoading && deletedDevis.length === 0 ? '—' : kpi.supprime, tone: 'default', active: devisFilter === 'supprime', onClick: () => setDevisFilter('supprime') },
          ]}
        />

        {/* ── Barre de recherche + filtres ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                className="w-full pl-10 pr-9 py-2.5 text-sm rounded-xl border border-slate-200 bg-muted/20 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30 focus:border-brand-400 transition"
                placeholder={showingDeleted ? 'Rechercher nom, n° dossier, n° devis…' : 'Rechercher nom, n° dossier…'}
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
                { key: 'supprime'  as const, label: 'Supprimés' },
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
              {showingDeleted ? (
                <>
                  <span className="font-semibold text-foreground">{deletedFiltered.length}</span>
                  {' '}devis supprimé{deletedFiltered.length > 1 ? 's' : ''}
                  {search ? ' (filtrés)' : ''}
                </>
              ) : (
                <>
                  <span className="font-semibold text-foreground">{patientsFiltered.length}</span> patient{patientsFiltered.length > 1 ? 's' : ''}
                  {devisFilter !== 'all' || search ? ' (filtrés)' : ''}
                </>
              )}
            </p>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={refreshList} disabled={listBusy}>
              <RefreshCw className={`h-3.5 w-3.5 ${listBusy ? 'animate-spin' : ''}`} /> Actualiser
            </Button>
          </div>

          {/* Skeleton loading */}
          {listBusy && (
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

          {/* Vide — devis supprimés */}
          {!listBusy && showingDeleted && deletedFiltered.length === 0 && (
            <EmptyState
              icon={Trash2}
              title="Aucun devis supprimé"
              description={
                search
                  ? `Aucun résultat pour « ${search} »`
                  : 'Les devis supprimés apparaissent ici. Ils sont retirés automatiquement de l’espace patient.'
              }
              actionLabel={search ? 'Effacer la recherche' : undefined}
              onAction={search ? () => setSearch('') : undefined}
            />
          )}

          {/* Vide — patients */}
          {!listBusy && !showingDeleted && patientsFiltered.length === 0 && (
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

          {/* Liste — devis supprimés */}
          {!listBusy && showingDeleted && deletedFiltered.length > 0 && (
            <>
            <div className="divide-y divide-border/40">
              {(pageDeleted).map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-muted/20 transition-colors"
                >
                  <Avatar className="h-9 w-9 sm:h-10 sm:w-10 shrink-0">
                    <AvatarFallback className="bg-slate-100 text-slate-600 font-bold text-xs rounded-xl">
                      {initials(d.patient.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900 truncate">{d.patient.fullName}</p>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-md shrink-0">
                        {d.patient.dossierNumber}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[11px] text-slate-400">
                      <span>{d.numeroDevis || 'Sans n°'}</span>
                      <span>·</span>
                      <span>v{d.version}</span>
                      <span>·</span>
                      <span>{formatCurrency(d.total, (d.currency as CurrencyUnit) || 'TND')}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-600 border-slate-200">
                      Supprimé
                    </span>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDateTime(d.deletedAt)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs shrink-0"
                    onClick={() => openDetail(d.patient.id)}
                  >
                    Dossier
                    <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                  </Button>
                </div>
              ))}
            </div>
            <PaginationBar
              page={safePage}
              totalPages={totalPages}
              total={listTotal}
              pageSize={LIST_PAGE_SIZE}
              onPageChange={setPage}
            />
            </>
          )}

          {/* Liste */}
          {!listBusy && !showingDeleted && patientsFiltered.length > 0 && (
            <>
            <div className="divide-y divide-border/40">
              {pagePatients.map((p) => {
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

                  {devisStatut === 'envoye' && lastDevis && (
                    <button
                      type="button"
                      title="Envoyer un rappel devis"
                      disabled={actionLoading || rappelSending}
                      onClick={(e) =>
                        openRappelDevis(e, p.id, p.user.fullName, {
                          id: lastDevis.id,
                          numeroDevis: lastDevis.numeroDevis,
                        })
                      }
                      className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-sky-500 hover:text-sky-700 hover:bg-sky-50 transition-colors disabled:opacity-50"
                    >
                      <Bell className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {/* Supprimer devis OU retirer le dossier sans devis */}
                  <button
                    type="button"
                    title={lastDevis ? 'Supprimer le devis' : 'Retirer de la liste des devis'}
                    disabled={actionLoading}
                    onClick={(e) =>
                      lastDevis
                        ? handleDeleteDevisFromList(e, p.id, p.user.fullName, lastDevis.id)
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
            <PaginationBar
              page={safePage}
              totalPages={totalPages}
              total={listTotal}
              pageSize={LIST_PAGE_SIZE}
              onPageChange={setPage}
            />
            </>
          )}
        </div>

      </div>
      </PullToRefresh>
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

    const latestRapport = rapportsList[0] ?? null
    const rapportIdsUsedByDevis = new Set(
      devisVersions.map((d) => d.rapportId).filter((id): id is string => !!id),
    )
    const needsNewDevisFromRapport = Boolean(
      latestRapport &&
      existingDevis &&
      (
        rapportIdsUsedByDevis.size > 0
          ? !rapportIdsUsedByDevis.has(latestRapport.id)
          : +new Date(latestRapport.createdAt) > +new Date(existingDevis.dateCreation)
      ),
    )

    const devisActionLabel =
      !existingDevis || existingDevis.statut === 'refuse'
        ? 'Créer un devis'
        : needsNewDevisFromRapport
          ? `Créer un nouveau devis (v${(devisVersions[0]?.version ?? 0) + 1})`
          : existingDevis.statut === 'brouillon'
            ? 'Modifier le brouillon'
            : 'Modifier le devis'

    const devisAllowed = canPatientHaveDevis(patientRow.status)
    const isAbstention = patientRow.status === 'abstention'

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 sm:px-8 py-5 sm:py-6 space-y-5 pb-14">

            <button
              onClick={goBackToList}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Retour à la liste
            </button>

            {/* Hero dossier */}
            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
              <div
                className="px-4 sm:px-6 pt-5 pb-4 space-y-4"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(6,42,48,0.06) 0%, rgba(184,140,92,0.08) 55%, rgba(255,255,255,0.9) 100%)',
                }}
              >
                {/* Identité */}
                <div className="flex items-start gap-3 sm:gap-4">
                  <Avatar className="h-12 w-12 sm:h-14 sm:w-14 shrink-0 ring-2 ring-white shadow-sm">
                    <AvatarFallback className="bg-brand-100 text-brand-800 text-base sm:text-lg font-bold">
                      {initials(patientRow.user.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-2">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">
                      {patientRow.user.fullName}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] sm:text-xs font-mono font-semibold text-brand-800 bg-white/90 border border-brand-100 px-2 py-0.5 rounded-md">
                        {patientRow.dossierNumber}
                      </span>
                      <StatusBadge kind="dossier" value={patientRow.status} />
                      {devisStatut && <StatusBadge kind="devis" value={devisStatut} />}
                      {devisStatut === 'envoye' && (
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${isRead ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {isRead
                            ? <><Eye className="h-3 w-3" /> Vu le {formatDateTime(existingDevis!.vuParPatientAt!)}</>
                            : <><EyeOff className="h-3 w-3" /> Pas encore consulté</>}
                        </span>
                      )}
                      {devisStatut === 'accepte' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" /> Accepté
                          {isRead && (
                            <span className="font-normal text-slate-400">
                              · lu le {formatDateTime(existingDevis!.vuParPatientAt!)}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Coordonnées — grille pleine largeur */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 rounded-xl border border-white/80 bg-white/70 px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0 text-xs text-slate-700">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{patientRow.user.email || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0 text-xs text-slate-700">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{patientRow.phone || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0 text-xs text-slate-700">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">
                      {[patientRow.ville, patientRow.pays].filter(Boolean).join(', ') || '—'}
                    </span>
                  </div>
                </div>

                {/* Actions — barre unique */}
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    {isAbstention ? (
                      <Button
                        variant="brand"
                        className="gap-2 h-10 text-sm font-semibold"
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
                          className="gap-2 h-10 text-sm font-semibold"
                          onClick={() =>
                            openModal(
                              needsNewDevisFromRapport
                                ? false
                                : !!existingDevis && existingDevis.statut !== 'refuse',
                            )
                          }
                          disabled={detailLoading || !devisAllowed}
                          title={
                            devisAllowed
                              ? needsNewDevisFromRapport
                                ? 'Nouveau devis à partir du dernier rapport — les versions précédentes restent conservées.'
                                : undefined
                              : 'En attente du rapport médical (médecin) avant devis.'
                          }
                        >
                          <FileText className="h-4 w-4" />
                          {devisActionLabel}
                        </Button>
                        {existingDevis && existingDevis.statut === 'envoye' && (
                          <Button
                            type="button"
                            variant="outline"
                            className="gap-1.5 h-10 text-sm border-sky-200 text-sky-700 hover:bg-sky-50 bg-white"
                            disabled={detailLoading || rappelSending}
                            onClick={() =>
                              openRappelDevis(null, patientRow.id, patientRow.user.fullName, {
                                id: existingDevis.id,
                                numeroDevis: existingDevis.numeroDevis,
                                version: existingDevis.version,
                              })
                            }
                          >
                            <Bell className="h-4 w-4" />
                            Rappel devis
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          className="gap-1.5 h-10 text-sm border-brand-200 text-brand-800 hover:bg-brand-50 bg-white"
                          disabled={detailLoading || majRapportSending}
                          onClick={openMajRapport}
                          title="Demander un nouveau rapport au médecin — sans toucher aux devis existants"
                        >
                          <Stethoscope className="h-4 w-4" />
                          Écrire au Dr Chennoufi
                        </Button>
                        {existingDevis && (
                          <Button
                            type="button"
                            variant="outline"
                            className="gap-1.5 h-10 text-sm border-slate-200 bg-white"
                            onClick={() => {
                              if (devisVersions.length === 1) {
                                openConsultDevis(devisVersions[0].id)
                                return
                              }
                              setConsultVersionsOpen(true)
                            }}
                          >
                            <Eye className="h-4 w-4" />
                            Consulter
                            {devisVersions.length > 1 && (
                              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                            )}
                          </Button>
                        )}
                        {existingDevis && (
                          <Button
                            type="button"
                            variant="outline"
                            className="gap-1.5 h-10 text-sm text-destructive border-destructive/30 hover:bg-destructive/10 bg-white"
                            disabled={actionLoading}
                            onClick={() => handleDeleteDevis()}
                          >
                            <Trash2 className="h-4 w-4" />
                            Supprimer
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                  {isAbstention ? (
                    <p className="text-[11px] text-slate-500">
                      Transmettre la décision du médecin à la patiente.
                    </p>
                  ) : !devisAllowed ? (
                    <p className="text-[11px] text-amber-700">
                      Rapport médical requis avant devis.
                    </p>
                  ) : null}
                </div>
              </div>

              {(patientRow.status === 'rapport_modifie' ||
                (patientRow.status === 'rapport_genere' && (patientRow.rapportsCount ?? patientRow.rapports?.length ?? 0) > 1)) && (
                <div className="border-t border-amber-100 bg-amber-50/90 px-4 sm:px-6 py-3">
                  <p className="text-sm font-semibold text-amber-950">
                    {(patientRow.rapportsCount ?? patientRow.rapports?.length ?? 0) > 1
                      ? dossierStatusLabel(patientRow.status, patientRow.rapportsCount ?? patientRow.rapports?.length)
                      : 'Rapport modifié par le médecin'}
                  </p>
                  <p className="mt-0.5 text-[13px] text-amber-900/90">
                    {(patientRow.rapportsCount ?? patientRow.rapports?.length ?? 0) > 1
                      ? 'Créez un nouveau devis à partir de ce rapport. Les devis précédents restent conservés.'
                      : 'Reprenez la même fiche devis : forfait, nuits, drainage et examens sont mis à jour dans le tableau, le PDF et l’éditeur.'}
                  </p>
                </div>
              )}

              {/* Barre statut — comme médecin : badge actuel + classement */}
              <div className="border-t border-slate-200/80 px-4 sm:px-6 py-3 bg-white space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-medium text-slate-600 shrink-0">Statut dossier :</span>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border',
                      STATUS_COLORS[patientRow.status as DossierStatus] ?? 'bg-slate-100 text-slate-700 border-slate-200',
                    )}
                  >
                    {dossierStatusLabel(patientRow.status, patientRow.rapportsCount ?? patientRow.rapports?.length)}
                  </span>
                  <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                    <Select
                      value={dossierStatusDraft || patientRow.status}
                      onValueChange={(v) => {
                        setDossierStatusDraft(v)
                        setStatusError(null)
                      }}
                    >
                      <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200 border-dashed w-full sm:w-56">
                        <SelectValue placeholder="Modifier…" />
                      </SelectTrigger>
                    <SelectContent>
                      {DOSSIER_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                    </Select>
                    {dossierStatusDraft && dossierStatusDraft !== patientRow.status && (
                      <Button
                        size="sm"
                        variant="brand"
                        className="h-9 text-xs shrink-0 px-3"
                        disabled={statusSaving}
                        onClick={() => void handleApplyDossierStatus()}
                      >
                        {statusSaving ? '…' : 'Appliquer'}
                      </Button>
                    )}
                  </div>
                </div>
                {statusError && (
                  <p className="text-xs text-destructive flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {statusError}
                  </p>
                )}
              </div>
            </div>

            {isAbstention && (
              <div className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 via-white to-slate-50 px-4 sm:px-5 py-4 shadow-sm">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" aria-hidden />
                <div className="flex items-start gap-3 pl-1">
                  <div className="h-10 w-10 rounded-xl bg-amber-100 border border-amber-200/80 flex items-center justify-center shrink-0">
                    <Ban className="h-5 w-5 text-amber-700" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-slate-900">
                      Parcours interrompu — abstention médicale
                    </p>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      Dossier consultable. Réouverture via Patients → Abstention.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {detailLoading && (
              <div className="space-y-3">
                <Skeleton className="h-36 w-full rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
              </div>
            )}

            {!detailLoading && (
              <>
                {/* Aperçu identité — panneau toujours ouvert */}
                <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm px-4 sm:px-5 py-5">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                      <User className="h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900">Identité & coordonnées</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                    {([
                      [<User key="u" className="h-3.5 w-3.5" />, 'Nom complet', patientDetail?.user.fullName],
                      [<Mail key="m" className="h-3.5 w-3.5" />, 'Email', patientDetail?.user.email],
                      [<Phone key="p" className="h-3.5 w-3.5" />, 'Téléphone', patientDetail?.phone],
                      [<MapPin key="mp" className="h-3.5 w-3.5" />, 'Ville / Pays', [patientDetail?.ville, patientDetail?.pays].filter(Boolean).join(', ') || null],
                      [<User key="s" className="h-3.5 w-3.5" />, 'Source', patientDetail?.sourceContact ? formatSourceConnaissanceLabel(patientDetail.sourceContact) : null],
                      [<Calendar key="c" className="h-3.5 w-3.5" />, 'Compte créé le', patientDetail?.user.createdAt ? formatDate(patientDetail.user.createdAt) : null],
                    ] as [React.ReactNode, string, string | null | undefined][]).map(([icon, label, value]) => (
                      <div key={label} className="flex items-start gap-2.5 min-w-0">
                        <span className="text-slate-300 mt-0.5 shrink-0">{icon}</span>
                        <div className="min-w-0">
                          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{label}</p>
                          <p className="text-sm font-medium text-slate-800 mt-0.5 break-words">
                            {value || <span className="text-slate-300">—</span>}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <Section
                  icon={<ClipboardList className="h-4 w-4" />}
                  title="Formulaires médicaux"
                  count={
                    patientDetail?.formulaires?.length
                      ? 1
                      : 0
                  }
                  defaultOpen
                >
                  {!patientDetail?.formulaires.length ? (
                    <p className="text-sm text-slate-400 text-center py-4">Aucun formulaire soumis.</p>
                  ) : (
                    <div className="space-y-6">
                      {(() => {
                        // Un seul formulaire affiché : le plus récent soumis, sinon le plus récent.
                        const sorted = [...patientDetail.formulaires].sort(
                          (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
                        )
                        const uniqueById = sorted.filter(
                          (f, i, arr) => arr.findIndex((x) => x.id === f.id) === i,
                        )
                        const latestSubmitted = uniqueById.find((f) => f.status === 'submitted')
                        const toShow = latestSubmitted ? [latestSubmitted] : uniqueById.slice(0, 1)
                        const hiddenCount = Math.max(0, uniqueById.length - toShow.length)

                        return (
                          <>
                            {toShow.map((f) => (
                              <div key={f.id}>
                                <div className="flex items-center gap-3 mb-4">
                                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${f.status === 'submitted' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                                  <p className="text-sm font-semibold text-slate-700">
                                    Formulaire médical
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
                                {hiddenCount > 0 && (
                                  <p className="mt-3 text-xs text-slate-400">
                                    {hiddenCount} ancienne(s) version(s) masquée(s) — affichage du formulaire le plus récent uniquement.
                                  </p>
                                )}
                              </div>
                            ))}
                          </>
                        )
                      })()}
                    </div>
                  )}
                </Section>

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
                      {rapportsList.map((r, idx) => {
                        const n = rapportsList.length - idx
                        const isLatest = idx === 0
                        return (
                        <div key={r.id}>
                          {idx > 0 && <hr className="border-slate-100 mb-6" />}
                          <div className="flex items-center gap-2 mb-4 flex-wrap">
                            <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border ${
                              isLatest
                                ? 'bg-brand-50 text-brand-800 border-brand-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                              Rapport R{n}{isLatest ? ' · actuel' : ' · conservé'}
                            </span>
                            <p className="text-sm font-semibold text-slate-600">
                              {formatDate(r.createdAt)}
                            </p>
                          </div>
                          <RapportView r={r} currency={currency} />
                        </div>
                        )
                      })}
                    </div>
                  ) : null}
                </Section>

                <Section
                  icon={<FileText className="h-4 w-4" />}
                  title="Historique des devis"
                  count={patientDetail?.devis.length ?? 0}
                  defaultOpen
                >
                  {!devisVersions.length ? (
                    <p className="text-sm text-slate-400 text-center py-4">Aucun devis créé.</p>
                  ) : (
                    <div className="space-y-2">
                      {historiqueSelectedIds.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-100 bg-red-50/70 px-3 py-2">
                          <p className="text-xs font-medium text-red-800">
                            {historiqueSelectedIds.length} devis sélectionné{historiqueSelectedIds.length > 1 ? 's' : ''}
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setHistoriqueSelectedIds([])}
                            >
                              Tout désélectionner
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="h-7 gap-1 text-xs"
                              disabled={actionLoading}
                              onClick={() => requestDeleteDevis(historiqueSelectedIds)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Supprimer
                            </Button>
                          </div>
                        </div>
                      )}
                      <div className="divide-y divide-slate-100">
                        {devisVersions.map((d) => {
                          const sc = {
                            accepte:   { label: 'Accepté',  cls: 'bg-emerald-100 text-emerald-700' },
                            refuse:    { label: 'Refusé',   cls: 'bg-red-100 text-red-600' },
                            envoye:    { label: 'Envoyé',   cls: 'bg-blue-100 text-blue-700' },
                            brouillon: { label: 'Brouillon',cls: 'bg-slate-100 text-slate-600' },
                          }[d.statut] ?? { label: d.statut, cls: 'bg-slate-100 text-slate-600' }
                          const devisName = devisDisplayName(
                            d,
                            patientRow.dossierNumber,
                            patientRow.user.fullName,
                          )
                          const checked = historiqueSelectedIds.includes(d.id)
                          return (
                            <div key={d.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                              <button
                                type="button"
                                aria-label={checked ? 'Désélectionner' : 'Sélectionner'}
                                onClick={() =>
                                  setHistoriqueSelectedIds((prev) =>
                                    checked ? prev.filter((id) => id !== d.id) : [...prev, d.id],
                                  )
                                }
                                className={cn(
                                  'h-4 w-4 rounded border shrink-0 flex items-center justify-center transition-colors',
                                  checked
                                    ? 'bg-brand-600 border-brand-600 text-white'
                                    : 'border-slate-300 bg-white hover:border-brand-400',
                                )}
                              >
                                {checked ? <CheckCircle2 className="h-3 w-3" /> : null}
                              </button>
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
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-xs text-destructive hover:bg-destructive/10 h-7 px-2.5 gap-1"
                                disabled={actionLoading}
                                onClick={() => requestDeleteDevis(d.id)}
                                title="Supprimer cette version (espace patient + chat)"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Supprimer
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
          onClose={flushDraftAndCloseModal}
          patientName={patientRow.user.fullName}
          existingDevis={existingDevis}
          isEditing={isEditingExisting}
          lignes={lignes}
          addLigne={() => setLignes((p) => [...p, { description: '', quantite: 1, prixUnitaire: 0 }])}
          removeLigne={(i) => setLignes((p) => p.filter((_, idx) => idx !== i))}
          updateLigne={(i, f, v) => setLignes((p) => p.map((l, idx) => (idx === i ? { ...l, [f]: v } : l)))}
          total={total}
          cliniqueChoice={cliniqueChoice}
          setCliniqueChoice={(v) => { setCliniqueChoice(v); setCliniqueNomInvalid(false); setModalError(null) }}
          cliniqueAutre={cliniqueAutre}
          setCliniqueAutre={(v) => { setCliniqueAutre(v); setCliniqueNomInvalid(false); setModalError(null) }}
          cliniqueNuits={cliniqueNuits} setCliniqueNuits={setCliniqueNuits}
          hotelChoice={hotelChoice}
          setHotelChoice={(v) => { setHotelChoice(v); setHotelNomInvalid(false); setModalError(null) }}
          hotelAutre={hotelAutre}
          setHotelAutre={(v) => { setHotelAutre(v); setHotelNomInvalid(false); setModalError(null) }}
          hotelNuits={hotelNuits} setHotelNuits={setHotelNuits}
          nbAdultes={nbAdultes} setNbAdultes={setNbAdultes}
          nbEnfants={nbEnfants} setNbEnfants={setNbEnfants}
          dureeSejourTotale={dureeSejourTotale} setDureeSejourTotale={setDureeSejourTotale}
          notesSejour={notesSejour} setNotesSejour={setNotesSejour}
          inclutIds={inclutIds} setInclutIds={setInclutIds}
          exclutIds={exclutIds} setExclutIds={setExclutIds}
          drainageNb={drainageNb} setDrainageNb={setDrainageNb}
          contentionDetail={contentionDetail} setContentionDetail={setContentionDetail}
          sent={sent} savedDraft={savedDraft} autoSaving={autoSaving} actionLoading={actionLoading}
          onSend={() => void handleSend()}
          onSaveDraft={() => void handleSaveDraft()}
          onDelete={() => handleDeleteDevis()}
          canDelete={!!existingDevis && existingDevis.statut !== 'accepte'}
          onCustomize={() => void handleCustomize()}
          currency={currency}
          tauxEur={tauxEur}
          formError={modalError}
          cliniqueNomInvalid={cliniqueNomInvalid}
          hotelNomInvalid={hotelNomInvalid}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={closeDeleteDialog}
        title={
          pendingDelete?.kind === 'dossier'
            ? 'Retirer ce dossier de la liste ?'
            : (pendingDelete?.kind === 'devis' && pendingDelete.devisIds.length > 1)
              ? `Supprimer ${pendingDelete.devisIds.length} devis ?`
              : 'Supprimer ce devis ?'
        }
        description={
          pendingDelete?.kind === 'dossier'
            ? `${pendingDelete.patientName} sera retiré(e) de la liste des devis (classé en abstention). L’historique reste consultable dans Patients.`
            : (pendingDelete?.kind === 'devis' && pendingDelete.devisIds.length > 1)
              ? 'Ces versions iront dans « Supprimés », disparaîtront de l’espace patient et les PDF associés passeront en « Message supprimé » dans le chat.'
              : 'Cette version ira dans « Supprimés », disparaîtra de l’espace patient et le PDF associé passera en « Message supprimé » dans le chat. Les autres versions restent intactes.'
        }
        confirmLabel={
          pendingDelete?.kind === 'dossier'
            ? 'Retirer de la liste'
            : (pendingDelete?.kind === 'devis' && pendingDelete.devisIds.length > 1)
              ? `Supprimer (${pendingDelete.devisIds.length})`
              : 'Supprimer le devis'
        }
        loading={deleteLoading}
        error={deleteError}
        onConfirm={confirmPendingDelete}
        icon={
          <div className="h-11 w-11 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
            <Trash2 className="h-5 w-5 text-destructive" />
          </div>
        }
      />

      {/* Choix de la version à supprimer */}
      {deletePicker && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !deletePicker.loading && setDeletePicker(null)}
            aria-label="Fermer"
          />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl border border-border flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">Supprimer un devis</p>
                <p className="text-xs text-muted-foreground truncate">
                  {deletePicker.patientName} — sélectionnez une ou plusieurs versions
                </p>
              </div>
              <button
                type="button"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"
                onClick={() => setDeletePicker(null)}
                disabled={deletePicker.loading}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-3 py-3 flex-1 min-h-0 overflow-y-auto space-y-1">
              {deletePicker.loading && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Chargement des versions…
                </div>
              )}
              {!deletePicker.loading && deletePicker.versions.map((d) => {
                const sc = {
                  accepte:   { label: 'Accepté',  cls: 'bg-emerald-100 text-emerald-700' },
                  refuse:    { label: 'Refusé',   cls: 'bg-red-100 text-red-600' },
                  envoye:    { label: 'Envoyé',   cls: 'bg-sky-100 text-sky-700' },
                  brouillon: { label: 'Brouillon',cls: 'bg-slate-100 text-slate-600' },
                } as const
                const badge = sc[d.statut as keyof typeof sc] ?? sc.brouillon
                const selected = deletePicker.selectedIds.includes(d.id)
                const devisName = devisDisplayName(d, deletePicker.dossierNumber, deletePicker.patientName)
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDeletePickerId(d.id)}
                    className={cn(
                      'w-full text-left rounded-xl border px-3.5 py-3 transition-colors',
                      selected
                        ? 'border-destructive/40 bg-red-50/80 ring-1 ring-destructive/20'
                        : 'border-transparent hover:bg-slate-50',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'h-4 w-4 rounded border shrink-0 flex items-center justify-center',
                          selected ? 'bg-destructive border-destructive text-white' : 'border-slate-300 bg-white',
                        )}
                        aria-hidden
                      >
                        {selected ? <CheckCircle2 className="h-3 w-3" /> : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate">{devisName}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {formatDate(d.dateCreation)}
                          {typeof d.total === 'number' ? ` · ${formatCurrency(d.total, (d.currency as CurrencyUnit) || 'TND')}` : ''}
                        </p>
                      </div>
                      <span className={cn('shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full', badge.cls)}>
                        {badge.label}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2 shrink-0">
              <Button variant="ghost" onClick={() => setDeletePicker(null)} disabled={deletePicker.loading}>
                Annuler
              </Button>
              <Button
                variant="destructive"
                className="gap-1.5"
                disabled={deletePicker.loading || deletePicker.selectedIds.length === 0}
                onClick={confirmDeletePickerSelection}
              >
                <Trash2 className="h-4 w-4" />
                Continuer
                {deletePicker.selectedIds.length > 1 ? ` (${deletePicker.selectedIds.length})` : ''}
              </Button>
            </div>
          </div>
        </div>
      )}

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
                const devisName = devisDisplayName(
                  d,
                  patientRow?.dossierNumber,
                  patientRow?.user.fullName ?? '',
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
                  {patientRow?.user.fullName ?? 'Patiente'} — modèle Communication, à adapter si besoin
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

      {/* Rappel devis → chat + PDF dernière version envoyée */}
      {rappelOpen && rappelTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !rappelSending && setRappelOpen(false)}
            aria-label="Fermer"
          />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl border border-border flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">Rappel devis</p>
                <p className="text-xs text-muted-foreground truncate">
                  {rappelTarget.patientName}
                  {rappelTarget.numeroDevis
                    ? ` — ${rappelTarget.numeroDevis}${rappelTarget.version ? ` (v${rappelTarget.version})` : ''}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"
                disabled={rappelSending}
                onClick={() => setRappelOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 flex-1 min-h-0 overflow-y-auto space-y-3">
              <p className="text-[12px] text-slate-500 rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2">
                Ce message sera envoyé dans le chat, accompagné du PDF de la dernière version de devis envoyée.
              </p>
              <Textarea
                value={rappelMsg}
                onChange={(e) => setRappelMsg(e.target.value)}
                rows={14}
                className="text-sm leading-relaxed resize-y min-h-[240px]"
                disabled={rappelSending}
              />
              {rappelError && (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {rappelError}
                </p>
              )}
            </div>
            <div className="px-5 py-4 border-t border-border flex flex-col-reverse sm:flex-row gap-2 sm:justify-end shrink-0">
              <Button
                type="button"
                variant="outline"
                disabled={rappelSending}
                onClick={() => setRappelOpen(false)}
              >
                Annuler
              </Button>
              <Button
                type="button"
                variant="brand"
                className="gap-2"
                disabled={rappelSending}
                onClick={() => void sendRappelDevis()}
              >
                {rappelSending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Envoyer le rappel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Demande MAJ rapport → notification médecin + lien dossier */}
      {majRapportOpen && patientRow && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !majRapportSending && setMajRapportOpen(false)}
            aria-label="Fermer"
          />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl border border-border flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">Écrire au Dr Chennoufi</p>
                <p className="text-xs text-muted-foreground truncate">
                  {patientRow.user.fullName} · {patientRow.dossierNumber}
                </p>
              </div>
              <button
                type="button"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"
                disabled={majRapportSending}
                onClick={() => setMajRapportOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 flex-1 min-h-0 overflow-y-auto space-y-3">
              <Textarea
                value={majRapportMsg}
                onChange={(e) => setMajRapportMsg(e.target.value)}
                rows={7}
                className="text-sm leading-relaxed resize-y min-h-[140px]"
                disabled={majRapportSending}
              />
              {majRapportError && (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {majRapportError}
                </p>
              )}
            </div>
            <div className="px-5 py-4 border-t border-border flex flex-col-reverse sm:flex-row gap-2 sm:justify-end shrink-0">
              <Button
                type="button"
                variant="outline"
                disabled={majRapportSending}
                onClick={() => setMajRapportOpen(false)}
              >
                Annuler
              </Button>
              <Button
                type="button"
                variant="brand"
                className="gap-2"
                disabled={majRapportSending}
                onClick={() => void sendMajRapport()}
              >
                {majRapportSending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Envoyer au médecin
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
