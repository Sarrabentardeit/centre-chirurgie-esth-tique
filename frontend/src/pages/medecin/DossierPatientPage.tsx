import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, FileText, Stethoscope, CheckCircle2, User, Phone, Mail,
  MapPin, Calendar, AlertCircle, RefreshCw, Save, ClipboardList,
  History, Eye, Plus, Lock, Pencil, Trash2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { useEffect, useState } from 'react'
import { STATUS_LABELS, STATUS_COLORS, formatDate, formatCurrency, cn, dossierStatusLabel } from '@/lib/utils'
import { medecinApi } from '@/lib/api'
import type { Devis, RendezVous } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { formatSourceConnaissanceLabel } from '@/lib/sourceConnaissance'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { InfoRow, FormulairePayloadView } from '@/components/dossier/FormulairePayloadView'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { accompagnantsFromFormulairePayload } from '@/lib/devisSejourNotes'

// ─── Types locaux ──────────────────────────────────────────────────────────────

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
  createdAt: string
  updatedAt?: string
}

/** R1 = premier rapport chronologique, Rn = plus récent. */
function rapportVersionNumber(rapports: Rapport[], rapportId: string): number {
  const chronological = [...rapports].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
  const idx = chronological.findIndex((r) => r.id === rapportId)
  return idx >= 0 ? idx + 1 : rapports.length
}

type RapportMode = 'edit' | 'consult' | 'nouveau'

interface PatientDetail {
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
  formulaires: Array<{ id: string; status: string; submittedAt: string | null; createdAt?: string; payload: Record<string, unknown> }>
  devis: Devis[]
  rendezvous?: RendezVous[]
  agendaEvents?: Array<{
    id: string
    dateDebut: string
    dateFin: string
    type: 'rdv' | 'blocage' | 'vacances'
    motif?: string | null
    statut?: 'planifie' | 'confirme' | 'annule' | null
    title?: string | null
  }>
  rapports: Rapport[]
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

const SOURCE_COLORS: Record<string, string> = {
  facebook:  'bg-blue-50 text-blue-800 border-blue-200',
  instagram: 'bg-pink-50 text-pink-700 border-pink-200',
  radio:     'bg-amber-50 text-amber-800 border-amber-200',
  tv:        'bg-violet-50 text-violet-800 border-violet-200',
  amie:      'bg-teal-50 text-teal-800 border-teal-200',
  autre:     'bg-slate-100 text-slate-700 border-slate-200',
  whatsapp:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  google:    'bg-blue-50 text-blue-700 border-blue-200',
  direct:    'bg-slate-100 text-slate-600 border-slate-200',
}

const DOSSIER_STATUSES = [
  'nouveau', 'formulaire_en_cours', 'formulaire_complete', 'en_analyse',
  'rapport_genere', 'rapport_modifie', 'devis_preparation', 'devis_envoye', 'devis_accepte',
  'date_reservee', 'logistique', 'intervention', 'post_op', 'suivi_termine',
  'abstention',
]

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DossierPatientPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const initialTab = tabParam && tabParam !== 'devis' ? tabParam : 'profil'
  const { user } = useAuthStore()

  const [patient, setPatient]   = useState<PatientDetail | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  // Rapport form
  const [diagnostic, setDiagnostic]     = useState('')
  const [examensDemandes, setExamensDemandes] = useState<string[]>([])
  const [examensAutreChecked, setExamensAutreChecked] = useState(false)
  const [examensAutreText, setExamensAutreText] = useState('')
  const [interventions, setInterventions] = useState('')
  const [forfait, setForfait]           = useState('')
  const [valeur, setValeur]             = useState('')
  const [nuitsPreoperatoires, setNuitsPreoperatoires] = useState('')
  const [nuitsClinique, setNuitsClinique] = useState('')
  const [nuitsHotel, setNuitsHotel]     = useState('')
  const [nbAdultesSejour, setNbAdultesSejour] = useState('')
  const [nbEnfantsSejour, setNbEnfantsSejour] = useState('')
  const [vetementContention, setVetementContention] = useState<boolean | null>(null)
  const [anesthesieGenerale, setAnesthesieGenerale] = useState(false)
  const [drainage, setDrainage] = useState<boolean | null>(null)
  const [nbSeancesDrainage, setNbSeancesDrainage] = useState('')
  const [notes, setNotes]               = useState('')
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [rapportError, setRapportError] = useState<string | null>(null)
  const [rapportMode, setRapportMode] = useState<RapportMode>(
    () => (searchParams.get('nouveau') === '1' ? 'nouveau' : 'edit'),
  )
  const [selectedRapportId, setSelectedRapportId] = useState<string | null>(null)
  const [confirmNouveauOpen, setConfirmNouveauOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deletingRapport, setDeletingRapport] = useState(false)
  const [deleteRapportError, setDeleteRapportError] = useState<string | null>(null)
  const [nouveauFromUrlApplied, setNouveauFromUrlApplied] = useState(false)

