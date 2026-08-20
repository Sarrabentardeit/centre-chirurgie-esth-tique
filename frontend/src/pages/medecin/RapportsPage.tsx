import { useCallback, useEffect, useState, useMemo, type ElementType, type ReactNode } from 'react'
import {
  Search, CheckCircle2, Clock, X, AlertTriangle, Heart, Scissors,
  Save, RefreshCw, AlertCircle, DollarSign, StickyNote, ExternalLink,
  ClipboardPlus, Sparkles, ArrowLeft,
  Phone, Mail, MapPin, Activity, Calendar, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useNavigate } from 'react-router-dom'
import { formatDate, formatRelative } from '@/lib/utils'
import { PageHeader, KpiStrip } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/lib/statusUi'
import { toast } from '@/store/toastStore'
import { useAuthStore } from '@/store/authStore'
import { medecinApi } from '@/lib/api'
import type { PatientListItem } from '@/lib/api'
import { accompagnantsFromFormulairePayload } from '@/lib/devisSejourNotes'
import { LIST_PAGE_SIZE, PaginationBar, paginateSlice } from '@/components/PaginationBar'
import { cachedFetch, hasCachedData, invalidateCache } from '@/lib/cachedFetch'
import { queryKeys } from '@/lib/queryKeys'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DiagnosticPicker } from '@/components/dossier/DiagnosticPicker'

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface Rapport {
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
  drainage?: boolean | null
  nbSeancesDrainage?: number | null
  dureeSejourTunisie?: number | null
  nbAdultesSejour?: number | null
  nbEnfantsSejour?: number | null
  notes: string | null
  changementDemande?: string | null
  createdAt: string
}

interface PatientWithRapport extends PatientListItem {
  rapport: Rapport | null
}

const EXAMEN_OPTIONS = [
  'Echographie Mammaire ou Mammographie',
  `Bilan sanguin complet qui comprend :
• Bilan biologique (groupe sanguin, NFS, plaquettes, TP, TCA)
• Bilan virologique HIV, Hépatite B et C.
• URÉE CRÉÂT GLYCÉMIE. IONO ASAT ALAT`,
  'Echographie Abdominale',
] as const
const EXAMEN_AUTRE_PREFIX = 'Autre:'

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

/** Rapport présent en base, ou statut déjà passé à « rapport généré » (et suites). */
const STATUSES_WITH_RAPPORT = new Set([
  'rapport_genere', 'rapport_modifie', 'devis_preparation', 'devis_envoye', 'devis_accepte',
  'date_reservee', 'logistique', 'intervention', 'post_op', 'suivi_termine',
])

function patientHasRapport(p: { rapport?: Rapport | null; status: string }): boolean {
  return !!p.rapport || STATUSES_WITH_RAPPORT.has(p.status)
}

function completionScore(
  diagnostic: string,
  examensDemandes: string[],
  examensAutreChecked: boolean,
  interventions: string,
  forfait: string,
  valeur: string,
  notes: string,
  nuitsClinique: string,
): number {
  const examensOk = examensDemandes.length > 0 || examensAutreChecked
  const textFields = [diagnostic, interventions, forfait, valeur, notes, nuitsClinique, examensOk ? 'ok' : '']
  const filledText = textFields.filter((f) => f.trim().length > 0).length
  const filledAnesthesie = 1
  const totalFields = textFields.length + 1
  return Math.round(((filledText + filledAnesthesie) / totalFields) * 100)
}

function CompletionRing({ pct }: { pct: number }) {
  const r = 14
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  const color = pct === 100 ? '#10b981' : pct >= 60 ? '#6366f1' : pct >= 20 ? '#f59e0b' : '#e2e8f0'
  return (
    <svg width="36" height="36" className="-rotate-90">
      <circle cx="18" cy="18" r={r} fill="none" stroke="#e2e8f0" strokeWidth="3" />
      <circle
        cx="18" cy="18" r={r} fill="none"
        stroke={color} strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.4s ease' }}
      />
      <text
        x="18" y="18"
        textAnchor="middle" dominantBaseline="middle"
        className="rotate-90"
        style={{ rotate: '90deg', transformOrigin: '18px 18px', fontSize: 8, fontWeight: 700, fill: color }}
      >
        {pct}%
      </text>
    </svg>
  )
}

// â”€â”€â”€ Section collapsible â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function FormBlock({ icon: Icon, title, hint, required, children }: {
  icon: ElementType
  title: string
  hint?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-border bg-white p-4 sm:p-5 space-y-4">
      <header className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            {title}
            {required && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-destructive">Obligatoire</span>
            )}
          </h2>
          {hint && <p className="text-[12px] text-muted-foreground mt-0.5">{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
      {children}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  )
}

type ListBucket = 'all' | 'a_analyser' | 'rediges' | 'forfait'

