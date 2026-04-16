import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Camera, Download, Upload, Bell, CheckCircle2, Star, AlertCircle,
  Clock, FileText, RefreshCw, Users, ChevronRight, ImageIcon, X,
  Stethoscope, CalendarDays,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/authStore'
import { medecinApi, patientApi, uploadPostOpPhoto, uploadMedecinFile } from '@/lib/api'
import type { SuiviPostOp, PostOpPatient } from '@/lib/api'
import { formatDate, formatRelative } from '@/lib/utils'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function getBeforeAfterPhotos(suivi: SuiviPostOp | null) {
  if (!suivi || !suivi.photos || suivi.photos.length < 2) return null
  const sorted = [...suivi.photos].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  return { before: sorted[0], after: sorted[sorted.length - 1] }
}

function getRecoveryScore(suivi: SuiviPostOp | null): number {
  if (!suivi) return 0
  const days = Math.max(0, daysSince(suivi.dateIntervention))
  const photos = suivi.photos ?? []
  const questionnaire = suivi.questionnaire

  const satisfactionScore = questionnaire ? Math.round((questionnaire.note / 5) * 40) : 10
  const latestPhoto = photos
    .map((p) => new Date(p.date))
    .sort((a, b) => b.getTime() - a.getTime())[0]
  const photoRecencyDays = latestPhoto ? Math.max(0, Math.floor((Date.now() - latestPhoto.getTime()) / 86400000)) : 999
  const photoScore = photos.length === 0
    ? 5
    : photoRecencyDays <= 7
      ? 30
      : photoRecencyDays <= 14
        ? 22
        : 12

  const adherenceScore = Math.min(15, photos.length * 3)
  const timelineScore = days < 7 ? 10 : days < 30 ? 15 : days < 90 ? 20 : 15

  return Math.max(0, Math.min(100, satisfactionScore + photoScore + adherenceScore + timelineScore))
}

// ─── Vue Médecin ─────────────────────────────────────────────────────────────

