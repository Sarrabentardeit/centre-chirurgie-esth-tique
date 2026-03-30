import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, ChevronLeft, ChevronRight, Upload, X, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'

const STEPS = [
  { id: 1, label: 'Informations personnelles', short: 'Personnel' },
  { id: 2, label: 'Antécédents médicaux', short: 'Médical' },
  { id: 3, label: 'Votre demande', short: 'Demande' },
  { id: 4, label: 'Documents & Photos', short: 'Documents' },
  { id: 5, label: 'Confirmation', short: 'Confirmation' },
]

const INTERVENTIONS = [
  'Rhinoplastie', 'Blepharoplastie', 'Lifting du visage', 'Otoplastie',
  'Augmentation mammaire', 'Réduction mammaire', 'Lifting mammaire',
  'Abdominoplastie', 'Liposuccion', 'Lipofilling', 'Blépharoplastie',
]

const ANTECEDENTS = [
  'Diabète', 'Hypertension', 'Maladie cardiaque', 'Problèmes de coagulation',
  'Troubles thyroïdiens', 'Asthme', 'Épilepsie', 'Dépression / Anxiété',
]

const step1Schema = z.object({
  poids: z.string().min(1, 'Requis').regex(/^\d+$/, 'Nombre entier requis'),
  taille: z.string().min(1, 'Requis').regex(/^\d+$/, 'Nombre entier requis'),
  groupeSanguin: z.string().min(1, 'Requis'),
  ville: z.string().min(2, 'Requis'),
  pays: z.string().min(2, 'Requis'),
  periodeSouhaitee: z.string().min(2, 'Requis'),
})

type Step1Data = z.infer<typeof step1Schema>

const step3Schema = z.object({
  descriptionDemande: z.string().min(20, 'Décrivez votre demande en au moins 20 caractères'),
  attentes: z.string().min(10, 'Décrivez vos attentes'),
})

type Step3Data = z.infer<typeof step3Schema>

type UploadedFile = { url: string; name: string }

