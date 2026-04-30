import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, FileText, Stethoscope, CheckCircle2, User, Phone, Mail,
  MapPin, Calendar, AlertCircle, RefreshCw, Save, ClipboardList,
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
import { STATUS_LABELS, STATUS_COLORS, formatDate, formatCurrency } from '@/lib/utils'
import { medecinApi } from '@/lib/api'
import type { Devis, RendezVous } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { formatSourceConnaissanceLabel } from '@/lib/sourceConnaissance'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { InfoRow, FormulairePayloadView } from '@/components/dossier/FormulairePayloadView'

// ─── Types locaux ──────────────────────────────────────────────────────────────

interface Rapport {
  id: string
  diagnostic: string | null
  examensDemandes?: string[]
  interventionsRecommandees: string[]
  valeurMedicale: string | null
  forfaitPropose: number | null
  nuitsClinique?: number | null
  anesthesieGenerale?: boolean | null
  notes: string | null
  createdAt: string
}

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
  'rapport_genere', 'devis_preparation', 'devis_envoye', 'devis_accepte',
  'date_reservee', 'logistique', 'intervention', 'post_op', 'suivi_termine',
]

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DossierPatientPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') ?? 'profil'
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
  const [nuitsClinique, setNuitsClinique] = useState('')
  const [anesthesieGenerale, setAnesthesieGenerale] = useState<boolean | null>(null)
  const [notes, setNotes]               = useState('')
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [rapportError, setRapportError] = useState<string | null>(null)

  // Status change
  const [newStatus, setNewStatus]       = useState('')
  const [statusSaving, setStatusSaving] = useState(false)

  const load = async () => {
    if (!id) return
    setLoading(true); setError(null)
    try {
      const res = await medecinApi.getPatient(id)
      setPatient(res.patient as PatientDetail)
      // Pre-fill rapport form
      const r = res.patient.rapports?.[0]
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
        setForfait(r.forfaitPropose?.toString() ?? '')
        setNuitsClinique(r.nuitsClinique != null ? String(r.nuitsClinique) : '')
        setAnesthesieGenerale(r.anesthesieGenerale ?? null)
        setNotes(r.notes ?? '')
      } else {
        setExamensDemandes([])
        setExamensAutreChecked(false)
        setExamensAutreText('')
      }
      setNewStatus(res.patient.status)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [id])

  const handleSaveRapport = async () => {
    if (!id) return
    setSaving(true); setRapportError(null)
    try {
      const examensPayload = [...examensDemandes]
      if (examensAutreChecked) {
        examensPayload.push(
          examensAutreText.trim() ? `${EXAMEN_AUTRE_PREFIX} ${examensAutreText.trim()}` : 'Autre'
        )
      }
      await medecinApi.upsertRapport(id, {
        diagnostic: diagnostic || undefined,
        examensDemandes: examensPayload,
        interventionsRecommandees: interventions.split('\n').map((s) => s.trim()).filter(Boolean),
        forfaitPropose: forfait ? Number(forfait) : undefined,
        nuitsClinique: nuitsClinique === '' ? undefined : Number(nuitsClinique),
        anesthesieGenerale: anesthesieGenerale === null ? undefined : anesthesieGenerale,
        notes: notes || undefined,
      })
      setSaved(true)
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
  const rapport    = patient.rapports?.[0]
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

  return (
    <div className="max-w-5xl mx-auto space-y-0 p-6">

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border mb-5 -mx-6 px-6 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/medecin/patients')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarFallback className="bg-brand-100 text-brand-700 font-bold text-sm">
              {getInitials(patient.user.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold">{patient.user.fullName}</h2>
              <span className="text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200 px-2 py-0.5 rounded">
                {patient.dossierNumber}
              </span>
              <Badge className={`text-xs ${STATUS_COLORS[patient.status as keyof typeof STATUS_COLORS] ?? ''}`}>
                {STATUS_LABELS[patient.status as keyof typeof STATUS_LABELS] ?? patient.status}
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{patient.user.email}</span>
              {patient.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{patient.phone}</span>}
              {(patient.ville || patient.pays) && (
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{[patient.ville, patient.pays].filter(Boolean).join(', ')}</span>
              )}
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Créé le {formatDate(patient.user.createdAt)}</span>
            </div>
          </div>
          {patient.sourceContact && (
            <span
              className={`text-xs px-2 py-1 rounded border font-medium shrink-0 ${
                SOURCE_COLORS[patient.sourceContact] ?? SOURCE_COLORS[patient.sourceContact.toLowerCase()] ?? ''
              }`}
            >
              {formatSourceConnaissanceLabel(patient.sourceContact)}
            </span>
          )}
        </div>
      </div>

      {/* ── Changer statut ── */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="text-sm text-muted-foreground">Statut dossier :</span>
        <Select value={newStatus} onValueChange={setNewStatus}>
          <SelectTrigger className="w-52 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOSSIER_STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {STATUS_LABELS[s as keyof typeof STATUS_LABELS] ?? s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {newStatus !== patient.status && (
          <Button size="sm" variant="brand" className="h-8 text-xs" disabled={statusSaving} onClick={handleUpdateStatus}>
            {statusSaving ? 'Sauvegarde...' : 'Appliquer'}
          </Button>
        )}
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue={initialTab}>
        <TabsList className="mb-5 w-full sm:w-auto flex">
          <TabsTrigger value="profil" className="gap-1 sm:gap-1.5 flex-1 sm:flex-none text-xs sm:text-sm">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden xs:inline sm:inline">Profil</span>
            <span className="xs:hidden sm:hidden">Profil</span>
          </TabsTrigger>
          <TabsTrigger value="formulaire" className="gap-1 sm:gap-1.5 flex-1 sm:flex-none text-xs sm:text-sm">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Formulaire</span>
            <span className="sm:hidden">Form.</span>
          </TabsTrigger>
          <TabsTrigger value="rapport" className="gap-1 sm:gap-1.5 flex-1 sm:flex-none text-xs sm:text-sm">
            <Stethoscope className="h-3.5 w-3.5 shrink-0" />
            <span>Rapport</span>
          </TabsTrigger>
          <TabsTrigger value="suivi" className="gap-1 sm:gap-1.5 flex-1 sm:flex-none text-xs sm:text-sm">
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

            <Card>
              <CardHeader><CardTitle className="text-sm">Devis</CardTitle></CardHeader>
              <CardContent>
                {patient.devis.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-3">Aucun devis</p>
                ) : (
                  <div className="space-y-2">
                    {patient.devis.map((d) => (
                      <div key={d.id} className="flex items-center gap-3 rounded-lg border p-3">
                        <FileText className="h-4 w-4 text-amber-500 shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{formatCurrency(d.total)}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(d.dateCreation)} · v{d.version}</p>
                        </div>
                        <Badge variant={d.statut === 'accepte' ? 'success' : d.statut === 'refuse' ? 'destructive' : 'info'} className="text-xs capitalize">
                          {d.statut}
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
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-brand-600" />
                  Rapport médical
                  {rapport && <Badge variant="success" className="text-xs">Existant</Badge>}
                </CardTitle>
                <Button
                  variant="brand"
                  size="sm"
                  className="gap-1.5"
                  disabled={saving}
                  onClick={handleSaveRapport}
                >
                  {saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Sauvegarde...' : saved ? 'Sauvegardé !' : 'Sauvegarder'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {rapportError && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {rapportError}
                </div>
              )}

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
                        <span className="text-sm text-foreground leading-relaxed whitespace-pre-line">{opt}</span>
                      </label>
                    )
                  })}
                  <label
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                      examensAutreChecked ? 'border-sky-300 bg-sky-50/50' : 'border-border hover:bg-muted/30'
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
                    <span className="text-sm text-foreground leading-relaxed">Autre</span>
                  </label>
                  {examensAutreChecked && (
                    <Input
                      value={examensAutreText}
                      onChange={(e) => setExamensAutreText(e.target.value)}
                      placeholder="Préciser l'examen complémentaire..."
                    />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Interventions recommandées (une par ligne)</Label>
                <Textarea
                  value={interventions}
                  onChange={(e) => setInterventions(e.target.value)}
                  placeholder="Rhinoplastie&#10;Blepharoplastie..."
                  className="min-h-[80px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Forfait proposé (TND)</Label>
                  <Input
                    type="number"
                    value={forfait}
                    onChange={(e) => setForfait(e.target.value)}
                    placeholder="Ex: 5000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre de nuits cliniques (séjour médical)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={60}
                    value={nuitsClinique}
                    onChange={(e) => setNuitsClinique(e.target.value)}
                    placeholder="Ex: 2"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Anesthésie générale</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={anesthesieGenerale === true ? 'brand' : 'outline'}
                      onClick={() => setAnesthesieGenerale(true)}
                    >
                      Oui
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={anesthesieGenerale === false ? 'brand' : 'outline'}
                      onClick={() => setAnesthesieGenerale(false)}
                    >
                      Non
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={anesthesieGenerale === null ? 'brand' : 'outline'}
                      onClick={() => setAnesthesieGenerale(null)}
                    >
                      Non précisé
                    </Button>
                  </div>
                </div>
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

              {rapport && (
                <p className="text-xs text-muted-foreground">
                  Dernière modification : {formatDate(rapport.createdAt)} · Dr. {user?.name}
                </p>
              )}
            </CardContent>
          </Card>
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
                    rapport ? { date: rapport.createdAt, label: `Rapport rédigé par Dr. ${user?.name}`, icon: '🩺' } : null,
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
