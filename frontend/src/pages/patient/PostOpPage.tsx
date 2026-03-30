import { Camera, Download, Upload, Bell, CheckCircle2, Star } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { formatDate } from '@/lib/utils'
import { downloadPdfFromText } from '@/lib/pdf'
import { useEffect, useMemo, useState } from 'react'

export default function PostOpPage() {
  const { user } = useAuthStore()
  const allPatients = useDemoStore((s) => s.patients)
  const allSuivi = useDemoStore((s) => s.suiviPostOp)
  const sendQuestionnaireIfReady = useDemoStore((s) => s.sendQuestionnaireIfReady)
  const submitQuestionnaire = useDemoStore((s) => s.submitQuestionnaire)
  const addPostOpPhoto = useDemoStore((s) => s.addPostOpPhoto)
  const [selectedPatientId, setSelectedPatientId] = useState<string>('')

  const isMedecin = user?.role === 'medecin'
  const ownPatient = useMemo(
    () => (user ? allPatients.find((p) => p.userId === user.id) : undefined),
    [allPatients, user]
  )
  const medecinRows = useMemo(() => {
    return allSuivi
      .map((sp) => {
        const p = allPatients.find((x) => x.id === sp.patientId)
        if (!p) return null
        return { patient: p, suivi: sp }
      })
      .filter(Boolean) as Array<{ patient: (typeof allPatients)[number]; suivi: (typeof allSuivi)[number] }>
  }, [allPatients, allSuivi])

  useEffect(() => {
    if (!isMedecin) return
    if (!selectedPatientId && medecinRows.length > 0) {
      setSelectedPatientId(medecinRows[0].patient.id)
    }
  }, [isMedecin, medecinRows, selectedPatientId])

  const patient = isMedecin
    ? allPatients.find((p) => p.id === selectedPatientId)
    : ownPatient
  const suivi = patient ? allSuivi.find((sp) => sp.patientId === patient.id) : undefined

  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([])
  const [questionnaireNote, setQuestionnaireNote] = useState<number>(0)
  const [questionnaireCommentaire, setQuestionnaireCommentaire] = useState<string>('')

  const questionnaire = suivi?.questionnaireSatisfaction
  const questionnaireReadyAt = useMemo(() => {
    if (!questionnaire) return null
    return new Date(`${questionnaire.dateEnvoi}T00:00:00`).getTime()
  }, [questionnaire?.dateEnvoi])

  const isQuestionnaireReady = useMemo(() => {
    if (!questionnaire || !questionnaireReadyAt) return false
    return Date.now() >= questionnaireReadyAt
  }, [questionnaire, questionnaireReadyAt])

  useEffect(() => {
    if (isMedecin) return
    if (!patient || !suivi) return
    if (!questionnaire) return
    if (questionnaire.repondu) return
    if (suivi.questionnaireDisponibiliteEnvoyee) return
    if (!isQuestionnaireReady) return

    sendQuestionnaireIfReady(patient.id)
  }, [
    patient?.id,
    questionnaire?.repondu,
    suivi?.questionnaireDisponibiliteEnvoyee,
    isQuestionnaireReady,
    isMedecin,
    sendQuestionnaireIfReady,
  ])

  if (!patient || (!suivi && patient.status !== 'post_op')) {
    return (
      <div className="max-w-xl mx-auto mt-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-4">
          <Camera className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Suivi post-opératoire</h3>
        <p className="text-muted-foreground text-sm">
          Cette section sera disponible après votre intervention.
        </p>
      </div>
    )
  }

  const daysSinceIntervention = suivi
    ? Math.floor((Date.now() - new Date(suivi.dateIntervention).getTime()) / (1000 * 60 * 60 * 24))
    : 0
  const followupProgress = Math.min(Math.round((daysSinceIntervention / 180) * 100), 100)
  const daysLeft = 180 - daysSinceIntervention

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {isMedecin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Patients en suivi post-op</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {medecinRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun patient en suivi post-op.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {medecinRows.map((row) => (
                  <button
                    key={row.patient.id}
                    onClick={() => setSelectedPatientId(row.patient.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      selectedPatientId === row.patient.id
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    {row.patient.prenom} {row.patient.nom}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Suivi progress */}
      {suivi && (
        <Card className="bg-gradient-to-r from-rose-50 to-pink-50 border-rose-200">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-rose-800">Suivi Post-Opératoire</p>
                <p className="text-xs text-rose-600 mt-0.5">
                  {isMedecin
                    ? `Patiente: ${patient.prenom} ${patient.nom} • Intervention le ${formatDate(suivi.dateIntervention)}`
                    : `Intervention le ${formatDate(suivi.dateIntervention)}`}
                </p>
              </div>
              <Badge className="bg-rose-100 text-rose-700 border-rose-300">
                J+{daysSinceIntervention}
              </Badge>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-rose-700">
                <span>Progression suivi gratuit (6 mois)</span>
                <span className="font-semibold">{followupProgress}%</span>
              </div>
              <Progress value={followupProgress} className="h-2 bg-rose-200 [&>div]:bg-rose-500" />
            </div>
            {daysSinceIntervention >= 150 && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-100 border border-amber-300 p-3 text-xs text-amber-800">
                <Bell className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  <strong>Attention :</strong> Votre suivi gratuit de 6 mois se termine dans{' '}
                  {Math.max(0, daysLeft)} jours.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Photos de suivi */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Camera className="h-4 w-4 text-brand-600" />
              Photos de suivi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {suivi?.photos.map((photo, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                <img
                  src={photo.url}
                  alt={`Photo suivi ${i + 1}`}
                  className="h-12 w-12 rounded-lg object-cover"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Photo J+{Math.floor(i * 25)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(photo.date)}</p>
                  {photo.note && (
                    <p className="text-xs text-emerald-700 mt-0.5">{photo.note}</p>
                  )}
                </div>
              </div>
            ))}

            {!isMedecin && (
              <>
                {/* Upload new */}
                <label
                  className="block border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-brand-400 transition-all"
                >
                  <Upload className="h-5 w-5 text-muted-foreground mx-auto mb-1.5" />
                  <p className="text-xs font-medium">Envoyer une photo</p>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (!e.target.files?.length || !patient) return
                      const files = Array.from(e.target.files)
                      for (const file of files) {
                        const objectUrl = URL.createObjectURL(file)
                        addPostOpPhoto(patient.id, { url: objectUrl, note: `Ajoutée par la patiente: ${file.name}` })
                        setUploadedPhotos((p) => [...p, file.name])
                      }
                      e.currentTarget.value = ''
                    }}
                  />
                </label>
                {uploadedPhotos.map((f, i) => (
                  <p key={i} className="text-xs text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> {f} — envoyée
                  </p>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        {/* Compte rendu + Satisfaction */}
        <div className="space-y-4">
          {/* Compte rendu */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Compte rendu opératoire</CardTitle>
            </CardHeader>
            <CardContent>
              {suivi?.compteRendu ? (
                  <Button
                    variant="brand"
                    className="w-full gap-2"
                    onClick={() => {
                      const text = suivi.compteRendu ?? ''
                      downloadPdfFromText({
                        title: 'Compte rendu opératoire',
                        subtitle: `Patient: ${patient.prenom} ${patient.nom}`,
                        filename: `compte-rendu-operatoire-${patient.prenom}-${patient.nom}.pdf`,
                        lines: text.split('\n'),
                      })
                    }}
                  >
                    <Download className="h-4 w-4" />
                    Télécharger le PDF
                  </Button>
              ) : (
                <div className="text-center py-3">
                  <p className="text-sm text-muted-foreground">
                    Le compte rendu opératoire sera disponible prochainement.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Satisfaction */}
          {suivi?.questionnaireSatisfaction && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Votre avis</CardTitle>
              </CardHeader>
              <CardContent>
                {suivi.questionnaireSatisfaction.repondu ? (
                  <div className="space-y-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`h-5 w-5 ${
                            s <= (suivi.questionnaireSatisfaction?.note ?? 0)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-muted-foreground'
                          }`}
                        />
                      ))}
                    </div>
                    {suivi.questionnaireSatisfaction.commentaire && (
                      <p className="text-sm text-muted-foreground italic">
                        "{suivi.questionnaireSatisfaction.commentaire}"
                      </p>
                    )}
                  </div>
                ) : isQuestionnaireReady && !isMedecin ? (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (!questionnaire) return
                      if (questionnaireNote < 1) return
                      submitQuestionnaire(patient.id, {
                        note: questionnaireNote,
                        commentaire: questionnaireCommentaire.trim() || undefined,
                      })
                    }}
                  >
                    <div>
                      <p className="text-sm font-medium mb-2">Note sur 5</p>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button
                            type="button"
                            key={s}
                            className="focus:outline-none"
                            onClick={() => setQuestionnaireNote(s)}
                            aria-label={`Donner ${s} étoiles`}
                          >
                            <Star
                              className={`h-5 w-5 ${
                                s <= questionnaireNote ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm font-medium">Commentaire (optionnel)</p>
                      <Textarea
                        value={questionnaireCommentaire}
                        onChange={(e) => setQuestionnaireCommentaire(e.target.value)}
                        placeholder="Dites-nous ce qui s'est bien passé (ou à améliorer)..."
                        className="min-h-[100px]"
                      />
                    </div>

                    <Button variant="brand" className="w-full gap-2" type="submit">
                      <CheckCircle2 className="h-4 w-4" />
                      Envoyer le questionnaire
                    </Button>
                  </form>
                ) : isMedecin ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {questionnaire?.repondu
                        ? 'Le patient a deja repondu au questionnaire.'
                        : 'Le patient n a pas encore rempli le questionnaire.'}
                    </p>
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                      Disponibilité : {questionnaire ? formatDate(questionnaire.dateEnvoi) : '—'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Le questionnaire sera disponible dans 24h après votre retour.
                    </p>
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                      Disponibilité : {questionnaire ? formatDate(questionnaire.dateEnvoi) : '—'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
