import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Save, Send, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { STATUS_COLORS, STATUS_LABELS, formatCurrency, type CurrencyUnit } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { useParams } from 'react-router-dom'

interface LigneDevisForm {
  description: string
  quantite: number
  prixUnitaire: number
}

export default function DevisGestionnairePage() {
  const { id: patientIdFromUrl } = useParams<{ id?: string }>()
  const patients = useDemoStore((s) => s.patients)
  const currency = useDemoStore((s) => s.currency)
  const setCurrency = useDemoStore((s) => s.setCurrency)
  const patientsAvecRapport = useMemo(
    () =>
      patients.filter((p) =>
        ['rapport_genere', 'devis_preparation', 'devis_envoye', 'devis_accepte'].includes(p.status)
      ),
    [patients]
  )
  const [selectedPatient, setSelectedPatient] = useState('')
  const [lignes, setLignes] = useState<LigneDevisForm[]>([
    { description: 'Consultation', quantite: 1, prixUnitaire: 0 },
  ])
  const [planning, setPlanning] = useState('')
  const [notesSejour, setNotesSejour] = useState('')
  const [sent, setSent] = useState(false)
  const [savedDraft, setSavedDraft] = useState(false)
  const [isEditingExisting, setIsEditingExisting] = useState(false)

  const { user } = useAuthStore()
  const patient = useDemoStore((s) => s.patients.find((p) => p.id === selectedPatient))
  const existingDevis = useDemoStore((s) => s.devis.find((d) => d.patientId === selectedPatient))
  const gestionnaireSendDevis = useDemoStore((s) => s.gestionnaireSendDevis)
  const saveDraftDevis = useDemoStore((s) => s.saveDraftDevis)
  const gestionnaireRefuseDevis = useDemoStore((s) => s.gestionnaireRefuseDevis)

  useEffect(() => {
    if (patientIdFromUrl && patientsAvecRapport.some((p) => p.id === patientIdFromUrl)) {
      setSelectedPatient(patientIdFromUrl)
      return
    }
    if (!selectedPatient && patientsAvecRapport.length > 0) {
      setSelectedPatient(patientsAvecRapport[0].id)
    }
  }, [patientIdFromUrl, patientsAvecRapport, selectedPatient])

  useEffect(() => {
    setIsEditingExisting(false)
    setSent(false)
    setSavedDraft(false)
    if (!existingDevis) {
      setLignes([{ description: 'Consultation', quantite: 1, prixUnitaire: 0 }])
      setPlanning('')
      setNotesSejour('')
    }
  }, [existingDevis, selectedPatient])

  const total = lignes.reduce((sum, l) => sum + l.quantite * l.prixUnitaire, 0)

  const addLigne = () => {
    setLignes((prev) => [...prev, { description: '', quantite: 1, prixUnitaire: 0 }])
  }

  const removeLigne = (i: number) => {
    setLignes((prev) => prev.filter((_, idx) => idx !== i))
  }

  const updateLigne = (i: number, field: keyof LigneDevisForm, value: string | number) => {
    setLignes((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }

  const handleSend = () => {
    if (!patient || !user) return

    const dateValidite = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const lignesPayload = lignes.map((l) => ({
      description: l.description,
      quantite: l.quantite,
      prixUnitaire: l.prixUnitaire,
      total: l.quantite * l.prixUnitaire,
    }))

    const total = lignesPayload.reduce((sum, x) => sum + x.total, 0)

    gestionnaireSendDevis(patient.id, user.id, {
      dateValidite,
      lignes: lignesPayload,
      total,
      planningMedical: planning,
      notesSejour,
    } as any)

    setSent(true)
    setTimeout(() => setSent(false), 1500)
    setIsEditingExisting(false)
  }

  const handleSaveDraft = () => {
    if (!patient || !user) return
    const dateValidite = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const lignesPayload = lignes.map((l) => ({
      description: l.description,
      quantite: l.quantite,
      prixUnitaire: l.prixUnitaire,
      total: l.quantite * l.prixUnitaire,
    }))
    const total = lignesPayload.reduce((sum, x) => sum + x.total, 0)

    saveDraftDevis(patient.id, user.id, {
      dateValidite,
      lignes: lignesPayload,
      total,
      planningMedical: planning,
      notesSejour,
    } as any)

    setSavedDraft(true)
    setTimeout(() => setSavedDraft(false), 1500)
  }

  const startEditingFromExisting = () => {
    if (!existingDevis) return
    setLignes(
      existingDevis.lignes.map((l) => ({
        description: l.description,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
      }))
    )
    setPlanning(existingDevis.planningMedical ?? '')
    setNotesSejour(existingDevis.notesSejour ?? '')
    setIsEditingExisting(true)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Gestion des Devis</h2>
            <p className="text-sm text-muted-foreground">Préparer et envoyer les devis aux patients</p>
          </div>
          <div className="w-full sm:w-[220px]">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Devise</p>
            <Select
              value={currency}
              onValueChange={(v) => setCurrency(v as CurrencyUnit)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Devise" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TND">TND</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Patient list */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Patients ({patientsAvecRapport.length})
          </p>
          {patientsAvecRapport.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPatient(p.id)}
              className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                selectedPatient === p.id
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-purple-100 text-purple-700 text-xs font-semibold">
                  {p.prenom[0]}{p.nom[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{p.prenom} {p.nom}</p>
                <Badge className={`text-xs mt-0.5 ${STATUS_COLORS[p.status]}`}>
                  {STATUS_LABELS[p.status]}
                </Badge>
              </div>
            </button>
          ))}
        </div>

        {/* Devis form */}
        <div className="lg:col-span-2">
          {existingDevis && !isEditingExisting ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Devis existant</CardTitle>
                  <Badge variant={existingDevis.statut === 'brouillon' ? 'secondary' : 'info'}>
                    {existingDevis.statut === 'brouillon' ? 'Brouillon' : 'Envoyé'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {existingDevis.lignes.map((l, i) => (
                    <div key={i} className="flex justify-between border-b pb-1.5">
                      <span>{l.description}</span>
                      <span className="font-semibold">
                        {l.total === 0 ? 'Inclus' : formatCurrency(l.total, currency)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-base pt-2">
                    <span>Total</span>
                    <span className="text-brand-600">{formatCurrency(existingDevis.total, currency)}</span>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="brand-outline" size="sm" onClick={startEditingFromExisting}>Modifier</Button>
                  <Button variant="outline" size="sm" onClick={startEditingFromExisting}>Nouvelle version</Button>
                  {existingDevis.statut !== 'refuse' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                      onClick={() => {
                        const reason = window.prompt('Motif de refus/abstention (optionnel)') ?? ''
                        gestionnaireRefuseDevis(existingDevis.patientId, existingDevis.id, reason.trim() || undefined)
                      }}
                    >
                      Refus / abstention
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {existingDevis ? 'Modifier devis' : 'Nouveau devis'} — {patient?.prenom} {patient?.nom}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Lignes */}
                <div className="space-y-2">
                  <div className="overflow-x-auto pb-1">
                    <div className="min-w-[640px]">
                      <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                        <div className="col-span-6">Description</div>
                        <div className="col-span-2 text-center">Qté</div>
                        <div className="col-span-3">Prix unit. ({currency})</div>
                        <div className="col-span-1" />
                      </div>
                      {lignes.map((ligne, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-center mt-2">
                          <Input
                            className="col-span-6 h-8 text-sm"
                            placeholder="Prestation..."
                            value={ligne.description}
                            onChange={(e) => updateLigne(i, 'description', e.target.value)}
                          />
                          <Input
                            className="col-span-2 h-8 text-sm text-center"
                            type="number"
                            min={1}
                            value={ligne.quantite}
                            onChange={(e) => updateLigne(i, 'quantite', parseInt(e.target.value) || 1)}
                          />
                          <Input
                            className="col-span-3 h-8 text-sm"
                            type="number"
                            min={0}
                            value={ligne.prixUnitaire}
                            onChange={(e) => updateLigne(i, 'prixUnitaire', parseInt(e.target.value) || 0)}
                          />
                          <button
                            className="col-span-1 text-muted-foreground hover:text-destructive"
                            onClick={() => removeLigne(i)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5 mt-1" onClick={addLigne}>
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter une ligne
                  </Button>
                </div>

                {/* Total */}
                <div className="flex justify-between items-center rounded-lg bg-muted px-4 py-3">
                  <span className="font-semibold">Total estimatif</span>
                  <span className="text-xl font-bold text-brand-600">{formatCurrency(total, currency)}</span>
                </div>

                {/* Planning */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Planning médical</label>
                  <Textarea
                    rows={2}
                    placeholder="Durée de l'intervention, hospitalisation, récupération..."
                    value={planning}
                    onChange={(e) => setPlanning(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Notes séjour</label>
                  <Textarea
                    rows={2}
                    placeholder="Durée du séjour recommandée, hébergement, transport..."
                    value={notesSejour}
                    onChange={(e) => setNotesSejour(e.target.value)}
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="outline" className="gap-2" onClick={handleSaveDraft}>
                    <Save className="h-4 w-4" />
                    {savedDraft ? 'Brouillon enregistré !' : 'Enregistrer brouillon'}
                  </Button>
                  <Button variant="brand" className="gap-2" onClick={handleSend}>
                    {sent ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Devis envoyé !
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Valider et envoyer
                      </>
                    )}
                  </Button>
                  {existingDevis && (
                    <Button variant="ghost" onClick={() => setIsEditingExisting(false)}>
                      Retour
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
