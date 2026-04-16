import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Save, Send, CheckCircle2, Stethoscope, Scissors, Heart, FileText, AlertCircle, RefreshCw, Search, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { STATUS_COLORS, STATUS_LABELS, formatCurrency, formatDate, type CurrencyUnit } from '@/lib/utils'
import { useParams } from 'react-router-dom'
import { gestionnaireApi, type Devis, type GestionnairePatientDetail, type PatientListItem } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'

interface LigneDevisForm {
  description: string
  quantite: number
  prixUnitaire: number
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return '?'
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase()
}

export default function DevisGestionnairePage() {
  const { id: patientIdFromUrl } = useParams<{ id?: string }>()
  const currency: CurrencyUnit = 'TND'

  const [patients, setPatients]           = useState<PatientListItem[]>([])
  const [listLoading, setListLoading]     = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [pageError, setPageError]         = useState<string | null>(null)
  const [search, setSearch]               = useState('')

  const [selectedPatient, setSelectedPatient]   = useState('')
  const [patientDetail, setPatientDetail]       = useState<GestionnairePatientDetail | null>(null)

  const [lignes, setLignes]               = useState<LigneDevisForm[]>([{ description: '', quantite: 1, prixUnitaire: 0 }])
  const [planning, setPlanning]           = useState('')
  const [notesSejour, setNotesSejour]     = useState('')
  const [sent, setSent]                   = useState(false)
  const [savedDraft, setSavedDraft]       = useState(false)
  const [isEditingExisting, setIsEditingExisting] = useState(false)
  const [rapportExpanded, setRapportExpanded]     = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  const STATUTS_DEVIS = ['rapport_genere', 'devis_preparation', 'devis_envoye', 'devis_accepte']

  const patientsAvecRapport = useMemo(
    () => patients.filter((p) => STATUTS_DEVIS.includes(p.status)),
    [patients]
  )

  const patientsFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return patientsAvecRapport
    return patientsAvecRapport.filter(
      (p) =>
        p.user.fullName.toLowerCase().includes(q) ||
        p.dossierNumber.toLowerCase().includes(q)
    )
  }, [patientsAvecRapport, search])

  const loadPatients = useCallback(async () => {
    setListLoading(true)
    setPageError(null)
    try {
      const res = await gestionnaireApi.getPatients()
      setPatients(res.patients)
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Impossible de charger les patients.')
    } finally {
      setListLoading(false)
    }
  }, [])

  const loadPatientDetail = useCallback(async (id: string) => {
    if (!id) return
    setDetailLoading(true)
    setPageError(null)
    try {
      const res = await gestionnaireApi.getPatient(id)
      setPatientDetail(res.patient)
    } catch (e) {
      setPatientDetail(null)
      setPageError(e instanceof Error ? e.message : 'Impossible de charger le dossier.')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => { void loadPatients() }, [loadPatients])

  // Initialise depuis l'URL uniquement au premier chargement
  useEffect(() => {
    if (patientIdFromUrl) {
      setSelectedPatient(patientIdFromUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientIdFromUrl])

  // Sélectionne automatiquement le premier patient si rien n'est sélectionné
  useEffect(() => {
    if (!selectedPatient && patientsAvecRapport.length > 0) {
      setSelectedPatient(patientsAvecRapport[0].id)
    }
  }, [patientsAvecRapport, selectedPatient])

  useEffect(() => {
    if (!selectedPatient) { setPatientDetail(null); return }
    void loadPatientDetail(selectedPatient)
  }, [selectedPatient, loadPatientDetail])

  const rapportRaw = patientDetail?.rapports?.[0] ?? null
  const rapport = rapportRaw ? {
    dateCreation: rapportRaw.createdAt.slice(0, 10),
    diagnostic: rapportRaw.diagnostic ?? '',
    interventionsRecommandees: rapportRaw.interventionsRecommandees ?? [],
    valeurMedicale: rapportRaw.valeurMedicale ?? '',
    notes: rapportRaw.notes ?? '',
    forfaitPropose: rapportRaw.forfaitPropose,
  } : null

  const existingDevis: Devis | null = useMemo(() => {
    const list = patientDetail?.devis ?? []
    return list.find((d) => d.statut === 'brouillon') ??
           list.find((d) => d.statut === 'envoye' || d.statut === 'accepte') ?? null
  }, [patientDetail])

  useEffect(() => {
    setIsEditingExisting(false)
    setSent(false)
    setSavedDraft(false)
  }, [selectedPatient])

  useEffect(() => {
    if (!patientDetail || isEditingExisting) return
    const draft = patientDetail.devis?.find((d) => d.statut === 'brouillon')
    if (draft) {
      setLignes(draft.lignes.map((l) => ({ description: l.description, quantite: l.quantite, prixUnitaire: l.prixUnitaire })))
      setPlanning(draft.planningMedical ?? '')
      setNotesSejour(draft.notesSejour ?? '')
      return
    }
    setLignes([{ description: '', quantite: 1, prixUnitaire: 0 }])
    setPlanning('')
    setNotesSejour('')
  }, [patientDetail, isEditingExisting])

  const patientRow = patients.find((p) => p.id === selectedPatient)
  const total = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)

  const addLigne    = () => setLignes((p) => [...p, { description: '', quantite: 1, prixUnitaire: 0 }])
  const removeLigne = (i: number) => setLignes((p) => p.filter((_, idx) => idx !== i))
  const updateLigne = (i: number, f: keyof LigneDevisForm, v: string | number) =>
    setLignes((p) => p.map((l, idx) => (idx === i ? { ...l, [f]: v } : l)))

  const buildPayload = () => {
    const dateValidite = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const lignesPayload = lignes.map((l) => ({ ...l, total: l.quantite * l.prixUnitaire }))
    return { dateValidite, lignes: lignesPayload, total: lignesPayload.reduce((s, x) => s + x.total, 0), planningMedical: planning || null, notesSejour: notesSejour || null, currency }
  }

  const handleSaveDraft = async () => {
    if (!selectedPatient) return
    setActionLoading(true); setPageError(null)
    try {
      await gestionnaireApi.upsertDevisDraft(selectedPatient, buildPayload())
      setSavedDraft(true); setTimeout(() => setSavedDraft(false), 2000)
      await loadPatientDetail(selectedPatient); await loadPatients()
    } catch (e) { setPageError(e instanceof Error ? e.message : 'Enregistrement impossible.') }
    finally { setActionLoading(false) }
  }

  const handleSend = async () => {
    if (!selectedPatient) return
    setActionLoading(true); setPageError(null)
    try {
      const r = await gestionnaireApi.upsertDevisDraft(selectedPatient, buildPayload())
      await gestionnaireApi.sendDevis(r.devis.id)
      setSent(true); setTimeout(() => setSent(false), 2500)
      setIsEditingExisting(false)
      await loadPatientDetail(selectedPatient); await loadPatients()
    } catch (e) { setPageError(e instanceof Error ? e.message : 'Envoi impossible.') }
    finally { setActionLoading(false) }
  }

  const startEditing = () => {
    if (!existingDevis) return
    setLignes(existingDevis.lignes.map((l) => ({ description: l.description, quantite: l.quantite, prixUnitaire: l.prixUnitaire })))
    setPlanning(existingDevis.planningMedical ?? '')
    setNotesSejour(existingDevis.notesSejour ?? '')
    setIsEditingExisting(true)
  }

  const handleRefuse = async () => {
    if (!existingDevis) return
    const reason = window.prompt('Motif de refus (optionnel)') ?? ''
    setActionLoading(true); setPageError(null)
    try {
      await gestionnaireApi.refuseDevis(existingDevis.id, { reason: reason.trim() || undefined })
      await loadPatientDetail(selectedPatient); await loadPatients()
    } catch (e) { setPageError(e instanceof Error ? e.message : 'Action impossible.') }
    finally { setActionLoading(false) }
  }

  /* ─── RENDER ───────────────────────────────────────────────────────── */
  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col -mx-4 -mt-2 sm:-mx-6 sm:-mt-4 bg-gradient-to-b from-slate-50 to-slate-100/70">

      {/* ── Barre supérieure ── */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 bg-white/90 backdrop-blur border-b border-border shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-foreground">Gestion des devis</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Préparez et envoyez les devis à partir des rapports médicaux</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => void loadPatients()} disabled={listLoading}>
          <RefreshCw className={`h-3.5 w-3.5 ${listLoading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {pageError && (
        <div className="shrink-0 mx-6 mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />{pageError}
        </div>
      )}

      {/* ── Corps principal ── */}
      <div className="flex-1 overflow-hidden p-4 sm:p-5">
        <div className="h-full flex overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_36px_-20px_rgba(15,23,42,0.35)]">

        {/* ═══ COLONNE GAUCHE — Liste patients ═══ */}
        <div className="w-[21.5rem] shrink-0 flex flex-col border-r border-slate-200 bg-slate-50/60">

          {/* Recherche + compteur */}
          <div className="px-4 py-3 border-b border-slate-200 bg-white space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Patients</span>
              <span className="text-xs font-bold text-white bg-brand-600 rounded-full px-2 py-0.5">
                {patientsAvecRapport.length}
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="Rechercher un patient..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Liste */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {listLoading && (
              <div className="p-4 space-y-3">
                {[1,2,3,4].map((k) => (
                  <div key={k} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!listLoading && patientsFiltered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center gap-2">
                <FileText className="h-9 w-9 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Aucun patient trouvé</p>
              </div>
            )}

            {!listLoading && patientsFiltered.map((p) => {
              const isSelected = selectedPatient === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPatient(p.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left border transition-all ${
                    isSelected
                      ? 'bg-brand-50 border-brand-200 ring-1 ring-brand-100 shadow-sm'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className={`text-sm font-bold ${isSelected ? 'bg-brand-100 text-brand-700' : 'bg-muted text-muted-foreground'}`}>
                      {initials(p.user.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{p.user.fullName}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{p.dossierNumber}</p>
                    <Badge className={`text-[10px] mt-1.5 font-medium ${STATUS_COLORS[p.status as keyof typeof STATUS_COLORS] ?? ''}`}>
                      {STATUS_LABELS[p.status as keyof typeof STATUS_LABELS] ?? p.status}
                    </Badge>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ═══ ZONE DROITE — Détail ═══ */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-100/60">

          {/* Aucun patient sélectionné */}
          {!patientRow && !listLoading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-10">
              <div className="h-16 w-16 rounded-2xl bg-white border border-border flex items-center justify-center shadow-sm">
                <FileText className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <p className="text-base font-semibold text-muted-foreground">Sélectionnez un patient</p>
              <p className="text-sm text-muted-foreground/70 max-w-xs">
                Choisissez un patient dans la liste pour consulter son rapport médical et préparer un devis.
              </p>
            </div>
          )}

          {/* Patient sélectionné */}
          {patientRow && (
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* Bandeau patient */}
              <div className="shrink-0 flex items-center gap-3 px-6 py-3.5 bg-white border-b border-slate-200">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-brand-100 text-brand-700 text-xs font-bold">
                    {initials(patientRow.user.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{patientRow.user.fullName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-mono text-brand-600">{patientRow.dossierNumber}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <Badge className={`text-[10px] ${STATUS_COLORS[patientRow.status as keyof typeof STATUS_COLORS] ?? ''}`}>
                      {STATUS_LABELS[patientRow.status as keyof typeof STATUS_LABELS] ?? patientRow.status}
                    </Badge>
                  </div>
                </div>
                <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-3 py-1 border border-border">
                  TND — Dinar tunisien
                </span>
              </div>

              {/* Contenu scrollable */}
              <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5 p-5 xl:p-6">

                  {/* ── RAPPORT MÉDICAL ── */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-5 py-4 border-b border-slate-200 hover:bg-slate-50 transition-colors"
                      onClick={() => setRapportExpanded((v) => !v)}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center">
                          <Stethoscope className="h-4 w-4 text-teal-600" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-semibold text-foreground">Rapport médical</p>
                          <p className="text-xs text-muted-foreground">
                            {rapport ? `Finalisé le ${formatDate(rapport.dateCreation)}` : 'En attente du médecin'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {rapport
                          ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                              <CheckCircle2 className="h-3 w-3" /> Disponible
                            </span>
                          : <span className="text-[11px] text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">En attente</span>
                        }
                        {rapportExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </button>

                    {detailLoading && (
                      <div className="p-5 space-y-3">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-14 w-full" />
                      </div>
                    )}

                    {!detailLoading && rapportExpanded && !rapport && (
                      <div className="flex flex-col items-center py-14 text-center gap-3">
                        <FileText className="h-10 w-10 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">Rapport non encore disponible</p>
                        <p className="text-xs text-muted-foreground/60 max-w-xs">
                          Le médecin n&apos;a pas encore finalisé l&apos;analyse de ce dossier.
                        </p>
                      </div>
                    )}

                    {!detailLoading && rapportExpanded && rapport && (
                      <div className="p-5 space-y-5">

                        {/* Diagnostic */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Heart className="h-3.5 w-3.5 text-rose-500" />
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Diagnostic</span>
                          </div>
                          <p className="text-sm text-foreground leading-relaxed bg-muted/30 rounded-lg px-4 py-3 border border-border/60">
                            {rapport.diagnostic || <span className="italic text-muted-foreground">Non renseigné</span>}
                          </p>
                        </div>

                        {/* Interventions */}
                        {rapport.interventionsRecommandees.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Scissors className="h-3.5 w-3.5 text-indigo-500" />
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Interventions recommandées</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {rapport.interventionsRecommandees.map((interv) => (
                                <span key={interv} className="text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md px-2.5 py-1">
                                  {interv}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Valorisation */}
                        {!!rapport.valeurMedicale && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Valorisation médicale</span>
                            </div>
                            <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 leading-relaxed">
                              {rapport.valeurMedicale}
                            </p>
                          </div>
                        )}

                        {/* Forfait suggéré */}
                        {rapport.forfaitPropose != null && rapport.forfaitPropose > 0 && (
                          <div className="rounded-xl border border-brand-200 bg-brand-50 px-5 py-4 text-center">
                            <p className="text-xs font-semibold text-brand-500 uppercase tracking-wide mb-1">
                              Forfait suggéré par le médecin
                            </p>
                            <p className="text-3xl font-extrabold text-brand-700">
                              {formatCurrency(rapport.forfaitPropose, currency)}
                            </p>
                            <p className="text-xs text-brand-400 mt-1">Indicatif — la gestionnaire saisit librement</p>
                          </div>
                        )}

                        {/* Notes */}
                        {rapport.notes && (
                          <div className="space-y-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</span>
                            <p className="text-sm italic text-muted-foreground bg-muted/30 border border-border/60 rounded-lg px-4 py-3">
                              {rapport.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── DEVIS ── */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

                    {detailLoading && (
                      <div className="p-5 space-y-4">
                        <Skeleton className="h-5 w-1/2" />
                        <Skeleton className="h-40 w-full" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    )}

                    {/* Devis existant (envoyé/accepté/refusé) */}
                    {!detailLoading && existingDevis && !isEditingExisting && existingDevis.statut !== 'brouillon' && (
                      <>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/60">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
                              <FileText className="h-4 w-4 text-brand-600" />
                            </div>
                            <p className="text-sm font-semibold text-foreground">Devis</p>
                          </div>
                          <Badge variant={existingDevis.statut === 'accepte' ? 'success' : existingDevis.statut === 'refuse' ? 'destructive' : 'info'} className="font-semibold">
                            {existingDevis.statut === 'envoye' ? 'Envoyé' : existingDevis.statut === 'accepte' ? 'Accepté' : 'Refusé'}
                          </Badge>
                        </div>

                        <div className="p-5 space-y-4">
                          {/* Tableau */}
                          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                            <div className="grid grid-cols-12 bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              <div className="col-span-7">Prestation</div>
                              <div className="col-span-2 text-center">Qté</div>
                              <div className="col-span-3 text-right">Montant</div>
                            </div>
                            {existingDevis.lignes.map((l, i) => (
                              <div key={i} className="grid grid-cols-12 px-4 py-3 border-b border-slate-100 last:border-0 text-sm">
                                <div className="col-span-7 text-foreground truncate">{l.description}</div>
                                <div className="col-span-2 text-center text-muted-foreground">{l.quantite}</div>
                                <div className="col-span-3 text-right font-semibold">
                                  {l.total === 0 ? <span className="italic text-muted-foreground text-xs">Inclus</span> : formatCurrency(l.total, currency)}
                                </div>
                              </div>
                            ))}
                            <div className="grid grid-cols-12 px-4 py-3 bg-brand-600">
                              <div className="col-span-9 text-sm font-bold text-white">Total</div>
                              <div className="col-span-3 text-right text-sm font-extrabold text-white">{formatCurrency(existingDevis.total, currency)}</div>
                            </div>
                          </div>

                          {/* Actions */}
                          {existingDevis.statut === 'envoye' && (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <Button variant="brand-outline" size="sm" className="w-full" onClick={startEditing}>Modifier</Button>
                                <Button variant="outline" size="sm" className="w-full" onClick={startEditing}>Nouvelle version</Button>
                              </div>
                              <Button variant="ghost" size="sm" className="w-full text-red-500 hover:bg-red-50 hover:text-red-600" onClick={() => void handleRefuse()} disabled={actionLoading}>
                                Refus / abstention
                              </Button>
                            </div>
                          )}
                          {existingDevis.statut === 'accepte' && (
                            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 font-medium">
                              <CheckCircle2 className="h-4 w-4 shrink-0" /> Le patient a accepté ce devis.
                            </div>
                          )}
                          {existingDevis.statut === 'refuse' && (
                            <p className="text-xs text-center text-muted-foreground py-1">Devis marqué comme refusé.</p>
                          )}
                        </div>
                      </>
                    )}

                    {/* Formulaire devis */}
                    {!detailLoading && (!existingDevis || isEditingExisting || existingDevis.statut === 'brouillon') && (
                      <>
                        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-200 bg-slate-50/60">
                          <div className="h-8 w-8 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
                            <Send className="h-4 w-4 text-brand-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {existingDevis?.statut === 'brouillon' ? 'Modifier le brouillon' : 'Nouveau devis'}
                            </p>
                            <p className="text-xs text-muted-foreground">{patientRow.user.fullName}</p>
                          </div>
                        </div>

                        <div className="p-5 space-y-5">
                          {/* Table lignes */}
                          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                            <div className="grid grid-cols-12 bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              <div className="col-span-6">Prestation</div>
                              <div className="col-span-2 text-center">Qté</div>
                              <div className="col-span-3 text-right">Prix ({currency})</div>
                              <div className="col-span-1" />
                            </div>
                            <div className="divide-y divide-slate-100">
                              {lignes.map((ligne, i) => (
                                <div key={i} className="grid grid-cols-12 gap-1.5 px-2 py-2 items-center">
                                  <Input className="col-span-6 h-8 text-sm" placeholder="Prestation..." value={ligne.description}
                                    onChange={(e) => updateLigne(i, 'description', e.target.value)} />
                                  <Input className="col-span-2 h-8 text-sm text-center" type="number" min={1} value={ligne.quantite}
                                    onChange={(e) => updateLigne(i, 'quantite', parseInt(e.target.value, 10) || 1)} />
                                  <Input className="col-span-3 h-8 text-sm text-right" type="number" min={0} value={ligne.prixUnitaire}
                                    onChange={(e) => updateLigne(i, 'prixUnitaire', parseInt(e.target.value, 10) || 0)} />
                                  <button type="button" onClick={() => removeLigne(i)}
                                    className="col-span-1 flex justify-center text-muted-foreground/40 hover:text-red-400 transition-colors">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div className="grid grid-cols-12 px-4 py-3 bg-brand-600">
                              <div className="col-span-9 text-xs font-bold text-white">Total estimatif</div>
                              <div className="col-span-3 text-right text-sm font-extrabold text-white">{formatCurrency(total, currency)}</div>
                            </div>
                          </div>

                          <button type="button" onClick={addLigne}
                            className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors">
                            <Plus className="h-3.5 w-3.5" /> Ajouter une ligne
                          </button>

                          {/* Planning + Notes */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground">Planning médical</label>
                            <Textarea rows={2} className="text-sm resize-none" placeholder="Durée intervention, hospitalisation, récupération..."
                              value={planning} onChange={(e) => setPlanning(e.target.value)} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground">Notes séjour</label>
                            <Textarea rows={2} className="text-sm resize-none" placeholder="Durée du séjour, hébergement, transport..."
                              value={notesSejour} onChange={(e) => setNotesSejour(e.target.value)} />
                          </div>

                          {/* CTA */}
                          <div className="space-y-2 pt-2 border-t border-slate-200">
                            <Button variant="brand" className="w-full gap-2 h-10" onClick={() => void handleSend()} disabled={actionLoading || !selectedPatient}>
                              {sent ? <><CheckCircle2 className="h-4 w-4" /> Devis envoyé !</> : <><Send className="h-4 w-4" /> Valider et envoyer</>}
                            </Button>
                            <Button variant="outline" className="w-full gap-2" onClick={() => void handleSaveDraft()} disabled={actionLoading || !selectedPatient}>
                              <Save className="h-4 w-4" />{savedDraft ? 'Brouillon enregistré !' : 'Enregistrer en brouillon'}
                            </Button>
                            {existingDevis && isEditingExisting && (
                              <Button type="button" variant="ghost" className="w-full text-muted-foreground text-xs" onClick={() => setIsEditingExisting(false)}>
                                Annuler
                              </Button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                </div>
              </div>
            </div>
          )}
        </div>

        </div>
      </div>
    </div>
  )
}