  // Status change
  const [newStatus, setNewStatus]       = useState('')
  const [statusSaving, setStatusSaving] = useState(false)

  const applyRapportToForm = (
    r: Rapport | null | undefined,
    formulairePayload?: Record<string, unknown> | null,
  ) => {
    if (!r) {
      setDiagnostic('')
      setExamensDemandes([])
      setExamensAutreChecked(false)
      setExamensAutreText('')
      setInterventions('')
      setForfait('')
      setValeur('')
      setNuitsPreoperatoires('1')
      setNuitsClinique('')
      setNuitsHotel('')
      if (formulairePayload) {
        const acc = accompagnantsFromFormulairePayload(formulairePayload)
        setNbAdultesSejour(acc.nbAdultes)
        setNbEnfantsSejour(acc.nbEnfants)
      } else {
        setNbAdultesSejour('')
        setNbEnfantsSejour('')
      }
      setVetementContention(null)
      setAnesthesieGenerale(false)
      setDrainage(null)
      setNbSeancesDrainage('')
      setNotes('')
      return
    }
    const savedExamens = r.examensDemandes ?? []
    const autreEntree = savedExamens.find((x) => x.trim().toLowerCase().startsWith('autre'))
    setDiagnostic(r.diagnostic ?? '')
    setExamensDemandes(savedExamens.filter((x) => !x.trim().toLowerCase().startsWith('autre')))
    setExamensAutreChecked(Boolean(autreEntree))
    setExamensAutreText(
      autreEntree?.startsWith(EXAMEN_AUTRE_PREFIX)
        ? autreEntree.slice(EXAMEN_AUTRE_PREFIX.length).trim()
        : '',
    )
    setInterventions((r.interventionsRecommandees ?? []).join('\n'))
    setForfait(
      r.forfaitPropose != null && Number.isFinite(r.forfaitPropose)
        ? String(Math.round(Number(r.forfaitPropose.toFixed(2))))
        : '',
    )
    setValeur(r.valeurMedicale ?? '')
    setNuitsClinique(r.nuitsClinique != null ? String(r.nuitsClinique) : '')
    setNuitsPreoperatoires(r.nuitsPreoperatoires != null ? String(r.nuitsPreoperatoires) : '1')
    setNuitsHotel(r.nuitsHotel != null ? String(r.nuitsHotel) : '')
    if (r.nbAdultesSejour != null || r.nbEnfantsSejour != null) {
      setNbAdultesSejour(r.nbAdultesSejour != null ? String(r.nbAdultesSejour) : '')
      setNbEnfantsSejour(r.nbEnfantsSejour != null ? String(r.nbEnfantsSejour) : '')
    } else if (formulairePayload) {
      const acc = accompagnantsFromFormulairePayload(formulairePayload)
      setNbAdultesSejour(acc.nbAdultes)
      setNbEnfantsSejour(acc.nbEnfants)
    } else {
      setNbAdultesSejour('')
      setNbEnfantsSejour('')
    }
    setVetementContention(r.vetementContention ?? null)
    setAnesthesieGenerale(r.anesthesieGenerale ?? false)
    setDrainage(r.drainage ?? null)
    setNbSeancesDrainage(r.nbSeancesDrainage != null ? String(r.nbSeancesDrainage) : '')
    setNotes(r.notes ?? '')
  }

  const formulairePayloadForRapport = (p: PatientDetail | null | undefined) =>
    (p?.formulaires?.[0]?.payload as Record<string, unknown> | undefined) ?? null

