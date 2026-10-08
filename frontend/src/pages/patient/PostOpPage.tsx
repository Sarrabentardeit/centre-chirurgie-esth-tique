import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Download, Upload, CheckCircle2, Star, AlertCircle,
  Clock, FileText, RefreshCw, Users, X,
  Stethoscope, Send,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/store/authStore'
import { medecinApi, medecinPostOpApi, patientApi, uploadPostOpPhoto } from '@/lib/api'
import type { SuiviPostOp, PostOpPatient } from '@/lib/api'
import { PostOpSection } from '@/components/dossier/PostOpSection'
import {
  PostOpAvisSection,
  PostOpDemandesSection,
  PostOpPhotosGallery,
} from '@/components/dossier/PostOpStaffSections'
import { daysSinceDate, photoDayOffset } from '@/lib/postOpSteps'
import { formatDate, formatRelative } from '@/lib/utils'
import { LIST_PAGE_SIZE, PaginationBar, paginateSlice } from '@/components/PaginationBar'
import { cachedFetch, hasCachedData } from '@/lib/cachedFetch'
import { queryKeys } from '@/lib/queryKeys'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function displayName(name: string) {
  const trimmed = name.trim()
  const letters = trimmed.replace(/[^\p{L}]/gu, '')
  if (!letters) return trimmed
  const uniform = letters === letters.toUpperCase() || letters === letters.toLowerCase()
  if (!uniform) return trimmed
  return trimmed
    .toLocaleLowerCase('fr')
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toLocaleUpperCase('fr'))
}

function getBeforeAfterPhotos(suivi: SuiviPostOp | null) {
  if (!suivi || !suivi.photos || suivi.photos.length < 2) return null
  const sorted = [...suivi.photos].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  return { before: sorted[0], after: sorted[sorted.length - 1] }
}

// ─── Vue Médecin ─────────────────────────────────────────────────────────────

