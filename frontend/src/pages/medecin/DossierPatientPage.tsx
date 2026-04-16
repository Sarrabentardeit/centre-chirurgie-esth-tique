import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, FileText, Stethoscope, CheckCircle2, User, Phone, Mail,
  MapPin, Calendar, AlertCircle, RefreshCw, Save, ClipboardList, Clock, ExternalLink,
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

// ─── Types locaux ──────────────────────────────────────────────────────────────

interface Rapport {
  id: string
  diagnostic: string | null
  interventionsRecommandees: string[]
  valeurMedicale: string | null
  forfaitPropose: number | null
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
  formulaires: Array<{ id: string; status: string; submittedAt: string | null; payload: Record<string, unknown> }>
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

const SOURCE_COLORS: Record<string, string> = {
  instagram: 'bg-pink-50 text-pink-700 border-pink-200',
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

function InfoRow({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      {icon && <span className="mt-0.5 text-muted-foreground shrink-0">{icon}</span>}
      <span className="text-muted-foreground text-sm min-w-[130px] shrink-0">{label}</span>
      <span className="text-sm font-medium ml-auto text-right">
        {value || <span className="text-muted-foreground/70">-</span>}
      </span>
    </div>
  )
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s.length > 0 ? s : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v).trim()).filter(Boolean)
}

function resolveFileUrl(value: string): string {
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  if (value.startsWith('/')) {
    const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace('/api', '') ?? 'http://localhost:4000'
    return `${base}${value}`
  }
  const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace('/api', '') ?? 'http://localhost:4000'
  return `${base}/uploads/${encodeURIComponent(value)}`
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
  const [interventions, setInterventions] = useState('')
  const [valeur, setValeur]             = useState('')
  const [forfait, setForfait]           = useState('')
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
        setDiagnostic(r.diagnostic ?? '')
        setInterventions((r.interventionsRecommandees ?? []).join('\n'))
        setValeur(r.valeurMedicale ?? '')
        setForfait(r.forfaitPropose?.toString() ?? '')
        setNotes(r.notes ?? '')
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
      await medecinApi.upsertRapport(id, {
        diagnostic: diagnostic || undefined,
        interventionsRecommandees: interventions.split('\n').map((s) => s.trim()).filter(Boolean),
        valeurMedicale: valeur || undefined,
        forfaitPropose: forfait ? Number(forfait) : undefined,
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
  const payload    = (formulaire?.payload ?? {}) as Record<string, unknown>
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
            <span className={`text-xs px-2 py-1 rounded border font-medium shrink-0 ${SOURCE_COLORS[patient.sourceContact] ?? ''}`}>
              {patient.sourceContact}
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
                <InfoRow label="Source" value={patient.sourceContact ?? undefined} />
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
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-4 py-2.5 text-sm">
                {formulaire.status === 'submitted'
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  : <Clock className="h-4 w-4 text-amber-600" />}
                <span className="font-medium">
                  {formulaire.status === 'submitted' ? 'Formulaire soumis' : 'Brouillon'}
                </span>
                {formulaire.submittedAt && (
                  <span className="text-muted-foreground ml-2">le {formatDate(formulaire.submittedAt)}</span>
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="text-sm">Données personnelles</CardTitle></CardHeader>
                  <CardContent>
                    <InfoRow label="Date de naissance" value={asString(payload.dateNaissance)} />
                    <InfoRow label="Poids" value={asString(payload.poids) ? `${String(payload.poids)} kg` : null} />
                    <InfoRow label="Taille" value={asString(payload.taille) ? `${String(payload.taille)} cm` : null} />
                    <InfoRow label="Groupe sanguin" value={asString(payload.groupeSanguin)} />
                    <InfoRow label="Période souhaitée" value={asString(payload.periodeSouhaitee)} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm">Données médicales</CardTitle></CardHeader>
                  <CardContent>
                    <InfoRow label="Antécédents médicaux" value={asStringArray(payload.antecedentsMedicaux).join(', ') || null} />
                    <InfoRow label="Traitement en cours" value={payload.traitementEnCours === true ? 'Oui' : payload.traitementEnCours === false ? 'Non' : null} />
                    <InfoRow label="Détails traitement" value={asString(payload.traitementDetails)} />
                    <InfoRow label="Allergies" value={asStringArray(payload.allergies).join(', ') || null} />
                    <InfoRow label="Fumeuse" value={payload.fumeur === true ? 'Oui' : payload.fumeur === false ? 'Non' : null} />
                    <InfoRow label="Détails tabac" value={asString(payload.detailsTabac)} />
                    <InfoRow label="Alcool" value={payload.alcool === true ? 'Oui' : payload.alcool === false ? 'Non' : null} />
                    <InfoRow label="Détails alcool" value={asString(payload.detailsAlcool)} />
                    <InfoRow label="Drogue" value={payload.drogue === true ? 'Oui' : payload.drogue === false ? 'Non' : null} />
                    <InfoRow label="Détails drogue" value={asString(payload.detailsDrogue)} />
                    <InfoRow label="Autres maladies" value={asString(payload.autresMaladiesChroniques)} />
                    <InfoRow label="Chirurgies antérieures" value={payload.chirurgiesAnterieures === true ? 'Oui' : payload.chirurgiesAnterieures === false ? 'Non' : null} />
                    <InfoRow label="Détails chirurgies" value={asString(payload.chirurgiesDetails)} />
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                  <CardHeader><CardTitle className="text-sm">Demande du patient</CardTitle></CardHeader>
                  <CardContent>
                    <InfoRow label="Interventions souhaitées" value={asStringArray(payload.typeIntervention).join(', ') || null} />
                    <InfoRow label="Description demande" value={asString(payload.descriptionDemande)} />
                    <InfoRow label="Attentes" value={asString(payload.attentes)} />
                    <InfoRow label="Date souhaitée" value={asString(payload.dateSouhaitee)} />
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                  <CardHeader><CardTitle className="text-sm">Documents et photos</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Photos</p>
                      {asStringArray(payload.photos).length === 0 ? (
                        <p className="text-sm text-muted-foreground">-</p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {asStringArray(payload.photos).map((photo, idx) => {
                            const url = resolveFileUrl(photo)
                            const fileName = decodeURIComponent(url.split('/').pop() ?? `photo-${idx + 1}`)
                            return (
                              <a
                                key={`${photo}-${idx}`}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group relative aspect-square rounded-lg border overflow-hidden bg-muted/30"
                                title={fileName}
                              >
                                <img
                                  src={url}
                                  alt={fileName}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                  <ExternalLink className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </a>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Documents</p>
                      {asStringArray(payload.documentsPDF).length === 0 ? (
                        <p className="text-sm text-muted-foreground">-</p>
                      ) : (
                        <div className="space-y-2">
                          {asStringArray(payload.documentsPDF).map((doc, idx) => {
                            const url = resolveFileUrl(doc)
                            const fileName = decodeURIComponent(url.split('/').pop() ?? `document-${idx + 1}`)
                            return (
                              <a
                                key={`${doc}-${idx}`}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-muted/30 transition-colors"
                              >
                                <FileText className="h-4 w-4 text-rose-500 shrink-0" />
                                <span className="text-sm truncate flex-1">{fileName}</span>
                                <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                              </a>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
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
                  <Label>Valeur médicale</Label>
                  <Input
                    value={valeur}
                    onChange={(e) => setValeur(e.target.value)}
                    placeholder="Ex: Excellent candidat"
                  />
                </div>
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