function MedecinView() {
  const [patients, setPatients] = useState<PostOpPatient[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Form création/édition suivi
  const [dateIntervention, setDateIntervention] = useState('')
  const [compteRendu, setCompteRendu]           = useState('')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Upload photo
  const [uploading, setUploading] = useState(false)
  const [photoNote, setPhotoNote] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await medecinApi.getPostOpPatients()
      setPatients(res.patients)
      if (res.patients.length > 0 && !selectedId) {
        setSelectedId(res.patients[0].id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => { void load() }, [load])

  const selected = patients.find((p) => p.id === selectedId) ?? null
  const suivi    = selected?.suiviPostOp ?? null
  const beforeAfter = getBeforeAfterPhotos(suivi)
  const recoveryScore = getRecoveryScore(suivi)

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

  const handleUploadPhoto = async (file: File) => {
    if (!selectedId) return
    setUploading(true)
    try {
      // 1. Upload fichier
      const uploaded = await uploadMedecinFile(file)
      // 2. Enregistrer dans le suivi
      const res = await medecinApi.addPostOpPhoto(selectedId, {
        url: uploaded.url,
        note: photoNote || undefined,
      })
      setPhotoNote('')
      setPatients((prev) =>
        prev.map((p) => p.id === selectedId ? { ...p, suiviPostOp: res.suivi } : p)
      )
    } catch {
      setSaveError('Erreur lors de l\'upload de la photo.')
    } finally {
      setUploading(false)
    }
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
        <p className="text-sm text-muted-foreground">Les patients passés en status "intervention" ou "post_op" apparaîtront ici.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Suivi Post-Opératoire</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{patients.length} patient(s) en suivi</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Actualiser
        </Button>
      </div>

      {/* Sélection patient */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Users className="h-4 w-4" /> Patients en suivi
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {patients.map((p) => {
            const jours = p.suiviPostOp
              ? daysSince(p.suiviPostOp.dateIntervention)
              : null
            const isSelected = p.id === selectedId
            return (
              <button
                key={p.id}
                onClick={() => handleSelectPatient(p.id)}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition-all ${
                  isSelected
                    ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
                    : 'border-border hover:bg-muted/60'
                }`}
              >
                <Avatar className="h-7 w-7">
                  <AvatarFallback className={`text-[10px] font-bold ${isSelected ? 'bg-brand-200 text-brand-800' : 'bg-muted text-muted-foreground'}`}>
                    {getInitials(p.user.fullName)}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium">{p.user.fullName}</span>
                {jours !== null && (
                  <Badge className="text-[10px] bg-rose-100 text-rose-700 border-rose-200">J+{jours}</Badge>
                )}
                {!p.suiviPostOp && (
                  <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">À créer</Badge>
                )}
              </button>
            )
          })}
        </CardContent>
      </Card>

      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Panneau gauche : création/édition */}
          <Card>
            <CardHeader className="pb-3" style={{ background: 'linear-gradient(135deg, #062a30 0%, #0d3d45 100%)', borderRadius: '0.75rem 0.75rem 0 0' }}>
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 ring-2 ring-white/20">
                  <AvatarFallback className="bg-white/15 text-white text-sm font-bold">
                    {getInitials(selected.user.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <CardTitle className="text-white text-base">{selected.user.fullName}</CardTitle>
                  <p className="text-white/60 text-xs mt-0.5 font-mono">{selected.dossierNumber}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {saveError && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive border border-destructive/20">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {saveError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" /> Date d'intervention *
                </label>
                <Input
                  type="date"
                  value={dateIntervention}
                  onChange={(e) => setDateIntervention(e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" /> Compte rendu opératoire
                </label>
                <Textarea
                  rows={6}
                  value={compteRendu}
                  onChange={(e) => setCompteRendu(e.target.value)}
                  placeholder="Détails de l'intervention, observations, recommandations post-opératoires..."
                  className="resize-none text-sm leading-relaxed"
                />
              </div>

              <Button
                variant="brand" className="w-full gap-2"
                onClick={() => void handleSave()}
                disabled={!dateIntervention || saving}
              >
                {saved
                  ? <><CheckCircle2 className="h-4 w-4" /> Sauvegardé</>
                  : <>{saving ? 'Sauvegarde...' : suivi ? 'Mettre à jour' : 'Créer le suivi'}</>
                }
              </Button>

              {suivi && (
                <p className="text-[11px] text-muted-foreground text-center">
                  Créé {formatRelative(suivi.createdAt)} · Mis à jour {formatRelative(suivi.updatedAt)}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Panneau droit : photos */}
          {suivi && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Camera className="h-4 w-4 text-brand-600" /> Photos de suivi
                  <Badge className="ml-auto bg-muted text-muted-foreground border">{suivi.photos.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-emerald-700">Score de récupération</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-lg font-bold text-emerald-700">{recoveryScore}/100</p>
                    <p className="text-xs text-emerald-700">
                      {recoveryScore >= 80 ? 'Excellente évolution' : recoveryScore >= 60 ? 'Évolution favorable' : 'Suivi à renforcer'}
                    </p>
                  </div>
                </div>

                {beforeAfter && (
                  <div className="rounded-xl border border-border p-2.5">
                    <p className="text-xs font-semibold mb-2">Comparaison avant / après</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <img src={beforeAfter.before.url} alt="Avant" className="w-full aspect-square object-cover rounded-lg border" />
                        <p className="text-[10px] text-muted-foreground">Avant ({formatDate(beforeAfter.before.date)})</p>
                      </div>
                      <div className="space-y-1">
                        <img src={beforeAfter.after.url} alt="Après" className="w-full aspect-square object-cover rounded-lg border" />
                        <p className="text-[10px] text-muted-foreground">Après ({formatDate(beforeAfter.after.date)})</p>
                      </div>
                    </div>
                  </div>
                )}

                {suivi.photos.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Aucune photo de suivi</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {suivi.photos.map((photo, i) => (
                      <div key={i} className="relative rounded-xl overflow-hidden border bg-muted">
                        <img src={photo.url} alt={`Photo suivi ${i + 1}`} className="w-full aspect-square object-cover" />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                          <p className="text-white text-[10px] font-medium">J+{daysSince(suivi.dateIntervention) - daysSince(photo.date)}</p>
                          {photo.note && <p className="text-white/80 text-[10px] truncate">{photo.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Zone d'upload */}
                <div className="space-y-2 pt-1">
                  <Input
                    placeholder="Note pour la photo (optionnel)"
                    value={photoNote}
                    onChange={(e) => setPhotoNote(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <label
                    className={`block border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                      uploading ? 'border-brand-300 bg-brand-50' : 'border-border hover:border-brand-400'
                    }`}
                  >
                    <Upload className="h-5 w-5 text-muted-foreground mx-auto mb-1.5" />
                    <p className="text-xs font-medium">{uploading ? 'Upload en cours...' : 'Ajouter une photo'}</p>
                    <input
                      ref={fileInputRef}
                      type="file" accept="image/*" multiple className="hidden"
                      onChange={async (e) => {
                        if (!e.target.files?.length) return
                        for (const file of Array.from(e.target.files)) {
                          await handleUploadPhoto(file)
                        }
                        e.currentTarget.value = ''
                      }}
                    />
                  </label>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Questionnaire de satisfaction */}
          {suivi && (
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" /> Questionnaire de satisfaction
                </CardTitle>
              </CardHeader>
              <CardContent>
                {suivi.questionnaire ? (
                  <div className="flex items-center gap-4">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={`h-5 w-5 ${s <= suivi.questionnaire!.note ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                      ))}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{suivi.questionnaire.note}/5</p>
                      {suivi.questionnaire.commentaire && (
                        <p className="text-sm text-muted-foreground italic mt-0.5">"{suivi.questionnaire.commentaire}"</p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Répondu {formatRelative(suivi.questionnaire.reponduAt)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
                    <Clock className="h-4 w-4 shrink-0" />
                    Le patient n'a pas encore rempli le questionnaire de satisfaction.
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Vue Patient ──────────────────────────────────────────────────────────────

function PatientView() {
  const [suivi, setSuivi]   = useState<SuiviPostOp | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // Questionnaire
  const [note, setNote]               = useState(0)
  const [commentaire, setCommentaire] = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [submitDone, setSubmitDone]   = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Upload
  const [uploading, setUploading]     = useState(false)
  const [uploadedNames, setUploadedNames] = useState<string[]>([])

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
      <div className="max-w-xl mx-auto space-y-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
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
            ? 'Votre suivi sera disponible après votre intervention.'
            : 'Cette section sera disponible après votre intervention.'}
        </p>
      </div>
    )
  }

  const jours = daysSince(suivi.dateIntervention)
  const progress = Math.min(Math.round((jours / 180) * 100), 100)
  const daysLeft = 180 - jours
  const questionnaireAvailable = jours >= 1
  const beforeAfter = getBeforeAfterPhotos(suivi)
  const recoveryScore = getRecoveryScore(suivi)

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

  const handleUploadPhoto = async (file: File) => {
    setUploading(true)
    try {
      const res = await uploadPostOpPhoto(file)
      if (res.suivi) setSuivi(res.suivi)
      setUploadedNames((p) => [...p, file.name])
    } catch {
      // silent — show fallback
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Carte progression */}
      <div className="rounded-2xl border border-rose-200 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #fff1f2 0%, #fce7f3 100%)' }}
      >
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-bold text-rose-800">Suivi Post-Opératoire</p>
              <p className="text-xs text-rose-600 mt-0.5">Intervention le {formatDate(suivi.dateIntervention)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-rose-100 text-rose-700 border-rose-300 text-sm font-bold px-3">J+{jours}</Badge>
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-sm font-bold px-3">
                Score {recoveryScore}/100
              </Badge>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-rose-700">
              <span>Suivi gratuit — 6 mois</span>
              <span className="font-semibold">{progress}% ({Math.max(0, daysLeft)} jours restants)</span>
            </div>
            <Progress value={progress} className="h-2 bg-rose-200 [&>div]:bg-rose-500" />
          </div>
          {daysLeft <= 30 && daysLeft > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-100 border border-amber-300 p-3 text-xs text-amber-800">
              <Bell className="h-4 w-4 shrink-0 mt-0.5" />
              <p><strong>Attention :</strong> Votre suivi gratuit se termine dans {daysLeft} jours.</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Photos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Camera className="h-4 w-4 text-brand-600" /> Photos de suivi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {beforeAfter && (
              <div className="rounded-xl border border-border p-2.5">
                <p className="text-xs font-semibold mb-2">Comparaison avant / après</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <img src={beforeAfter.before.url} alt="Avant" className="w-full aspect-square object-cover rounded-lg border" />
                    <p className="text-[10px] text-muted-foreground">Avant ({formatDate(beforeAfter.before.date)})</p>
                  </div>
                  <div className="space-y-1">
                    <img src={beforeAfter.after.url} alt="Après" className="w-full aspect-square object-cover rounded-lg border" />
                    <p className="text-[10px] text-muted-foreground">Après ({formatDate(beforeAfter.after.date)})</p>
                  </div>
                </div>
              </div>
            )}

            {suivi.photos.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Envoyez vos premières photos de suivi.
              </p>
            )}
            {suivi.photos.map((photo, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border p-3">
                <img
                  src={photo.url} alt={`Photo suivi ${i + 1}`}
                  className="h-14 w-14 rounded-lg object-cover shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Photo J+{daysSince(suivi.dateIntervention) - daysSince(photo.date)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(photo.date)}</p>
                  {photo.note && <p className="text-xs text-emerald-700 mt-0.5">{photo.note}</p>}
                </div>
              </div>
            ))}

            <label className={`block border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${uploading ? 'border-brand-300 bg-brand-50/50' : 'border-border hover:border-brand-400'}`}>
              <Upload className="h-5 w-5 text-muted-foreground mx-auto mb-1.5" />
              <p className="text-xs font-medium">{uploading ? 'Upload en cours...' : 'Envoyer une photo'}</p>
              <input
                type="file" accept="image/*" multiple className="hidden"
                onChange={async (e) => {
                  if (!e.target.files?.length) return
                  for (const file of Array.from(e.target.files)) {
                    await handleUploadPhoto(file)
                  }
                  e.currentTarget.value = ''
                }}
              />
            </label>
            {uploadedNames.map((f, i) => (
              <p key={i} className="text-xs text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> {f} — envoyée
              </p>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Compte rendu */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-brand-600" /> Compte rendu opératoire
              </CardTitle>
            </CardHeader>
            <CardContent>
              {suivi.compteRendu ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{suivi.compteRendu}</p>
                  <Button
                    variant="brand" size="sm" className="w-full gap-2"
                    onClick={() => {
                      const blob = new Blob([suivi.compteRendu!], { type: 'text/plain' })
                      const a = document.createElement('a')
                      a.href = URL.createObjectURL(blob)
                      a.download = `compte-rendu-operatoire.txt`
                      a.click()
                    }}
                  >
                    <Download className="h-4 w-4" /> Télécharger
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-3">
                  Le compte rendu sera disponible prochainement.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Questionnaire */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" /> Votre avis
              </CardTitle>
            </CardHeader>
            <CardContent>
              {suivi.questionnaire ? (
                <div className="space-y-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className={`h-5 w-5 ${s <= suivi.questionnaire!.note ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                    ))}
                  </div>
                  {suivi.questionnaire.commentaire && (
                    <p className="text-sm text-muted-foreground italic">"{suivi.questionnaire.commentaire}"</p>
                  )}
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Réponse soumise
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
                    placeholder="Partagez votre expérience..."
                    className="min-h-[80px] resize-none"
                  />
                  <Button variant="brand" className="w-full gap-2" type="submit" disabled={note < 1 || submitting}>
                    <CheckCircle2 className="h-4 w-4" />
                    {submitting ? 'Envoi...' : 'Envoyer mon avis'}
                  </Button>
                </form>
              ) : (
                <div className="text-center py-3 space-y-2">
                  <p className="text-sm text-muted-foreground">Le questionnaire sera disponible 24h après votre intervention.</p>
                  <div className="flex items-center justify-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <Clock className="h-3.5 w-3.5" /> Disponible dès demain
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Lien dossier */}
      <button
        onClick={() => window.location.href = '/patient/dossier'}
        className="w-full flex items-center justify-between rounded-2xl border px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3 text-sm">
          <FileText className="h-4 w-4 text-brand-600" />
          <span className="font-medium">Voir mon dossier complet</span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