function MedecinView() {
  const [patients, setPatients] = useState<PostOpPatient[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [tab, setTab] = useState<'cours' | 'clotures'>('cours')

  const [dateIntervention, setDateIntervention] = useState('')
  const [compteRendu, setCompteRendu]           = useState('')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = useCallback(async (opts?: { useCache?: boolean }) => {
    const key = queryKeys.postOpPatients()
    const force = !opts?.useCache
    if (opts?.useCache && hasCachedData(key)) setLoading(false)
    else setLoading(true)
    setError(null)
    try {
      const res = await cachedFetch(key, () => medecinApi.getPostOpPatients(), { force })
      setPatients(res.patients)
      if (res.patients.length > 0 && !selectedId) {
        const firstOpen = res.patients.find((p) => !p.suiviPostOp?.clotureAt && p.status !== 'suivi_termine')
        setSelectedId((firstOpen ?? res.patients[0]).id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => { void load({ useCache: true }) }, [load])

  const selected = patients.find((p) => p.id === selectedId) ?? null
  const suivi    = selected?.suiviPostOp ?? null

  const isClosed = (p: PostOpPatient) => Boolean(p.suiviPostOp?.clotureAt) || p.status === 'suivi_termine'
  const closedCount = patients.filter(isClosed).length
  const openCount = patients.length - closedCount
  const tabPatients = useMemo(() => {
    const needsAction = (p: PostOpPatient) => {
      const pending = (p.suiviPostOp?.demandes ?? []).filter((d) => !d.reponse).length
      const cr = Boolean(p.suiviPostOp?.compteRenduDemandeAt) && !p.suiviPostOp?.compteRendu
      return (pending > 0 ? 2 : 0) + (cr ? 1 : 0)
    }
    return patients
      .filter((p) => (tab === 'clotures' ? isClosed(p) : !isClosed(p)))
      .sort((a, b) => {
        const byAction = needsAction(b) - needsAction(a)
        if (byAction !== 0) return byAction
        const ja = a.suiviPostOp ? daysSinceDate(a.suiviPostOp.dateIntervention) : 9999
        const jb = b.suiviPostOp ? daysSinceDate(b.suiviPostOp.dateIntervention) : 9999
        return ja - jb
      })
  }, [patients, tab])

  const { slice: pagePatients, totalPages, page: safePage, total } = useMemo(
    () => paginateSlice(tabPatients, page, LIST_PAGE_SIZE),
    [tabPatients, page],
  )

  const handleTabChange = (next: 'cours' | 'clotures') => {
    setTab(next)
    setPage(1)
    const first = patients.find((p) => (next === 'clotures' ? isClosed(p) : !isClosed(p)))
    if (first) handleSelectPatient(first.id)
  }

  const handleSelectPatient = (id: string) => {
    setSelectedId(id)
    setSaved(false); setSaveError(null)
    const p = patients.find((x) => x.id === id)
    setDateIntervention(p?.suiviPostOp?.dateIntervention?.slice(0, 10) ?? '')
    setCompteRendu(p?.suiviPostOp?.compteRendu ?? '')
  }

  useEffect(() => {
    if (selected) {
      setDateIntervention(suivi?.dateIntervention?.slice(0, 10) ?? '')
      setCompteRendu(suivi?.compteRendu ?? '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const handleSave = async () => {
    if (!selectedId || !dateIntervention) return
    setSaving(true); setSaveError(null)
    try {
      const res = await medecinApi.upsertPostOp(selectedId, {
        dateIntervention,
        compteRendu: compteRendu || undefined,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      setPatients((prev) =>
        prev.map((p) => p.id === selectedId ? { ...p, suiviPostOp: res.suivi } : p)
      )
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde.')
    } finally {
      setSaving(false)
    }
  }

  const handleSuiviChange = (next: SuiviPostOp) => {
    if (!selected) return
    setPatients((prev) =>
      prev.map((p) => (p.id === selected.id ? { ...p, suiviPostOp: next, status: p.status === 'intervention' ? 'post_op' : p.status } : p)),
    )
    if (!dateIntervention) setDateIntervention(next.dateIntervention.slice(0, 10))
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => void load()}>Réessayer</Button>
      </div>
    )
  }

  if (patients.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          <Users className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="font-semibold">Aucun patient en suivi post-opératoire</p>
        <p className="text-sm text-muted-foreground">Les patients passés en statut « intervention » ou « post-op » apparaîtront ici.</p>
      </div>
    )
  }

  const jours = suivi ? daysSinceDate(suivi.dateIntervention) : null

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Suivi post-opératoire</h2>
        <Button variant="ghost" size="sm" onClick={() => void load()} className="gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4" /> Actualiser
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="rounded-xl border bg-white overflow-hidden lg:sticky lg:top-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
          <p className="text-sm font-medium">Patientes</p>
          <div className="inline-flex max-w-full rounded-md border bg-slate-50 p-0.5 text-xs">
            {([
              ['cours', `En cours ${openCount}`],
              ['clotures', `Clôturés ${closedCount}`],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => handleTabChange(value)}
                className={`whitespace-nowrap rounded px-2 py-1 ${
                  tab === value ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-muted-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2 border-b bg-slate-50 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Patiente</span>
          <span>Jour</span>
        </div>
        {pagePatients.length === 0 ? (
          <p className="px-3 py-6 text-sm text-muted-foreground">
            {tab === 'clotures' ? 'Aucun dossier clôturé.' : 'Aucun suivi en cours.'}
          </p>
        ) : (
          <ul className="max-h-72 overflow-y-auto lg:max-h-[calc(100vh-8rem)]">
            {pagePatients.map((p) => {
              const j = p.suiviPostOp ? daysSinceDate(p.suiviPostOp.dateIntervention) : null
              const pending = (p.suiviPostOp?.demandes ?? []).filter((d) => !d.reponse).length
              const crAsked = Boolean(p.suiviPostOp?.compteRenduDemandeAt) && !p.suiviPostOp?.compteRendu
              const selectedRow = p.id === selectedId
              const todo = [
                pending > 0 ? (pending > 1 ? `${pending} questions` : '1 question') : null,
                crAsked ? 'Compte rendu' : null,
              ].filter(Boolean).join(' · ')
              return (
                <li key={p.id} className="border-b last:border-b-0">
                  <button
                    type="button"
                    onClick={() => handleSelectPatient(p.id)}
                    className={`grid w-full grid-cols-[1fr_auto] items-start gap-2 px-3 py-2.5 text-left border-l-2 ${
                      selectedRow
                        ? 'border-l-brand-600 bg-brand-50/60'
                        : 'border-l-transparent hover:bg-slate-50'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">{displayName(p.user.fullName)}</span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">{p.dossierNumber}</span>
                      {todo && <span className="mt-0.5 block text-[11px] text-amber-800">{todo}</span>}
                    </span>
                    <span className="pt-0.5 text-xs tabular-nums text-slate-600">{j !== null ? `J+${j}` : '—'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <PaginationBar
          page={safePage}
          totalPages={totalPages}
          total={total}
          pageSize={LIST_PAGE_SIZE}
          onPageChange={setPage}
        />
      </div>

      {selected && (
        <div className="rounded-xl border bg-white px-4 sm:px-5 divide-y">
          <div className="flex flex-wrap items-baseline justify-between gap-2 py-4">
            <div>
              <p className="font-medium">{displayName(selected.user.fullName)}</p>
              <p className="text-xs text-muted-foreground">{selected.dossierNumber}</p>
            </div>
            {suivi && (
              <p className="text-sm text-muted-foreground">
                Intervention le {formatDate(suivi.dateIntervention)} · J+{jours}
              </p>
            )}
          </div>

          {saveError && (
            <div className="flex items-center gap-2 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" /> {saveError}
            </div>
          )}

          {!suivi ? (
            <p className="py-4 text-sm text-muted-foreground">Pas encore de suivi pour cette patiente.</p>
          ) : (
          <>
          <PostOpPhotosGallery suivi={suivi} />

          <PostOpDemandesSection
            patientId={selected.id}
            suivi={suivi}
            api={medecinPostOpApi}
            onChange={handleSuiviChange}
          />

          <PostOpSection
            title="Compte rendu"
            note={
              suivi?.compteRendu
                ? 'Rédigé'
                : suivi?.compteRenduDemandeAt
                  ? 'Demandé par la patiente'
                  : 'Uniquement sur demande'
            }
          >
            {suivi?.compteRenduDemandeAt && !suivi.compteRendu && (
              <p className="text-sm text-slate-700">
                Demandé le {formatDate(suivi.compteRenduDemandeAt)}.
              </p>
            )}
            <Textarea
              rows={7}
              value={compteRendu}
              onChange={(e) => setCompteRendu(e.target.value)}
              placeholder="Détails de l'intervention, observations, recommandations post-opératoires…"
              className="resize-y text-sm leading-relaxed"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="brand"
                className="gap-2"
                onClick={() => void handleSave()}
                disabled={!dateIntervention || saving}
              >
                {saved
                  ? <><CheckCircle2 className="h-4 w-4" /> Enregistré</>
                  : saving ? 'Enregistrement…' : 'Enregistrer le compte rendu'}
              </Button>
            </div>
          </PostOpSection>

          <PostOpAvisSection suivi={suivi} />
          </>
          )}
        </div>
      )}
      </div>
    </div>
  )
}

// ─── Vue Patient ──────────────────────────────────────────────────────────────

function PatientView() {
  const navigate = useNavigate()
  const [suivi, setSuivi]   = useState<SuiviPostOp | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const [note, setNote]               = useState(0)
  const [commentaire, setCommentaire] = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [submitDone, setSubmitDone]   = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [uploading, setUploading]     = useState(false)
  const [uploadedNames, setUploadedNames] = useState<string[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [demandeText, setDemandeText]     = useState('')
  const [demandeSending, setDemandeSending] = useState(false)
  const [demandeError, setDemandeError]   = useState<string | null>(null)

  const [crRequesting, setCrRequesting] = useState(false)
  const [crError, setCrError]           = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await patientApi.getMyPostOp()
      setSuivi(res.suivi)
      setStatus(res.patient.status)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => void load()}>Réessayer</Button>
      </div>
    )
  }

  if (!suivi) {
    return (
      <div className="max-w-xl mx-auto mt-12 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <Stethoscope className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Suivi post-opératoire</h3>
        <p className="text-sm text-muted-foreground">
          {status === 'intervention'
            ? 'Votre suivi sera ouvert par notre équipe dès votre retour à domicile. Vous pourrez alors nous envoyer vos photos et poser vos questions.'
            : 'Cette rubrique sera disponible après votre intervention.'}
        </p>
      </div>
    )
  }

  const jours = daysSinceDate(suivi.dateIntervention)
  const daysLeft = 180 - jours
  const questionnaireAvailable = jours >= 1
  const beforeAfter = getBeforeAfterPhotos(suivi)

  const handleSubmitQuestionnaire = async (e: React.FormEvent) => {
    e.preventDefault()
    if (note < 1) return
    setSubmitting(true); setSubmitError(null)
    try {
      const res = await patientApi.submitQuestionnaire({ note, commentaire: commentaire || undefined })
      setSuivi(res.suivi)
      setSubmitDone(true)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erreur lors de la soumission.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSendDemande = async (e: React.FormEvent) => {
    e.preventDefault()
    const message = demandeText.trim()
    if (message.length < 2) return
    setDemandeSending(true); setDemandeError(null)
    try {
      const res = await patientApi.addPostOpDemande(message)
      setSuivi(res.suivi)
      setDemandeText('')
    } catch (err) {
      setDemandeError(err instanceof Error ? err.message : 'Envoi impossible.')
    } finally {
      setDemandeSending(false)
    }
  }

  const handleRequestCompteRendu = async () => {
    setCrRequesting(true); setCrError(null)
    try {
      const res = await patientApi.requestCompteRendu()
      setSuivi(res.suivi)
    } catch (err) {
      setCrError(err instanceof Error ? err.message : 'Demande impossible.')
    } finally {
      setCrRequesting(false)
    }
  }

  const handleUploadPhoto = async (file: File) => {
    setUploading(true); setUploadError(null)
    try {
      const res = await uploadPostOpPhoto(file)
      if (res.suivi) setSuivi(res.suivi)
      setUploadedNames((p) => [...p, file.name])
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : `Envoi impossible pour « ${file.name} ».`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Suivi post-opératoire</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Intervention le {formatDate(suivi.dateIntervention)} · J+{jours}
          {daysLeft > 0 ? ` · ${daysLeft} jours de suivi restants` : ''}
        </p>
        {daysLeft <= 30 && daysLeft > 0 && (
          <p className="text-sm text-slate-700 mt-2">Votre suivi offert se termine dans {daysLeft} jours.</p>
        )}
      </div>

      <div className="rounded-xl border bg-white px-4 sm:px-5 divide-y">
      <PostOpSection title="Photos" note={suivi.photos.length > 0 ? String(suivi.photos.length) : undefined}>
        {beforeAfter && (
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs font-semibold mb-2">Comparaison avant / après</p>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <div className="space-y-1">
                <img src={beforeAfter.before.url} alt="Avant" className="w-full aspect-square object-cover rounded-lg border" />
                <p className="text-[11px] text-muted-foreground">Première photo ({formatDate(beforeAfter.before.date)})</p>
              </div>
              <div className="space-y-1">
                <img src={beforeAfter.after.url} alt="Après" className="w-full aspect-square object-cover rounded-lg border" />
                <p className="text-[11px] text-muted-foreground">Dernière photo ({formatDate(beforeAfter.after.date)})</p>
              </div>
            </div>
          </div>
        )}

        {suivi.photos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {suivi.photos.map((photo, i) => (
              <div key={i} className="relative rounded-xl overflow-hidden border bg-muted">
                <img src={photo.url} alt={`Photo de suivi ${i + 1}`} className="w-full aspect-square object-cover" />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                  <p className="text-white text-[11px] font-semibold">J+{photoDayOffset(suivi, photo)}</p>
                  <p className="text-white/80 text-[10px]">{formatDate(photo.date)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <label className={`block border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${uploading ? 'border-brand-300 bg-brand-50/50' : 'border-border hover:border-brand-400'}`}>
          <Upload className="h-5 w-5 text-muted-foreground mx-auto mb-1.5" />
          <p className="text-sm font-medium">{uploading ? 'Envoi en cours…' : 'Envoyer mes photos'}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Une ou plusieurs images depuis votre téléphone ou votre ordinateur</p>
          <input
            type="file" accept="image/*" multiple className="hidden"
            onChange={async (e) => {
              const input = e.currentTarget
              if (!input.files?.length) return
              for (const file of Array.from(input.files)) {
                await handleUploadPhoto(file)
              }
              input.value = ''
            }}
          />
        </label>
        {uploadError && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <X className="h-3 w-3" /> {uploadError}
          </p>
        )}
        {uploadedNames.map((f, i) => (
          <p key={i} className="text-xs text-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> {f} — envoyée
          </p>
        ))}
      </PostOpSection>

      <PostOpSection title="Questions">
        <form className="space-y-2" onSubmit={(e) => void handleSendDemande(e)}>
          <Textarea
            value={demandeText}
            onChange={(e) => setDemandeText(e.target.value)}
            placeholder="Écrivez votre question ou votre demande…"
            className="min-h-[90px] resize-none"
          />
          {demandeError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <X className="h-3 w-3" /> {demandeError}
            </p>
          )}
          <Button
            variant="brand" type="submit" className="w-full sm:w-auto gap-2"
            disabled={demandeSending || demandeText.trim().length < 2}
          >
            <Send className="h-4 w-4" />
            {demandeSending ? 'Envoi…' : 'Envoyer ma demande'}
          </Button>
        </form>

        {(suivi.demandes ?? []).length > 0 && (
          <div className="space-y-3 pt-2 border-t">
            {[...(suivi.demandes ?? [])].reverse().map((d) => (
              <div key={d.id} className="rounded-xl border p-3 space-y-2">
                <p className="text-[11px] text-muted-foreground">Vous · {formatRelative(d.createdAt)}</p>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{d.message}</p>
                {d.reponse ? (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                    <p className="text-[11px] font-semibold text-emerald-700 mb-0.5">Réponse du cabinet</p>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed text-emerald-900">{d.reponse}</p>
                    {d.reponseAt && (
                      <p className="text-[11px] text-emerald-700 mt-1">{formatRelative(d.reponseAt)}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-amber-700 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> En attente de réponse
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </PostOpSection>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
        <PostOpSection title="Compte rendu">
          {suivi.compteRendu ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{suivi.compteRendu}</p>
              <Button
                variant="brand" size="sm" className="w-full gap-2"
                onClick={() => {
                  const blob = new Blob([suivi.compteRendu!], { type: 'text/plain' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = 'compte-rendu-operatoire.txt'
                  a.click()
                }}
              >
                <Download className="h-4 w-4" /> Télécharger
              </Button>
            </div>
          ) : suivi.compteRenduDemandeAt ? (
            <div className="flex items-start gap-2 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2.5 text-sm text-indigo-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                Demande envoyée le {formatDate(suivi.compteRenduDemandeAt)}. Le Dr vous le transmettra dès qu’il sera rédigé.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Vous en avez besoin (assurance, médecin traitant…) ? Faites-en la demande, le Dr le rédigera pour vous.
              </p>
              {crError && <p className="text-xs text-destructive">{crError}</p>}
              <Button
                variant="outline" size="sm" className="w-full gap-2"
                disabled={crRequesting}
                onClick={() => void handleRequestCompteRendu()}
              >
                <FileText className="h-4 w-4" />
                {crRequesting ? 'Envoi…' : 'Demander mon compte rendu'}
              </Button>
            </div>
          )}
        </PostOpSection>

        <PostOpSection title="Votre avis">
          {suivi.questionnaire ? (
            <div className="space-y-2">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className={`h-5 w-5 ${s <= suivi.questionnaire!.note ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                ))}
              </div>
              {suivi.questionnaire.commentaire && (
                <p className="text-sm text-muted-foreground italic">« {suivi.questionnaire.commentaire} »</p>
              )}
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Réponse enregistrée, merci.
              </p>
            </div>
          ) : questionnaireAvailable ? (
            <form className="space-y-3" onSubmit={(e) => void handleSubmitQuestionnaire(e)}>
              {submitError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <X className="h-3 w-3" /> {submitError}
                </p>
              )}
              {submitDone && (
                <p className="text-xs text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Merci pour votre avis !
                </p>
              )}
              <div>
                <p className="text-sm font-medium mb-2">Note sur 5</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button type="button" key={s} onClick={() => setNote(s)} aria-label={`${s} étoiles`}>
                      <Star className={`h-6 w-6 transition-colors ${s <= note ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground hover:text-amber-300'}`} />
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="Partagez votre expérience…"
                className="min-h-[80px] resize-none"
              />
              <Button variant="brand" className="w-full gap-2" type="submit" disabled={note < 1 || submitting}>
                <CheckCircle2 className="h-4 w-4" />
                {submitting ? 'Envoi…' : 'Envoyer mon avis'}
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <Clock className="h-3.5 w-3.5 shrink-0" /> Le questionnaire sera disponible dès demain.
            </div>
          )}
        </PostOpSection>
      </div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        En cas de fièvre, douleur inhabituelle, saignement ou rougeur, contactez le cabinet. Cette page n’est pas un service d’urgence.
      </p>
      <button
        type="button"
        onClick={() => navigate('/patient/dossier')}
        className="mt-3 text-sm text-slate-700 underline underline-offset-2"
      >
        Voir mon dossier
      </button>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function PostOpPage() {
  const { user } = useAuthStore()
  const isMedecin = user?.role === 'medecin'

  return isMedecin ? <MedecinView /> : <PatientView />
}