// â”€â”€â”€ Page principale â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function RapportsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [patients, setPatients] = useState<PatientWithRapport[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState('')
  const [listBucket, setListBucket] = useState<ListBucket>('all')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Rapport editor state
  const [diagnostic, setDiagnostic]       = useState('')
  const [examensDemandes, setExamensDemandes] = useState<string[]>([])
  const [examensAutreChecked, setExamensAutreChecked] = useState(false)
  const [examensAutreText, setExamensAutreText] = useState('')
  const [interventions, setInterventions] = useState('')
  const [valeur, setValeur]               = useState('')
  const [forfait, setForfait]             = useState('')
  const [nuitsPreoperatoires, setNuitsPreoperatoires] = useState('1')
  const [nuitsClinique, setNuitsClinique] = useState('')
  const [nuitsHotel, setNuitsHotel]       = useState('')
  const [vetementContention, setVetementContention] = useState<boolean | null>(null)
  const [nbAdultesSejour, setNbAdultesSejour] = useState('')
  const [nbEnfantsSejour, setNbEnfantsSejour] = useState('')
  const [anesthesieGenerale, setAnesthesieGenerale] = useState(false)
  const [drainage, setDrainage] = useState<boolean | null>(null)
  const [nbSeancesDrainage, setNbSeancesDrainage] = useState('')
  const [notes, setNotes]                 = useState('')
  const [saving, setSaving]               = useState(false)
  const [saved, setSaved]                 = useState(false)
  const [saveError, setSaveError]         = useState<string | null>(null)
  /** true = prochain enregistrement crée un nouveau rapport (ne touche pas aux précédents). */
  const [modeNouveauRapport, setModeNouveauRapport] = useState(false)
  const [rapportsCount, setRapportsCount] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<PatientWithRapport | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const closeEditor = () => {
    setDrawerOpen(false)
    setSelectedId(null)
    setSaveError(null)
  }

  const load = useCallback(async (opts?: { useCache?: boolean }) => {
    const key = queryKeys.medecinPatientsAll()
    const force = !opts?.useCache
    if (opts?.useCache && hasCachedData(key)) setLoading(false)
    else setLoading(true)
    setError(null)
    try {
      const res = await cachedFetch(key, () => medecinApi.getPatients(), { force })
      const eligible = res.patients.filter((p) =>
        ['formulaire_complete', 'en_analyse', 'rapport_genere', 'rapport_modifie', 'devis_preparation',
          'devis_envoye', 'devis_accepte', 'date_reservee', 'logistique', 'intervention', 'post_op', 'suivi_termine'].includes(p.status)
      )
      const sorted: PatientWithRapport[] = eligible
        .map((p) => ({
          ...p,
          // Sync avec la page Patients : utiliser le rapport réel s'il existe
          rapport: (p.rapports?.[0] as Rapport | undefined) ?? null,
        }))
        .sort((a, b) => {
          const aNeeds = !a.rapport && (a.status === 'formulaire_complete' || a.status === 'en_analyse')
          const bNeeds = !b.rapport && (b.status === 'formulaire_complete' || b.status === 'en_analyse')
          if (aNeeds && !bNeeds) return -1
          if (bNeeds && !aNeeds) return 1
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        })
      setPatients(sorted)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load({ useCache: true }) }, [load])

  const handleDeleteRapport = async () => {
    if (!deleteTarget?.rapport?.id) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await medecinApi.deleteRapport(deleteTarget.id, deleteTarget.rapport.id)
      toast({ title: 'Rapport supprimé', variant: 'success' })
      if (selectedId === deleteTarget.id) closeEditor()
      setDeleteTarget(null)
      await invalidateCache(queryKeys.medecinPatientsAll())
      void load({ useCache: false })
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Suppression impossible.')
    } finally {
      setDeleting(false)
    }
  }

  const handleSelect = async (patientId: string) => {
    setSelectedId(patientId)
    setDiagnostic(''); setExamensDemandes([]); setExamensAutreChecked(false); setExamensAutreText(''); setInterventions(''); setValeur(''); setForfait('')
    setNuitsPreoperatoires('1'); setNuitsClinique(''); setNuitsHotel(''); setVetementContention(null)
    setNbAdultesSejour(''); setNbEnfantsSejour(''); setAnesthesieGenerale(false)
    setDrainage(null); setNbSeancesDrainage(''); setNotes('')
    setSaved(false); setSaveError(null)
    setModeNouveauRapport(false)
    setRapportsCount(0)
    setDrawerOpen(true)
    try {
      const res = await medecinApi.getPatient(patientId)
      const allRapports = res.patient.rapports ?? []
      setRapportsCount(allRapports.length)
      const r = allRapports[0]
      if (r) {
        const savedExamens = r.examensDemandes ?? []
        const autreEntree = savedExamens.find((x) => x.trim().toLowerCase().startsWith('autre'))
        setDiagnostic(r.diagnostic ?? '')
        setExamensDemandes(savedExamens.filter((x) => !x.trim().toLowerCase().startsWith('autre')))
        setExamensAutreChecked(Boolean(autreEntree))
        setExamensAutreText(
          autreEntree?.startsWith(EXAMEN_AUTRE_PREFIX)
            ? autreEntree.slice(EXAMEN_AUTRE_PREFIX.length).trim()
            : ''
        )
        setInterventions((r.interventionsRecommandees ?? []).join('\n'))
        setValeur(r.valeurMedicale ?? '')
        setForfait(
          r.forfaitPropose != null && Number.isFinite(r.forfaitPropose)
            ? String(Math.round(Number(r.forfaitPropose.toFixed(2))))
            : ''
        )
        setNuitsPreoperatoires(r.nuitsPreoperatoires != null ? String(r.nuitsPreoperatoires) : '1')
        setNuitsClinique(r.nuitsClinique != null ? String(r.nuitsClinique) : '')
        setNuitsHotel(r.nuitsHotel != null ? String(r.nuitsHotel) : '')
        setVetementContention(r.vetementContention ?? null)
        setNbAdultesSejour(r.nbAdultesSejour != null ? String(r.nbAdultesSejour) : '')
        setNbEnfantsSejour(r.nbEnfantsSejour != null ? String(r.nbEnfantsSejour) : '')
        setAnesthesieGenerale(r.anesthesieGenerale ?? false)
        setDrainage(r.drainage ?? null)
        setNbSeancesDrainage(r.nbSeancesDrainage != null ? String(r.nbSeancesDrainage) : '')
        setNotes(r.notes ?? '')
        setPatients((prev) => prev.map((p) => p.id === patientId ? {
          ...p,
          rapport: r,
          pendingRapportChangeNote: res.patient.pendingRapportChangeNote ?? null,
        } : p))
        if (r.nbAdultesSejour == null && r.nbEnfantsSejour == null) {
          const payload = res.patient.formulaires?.[0]?.payload as Record<string, unknown> | undefined
          if (payload) {
            const acc = accompagnantsFromFormulairePayload(payload)
            setNbAdultesSejour(acc.nbAdultes)
            setNbEnfantsSejour(acc.nbEnfants)
          }
        }
      } else {
        const payload = res.patient.formulaires?.[0]?.payload as Record<string, unknown> | undefined
        if (payload) {
          const acc = accompagnantsFromFormulairePayload(payload)
          setNbAdultesSejour(acc.nbAdultes)
          setNbEnfantsSejour(acc.nbEnfants)
        }
        setPatients((prev) => prev.map((p) => p.id === patientId ? {
          ...p,
          pendingRapportChangeNote: res.patient.pendingRapportChangeNote ?? null,
        } : p))
      }
    } catch { /* silent */ }
  }

  const handleSave = async (asNouveau?: boolean) => {
    if (!selectedId || !diagnostic.trim()) return
    if (!forfait || Number(forfait) <= 0) {
      setSaveError('Le forfait médical est obligatoire.')
      return
    }
    if (nuitsPreoperatoires === '' || nuitsClinique === '' || nuitsHotel === '') {
      setSaveError('Nuit préparatoire en clinique, nuits postopératoires et nuit de convalescence à l\'hôtel sont obligatoires.')
      return
    }
    if (vetementContention === null) {
      setSaveError('Indiquez si un vêtement de contention est prescrit.')
      return
    }
    if (drainage === true && (!nbSeancesDrainage || Number(nbSeancesDrainage) < 1)) {
      setSaveError('Indiquez le nombre de séances de drainage.')
      return
    }
    const nPre = Number(nuitsPreoperatoires)
    const nPost = Number(nuitsClinique)
    const nHotel = Number(nuitsHotel)
    const totalTunisie = nPre + nPost + nHotel
    const createNouveau = asNouveau === true || modeNouveauRapport || !selected?.rapport
    setSaving(true); setSaveError(null)
    try {
      const examensPayload = [...examensDemandes]
      if (examensAutreChecked) {
        examensPayload.push(
          examensAutreText.trim() ? `${EXAMEN_AUTRE_PREFIX} ${examensAutreText.trim()}` : 'Autre'
        )
      }
      await medecinApi.upsertRapport(selectedId, {
        diagnostic,
        examensDemandes: examensPayload,
        interventionsRecommandees: interventions.split('\n').map((s) => s.trim()).filter(Boolean),
        valeurMedicale: valeur || undefined,
        forfaitPropose: Number(forfait),
        nuitsPreoperatoires: nPre,
        nuitsClinique: nPost,
        nuitsHotel: nHotel,
        vetementContention,
        dureeSejourTunisie: totalTunisie,
        nbAdultesSejour: nbAdultesSejour === '' ? undefined : Number(nbAdultesSejour),
        nbEnfantsSejour: nbEnfantsSejour === '' ? undefined : Number(nbEnfantsSejour),
        anesthesieGenerale,
        drainage: drainage ?? undefined,
        nbSeancesDrainage: drainage === true ? Number(nbSeancesDrainage) : null,
        notes: notes || undefined,
        nouveauRapport: createNouveau && !!selected?.rapport,
      })
      setSaved(true)
      toast({
        title: createNouveau && selected?.rapport ? 'Nouveau rapport généré' : 'Rapport enregistré',
        description: createNouveau && selected?.rapport
          ? 'Le rapport précédent est conservé. Houda pourra créer le devis correspondant, prérempli depuis ce nouveau rapport.'
          : 'Le diagnostic a été sauvegardé.',
        variant: 'success',
      })
      setTimeout(() => setSaved(false), 3000)
      setModeNouveauRapport(false)
      setRapportsCount((c) => (createNouveau && selected?.rapport ? c + 1 : Math.max(c, 1)))
      setPatients((prev) => prev.map((p) => p.id === selectedId
        ? {
            ...p,
            rapport: {
              id: '',
              diagnostic,
              examensDemandes: examensPayload,
              interventionsRecommandees: interventions.split('\n').filter(Boolean),
              valeurMedicale: valeur,
              forfaitPropose: Number(forfait),
              nuitsPreoperatoires: nPre,
              nuitsClinique: nPost,
              nuitsHotel: nHotel,
              vetementContention,
              dureeSejourTunisie: totalTunisie,
              nbAdultesSejour: nbAdultesSejour === '' ? null : Number(nbAdultesSejour),
              nbEnfantsSejour: nbEnfantsSejour === '' ? null : Number(nbEnfantsSejour),
              anesthesieGenerale,
              drainage,
              nbSeancesDrainage: drainage === true ? Number(nbSeancesDrainage) : null,
              notes,
              createdAt: new Date().toISOString(),
            },
          }
        : p))
      void load({ useCache: false })
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde.')
    } finally {
      setSaving(false)
    }
  }

  const stats = useMemo(() => ({
    aAnalyser:   patients.filter((p) => !patientHasRapport(p) && (p.status === 'formulaire_complete' || p.status === 'en_analyse')).length,
    total:       patients.filter((p) => patientHasRapport(p)).length,
    avecForfait: patients.filter((p) => p.rapport?.forfaitPropose).length,
  }), [patients])

  const filtered = useMemo(() => {
    let list = patients
    if (listBucket === 'a_analyser') {
      list = list.filter((p) => !patientHasRapport(p) && (p.status === 'formulaire_complete' || p.status === 'en_analyse'))
    } else if (listBucket === 'rediges') {
      list = list.filter((p) => patientHasRapport(p))
    } else if (listBucket === 'forfait') {
      list = list.filter((p) => !!p.rapport?.forfaitPropose)
    }
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter((p) =>
      p.user.fullName.toLowerCase().includes(q) ||
      p.dossierNumber.toLowerCase().includes(q) ||
      p.rapport?.diagnostic?.toLowerCase().includes(q)
    )
  }, [patients, search, listBucket])

  useEffect(() => {
    setPage(1)
  }, [search, listBucket])

  const { slice: pageRows, totalPages, page: safePage, total } = useMemo(
    () => paginateSlice(filtered, page, LIST_PAGE_SIZE),
    [filtered, page],
  )

  const selected = patients.find((p) => p.id === selectedId) ?? null
  const examensCount = examensDemandes.length + (examensAutreChecked ? 1 : 0)
  const pct = completionScore(diagnostic, examensDemandes, examensAutreChecked, interventions, forfait, valeur, notes, nuitsClinique)
  const sejourCliniqueTotal = (Number(nuitsPreoperatoires) || 0) + (Number(nuitsClinique) || 0)
  const sejourTunisieAuto = sejourCliniqueTotal + (Number(nuitsHotel) || 0)

  function rowCompletion(p: PatientWithRapport) {
    if (!p.rapport) return patientHasRapport(p) ? 50 : 0
    return completionScore(
      p.rapport.diagnostic ?? '',
      p.rapport.examensDemandes ?? [],
      false,
      (p.rapport.interventionsRecommandees ?? []).join('\n'),
      p.rapport.forfaitPropose?.toString() ?? '',
      p.rapport.valeurMedicale ?? '',
      p.rapport.notes ?? '',
      p.rapport.nuitsClinique?.toString() ?? '',
    )
  }

  /* ── Vue éditeur plein écran (pas de panneau latéral) ── */
  if (drawerOpen && selected) {
    return (
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-5 pb-24 lg:pb-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0 shrink-0"
              onClick={closeEditor}
              aria-label="Retour à la liste"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Rapport médical</p>
              <h1 className="font-display text-2xl sm:text-[1.65rem] font-semibold text-brand-950 tracking-tight leading-tight truncate">
                {selected.user.fullName}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-mono text-brand-700 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-md">
                  {selected.dossierNumber}
                </span>
                <StatusBadge kind="dossier" value={selected.status} />
                {saved ? (
                  <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Enregistré
                  </span>
                ) : !selected.rapport ? (
                  <span className="text-xs text-amber-700 font-medium flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Brouillon
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 sm:pt-1">
            <div className="hidden sm:flex items-center gap-2 mr-1">
              <CompletionRing pct={pct} />
              <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => navigate(`/medecin/patients/${selected.id}`)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Dossier</span>
            </Button>
            {selected.rapport && (
              <Button
                variant={modeNouveauRapport ? 'brand' : 'outline'}
                size="sm"
                className="h-9 gap-1.5"
                onClick={() => setModeNouveauRapport(true)}
                disabled={saving}
                title="Crée un nouveau rapport sans modifier les précédents"
              >
                <ClipboardPlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Nouveau rapport</span>
              </Button>
            )}
            <Button
              variant="brand"
              size="sm"
              className="h-9 gap-2 font-semibold"
              onClick={() => void handleSave(modeNouveauRapport || !selected.rapport)}
              disabled={!diagnostic.trim() || saving}
            >
              {saved
                ? <><CheckCircle2 className="h-4 w-4" /> OK</>
                : <><Save className="h-4 w-4" /> {saving ? '…' : (
                    !selected.rapport
                      ? 'Enregistrer'
                      : modeNouveauRapport
                        ? 'Générer le nouveau rapport'
                        : 'Corriger le rapport actuel'
                  )}</>}
            </Button>
          </div>
        </div>

        {selected.rapport && (
          <div className={`rounded-xl border px-4 py-2.5 text-xs ${
            modeNouveauRapport
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-slate-200 bg-slate-50 text-slate-600'
          }`}>
            {modeNouveauRapport
              ? `Mode nouveau rapport : R${rapportsCount || 1} et son devis restent conservés. Vous créez R${(rapportsCount || 1) + 1} — Houda pourra ensuite créer le devis R${(rapportsCount || 1) + 1}, prérempli depuis ce rapport.`
              : `${rapportsCount > 1 ? `${rapportsCount} rapports` : '1 rapport'} sur ce dossier. Après un devis, utilisez « Nouveau rapport » (ne pas corriger l’ancien).`}
            {modeNouveauRapport && (
              <button
                type="button"
                className="ml-2 underline font-medium"
                onClick={() => setModeNouveauRapport(false)}
              >
                Annuler
              </button>
            )}
          </div>
        )}

        {/* Bandeau patient */}
        <div className="rounded-2xl border border-border bg-white px-4 py-3 sm:px-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="h-11 w-11 shrink-0">
              <AvatarFallback className="bg-teal-100 text-teal-800 text-sm font-bold">
                {getInitials(selected.user.fullName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 text-[12px] text-muted-foreground space-y-0.5">
              {selected.user.email && (
                <p className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3 shrink-0" />{selected.user.email}</p>
              )}
              {selected.phone && (
                <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 shrink-0" />{selected.phone}</p>
              )}
              {(selected.ville || selected.pays) && (
                <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3 shrink-0" />{[selected.ville, selected.pays].filter(Boolean).join(', ')}</p>
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0 sm:max-w-xs sm:ml-auto">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Activity className="h-3 w-3" /> Complétion
              </span>
              <span className="text-[11px] font-bold tabular-nums text-slate-700">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-teal-500' : 'bg-amber-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {selected.rapport && (
              <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Dernière version · {formatDate(selected.rapport.createdAt)}
                {user?.name ? ` · Dr. ${user.name}` : ''}
              </p>
            )}
          </div>
        </div>

        {saveError && (
          <div className="flex items-start gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {saveError}
          </div>
        )}

        {(modeNouveauRapport ? selected.pendingRapportChangeNote : selected.rapport?.changementDemande)?.trim() && (
          <div className="rounded-xl border border-[#e8d9c8] bg-[#faf6f1] px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-xs font-semibold text-[#6b4a2e]">Retour de la patiente</p>
              <span className="text-[10px] font-medium text-slate-500 bg-white/80 border border-slate-200 rounded-full px-2 py-0.5">
                Note interne
              </span>
            </div>
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
              {(modeNouveauRapport ? selected.pendingRapportChangeNote : selected.rapport?.changementDemande)?.trim()}
            </p>
            {modeNouveauRapport && (
              <p className="text-xs text-slate-500 mt-2">À reprendre dans ce rapport.</p>
            )}
          </div>
        )}

        {/* Formulaire 2 colonnes */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 space-y-4">
            <FormBlock icon={Heart} title="Diagnostic" required hint="Choisissez une intervention, puis ajustez le texte">
              <DiagnosticPicker
                diagnostic={diagnostic}
                onDiagnosticChange={setDiagnostic}
                interventions={interventions}
                onInterventionsChange={setInterventions}
                resetKey={`${selected.id}-${modeNouveauRapport ? 'nouveau' : selected.rapport?.id ?? 'new'}`}
              />
              <Textarea
                rows={10}
                placeholder="Diagnostic, observations morphologiques, points cliniques…"
                value={diagnostic}
                onChange={(e) => setDiagnostic(e.target.value)}
                className="resize-y text-sm leading-relaxed min-h-[180px]"
                autoFocus
              />
            </FormBlock>

            <FormBlock
              icon={ClipboardPlus}
              title="Examens complémentaires"
              hint={examensCount > 0 ? `${examensCount} sélectionné(s)` : 'Cochez les examens demandés'}
            >
              <div className="space-y-2">
                {EXAMEN_OPTIONS.map((opt) => {
                  const checked = examensDemandes.includes(opt)
                  return (
                    <label
                      key={opt}
                      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                        checked ? 'border-teal-300 bg-teal-50/50' : 'border-border hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                        checked={checked}
                        onChange={(e) => {
                          setExamensDemandes((prev) =>
                            e.target.checked ? [...prev, opt] : prev.filter((x) => x !== opt)
                          )
                        }}
                      />
                      <span className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">{opt}</span>
                    </label>
                  )
                })}
                <label
                  className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                    examensAutreChecked ? 'border-teal-300 bg-teal-50/50' : 'border-border hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                    checked={examensAutreChecked}
                    onChange={(e) => {
                      setExamensAutreChecked(e.target.checked)
                      if (!e.target.checked) setExamensAutreText('')
                    }}
                  />
                  <span className="text-sm text-slate-800">Autre</span>
                </label>
                {examensAutreChecked && (
                  <Input
                    value={examensAutreText}
                    onChange={(e) => setExamensAutreText(e.target.value)}
                    placeholder="Préciser l'examen…"
                  />
                )}
              </div>
            </FormBlock>

            <FormBlock icon={Scissors} title="Interventions recommandées" hint="Une intervention par ligne">
              <Textarea
                rows={5}
                placeholder={'Rhinoplastie\nBlépharoplastie\nLifting cervico-facial…'}
                value={interventions}
                onChange={(e) => setInterventions(e.target.value)}
                className="resize-none text-sm leading-relaxed font-mono"
              />
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 -mt-2">
                <Sparkles className="h-3 w-3" /> Une ligne = une intervention
              </p>
            </FormBlock>

            <FormBlock icon={StickyNote} title="Notes complémentaires" hint="Optionnel — contre-indications, remarques">
              <Textarea
                rows={3}
                placeholder="Observations, recommandations pré/post-op…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="resize-none text-sm leading-relaxed"
              />
            </FormBlock>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <FormBlock icon={DollarSign} title="Forfait & valorisation" required hint="Montant repris dans le devis">
              <div>
                <FieldLabel required>Forfait proposé (TND)</FieldLabel>
                <div className="relative max-w-[220px]">
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={forfait}
                    onChange={(e) => setForfait(e.target.value)}
                    className="h-11 text-lg font-bold pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">TND</span>
                </div>
              </div>
              <div>
                <FieldLabel>Valorisation médicale</FieldLabel>
                <Textarea
                  rows={3}
                  placeholder="Description technique des actes…"
                  value={valeur}
                  onChange={(e) => setValeur(e.target.value)}
                  className="resize-none text-sm"
                />
              </div>
            </FormBlock>

            <FormBlock
              icon={Calendar}
              title="Plan de séjour"
              hint={`Clinique ${sejourCliniqueTotal} · Hôtel ${nuitsHotel || '—'} · Total ${sejourTunisieAuto} nuits`}
            >
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-2">Clinique</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel required>Nuit préparatoire</FieldLabel>
                      <Input type="number" min={0} max={30} value={nuitsPreoperatoires} onChange={(e) => setNuitsPreoperatoires(e.target.value)} className="h-10" />
                    </div>
                    <div>
                      <FieldLabel required>Nuits postop.</FieldLabel>
                      <Input type="number" min={0} max={60} placeholder="Ex. 2" value={nuitsClinique} onChange={(e) => setNuitsClinique(e.target.value)} className="h-10" />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Total clinique : <strong>{sejourCliniqueTotal}</strong> nuit(s)
                  </p>
                </div>

                <div className="border-t border-border pt-3">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-2">Hôtel</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel required>Nuits convalescence</FieldLabel>
                      <Input type="number" min={0} max={60} placeholder="Ex. 4" value={nuitsHotel} onChange={(e) => setNuitsHotel(e.target.value)} className="h-10" />
                    </div>
                    <div>
                      <FieldLabel>Total Tunisie</FieldLabel>
                      <Input type="number" readOnly value={String(sejourTunisieAuto)} className="h-10 bg-slate-50 font-semibold" title="Calculé automatiquement : clinique + hôtel" />
                      <p className="text-[10px] text-muted-foreground mt-1">Auto : clinique + hôtel</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-3">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-2">Accompagnants</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel>Adultes accompagnants</FieldLabel>
                      <Input type="number" min={0} max={20} placeholder="0" value={nbAdultesSejour} onChange={(e) => setNbAdultesSejour(e.target.value)} className="h-10" />
                    </div>
                    <div>
                      <FieldLabel>Enfants (2–12 ans)</FieldLabel>
                      <Input type="number" min={0} max={20} placeholder="0" value={nbEnfantsSejour} onChange={(e) => setNbEnfantsSejour(e.target.value)} className="h-10" />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">Depuis le formulaire — sans compter la patiente.</p>
                </div>

                <div className="border-t border-border pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <FieldLabel required>Vêtement de contention</FieldLabel>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" className="flex-1" variant={vetementContention === true ? 'brand' : 'outline'} onClick={() => setVetementContention(true)}>Oui</Button>
                      <Button type="button" size="sm" className="flex-1" variant={vetementContention === false ? 'brand' : 'outline'} onClick={() => setVetementContention(false)}>Non</Button>
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Anesthésie générale</FieldLabel>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" className="flex-1" variant={anesthesieGenerale ? 'brand' : 'outline'} onClick={() => setAnesthesieGenerale(true)}>Oui</Button>
                      <Button type="button" size="sm" className="flex-1" variant={!anesthesieGenerale ? 'brand' : 'outline'} onClick={() => setAnesthesieGenerale(false)}>Non</Button>
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Drainage</FieldLabel>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" className="flex-1" variant={drainage === true ? 'brand' : 'outline'} onClick={() => setDrainage(true)}>Oui</Button>
                      <Button type="button" size="sm" className="flex-1" variant={drainage === false ? 'brand' : 'outline'} onClick={() => { setDrainage(false); setNbSeancesDrainage('') }}>Non</Button>
                    </div>
                  </div>
                  {drainage === true && (
                    <div>
                      <FieldLabel required>Nombre de séances</FieldLabel>
                      <Input
                        type="number"
                        min={1}
                        max={60}
                        placeholder="Ex. 5"
                        value={nbSeancesDrainage}
                        onChange={(e) => setNbSeancesDrainage(e.target.value)}
                        className="h-10"
                      />
                    </div>
                  )}
                </div>
              </div>
            </FormBlock>
          </div>
        </div>

        {/* Barre d’actions mobile sticky */}
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 backdrop-blur px-4 py-3 pb-safe lg:hidden flex items-center gap-2">
          <Button variant="outline" className="h-11 flex-1" onClick={closeEditor}>Retour</Button>
          {selected.rapport && !modeNouveauRapport && (
            <Button
              variant="outline"
              className="h-11 px-3"
              onClick={() => setModeNouveauRapport(true)}
              disabled={saving}
            >
              <ClipboardPlus className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="brand"
            className="h-11 flex-[1.4] gap-2 font-semibold"
            onClick={() => void handleSave(modeNouveauRapport || !selected.rapport)}
            disabled={!diagnostic.trim() || saving}
          >
            <Save className="h-4 w-4" />
            {saving ? '…' : modeNouveauRapport ? 'Nouveau' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    )
  }

  /* ── Liste ── */
  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-5 pb-2">
      <PageHeader
        title="Rapports médicaux"
        description={
          loading
            ? 'Chargement…'
            : `${patients.length} dossier${patients.length > 1 ? 's' : ''} · ${stats.aAnalyser} à analyser`
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualiser</span>
          </Button>
        }
      />

      <KpiStrip
        items={[
          {
            key: 'a',
            label: 'À analyser',
            value: loading ? '—' : stats.aAnalyser,
            tone: 'amber',
            active: listBucket === 'a_analyser',
            onClick: () => setListBucket((b) => (b === 'a_analyser' ? 'all' : 'a_analyser')),
          },
          {
            key: 'r',
            label: 'Rédigés',
            value: loading ? '—' : stats.total,
            tone: 'teal',
            active: listBucket === 'rediges',
            onClick: () => setListBucket((b) => (b === 'rediges' ? 'all' : 'rediges')),
          },
          {
            key: 'f',
            label: 'Avec forfait',
            value: loading ? '—' : stats.avecForfait,
            tone: 'emerald',
            active: listBucket === 'forfait',
            onClick: () => setListBucket((b) => (b === 'forfait' ? 'all' : 'forfait')),
          },
        ]}
      />

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => void load()}>Réessayer</Button>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-3 sm:px-4 py-3 border-b border-border bg-white space-y-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Rechercher par nom, n° dossier, diagnostic…"
              className="pl-10 pr-9 h-10 text-sm bg-muted/30 border-border rounded-xl"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch('')}>
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {loading ? '…' : `${filtered.length} résultat${filtered.length > 1 ? 's' : ''}`}
              {listBucket !== 'all' && (
                <button type="button" className="ml-2 text-brand-700 font-medium hover:underline" onClick={() => setListBucket('all')}>
                  Tout afficher
                </button>
              )}
            </span>
            <span className="hidden sm:inline">{patients.length} éligibles</span>
          </div>
        </div>

        <div className="divide-y divide-border/70">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 sm:px-4 py-3.5">
                <Skeleton className="h-11 w-11 rounded-full shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-8 w-20 rounded-lg" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ClipboardPlus}
              title="Aucun dossier dans ce filtre"
              description={search ? 'Essayez un autre terme de recherche.' : 'Aucun dossier à analyser pour le moment.'}
              actionLabel={listBucket !== 'all' ? 'Voir tous' : 'Voir les patients'}
              onAction={() => (listBucket !== 'all' ? setListBucket('all') : navigate('/medecin/patients'))}
              className="py-14"
            />
          ) : (
            pageRows.map((p) => {
              const hasRapport = patientHasRapport(p)
              const needsAnalysis = !hasRapport && (p.status === 'formulaire_complete' || p.status === 'en_analyse')
              const rowPct = rowCompletion(p)
              const canDelete = Boolean(p.rapport?.id)
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-3 sm:px-4 py-3.5 transition-colors hover:bg-slate-50/90"
                >
                  <button
                    type="button"
                    onClick={() => void handleSelect(p.id)}
                    className="flex flex-1 items-center gap-3 min-w-0 text-left"
                  >
                    <div className="relative shrink-0">
                      <Avatar className="h-11 w-11">
                        <AvatarFallback className={`text-xs font-bold ${
                          needsAnalysis ? 'bg-amber-100 text-amber-800' :
                          hasRapport ? 'bg-teal-100 text-teal-800' : 'bg-brand-100 text-brand-800'
                        }`}>
                          {getInitials(p.user.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      {needsAnalysis && (
                        <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 border-2 border-white" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{p.user.fullName}</p>
                        <span className="hidden md:inline-flex shrink-0">
                          <StatusBadge kind="dossier" value={p.status} />
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[11px] font-mono text-brand-700">{p.dossierNumber}</p>
                        <span className="text-[11px] text-muted-foreground">· {formatRelative(p.updatedAt)}</span>
                      </div>
                      <div className="flex items-center gap-3 pt-0.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1 max-w-[140px]">
                          <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                rowPct === 100 ? 'bg-emerald-500' : rowPct >= 60 ? 'bg-teal-500' : rowPct > 0 ? 'bg-amber-400' : 'bg-slate-200'
                              }`}
                              style={{ width: `${rowPct}%` }}
                            />
                          </div>
                          <span className="text-[10px] tabular-nums text-muted-foreground w-7">{rowPct}%</span>
                        </div>
                        {p.rapport?.forfaitPropose != null && (
                          <span className="text-[11px] font-semibold text-brand-800 tabular-nums">
                            {p.rapport.forfaitPropose.toLocaleString('fr-TN')} TND
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="shrink-0 flex items-center gap-1.5">
                    {canDelete && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2 text-[11px] text-destructive border-destructive/30 hover:bg-destructive/5"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteError(null)
                          setDeleteTarget(p)
                        }}
                        aria-label={`Supprimer le rapport de ${p.user.fullName}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Supprimer</span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={`h-8 px-2.5 text-[11px] font-semibold ${
                        needsAnalysis
                          ? 'text-amber-800 border-amber-200 bg-amber-50 hover:bg-amber-100'
                          : 'text-slate-700 border-slate-200 bg-white'
                      }`}
                      onClick={() => void handleSelect(p.id)}
                    >
                      {hasRapport ? 'Modifier' : 'Rédiger'}
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>
        {!loading && filtered.length > 0 && (
          <PaginationBar
            page={safePage}
            totalPages={totalPages}
            total={total}
            pageSize={LIST_PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (deleting) return
          setDeleteTarget(null)
          setDeleteError(null)
        }}
        title="Supprimer ce rapport ?"
        description={
          deleteTarget
            ? `Le rapport actuel de ${deleteTarget.user.fullName} (${deleteTarget.dossierNumber}) sera définitivement supprimé. Les devis déjà émis restent conservés.`
            : undefined
        }
        confirmLabel="Supprimer"
        confirmVariant="destructive"
        loading={deleting}
        error={deleteError}
        onConfirm={() => void handleDeleteRapport()}
      />
    </div>
  )
}
