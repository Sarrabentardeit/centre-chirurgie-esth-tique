import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Stethoscope, Download, CheckCircle2, User } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useMemo, useState } from 'react'
import { STATUS_LABELS, STATUS_COLORS, formatDate } from '@/lib/utils'
import { downloadRapportPdf } from '@/lib/pdf'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import type { Patient } from '@/types'

export default function DossierPatientPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const patientFromStore = useDemoStore((s) => s.patients.find((p) => p.id === id))
  const formulaire = useDemoStore((s) =>
    patientFromStore ? s.formulaires.find((f) => f.patientId === patientFromStore.id) : undefined
  )
  const patient: Patient =
    patientFromStore ?? ({
      id: '',
      userId: '',
      nom: '',
      prenom: '',
      email: '',
      phone: '',
      dateNaissance: '',
      nationalite: '',
      ville: '',
      pays: '',
      sourceContact: 'direct',
      status: 'nouveau',
      dateCreation: '',
      derniereActivite: '',
      avatar: undefined,
    } as Patient)
  const existingRapport = useDemoStore((s) =>
    patientFromStore ? s.rapports.find((r) => r.patientId === patientFromStore.id) : undefined
  )
  const devis = useDemoStore((s) =>
    patientFromStore ? s.devis.find((d) => d.patientId === patientFromStore.id) : undefined
  )
  const rdv = useDemoStore((s) =>
    patientFromStore ? s.rdv.find((r) => r.patientId === patientFromStore.id) : undefined
  )
  const logistique = useDemoStore((s) =>
    patientFromStore ? s.logistique.find((l) => l.patientId === patientFromStore.id) : undefined
  )
  const suivi = useDemoStore((s) =>
    patientFromStore ? s.suiviPostOp.find((sp) => sp.patientId === patientFromStore.id) : undefined
  )
  const doctorFinalizeRapport = useDemoStore((s) => s.doctorFinalizeRapport)

  const [diagnostic, setDiagnostic] = useState(existingRapport?.diagnostic ?? '')
  const [interventions, setInterventions] = useState(existingRapport?.interventionsRecommandees.join('\n') ?? '')
  const [notes, setNotes] = useState(existingRapport?.notes ?? '')
  const [valeur, setValeur] = useState(existingRapport?.valeurMedicale ?? '')
  const [saved, setSaved] = useState(false)

  const historyEvents = useMemo(() => {
    const events: Array<{ date: string; action: string; icon: string }> = []

    if (patient.dateCreation) {
      events.push({
        date: patient.dateCreation,
        action: `Dossier créé via ${patient.sourceContact}`,
        icon: '📁',
      })
    }
    if (formulaire?.dateCompletion) {
      events.push({
        date: formulaire.dateCompletion,
        action: 'Formulaire médical complété par la patiente',
        icon: '📋',
      })
    }
    if (existingRapport?.dateCreation) {
      events.push({
        date: existingRapport.dateCreation,
        action: `Rapport médical finalisé par ${user?.name ?? 'médecin'}`,
        icon: '🩺',
      })
    }
    if (devis?.dateCreation) {
      events.push({
        date: devis.dateCreation,
        action: 'Devis préparé et envoyé',
        icon: '📄',
      })
    }
    if (rdv?.date) {
      events.push({
        date: rdv.date,
        action: `Rendez-vous ${rdv.type} ${rdv.statut}`,
        icon: '📅',
      })
    }
    if (logistique?.dateArrivee) {
      events.push({
        date: logistique.dateArrivee,
        action: 'Logistique séjour complétée',
        icon: '✈️',
      })
    }
    if (suivi?.dateIntervention) {
      events.push({
        date: suivi.dateIntervention,
        action: 'Suivi post-op activé',
        icon: '💊',
      })
    }
    if (suivi?.questionnaireSatisfaction?.repondu && suivi.questionnaireSatisfaction.dateEnvoi) {
      events.push({
        date: suivi.questionnaireSatisfaction.dateEnvoi,
        action: `Questionnaire satisfaction répondu (note: ${suivi.questionnaireSatisfaction.note ?? '-'}/5)`,
        icon: '⭐',
      })
    }

    return events
      .filter((e) => e.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [devis?.dateCreation, existingRapport?.dateCreation, formulaire?.dateCompletion, logistique?.dateArrivee, patient.dateCreation, patient.sourceContact, rdv?.date, rdv?.statut, rdv?.type, suivi?.dateIntervention, suivi?.questionnaireSatisfaction?.dateEnvoi, suivi?.questionnaireSatisfaction?.note, suivi?.questionnaireSatisfaction?.repondu, user?.name])

  const handleSaveRapport = () => {
    if (!user) return
    const interventionsArr = interventions
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    doctorFinalizeRapport(patient.id, user.id, {
      diagnostic,
      interventionsRecommandees: interventionsArr,
      notes,
      valeurMedicale: valeur,
    })

    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/medecin/patients')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <Avatar className="h-11 w-11">
            <AvatarFallback className="bg-brand-100 text-brand-700 font-semibold">
              {patient.prenom[0]}{patient.nom[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-lg font-bold">{patient.prenom} {patient.nom}</h2>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">{patient.email}</p>
              <Badge className={`text-xs ${STATUS_COLORS[patient.status]}`}>
                {STATUS_LABELS[patient.status]}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="profil">
        <TabsList className="w-full justify-start h-auto flex-wrap">
          <TabsTrigger value="profil">Profil patient</TabsTrigger>
          <TabsTrigger value="formulaire">Formulaire médical</TabsTrigger>
          <TabsTrigger value="rapport">Rapport médical</TabsTrigger>
          <TabsTrigger value="historique">Historique</TabsTrigger>
        </TabsList>

        {/* PROFIL */}
        <TabsContent value="profil" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <User className="h-4 w-4" /> Informations personnelles
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[
                  ['Prénom', patient.prenom],
                  ['Nom', patient.nom],
                  ['Date de naissance', formatDate(patient.dateNaissance)],
                  ['Nationalité', patient.nationalite],
                  ['Ville', patient.ville],
                  ['Pays', patient.pays],
                  ['Téléphone', patient.phone],
                  ['Email', patient.email],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center border-b border-border/50 pb-1.5">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Informations dossier</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[
                  ['Source de contact', patient.sourceContact],
                  ['Date de création', formatDate(patient.dateCreation)],
                  ['Statut', STATUS_LABELS[patient.status]],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center border-b border-border/50 pb-1.5">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium capitalize">{value}</span>
                  </div>
                ))}
                <div className="pt-2">
                  <p className="text-muted-foreground mb-2">Documents uploadés</p>
                  <div className="space-y-2">
                    {(!formulaire || (formulaire.photos.length === 0 && formulaire.documentsPDF.length === 0)) && (
                      <p className="text-xs text-muted-foreground">Aucun document encore uploadé.</p>
                    )}

                    {formulaire && formulaire.photos.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Photos</p>
                        <div className="space-y-1">
                          {formulaire.photos.slice(0, 4).map((doc) => (
                            <div
                              key={doc}
                              className="flex items-center justify-between rounded bg-muted px-2 py-1.5 text-xs"
                            >
                              <span className="truncate max-w-[240px]">{doc}</span>
                              <button
                                className="text-brand-600 hover:underline"
                                onClick={() => window.alert(`Document démo: ${doc}\n\nLe fichier réel sera disponible côté backend/storage.`)}
                              >
                                Voir
                              </button>
                            </div>
                          ))}
                          {formulaire.photos.length > 4 && (
                            <p className="text-xs text-muted-foreground">+ {formulaire.photos.length - 4} autre(s)</p>
                          )}
                        </div>
                      </div>
                    )}

                    {formulaire && formulaire.documentsPDF.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">PDF</p>
                        <div className="space-y-1">
                          {formulaire.documentsPDF.slice(0, 4).map((doc) => (
                            <div
                              key={doc}
                              className="flex items-center justify-between rounded bg-muted px-2 py-1.5 text-xs"
                            >
                              <span className="truncate max-w-[240px]">{doc}</span>
                              <button
                                className="text-brand-600 hover:underline"
                                onClick={() => window.alert(`Document démo: ${doc}\n\nLe fichier réel sera disponible côté backend/storage.`)}
                              >
                                Voir
                              </button>
                            </div>
                          ))}
                          {formulaire.documentsPDF.length > 4 && (
                            <p className="text-xs text-muted-foreground">+ {formulaire.documentsPDF.length - 4} autre(s)</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* FORMULAIRE */}
        <TabsContent value="formulaire" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Formulaire médical complété</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <h4 className="font-semibold text-muted-foreground text-xs uppercase">Informations médicales</h4>
                  {[
                    ['Poids', '58 kg'],
                    ['Taille', '165 cm'],
                    ['IMC', '21.3'],
                    ['Groupe sanguin', 'A+'],
                    ['Fumeur', 'Non'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-border/50 pb-1.5">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-muted-foreground text-xs uppercase">Demande</h4>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Interventions souhaitées</p>
                    <div className="flex flex-wrap gap-1">
                      {['Rhinoplastie', 'Blepharoplastie'].map((i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{i}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Description</p>
                    <p className="text-sm bg-muted rounded-lg p-2">
                      Je souhaite corriger ma bosse nasale et affiner la pointe de mon nez.
                      Également corriger un léger ptosis des paupières supérieures.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* RAPPORT MÉDICAL */}
        <TabsContent value="rapport" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-brand-600" />
                  Rapport médical structuré
                </CardTitle>
                {existingRapport && (
                  <Badge variant="success" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Finalisé
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Diagnostic <span className="text-destructive">*</span></label>
                <Textarea
                  rows={3}
                  placeholder="Évaluation clinique et diagnostic..."
                  value={diagnostic}
                  onChange={(e) => setDiagnostic(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Interventions recommandées <span className="text-destructive">*</span></label>
                <Textarea
                  rows={3}
                  placeholder="Une intervention par ligne..."
                  value={interventions}
                  onChange={(e) => setInterventions(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Saisir une intervention par ligne</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Valorisation médicale (pour le devis)</label>
                <Textarea
                  rows={3}
                  placeholder="Description technique des actes pour la gestionnaire..."
                  value={valeur}
                  onChange={(e) => setValeur(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notes complémentaires</label>
                <Textarea
                  rows={2}
                  placeholder="Observations, contre-indications, recommandations..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button
                  variant="brand"
                  className="gap-2"
                  onClick={handleSaveRapport}
                  disabled={!diagnostic.trim()}
                >
                  {saved ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Rapport sauvegardé !
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      Finaliser le rapport
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    if (!user) return

                    downloadRapportPdf({
                      patient,
                      medecinName: user.name,
                      filename: `rapport-medical-${patient.prenom}-${patient.nom}.pdf`,
                      diagnostic: diagnostic.trim() || '—',
                      interventions: interventions.trim() || '—',
                      valeur: valeur.trim() || '—',
                      notes: notes.trim() || '—',
                    })
                  }}
                >
                  <Download className="h-4 w-4" />
                  Exporter PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* HISTORIQUE */}
        <TabsContent value="historique" className="mt-4">
          <Card>
            <CardContent className="pt-5">
              <div className="space-y-3">
                {historyEvents.map((event, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <span className="text-lg">{event.icon}</span>
                    <div>
                      <p className="font-medium">{event.action}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(event.date)}</p>
                    </div>
                  </div>
                ))}
                {historyEvents.length === 0 && (
                  <p className="text-sm text-muted-foreground">Aucun événement historique disponible.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