export default function FormulairePage() {
  const [currentStep, setCurrentStep] = useState(1)
  const [completed, setCompleted] = useState(false)
  const { user } = useAuthStore()
  const ensurePatientForUser = useDemoStore((s) => s.ensurePatientForUser)
  const submitMedicalForm = useDemoStore((s) => s.submitMedicalForm)

  // Ensure patient exists in demo store early (Chatbot available right after account creation)
  useEffect(() => {
    if (!user) return
    ensurePatientForUser(user, { sourceContact: 'direct' })
  }, [user, ensurePatientForUser])

  // Step 2 state
  const [antecedents, setAntecedents] = useState<string[]>([])
  const [traitementEnCours, setTraitementEnCours] = useState(false)
  const [traitementDetails, setTraitementDetails] = useState('')
  const [fumeur, setFumeur] = useState(false)
  const [detailsTabac, setDetailsTabac] = useState('')
  const [alcool, setAlcool] = useState(false)
  const [detailsAlcool, setDetailsAlcool] = useState('')
  const [drogue, setDrogue] = useState(false)
  const [detailsDrogue, setDetailsDrogue] = useState('')
  const [tensionArterielle, setTensionArterielle] = useState('')
  const [diabete, setDiabete] = useState(false)
  const [maladieCardiaque, setMaladieCardiaque] = useState(false)
  const [autresMaladiesChroniques, setAutresMaladiesChroniques] = useState('')
  const [chirurgiesAnterieures, setChirurgiesAnterieures] = useState(false)
  const [chirurgiesDetails, setChirurgiesDetails] = useState('')
  const [allergies, setAllergies] = useState('')

  // Step 3 state
  const [selectedInterventions, setSelectedInterventions] = useState<string[]>([])
  const [step3Error, setStep3Error] = useState('')
  const [step4Error, setStep4Error] = useState('')

  // Step 4 state
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedFile[]>([])
  const [uploadedDocs, setUploadedDocs] = useState<UploadedFile[]>([])
  const photosInputRef = useRef<HTMLInputElement | null>(null)
  const docsInputRef = useRef<HTMLInputElement | null>(null)

  const step1Form = useForm<Step1Data>({ resolver: zodResolver(step1Schema) })
  const step3Form = useForm<Step3Data>({ resolver: zodResolver(step3Schema) })

  const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100

  const handleNext = async () => {
    if (currentStep === 1) {
      const valid = await step1Form.trigger()
      if (!valid) return
    }
    if (currentStep === 3) {
      if (selectedInterventions.length === 0) {
        setStep3Error('Sélectionnez au moins un type d\'intervention.')
        return
      }
      const valid = await step3Form.trigger()
      if (!valid) return
      setStep3Error('')
    }
    if (currentStep === 4) {
      if (uploadedPhotos.length === 0) {
        setStep4Error('Veuillez ajouter au moins une photo.')
        return
      }
      if (uploadedDocs.length === 0) {
        setStep4Error('Veuillez ajouter au moins un document PDF.')
        return
      }
      setStep4Error('')
    }
    setCurrentStep((s) => Math.min(s + 1, 5))
  }

  const handleBack = () => setCurrentStep((s) => Math.max(s - 1, 1))

  const handleSubmit = () => {
    if (!user) return
    ensurePatientForUser(user, { sourceContact: 'direct' })

    const step1 = step1Form.getValues()
    const step3 = step3Form.getValues()

    submitMedicalForm(user.id, {
      poids: parseInt(step1.poids, 10),
      taille: parseInt(step1.taille, 10),
      groupeSanguin: step1.groupeSanguin,
      periodeSouhaitee: step1.periodeSouhaitee,
      antecedentsMedicaux: antecedents,
      traitementEnCours,
      traitementDetails: traitementEnCours ? traitementDetails : undefined,
      allergies: allergies
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      fumeur,
      detailsTabac: fumeur ? detailsTabac : undefined,
      alcool,
      detailsAlcool: alcool ? detailsAlcool : undefined,
      drogue,
      detailsDrogue: drogue ? detailsDrogue : undefined,
      tensionArterielle: tensionArterielle || undefined,
      diabete,
      maladieCardiaque,
      autresMaladiesChroniques: autresMaladiesChroniques || undefined,
      chirurgiesAnterieures,
      chirurgiesDetails: chirurgiesAnterieures ? chirurgiesDetails : undefined,
      typeIntervention: selectedInterventions,
      zonesConcernees: selectedInterventions,
      descriptionDemande: step3.descriptionDemande,
      attentes: step3.attentes,
      photos: uploadedPhotos.map((f) => f.name),
      documentsPDF: uploadedDocs.map((f) => f.name),
    })
    setCompleted(true)
  }

  const toggleIntervention = (item: string) => {
    setSelectedInterventions((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    )
  }

  const toggleAntecedent = (item: string) => {
    setAntecedents((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    )
  }

  if (completed) {
    return (
      <div className="max-w-lg mx-auto mt-12 text-center animate-fade-in">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 mx-auto mb-6">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-3">Formulaire soumis !</h2>
        <p className="text-muted-foreground mb-6">
          Votre dossier médical a été transmis au Dr. Mehdi Chennoufi. Vous recevrez une notification
          dès que votre dossier aura été analysé.
        </p>
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-700 text-left">
          <p className="font-semibold mb-1">Prochaine étape</p>
          <p>Le médecin analysera votre dossier sous 48-72h ouvrées et vous enverra son rapport médical.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Steps Header */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Formulaire Médical</h2>
          <span className="text-sm text-muted-foreground">Étape {currentStep} / {STEPS.length}</span>
        </div>
        <Progress value={progress} className="h-2 mb-4" />
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {STEPS.map((step) => (
            <div
              key={step.id}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-all',
                step.id === currentStep
                  ? 'bg-brand-600 text-white'
                  : step.id < currentStep
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {step.id < currentStep && <CheckCircle2 className="h-3 w-3" />}
              {step.short}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card className="animate-fade-in">
        <CardHeader>
          <CardTitle>{STEPS[currentStep - 1].label}</CardTitle>
          {currentStep === 1 && (
            <CardDescription>Informations complémentaires à votre profil</CardDescription>
          )}
          {currentStep === 2 && (
            <CardDescription>
              Ces informations sont essentielles pour évaluer votre candidature
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {/* STEP 1 — Infos personnelles */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="poids">Poids (kg) <span className="text-destructive">*</span></Label>
                  <Input id="poids" placeholder="65" {...step1Form.register('poids')} />
                  {step1Form.formState.errors.poids && (
                    <p className="text-xs text-destructive">{step1Form.formState.errors.poids.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taille">Taille (cm) <span className="text-destructive">*</span></Label>
                  <Input id="taille" placeholder="165" {...step1Form.register('taille')} />
                  {step1Form.formState.errors.taille && (
                    <p className="text-xs text-destructive">{step1Form.formState.errors.taille.message}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="groupeSanguin">Groupe sanguin <span className="text-destructive">*</span></Label>
                <select
                  id="groupeSanguin"
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...step1Form.register('groupeSanguin')}
                >
                  <option value="">Sélectionner...</option>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                {step1Form.formState.errors.groupeSanguin && (
                  <p className="text-xs text-destructive">{step1Form.formState.errors.groupeSanguin.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ville">Ville <span className="text-destructive">*</span></Label>
                  <Input id="ville" placeholder="Alger" {...step1Form.register('ville')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pays">Pays <span className="text-destructive">*</span></Label>
                  <Input id="pays" placeholder="Algérie" {...step1Form.register('pays')} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="periodeSouhaitee">Période souhaitée <span className="text-destructive">*</span></Label>
                <Input id="periodeSouhaitee" placeholder="Ex: Juin-Juillet 2026" {...step1Form.register('periodeSouhaitee')} />
                {step1Form.formState.errors.periodeSouhaitee && (
                  <p className="text-xs text-destructive">{step1Form.formState.errors.periodeSouhaitee.message}</p>
                )}
              </div>
            </div>
          )}

          {/* STEP 2 — Antécédents médicaux */}
          {currentStep === 2 && (
            <div className="space-y-5">
              <div>
                <Label className="mb-3 block">Antécédents médicaux</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ANTECEDENTS.map((item) => (
                    <label
                      key={item}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-all text-sm',
                        antecedents.includes(item)
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-border hover:bg-muted/50'
                      )}
                    >
                      <Checkbox
                        checked={antecedents.includes(item)}
                        onCheckedChange={() => toggleAntecedent(item)}
                      />
                      {item}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <Checkbox
                    checked={traitementEnCours}
                    onCheckedChange={(v) => setTraitementEnCours(!!v)}
                  />
                  <span className="text-sm font-medium">Traitement médical en cours</span>
                </label>
                {traitementEnCours && (
                  <Textarea
                    placeholder="Décrivez le traitement..."
                    value={traitementDetails}
                    onChange={(e) => setTraitementDetails(e.target.value)}
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="allergies">Allergies connues</Label>
                <Input
                  id="allergies"
                  placeholder="Ex: Pénicilline, latex..."
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                />
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox checked={fumeur} onCheckedChange={(v) => setFumeur(!!v)} />
                  Fumeur(se)
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox checked={alcool} onCheckedChange={(v) => setAlcool(!!v)} />
                  Consommation alcool
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox checked={drogue} onCheckedChange={(v) => setDrogue(!!v)} />
                  Consommation drogue
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox
                    checked={chirurgiesAnterieures}
                    onCheckedChange={(v) => setChirurgiesAnterieures(!!v)}
                  />
                  Chirurgies antérieures
                </label>
              </div>
              {fumeur && (
                <Textarea
                  placeholder="Précisez type de cigarette/vape et quantité par jour..."
                  value={detailsTabac}
                  onChange={(e) => setDetailsTabac(e.target.value)}
                />
              )}
              {alcool && (
                <Textarea
                  placeholder="Précisez fréquence/type d'alcool..."
                  value={detailsAlcool}
                  onChange={(e) => setDetailsAlcool(e.target.value)}
                />
              )}
              {drogue && (
                <Textarea
                  placeholder="Précisez fréquence/type de consommation..."
                  value={detailsDrogue}
                  onChange={(e) => setDetailsDrogue(e.target.value)}
                />
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="tension">Tension artérielle</Label>
                  <Input
                    id="tension"
                    placeholder="Ex: 12/8"
                    value={tensionArterielle}
                    onChange={(e) => setTensionArterielle(e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm pt-7">
                  <Checkbox checked={diabete} onCheckedChange={(v) => setDiabete(!!v)} />
                  Diabète
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm pt-7">
                  <Checkbox checked={maladieCardiaque} onCheckedChange={(v) => setMaladieCardiaque(!!v)} />
                  Maladie cardiaque
                </label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="autresChroniques">Autres maladies chroniques</Label>
                <Textarea
                  id="autresChroniques"
                  placeholder="Précisez toute maladie chronique importante..."
                  value={autresMaladiesChroniques}
                  onChange={(e) => setAutresMaladiesChroniques(e.target.value)}
                />
              </div>
              {chirurgiesAnterieures && (
                <Textarea
                  placeholder="Précisez les interventions précédentes..."
                  value={chirurgiesDetails}
                  onChange={(e) => setChirurgiesDetails(e.target.value)}
                />
              )}
            </div>
          )}

          {/* STEP 3 — Demande */}
          {currentStep === 3 && (
            <div className="space-y-5">
              <div>
                <Label className="mb-3 block">
                  Type(s) d'intervention souhaité(s) <span className="text-destructive">*</span>
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {INTERVENTIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleIntervention(item)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm text-left transition-all',
                        selectedInterventions.includes(item)
                          ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium'
                          : 'border-border hover:bg-muted/50'
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                {step3Error && (
                  <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {step3Error}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="desc">
                  Description de votre demande <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="desc"
                  rows={4}
                  placeholder="Décrivez en détail ce que vous souhaitez..."
                  {...step3Form.register('descriptionDemande')}
                />
                {step3Form.formState.errors.descriptionDemande && (
                  <p className="text-xs text-destructive">
                    {step3Form.formState.errors.descriptionDemande.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="attentes">
                  Vos attentes <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="attentes"
                  rows={3}
                  placeholder="Quel résultat attendez-vous ?"
                  {...step3Form.register('attentes')}
                />
                {step3Form.formState.errors.attentes && (
                  <p className="text-xs text-destructive">{step3Form.formState.errors.attentes.message}</p>
                )}
              </div>
            </div>
          )}

          {/* STEP 4 — Documents */}
          {currentStep === 4 && (
            <div className="space-y-6">
              {/* Photos */}
              <div>
                <Label className="mb-2 block">Photos (face, profil, 3/4)</Label>
                <input
                  ref={photosInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? [])
                    if (files.length === 0) return
                    const mapped: UploadedFile[] = files.map((file) => ({
                      url: URL.createObjectURL(file),
                      name: file.name,
                    }))
                    setUploadedPhotos((prev) => [...prev, ...mapped])
                    // Reset input so selecting same file again triggers onChange
                    e.currentTarget.value = ''
                  }}
                />
                <div
                  className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-all"
                  onClick={() => photosInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground">
                    Cliquez pour ajouter des photos
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    JPG, PNG — Max 10 MB par fichier
                  </p>
                </div>
                {uploadedPhotos.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {uploadedPhotos.map((f, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                        <span className="text-foreground truncate">{f.name}</span>
                        <button
                          onClick={() => setUploadedPhotos((p) => p.filter((_, j) => j !== i))}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* PDF Documents */}
              <div>
                <Label className="mb-2 block">Documents médicaux (résultats, analyses, ordonnances)</Label>
                <input
                  ref={docsInputRef}
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? [])
                    if (files.length === 0) return
                    const mapped: UploadedFile[] = files.map((file) => ({
                      url: URL.createObjectURL(file),
                      name: file.name,
                    }))
                    setUploadedDocs((prev) => [...prev, ...mapped])
                    e.currentTarget.value = ''
                  }}
                />
                <div
                  className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-all"
                  onClick={() => docsInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground">
                    Cliquez pour ajouter des PDF
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">PDF — Max 20 MB par fichier</p>
                </div>
                {uploadedDocs.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {uploadedDocs.map((f, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                        <span className="text-foreground truncate">{f.name}</span>
                        <button
                          onClick={() => setUploadedDocs((p) => p.filter((_, j) => j !== i))}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {step4Error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
                  {step4Error}
                </div>
              )}

              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
                <p className="font-semibold mb-1">Important</p>
                <p>Vos documents sont chiffrés et accessibles uniquement par l'équipe médicale.</p>
              </div>
            </div>
          )}

          {/* STEP 5 — Confirmation */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <p className="font-semibold text-emerald-800">Récapitulatif de votre dossier</p>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Interventions souhaitées</span>
                    <span className="font-medium text-right">
                      {selectedInterventions.length > 0
                        ? selectedInterventions.join(', ')
                        : 'Non renseigné'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Antécédents</span>
                    <span className="font-medium">
                      {antecedents.length > 0 ? antecedents.length + ' renseigné(s)' : 'Aucun'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Photos uploadées</span>
                    <span className="font-medium">{uploadedPhotos.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Documents PDF</span>
                    <span className="font-medium">{uploadedDocs.length}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                En soumettant ce formulaire, vous confirmez que les informations fournies sont exactes et complètes.
              </div>

              <Button
                variant="brand"
                size="lg"
                className="w-full"
                onClick={handleSubmit}
              >
                Soumettre mon dossier médical
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      {currentStep < 5 && (
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Précédent
          </Button>
          <Button variant="brand" onClick={handleNext}>
            Suivant
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  )
}