  const load = async () => {
    if (!id) return
    setLoading(true); setError(null)
    try {
      const res = await medecinApi.getPatient(id)
      const detail = res.patient as PatientDetail
      setPatient(detail)
      const list = (detail.rapports ?? []) as Rapport[]
      const latest = list[0]
      const formPayload = formulairePayloadForRapport(detail)
      const wantNouveau = searchParams.get('nouveau') === '1' && !nouveauFromUrlApplied
      if (wantNouveau && latest) {
        setNouveauFromUrlApplied(true)
        setRapportMode('nouveau')
        setSelectedRapportId(latest.id)
        applyRapportToForm(latest, formPayload)
      } else if (latest) {
        setRapportMode('edit')
        setSelectedRapportId(latest.id)
        applyRapportToForm(latest, formPayload)
      } else {
        setRapportMode('edit')
        setSelectedRapportId(null)
        applyRapportToForm(null, formPayload)
      }
      setNewStatus(detail.status)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [id])

  const handleSelectRapportVersion = (rapportId: string) => {
    if (!patient) return
    const list = patient.rapports
    const latestId = list[0]?.id
    const chosen = list.find((r) => r.id === rapportId)
    if (!chosen) return
    setSelectedRapportId(rapportId)
    setRapportError(null)
    applyRapportToForm(chosen, formulairePayloadForRapport(patient))
    if (rapportId === latestId) {
      setRapportMode('edit')
    } else {
      setRapportMode('consult')
    }
  }

  const startNouveauRapport = () => {
    if (!patient?.rapports[0]) return
    setConfirmNouveauOpen(false)
    setRapportMode('nouveau')
    setSelectedRapportId(patient.rapports[0].id)
    applyRapportToForm(patient.rapports[0], formulairePayloadForRapport(patient))
    setRapportError(null)
  }

  const cancelNouveauRapport = () => {
    if (!patient?.rapports[0]) {
      setRapportMode('edit')
      return
    }
    setRapportMode('edit')
    setSelectedRapportId(patient.rapports[0].id)
    applyRapportToForm(patient.rapports[0], formulairePayloadForRapport(patient))
    setRapportError(null)
  }

  const handleDeleteRapport = async () => {
    if (!id || !selectedRapport) return
    setDeletingRapport(true)
    setDeleteRapportError(null)
    try {
      await medecinApi.deleteRapport(id, selectedRapport.id)
      setConfirmDeleteOpen(false)
      setRapportMode('edit')
      void load()
    } catch (e) {
      setDeleteRapportError(e instanceof Error ? e.message : 'Suppression impossible.')
    } finally {
      setDeletingRapport(false)
    }
  }

  const handleSaveRapport = async () => {
    if (!id) return

    // Validation des champs obligatoires
    const missing: string[] = []
    if (!forfait || Number(forfait) <= 0) missing.push('Forfait médical')
    if (nuitsPreoperatoires === '') missing.push('Nuit préparatoire en clinique')
    if (nuitsClinique === '') missing.push('Nuits postopératoires')
    if (nuitsHotel === '') missing.push('Nuit de convalescence à l\'hôtel')
    if (vetementContention === null) missing.push('Vêtement de contention')
    if (drainage === true && (!nbSeancesDrainage || Number(nbSeancesDrainage) < 1)) {
      missing.push('Nombre de séances de drainage')
    }
    if (missing.length > 0) {
      setRapportError(`Champs obligatoires manquants : ${missing.join(', ')}.`)
      return
    }

    setSaving(true); setRapportError(null)
    try {
      const examensPayload = [...examensDemandes]
      if (examensAutreChecked) {
        examensPayload.push(
          examensAutreText.trim() ? `${EXAMEN_AUTRE_PREFIX} ${examensAutreText.trim()}` : 'Autre'
        )
      }
      const createNew = rapportMode === 'nouveau' || !patient?.rapports?.[0]
      await medecinApi.upsertRapport(id, {
        diagnostic: diagnostic || undefined,
        examensDemandes: examensPayload,
        interventionsRecommandees: interventions.split('\n').map((s) => s.trim()).filter(Boolean),
        valeurMedicale: valeur || undefined,
        forfaitPropose: Number(forfait),
        nuitsPreoperatoires: Number(nuitsPreoperatoires),
        nuitsClinique: Number(nuitsClinique),
        nuitsHotel: Number(nuitsHotel),
        vetementContention: vetementContention!,
        dureeSejourTunisie:
          (Number(nuitsPreoperatoires) || 0)
          + (Number(nuitsClinique) || 0)
          + (Number(nuitsHotel) || 0),
        nbAdultesSejour: nbAdultesSejour === '' ? undefined : Number(nbAdultesSejour),
        nbEnfantsSejour: nbEnfantsSejour === '' ? undefined : Number(nbEnfantsSejour),
        anesthesieGenerale,
        drainage: drainage ?? undefined,
        nbSeancesDrainage: drainage === true ? Number(nbSeancesDrainage) : null,
        notes: notes || undefined,
        nouveauRapport: createNew,
      })
      setSaved(true)
      setRapportMode('edit')
      setTimeout(() => setSaved(false), 3000)
      void load()
    } catch (e) {
      setRapportError(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde.')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateStatus = async () => {
    if (!id || !newStatus) return
    setStatusSaving(true)
    try {
      await medecinApi.updatePatientStatus(id, newStatus)
      void load()
    } catch (e) {
      console.error(e)
    } finally {
      setStatusSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    )
  }

  if (error || !patient) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground text-sm">{error ?? 'Patient introuvable.'}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Réessayer
        </Button>
      </div>
    )
  }

  const formulaire = patient.formulaires?.[0]
  const rapports = patient.rapports ?? []
  const latestRapport = rapports[0] ?? null
  const selectedRapport =
    rapports.find((r) => r.id === selectedRapportId) ?? latestRapport
  const selectedVersionNum = selectedRapport
    ? rapportVersionNumber(rapports, selectedRapport.id)
    : 0
  const nextVersionNum = rapports.length + 1
  const sejourCliniqueTotal = (Number(nuitsPreoperatoires) || 0) + (Number(nuitsClinique) || 0)
  const sejourTunisieAuto = sejourCliniqueTotal + (Number(nuitsHotel) || 0)
  const rapportReadOnly = rapportMode === 'consult'
  const canEditFields = rapportMode === 'edit' || rapportMode === 'nouveau' || !latestRapport
  const rendezvous: RendezVous[] = patient.rendezvous ?? (patient.agendaEvents ?? [])
    .filter((ev) => ev.type === 'rdv')
    .map((ev) => {
      const dateObj = new Date(ev.dateDebut)
      const dateIso = Number.isNaN(dateObj.getTime()) ? String(ev.dateDebut).slice(0, 10) : dateObj.toISOString().slice(0, 10)
      const heure = Number.isNaN(dateObj.getTime())
        ? String(ev.dateDebut).slice(11, 16)
        : `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`
      return {
        id: ev.id,
        date: dateIso,
        heure,
        type: ev.title ?? 'rdv',
        motif: ev.motif ?? null,
        statut: (ev.statut ?? 'planifie') as 'planifie' | 'confirme' | 'annule',
      } as RendezVous
    })

  const rapportVersionsChrono = [...rapports].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )

  return (
    <div className="max-w-5xl mx-auto space-y-0">

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border mb-4 sm:mb-5 -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6 py-3">
        <div className="flex items-start gap-2 sm:items-center sm:gap-3">
          <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={() => navigate('/medecin/patients')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-9 w-9 sm:h-10 sm:w-10 shrink-0">
            <AvatarFallback className="bg-brand-100 text-brand-700 font-bold text-sm">
              {getInitials(patient.user.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold truncate max-w-full">{patient.user.fullName}</h2>
              <span className="text-[10px] sm:text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200 px-1.5 py-0.5 rounded whitespace-nowrap">
                {patient.dossierNumber}
              </span>
              <Badge className={`text-[10px] sm:text-xs ${STATUS_COLORS[patient.status as keyof typeof STATUS_COLORS] ?? ''}`}>
                {dossierStatusLabel(patient.status, patient.rapports?.length)}
              </Badge>
              {patient.sourceContact && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                    SOURCE_COLORS[patient.sourceContact] ?? SOURCE_COLORS[patient.sourceContact.toLowerCase()] ?? ''
                  }`}
                >
                  {formatSourceConnaissanceLabel(patient.sourceContact)}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-0.5 mt-1 text-[11px] sm:text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-3 sm:flex-wrap">
              <span className="flex items-center gap-1 min-w-0">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{patient.user.email}</span>
              </span>
              {patient.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3 shrink-0" />
                  {patient.phone}
                </span>
              )}
              {(patient.ville || patient.pays) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {[patient.ville, patient.pays].filter(Boolean).join(', ')}
                </span>
              )}
              <span className="hidden sm:flex items-center gap-1">
                <Calendar className="h-3 w-3 shrink-0" />
                Créé le {formatDate(patient.user.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Statut dossier ── */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground">Statut dossier :</span>
        <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border', STATUS_COLORS[patient.status as keyof typeof STATUS_COLORS])}>
          {dossierStatusLabel(patient.status, patient.rapports?.length)}
        </span>
        <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger className="w-full sm:w-52 h-8 text-xs border-dashed">
              <SelectValue placeholder="Modifier manuellement…" />
            </SelectTrigger>
            <SelectContent>
              {DOSSIER_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {STATUS_LABELS[s as keyof typeof STATUS_LABELS] ?? s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {newStatus && newStatus !== patient.status && (
            <Button size="sm" variant="brand" className="h-8 text-xs" disabled={statusSaving} onClick={handleUpdateStatus}>
              {statusSaving ? 'Sauvegarde...' : 'Appliquer'}
            </Button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue={initialTab}>
        <TabsList className="mb-5 w-full sm:w-auto flex overflow-x-auto scrollbar-none">
          <TabsTrigger value="profil" className="gap-1 sm:gap-1.5 flex-1 sm:flex-none shrink-0 text-xs sm:text-sm">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span>Profil</span>
          </TabsTrigger>
          <TabsTrigger value="formulaire" className="gap-1 sm:gap-1.5 flex-1 sm:flex-none shrink-0 text-xs sm:text-sm">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Formulaire</span>
            <span className="sm:hidden">Form.</span>
          </TabsTrigger>
          <TabsTrigger value="rapport" className="gap-1 sm:gap-1.5 flex-1 sm:flex-none shrink-0 text-xs sm:text-sm">
            <Stethoscope className="h-3.5 w-3.5 shrink-0" />
            <span>Rapport</span>
          </TabsTrigger>
          <TabsTrigger value="suivi" className="gap-1 sm:gap-1.5 flex-1 sm:flex-none shrink-0 text-xs sm:text-sm">
            <ClipboardList className="h-3.5 w-3.5 shrink-0" />
            <span>Suivi</span>
          </TabsTrigger>
        </TabsList>

        {/* ── Profil ── */}
        <TabsContent value="profil">
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm">Informations personnelles</CardTitle></CardHeader>
              <CardContent>
                <InfoRow label="Nom complet" value={patient.user.fullName} icon={<User className="h-3.5 w-3.5" />} />
                <InfoRow label="Email" value={patient.user.email} icon={<Mail className="h-3.5 w-3.5" />} />
                <InfoRow label="Téléphone" value={patient.phone} icon={<Phone className="h-3.5 w-3.5" />} />
                <InfoRow label="Ville" value={patient.ville} icon={<MapPin className="h-3.5 w-3.5" />} />
                <InfoRow label="Pays" value={patient.pays} />
                <InfoRow label="Nationalité" value={patient.nationalite} />
                <InfoRow
                  label="Source"
                  value={patient.sourceContact ? formatSourceConnaissanceLabel(patient.sourceContact) : undefined}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Rendez-vous</CardTitle></CardHeader>
              <CardContent>
                {rendezvous.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-3">Aucun rendez-vous</p>
                ) : (
                  <div className="space-y-2">
                    {rendezvous.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 rounded-lg border p-3">
                        <Calendar className="h-4 w-4 text-brand-600 shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{formatDate(r.date.slice(0, 10))} à {r.heure}</p>
                          <p className="text-xs text-muted-foreground capitalize">{r.type}{r.motif ? ` — ${r.motif}` : ''}</p>
                        </div>
                        <Badge variant={r.statut === 'confirme' ? 'success' : 'warning'} className="text-xs">
                          {r.statut}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Formulaire médical ── */}
        <TabsContent value="formulaire">
          {!formulaire ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Aucun formulaire soumis</p>
            </div>
          ) : (
            <FormulairePayloadView
              status={formulaire.status}
              submittedAt={formulaire.submittedAt}
              createdAt={formulaire.createdAt}
              payload={(formulaire.payload ?? {}) as Record<string, unknown>}
            />
          )}
        </TabsContent>

        {/* ── Rapport médical ── */}
        <TabsContent value="rapport">
          <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
            {/* Versions */}
            <Card className="h-fit lg:sticky lg:top-24">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <History className="h-4 w-4 text-brand-600" />
                  Versions
                </CardTitle>
                <p className="text-[11px] text-muted-foreground font-normal">
                  Consultez l’historique complet. Seul le rapport actuel est modifiable.
                </p>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {rapports.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3">Aucun rapport pour l’instant.</p>
                ) : (
                  <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
                    {rapportMode === 'nouveau' && (
                      <div className="min-w-[160px] lg:min-w-0 rounded-xl border border-dashed border-[#81572d]/50 bg-[#81572d]/5 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#81572d]">R{nextVersionNum}</span>
                          <Badge className="text-[10px] bg-amber-100 text-amber-900 border-amber-200">Brouillon</Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">En cours de rédaction</p>
                      </div>
                    )}
                    {rapports.map((r, index) => {
                      const version = rapportVersionNumber(rapports, r.id)
                      const isLatest = index === 0
                      const isSelected =
                        rapportMode !== 'nouveau' && selectedRapportId === r.id
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleSelectRapportVersion(r.id)}
                          className={cn(
                            'min-w-[160px] lg:min-w-0 text-left rounded-xl border px-3 py-2.5 transition-colors',
                            isSelected
                              ? 'border-brand-300 bg-brand-50 ring-1 ring-brand-200'
                              : 'border-border hover:bg-slate-50',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900">R{version}</span>
                            {isLatest ? (
                              <Badge variant="success" className="text-[10px]">Actuel</Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                                <Lock className="h-2.5 w-2.5" /> Archivé
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {formatDate(r.updatedAt ?? r.createdAt)}
                          </p>
                          {r.forfaitPropose != null && (
                            <p className="text-[10px] text-slate-600 mt-0.5 truncate">
                              Forfait {formatCurrency(r.forfaitPropose)}
                            </p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Éditeur / consultation */}
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                      <Stethoscope className="h-4 w-4 text-brand-600" />
                      {rapportMode === 'nouveau'
                        ? `Nouveau rapport · R${nextVersionNum}`
                        : selectedRapport
                          ? `Rapport médical · R${selectedVersionNum}`
                          : 'Rapport médical'}
                      {rapportMode === 'consult' && (
                        <Badge className="text-[10px] bg-slate-100 text-slate-700 border-slate-200 gap-1">
                          <Eye className="h-3 w-3" /> Consultation
                        </Badge>
                      )}
                      {rapportMode === 'edit' && latestRapport && (
                        <Badge className="text-[10px] bg-sky-50 text-sky-800 border-sky-200 gap-1">
                          <Pencil className="h-3 w-3" /> Édition
                        </Badge>
                      )}
                      {rapportMode === 'nouveau' && (
                        <Badge className="text-[10px] bg-amber-100 text-amber-900 border-amber-200">
                          Nouvelle version
                        </Badge>
                      )}
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {rapportMode === 'nouveau'
                        ? 'Les versions précédentes et les devis déjà créés restent conservés.'
                        : rapportMode === 'consult'
                          ? 'Version archivée — lecture seule. Créez un nouveau rapport pour mettre à jour le dossier.'
                          : latestRapport
                            ? 'Correction du rapport actuel (écrase uniquement cette version).'
                            : 'Premier rapport médical du dossier.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {latestRapport && rapportMode !== 'nouveau' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={saving}
                        onClick={() => setConfirmNouveauOpen(true)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Nouveau rapport
                      </Button>
                    )}
                    {rapportMode === 'nouveau' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={saving}
                        onClick={cancelNouveauRapport}
                      >
                        Annuler
                      </Button>
                    )}
                    {rapportMode === 'consult' && latestRapport && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => handleSelectRapportVersion(latestRapport.id)}
                      >
                        Revenir à l’actuel
                      </Button>
                    )}
                    {selectedRapport && rapportMode !== 'nouveau' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5"
                        disabled={saving || deletingRapport}
                        onClick={() => {
                          setDeleteRapportError(null)
                          setConfirmDeleteOpen(true)
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Supprimer
                      </Button>
                    )}
                    {canEditFields && (
                      <Button
                        variant="brand"
                        size="sm"
                        className="gap-1.5"
                        disabled={saving || !forfait || Number(forfait) <= 0 || nuitsPreoperatoires === '' || nuitsClinique === '' || nuitsHotel === '' || vetementContention === null || (drainage === true && (!nbSeancesDrainage || Number(nbSeancesDrainage) < 1))}
                        title={
                          !forfait || Number(forfait) <= 0 ? 'Forfait médical requis'
                          : nuitsPreoperatoires === '' ? 'Nuit préparatoire en clinique requise'
                          : nuitsClinique === '' ? 'Nuits postopératoires requises'
                          : nuitsHotel === '' ? 'Nuit de convalescence à l\'hôtel requise'
                          : vetementContention === null ? 'Vêtement de contention requis'
                          : drainage === true && (!nbSeancesDrainage || Number(nbSeancesDrainage) < 1) ? 'Nombre de séances de drainage requis'
                          : undefined
                        }
                        onClick={() => void handleSaveRapport()}
                      >
                        {saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                        {saving
                          ? 'Enregistrement…'
                          : saved
                            ? 'Enregistré'
                            : rapportMode === 'nouveau'
                              ? `Générer R${nextVersionNum}`
                              : latestRapport
                                ? 'Enregistrer la correction'
                                : 'Générer le rapport'}
                      </Button>
                    )}
                  </div>
                </div>

                {rapportMode === 'nouveau' && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950 leading-relaxed">
                    <p className="font-semibold mb-0.5">Création d’une nouvelle version (R{nextVersionNum})</p>
                    <p>
                      Prérempli depuis R{rapports.length}. L’ancien rapport reste consultable dans l’historique.
                      Un nouveau devis pourra ensuite être créé sans écraser le précédent.
                    </p>
                  </div>
                )}
                {rapportMode === 'consult' && selectedRapport && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                    <p>
                      Vous consultez <strong>R{selectedVersionNum}</strong> du {formatDate(selectedRapport.createdAt)}.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="brand"
                      className="h-8 gap-1.5 shrink-0"
                      onClick={() => {
                        applyRapportToForm(selectedRapport, formulairePayloadForRapport(patient))
                        setRapportMode('nouveau')
                        setConfirmNouveauOpen(false)
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Nouveau à partir de cette version
                    </Button>
                  </div>
                )}
              </CardHeader>

              <CardContent className={cn('space-y-5', rapportReadOnly && 'opacity-[0.92]')}>
                {rapportError && (
                  <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {rapportError}
                  </div>
                )}

                <fieldset disabled={!canEditFields} className="space-y-5 border-0 p-0 m-0 min-w-0">
              <div className="space-y-2">
                <Label>Diagnostic</Label>
                <Textarea
                  value={diagnostic}
                  onChange={(e) => setDiagnostic(e.target.value)}
                  placeholder="Observations cliniques, analyse médicale..."
                  className="min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <Label>Examen complémentaire</Label>
                <div className="space-y-2.5">
                  {EXAMEN_OPTIONS.map((opt) => {
                    const checked = examensDemandes.includes(opt)
                    return (
                      <label
                        key={opt}
                        className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                          checked ? 'border-sky-300 bg-sky-50/50' : 'border-border hover:bg-muted/30'
                        } ${!canEditFields ? 'pointer-events-none' : ''}`}
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
                        <span className="text-sm text-foreground leading-relaxed whitespace-pre-line">{opt}</span>
                      </label>
                    )
                  })}
                  <label
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                      examensAutreChecked ? 'border-sky-300 bg-sky-50/50' : 'border-border hover:bg-muted/30'
                    } ${!canEditFields ? 'pointer-events-none' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                      checked={examensAutreChecked}
                      onChange={(e) => setExamensAutreChecked(e.target.checked)}
                    />
                    <span className="flex-1 space-y-2">
                      <span className="text-sm text-foreground">Autre</span>
                      {examensAutreChecked && (
                        <Input
                          value={examensAutreText}
                          onChange={(e) => setExamensAutreText(e.target.value)}
                          placeholder="Précisez l’examen…"
                          className="h-9 text-sm"
                        />
                      )}
                    </span>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Interventions recommandées (une par ligne)</Label>
                <Textarea
                  value={interventions}
                  onChange={(e) => setInterventions(e.target.value)}
                  placeholder={"Ex:\nAugmentation mammaire\nLiposuccion abdomen"}
                  className="min-h-[90px]"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Forfait proposé (TND)
                    <span className="text-destructive font-bold">*</span>
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={forfait}
                    onChange={(e) => setForfait(e.target.value)}
                    placeholder="Ex: 4500"
                    className={!forfait || Number(forfait) <= 0 ? 'border-amber-300 focus:border-amber-500' : ''}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Valorisation médicale</Label>
                  <Textarea
                    value={valeur}
                    onChange={(e) => setValeur(e.target.value)}
                    placeholder="Description technique des actes…"
                    className="min-h-[70px]"
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-border bg-slate-50/60 p-4">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Plan de séjour</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Clinique {sejourCliniqueTotal} · Hôtel {nuitsHotel || '—'} · Total {sejourTunisieAuto} nuits
                  </p>
                </div>

                <div>
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-2">Clinique</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        Nuit préparatoire
                        <span className="text-destructive font-bold">*</span>
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={30}
                        value={nuitsPreoperatoires}
                        onChange={(e) => setNuitsPreoperatoires(e.target.value)}
                        placeholder="Ex: 1"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        Nuits postop.
                        <span className="text-destructive font-bold">*</span>
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={60}
                        value={nuitsClinique}
                        onChange={(e) => setNuitsClinique(e.target.value)}
                        placeholder="Ex: 2"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Total clinique : <strong>{sejourCliniqueTotal}</strong> nuit(s)
                  </p>
                </div>

                <div className="border-t border-border pt-3">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-2">Hôtel</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        Nuits convalescence
                        <span className="text-destructive font-bold">*</span>
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={60}
                        value={nuitsHotel}
                        onChange={(e) => setNuitsHotel(e.target.value)}
                        placeholder="Ex: 4"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Total Tunisie</Label>
                      <Input
                        type="number"
                        readOnly
                        value={String(sejourTunisieAuto)}
                        className="bg-white font-semibold"
                        title="Calculé automatiquement : clinique + hôtel"
                      />
                      <p className="text-[10px] text-muted-foreground">Auto : clinique + hôtel</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-3">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-2">Accompagnants</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Adultes accompagnants</Label>
                      <Input
                        type="number"
                        min={0}
                        max={20}
                        placeholder="0"
                        value={nbAdultesSejour}
                        onChange={(e) => setNbAdultesSejour(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Enfants (2–12 ans)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={20}
                        placeholder="0"
                        value={nbEnfantsSejour}
                        onChange={(e) => setNbEnfantsSejour(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">Depuis le formulaire — sans compter la patiente.</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Vêtement de contention
                    <span className="text-destructive font-bold">*</span>
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={vetementContention === true ? 'brand' : 'outline'}
                      onClick={() => setVetementContention(true)}
                    >
                      Oui
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={vetementContention === false ? 'brand' : 'outline'}
                      onClick={() => setVetementContention(false)}
                    >
                      Non
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Anesthésie générale</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={anesthesieGenerale ? 'brand' : 'outline'}
                      onClick={() => setAnesthesieGenerale(true)}
                    >
                      Oui
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={!anesthesieGenerale ? 'brand' : 'outline'}
                      onClick={() => setAnesthesieGenerale(false)}
                    >
                      Non
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Drainage</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={drainage === true ? 'brand' : 'outline'}
                      onClick={() => setDrainage(true)}
                    >
                      Oui
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={drainage === false ? 'brand' : 'outline'}
                      onClick={() => { setDrainage(false); setNbSeancesDrainage('') }}
                    >
                      Non
                    </Button>
                  </div>
                </div>
                {drainage === true && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      Nombre de séances
                      <span className="text-destructive font-bold">*</span>
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      placeholder="Ex: 5"
                      value={nbSeancesDrainage}
                      onChange={(e) => setNbSeancesDrainage(e.target.value)}
                      className={!nbSeancesDrainage || Number(nbSeancesDrainage) < 1 ? 'border-amber-300 focus:border-amber-500' : ''}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Notes internes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes confidentielles, recommandations complémentaires..."
                  className="min-h-[80px]"
                />
              </div>
                </fieldset>

                {selectedRapport && rapportMode !== 'nouveau' && (
                  <p className="text-xs text-muted-foreground">
                    R{selectedVersionNum} · créé le {formatDate(selectedRapport.createdAt)}
                    {selectedRapport.updatedAt && selectedRapport.updatedAt !== selectedRapport.createdAt
                      ? ` · mis à jour le ${formatDate(selectedRapport.updatedAt)}`
                      : ''}
                    {user?.name ? ` · Dr. ${user.name}` : ''}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <ConfirmDialog
            open={confirmNouveauOpen}
            onClose={() => setConfirmNouveauOpen(false)}
            title="Créer un nouveau rapport ?"
            description={`Une nouvelle version (R${nextVersionNum}) sera ajoutée. R${rapports.length || 1} restera consultable. Les devis déjà émis restent inchangés — un nouveau devis pourra être créé ensuite.`}
            confirmLabel={`Créer R${nextVersionNum}`}
            confirmVariant="brand"
            onConfirm={startNouveauRapport}
          />
          <ConfirmDialog
            open={confirmDeleteOpen}
            onClose={() => {
              if (deletingRapport) return
              setConfirmDeleteOpen(false)
              setDeleteRapportError(null)
            }}
            title={`Supprimer le rapport R${selectedVersionNum} ?`}
            description="Cette action est définitive. Les devis déjà émis restent conservés (lien rapport retiré)."
            confirmLabel="Supprimer le rapport"
            confirmVariant="destructive"
            loading={deletingRapport}
            error={deleteRapportError}
            onConfirm={() => void handleDeleteRapport()}
          />
        </TabsContent>


        {/* ── Suivi ── */}
        <TabsContent value="suivi">
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Historique du dossier</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { date: patient.user.createdAt, label: 'Compte créé', icon: '👤' },
                    formulaire?.submittedAt ? { date: formulaire.submittedAt, label: 'Formulaire soumis', icon: '📋' } : null,
                    ...rapportVersionsChrono.map((r) => ({
                      date: r.createdAt,
                      label: `Rapport médical R${rapportVersionNumber(rapports, r.id)}${r.id === latestRapport?.id ? ' (actuel)' : ''}${user?.name ? ` · Dr. ${user.name}` : ''}`,
                      icon: '🩺',
                    })),
                    ...patient.devis.map((d) => ({ date: d.dateCreation, label: `Devis ${d.statut} — ${formatCurrency(d.total)}`, icon: '📄' })),
                    ...rendezvous.map((r) => ({ date: r.date, label: `RDV ${r.type} — ${r.statut}`, icon: '📅' })),
                  ]
                    .filter(Boolean)
                    .sort((a, b) => new Date(b!.date).getTime() - new Date(a!.date).getTime())
                    .map((ev, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span className="text-base shrink-0 mt-0.5">{ev!.icon}</span>
                        <div>
                          <p className="text-sm font-medium">{ev!.label}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(ev!.date)}</p>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
