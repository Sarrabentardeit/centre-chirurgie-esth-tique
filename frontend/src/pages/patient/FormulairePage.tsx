import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, ChevronLeft, ChevronRight, Upload, X, AlertCircle, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { getDashboardPath, useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { registerMockAccount } from '@/mocks/auth'
import { useNavigate } from 'react-router-dom'

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
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(1)
  const [completed, setCompleted] = useState(false)
  const { user, login } = useAuthStore()
  const ensurePatientForUser = useDemoStore((s) => s.ensurePatientForUser)
  const submitMedicalForm = useDemoStore((s) => s.submitMedicalForm)
  const [autoAccountError, setAutoAccountError] = useState('')
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [privacyError, setPrivacyError] = useState('')
  const [autoEmail, setAutoEmail] = useState('')
  const [autoPassword, setAutoPassword] = useState('')
  const [publicIdentity, setPublicIdentity] = useState({
    prenom: '',
    nom: '',
    email: '',
    phone: '',
  })
  const [submittedByPublic, setSubmittedByPublic] = useState(false)

  useEffect(() => {
    if (user && user.role !== 'patient') {
      navigate(getDashboardPath(user.role), { replace: true })
      return
    }
    if (!user) return
    ensurePatientForUser(user, { sourceContact: 'direct' })
  }, [user, ensurePatientForUser, navigate])

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

  const handleNext = async () => {
    if (currentStep === 1) {
      const valid = await step1Form.trigger()
      if (!valid) return
    }
    if (currentStep === 3) {
      if (selectedInterventions.length === 0) {
        setStep3Error("Sélectionnez au moins un type d'intervention.")
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
    let targetUser = user
    setAutoAccountError('')

    if (!targetUser) {
      if (!privacyAccepted) {
        setPrivacyError('Veuillez accepter la politique de confidentialité pour créer votre compte.')
        return
      }

      const prenom = publicIdentity.prenom.trim()
      const nom = publicIdentity.nom.trim()
      const email = publicIdentity.email.trim().toLowerCase()
      const phone = publicIdentity.phone.trim()
      if (!prenom || !nom || !email || !phone) {
        setAutoAccountError('Veuillez compléter vos coordonnées pour finaliser la soumission.')
        return
      }

      const digits = phone.replace(/\D/g, '')
      const generatedPassword = `DrMehdi@${digits.slice(-4) || '2026'}`
      const newUser = {
        id: `u_auto_${Date.now()}`,
        email,
        name: `${prenom} ${nom}`,
        role: 'patient' as const,
        phone,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${prenom}`,
      }
      const registration = registerMockAccount(newUser, generatedPassword)
      if (!registration.success) {
        setAutoAccountError(registration.error ?? 'Impossible de créer le compte automatiquement.')
        return
      }

      login(newUser, `mock-token-${newUser.id}`)
      targetUser = newUser
      setAutoEmail(email)
      setAutoPassword(generatedPassword)
      setSubmittedByPublic(true)
    }

    ensurePatientForUser(targetUser, { sourceContact: 'direct' })

    const step1 = step1Form.getValues()
    const step3 = step3Form.getValues()

    submitMedicalForm(targetUser.id, {
      poids: parseInt(step1.poids, 10),
      taille: parseInt(step1.taille, 10),
      groupeSanguin: step1.groupeSanguin,
      periodeSouhaitee: step1.periodeSouhaitee,
      antecedentsMedicaux: antecedents,
      traitementEnCours,
      traitementDetails: traitementEnCours ? traitementDetails : undefined,
      allergies: allergies.split(',').map((x) => x.trim()).filter(Boolean),
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

  useEffect(() => {
    if (!completed) return
    const timeout = window.setTimeout(() => {
      navigate('/patient/dossier')
    }, submittedByPublic ? 3200 : 1800)
    return () => window.clearTimeout(timeout)
  }, [completed, navigate, submittedByPublic])

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

  // ─── Completion screen ────────────────────────────────────────────────────
  if (completed) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{
          background: 'linear-gradient(135deg, #062a30 0%, #0d3d45 40%, #1a4a3a 100%)',
        }}
      >
        <div className="w-full max-w-lg text-center animate-fade-in">
          <img
            src="/brand-logo-teal.png"
            alt="Dr. Mehdi Chennoufi"
            className="h-24 w-auto object-contain mx-auto mb-8 opacity-90"
          />
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full mx-auto mb-6"
            style={{ background: 'rgba(129,87,45,0.2)', border: '1px solid rgba(129,87,45,0.4)' }}
          >
            <CheckCircle2 className="h-8 w-8" style={{ color: '#e4c8bd' }} />
          </div>
          <h2
            className="text-2xl font-light tracking-[0.12em] uppercase mb-2"
            style={{ color: '#fdeada' }}
          >
            Formulaire soumis
          </h2>
          <p className="text-sm mb-8" style={{ color: 'rgba(253,234,218,0.6)' }}>
            Votre dossier médical a été transmis au Dr. Mehdi Chennoufi.
            Vous recevrez une notification dès que votre dossier aura été analysé.
          </p>

          {autoEmail && (
            <div
              className="mb-6 rounded-xl p-5 text-left text-sm"
              style={{
                background: 'rgba(253,234,218,0.07)',
                border: '1px solid rgba(228,200,189,0.25)',
              }}
            >
              <p
                className="text-xs tracking-[0.15em] uppercase font-semibold mb-3"
                style={{ color: '#81572d' }}
              >
                Identifiants de votre compte
              </p>
              <div className="space-y-1.5" style={{ color: '#fdeada' }}>
                <p><span style={{ color: 'rgba(253,234,218,0.5)' }}>Email :</span> {autoEmail}</p>
                <p><span style={{ color: 'rgba(253,234,218,0.5)' }}>Mot de passe :</span> {autoPassword}</p>
                <p className="text-xs mt-2" style={{ color: 'rgba(253,234,218,0.45)' }}>
                  Accès ultérieur via <span style={{ color: '#e4c8bd' }}>/acces-patient</span>
                </p>
              </div>
            </div>
          )}

          <div
            className="rounded-xl p-4 text-sm text-left"
            style={{ background: 'rgba(253,234,218,0.06)', border: '1px solid rgba(228,200,189,0.2)' }}
          >
            <p className="font-medium mb-1" style={{ color: '#e4c8bd' }}>Prochaine étape</p>
            <p style={{ color: 'rgba(253,234,218,0.6)' }}>
              Le médecin analysera votre dossier sous 48–72h ouvrées et vous enverra son rapport médical.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Main page ────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundImage: "linear-gradient(rgba(253,234,218,0.25), rgba(228,200,189,0.15)), url('/brand-marble.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'scroll',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header style={{ background: '#062a30' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="h-12 sm:h-14 w-[170px] sm:w-[205px] overflow-hidden flex items-center">
              <img
                src="/acces-patient-logo1-crop.png"
                alt="Dr. Mehdi Chennoufi"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="border-l border-white/10 pl-3 sm:pl-4">
              <p
                className="text-xs tracking-[0.22em] uppercase"
                style={{ color: 'rgba(228,200,189,0.6)' }}
              >
                Formulaire de
              </p>
              <p
                className="text-sm font-semibold tracking-[0.18em] uppercase"
                style={{ color: '#fdeada' }}
              >
                Pré-consultation
              </p>
            </div>
          </div>

          {!user && (
            <button
              type="button"
              onClick={() => navigate('/acces-patient')}
              className="w-full sm:w-auto text-xs tracking-wide transition-all rounded-full px-4 py-1.5 whitespace-nowrap"
              style={{
                color: 'rgba(253,234,218,0.75)',
                border: '1px solid rgba(228,200,189,0.2)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#fdeada'
                e.currentTarget.style.borderColor = 'rgba(228,200,189,0.5)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(253,234,218,0.75)'
                e.currentTarget.style.borderColor = 'rgba(228,200,189,0.2)'
              }}
            >
              Patiente existante →
            </button>
          )}
        </div>

        {/* Gold divider */}
        <div className="h-px mx-3 sm:mx-5" style={{ background: 'linear-gradient(to right, transparent, #81572d, transparent)' }} />
      </header>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <main className="flex-1 py-6 sm:py-8 px-3 sm:px-4">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* ── Coordonnées (public user only) ────────────────────── */}
          {!user && (
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: '1px solid rgba(228,200,189,0.45)', background: 'rgba(255,255,255,0.92)' }}
            >
              {/* Card header accent */}
              <div
                className="px-4 sm:px-6 py-3 flex items-center gap-3"
                style={{ background: 'rgba(6,42,48,0.04)', borderBottom: '1px solid rgba(228,200,189,0.3)' }}
              >
                <div
                  className="h-5 w-1 rounded-full"
                  style={{ background: '#062a30' }}
                />
                <p
                  className="text-xs tracking-[0.18em] uppercase font-semibold"
                  style={{ color: '#062a30' }}
                >
                  Vos coordonnées
                </p>
              </div>
              <div className="p-4 sm:p-6 space-y-4">
                <p className="text-xs" style={{ color: '#929292' }}>
                  Complétez directement le formulaire. Votre compte patiente sera créé automatiquement à l'envoi.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { placeholder: 'Prénom', key: 'prenom' as const },
                    { placeholder: 'Nom', key: 'nom' as const },
                    { placeholder: 'Email', key: 'email' as const, type: 'email' },
                    { placeholder: 'Téléphone', key: 'phone' as const },
                  ].map(({ placeholder, key, type }) => (
                    <div key={key} className="relative">
                      <Input
                        type={type}
                        placeholder={placeholder}
                        value={publicIdentity[key]}
                        onChange={(e) => setPublicIdentity((p) => ({ ...p, [key]: e.target.value }))}
                        className="border-brand-200 focus-visible:ring-brand-950/20 bg-white"
                      />
                    </div>
                  ))}
                </div>
                {autoAccountError && (
                  <p className="text-xs flex items-center gap-1.5" style={{ color: '#c0392b' }}>
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    {autoAccountError}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Step progress ────────────────────────────────────── */}
          <div
            className="rounded-2xl px-4 sm:px-6 py-5"
            style={{ background: 'rgba(255,255,255,0.88)', border: '1px solid rgba(228,200,189,0.4)' }}
          >
            {/* Numbered stepper */}
            <div className="overflow-x-auto pb-1 -mx-1 px-1 sm:mx-0 sm:px-0">
            <div className="relative flex min-w-[520px] sm:min-w-0 items-start justify-between">
              {/* Connecting line behind the circles */}
              <div
                className="absolute top-4 left-0 right-0 h-px"
                style={{ background: 'rgba(228,200,189,0.6)', zIndex: 0 }}
              />
              {/* Active progress line */}
              <div
                className="absolute top-4 left-0 h-px transition-all duration-500"
                style={{
                  background: 'linear-gradient(to right, #062a30, #81572d)',
                  width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%`,
                  zIndex: 1,
                }}
              />
              {STEPS.map((step) => (
                <div key={step.id} className="flex flex-col items-center gap-2 relative" style={{ zIndex: 2 }}>
                  <div
                    className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300',
                    )}
                    style={{
                      background:
                        step.id < currentStep
                          ? '#81572d'
                          : step.id === currentStep
                          ? '#062a30'
                          : '#fff',
                      border:
                        step.id === currentStep
                          ? '2px solid #062a30'
                          : step.id < currentStep
                          ? '2px solid #81572d'
                          : '2px solid rgba(228,200,189,0.8)',
                      color:
                        step.id <= currentStep ? '#fff' : '#929292',
                      boxShadow: step.id === currentStep ? '0 0 0 3px rgba(6,42,48,0.12)' : 'none',
                    }}
                  >
                    {step.id < currentStep ? <Check className="h-3.5 w-3.5" /> : step.id}
                  </div>
                  <p
                    className="text-xs text-center hidden sm:block leading-tight max-w-[60px] transition-all"
                    style={{
                      fontWeight: step.id === currentStep ? 600 : 400,
                      color: step.id === currentStep ? '#062a30' : step.id < currentStep ? '#81572d' : '#929292',
                    }}
                  >
                    {step.short}
                  </p>
                </div>
              ))}
            </div>
            </div>

            {/* Mobile current step label */}
            <p className="mt-3 text-xs text-center sm:hidden" style={{ color: '#062a30', fontWeight: 600 }}>
              Étape {currentStep} — {STEPS[currentStep - 1].label}
            </p>
          </div>

          {/* ── Form card ───────────────────────────────────────── */}
          <div
            className="rounded-2xl overflow-hidden animate-fade-in"
            style={{ border: '1px solid rgba(228,200,189,0.45)', background: 'rgba(255,255,255,0.95)' }}
          >
            {/* Card header bar */}
            <div
              className="px-4 sm:px-6 py-3.5 flex items-center gap-3"
              style={{ background: '#062a30' }}
            >
              <div
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: '#81572d' }}
              />
              <p
                className="text-sm font-medium tracking-[0.1em]"
                style={{ color: '#fdeada' }}
              >
                {STEPS[currentStep - 1].label}
              </p>
              <span
                className="ml-auto text-xs"
                style={{ color: 'rgba(253,234,218,0.4)' }}
              >
                {currentStep} / {STEPS.length}
              </span>
            </div>

            <div className="p-4 sm:p-6 space-y-5">

              {/* ── STEP 1 ──────────────────────────────────────── */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="poids" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                        Poids (kg) <span className="text-destructive">*</span>
                      </Label>
                      <Input id="poids" placeholder="65" {...step1Form.register('poids')} className="border-brand-200 focus-visible:ring-brand-950/20" />
                      {step1Form.formState.errors.poids && (
                        <p className="text-xs text-destructive">{step1Form.formState.errors.poids.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="taille" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                        Taille (cm) <span className="text-destructive">*</span>
                      </Label>
                      <Input id="taille" placeholder="165" {...step1Form.register('taille')} className="border-brand-200 focus-visible:ring-brand-950/20" />
                      {step1Form.formState.errors.taille && (
                        <p className="text-xs text-destructive">{step1Form.formState.errors.taille.message}</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="groupeSanguin" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                      Groupe sanguin <span className="text-destructive">*</span>
                    </Label>
                    <select
                      id="groupeSanguin"
                      className="flex h-10 w-full rounded-lg border border-brand-200 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-950/20"
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="ville" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                        Ville <span className="text-destructive">*</span>
                      </Label>
                      <Input id="ville" placeholder="Alger" {...step1Form.register('ville')} className="border-brand-200 focus-visible:ring-brand-950/20" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pays" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                        Pays <span className="text-destructive">*</span>
                      </Label>
                      <Input id="pays" placeholder="Algérie" {...step1Form.register('pays')} className="border-brand-200 focus-visible:ring-brand-950/20" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="periodeSouhaitee" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                      Période souhaitée <span className="text-destructive">*</span>
                    </Label>
                    <Input id="periodeSouhaitee" placeholder="Ex: Juin–Juillet 2026" {...step1Form.register('periodeSouhaitee')} className="border-brand-200 focus-visible:ring-brand-950/20" />
                    {step1Form.formState.errors.periodeSouhaitee && (
                      <p className="text-xs text-destructive">{step1Form.formState.errors.periodeSouhaitee.message}</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── STEP 2 ──────────────────────────────────────── */}
              {currentStep === 2 && (
                <div className="space-y-5">
                  <div>
                    <Label className="mb-3 block text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                      Antécédents médicaux
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ANTECEDENTS.map((item) => (
                        <label
                          key={item}
                          className={cn(
                            'flex items-center gap-2 rounded-xl border p-3 cursor-pointer transition-all text-sm',
                            antecedents.includes(item)
                              ? 'border-brand-950/30 bg-brand-950/5 text-brand-950'
                              : 'border-brand-200/60 hover:bg-brand-100/30'
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
                      <span className="text-sm">Traitement médical en cours</span>
                    </label>
                    {traitementEnCours && (
                      <Textarea
                        placeholder="Décrivez le traitement..."
                        value={traitementDetails}
                        onChange={(e) => setTraitementDetails(e.target.value)}
                        className="border-brand-200"
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="allergies" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                      Allergies connues
                    </Label>
                    <Input
                      id="allergies"
                      placeholder="Ex: Pénicilline, latex..."
                      value={allergies}
                      onChange={(e) => setAllergies(e.target.value)}
                      className="border-brand-200"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'Fumeur(se)', checked: fumeur, set: setFumeur },
                      { label: 'Alcool', checked: alcool, set: setAlcool },
                      { label: 'Drogue', checked: drogue, set: setDrogue },
                      { label: 'Chirurgies antérieures', checked: chirurgiesAnterieures, set: setChirurgiesAnterieures },
                    ].map(({ label, checked, set }) => (
                      <label
                        key={label}
                        className={cn(
                          'flex items-center gap-2 rounded-xl border p-2.5 cursor-pointer transition-all text-xs',
                          checked
                            ? 'border-brand-950/30 bg-brand-950/5 text-brand-950'
                            : 'border-brand-200/60 hover:bg-brand-100/30'
                        )}
                      >
                        <Checkbox checked={checked} onCheckedChange={(v) => set(!!v)} />
                        {label}
                      </label>
                    ))}
                  </div>

                  {fumeur && (
                    <Textarea placeholder="Précisez type de cigarette/vape et quantité par jour..." value={detailsTabac} onChange={(e) => setDetailsTabac(e.target.value)} className="border-brand-200" />
                  )}
                  {alcool && (
                    <Textarea placeholder="Précisez fréquence/type d'alcool..." value={detailsAlcool} onChange={(e) => setDetailsAlcool(e.target.value)} className="border-brand-200" />
                  )}
                  {drogue && (
                    <Textarea placeholder="Précisez fréquence/type de consommation..." value={detailsDrogue} onChange={(e) => setDetailsDrogue(e.target.value)} className="border-brand-200" />
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="tension" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>Tension artérielle</Label>
                      <Input id="tension" placeholder="Ex: 12/8" value={tensionArterielle} onChange={(e) => setTensionArterielle(e.target.value)} className="border-brand-200" />
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
                    <Label htmlFor="autresChroniques" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>Autres maladies chroniques</Label>
                    <Textarea id="autresChroniques" placeholder="Précisez toute maladie chronique importante..." value={autresMaladiesChroniques} onChange={(e) => setAutresMaladiesChroniques(e.target.value)} className="border-brand-200" />
                  </div>

                  {chirurgiesAnterieures && (
                    <Textarea placeholder="Précisez les interventions précédentes..." value={chirurgiesDetails} onChange={(e) => setChirurgiesDetails(e.target.value)} className="border-brand-200" />
                  )}
                </div>
              )}

              {/* ── STEP 3 ──────────────────────────────────────── */}
              {currentStep === 3 && (
                <div className="space-y-5">
                  <div>
                    <Label className="mb-3 block text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                      Type(s) d'intervention souhaité(s) <span className="text-destructive">*</span>
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {INTERVENTIONS.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => toggleIntervention(item)}
                          className={cn(
                            'rounded-xl border px-3 py-2.5 text-sm text-left transition-all',
                            selectedInterventions.includes(item)
                              ? 'border-brand-950/30 bg-brand-950/5 text-brand-950 font-medium'
                              : 'border-brand-200/60 hover:bg-brand-100/30 text-foreground'
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
                    <Label htmlFor="desc" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                      Description de votre demande <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="desc"
                      rows={4}
                      placeholder="Décrivez en détail ce que vous souhaitez..."
                      {...step3Form.register('descriptionDemande')}
                      className="border-brand-200 focus-visible:ring-brand-950/20"
                    />
                    {step3Form.formState.errors.descriptionDemande && (
                      <p className="text-xs text-destructive">{step3Form.formState.errors.descriptionDemande.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="attentes" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                      Vos attentes <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="attentes"
                      rows={3}
                      placeholder="Quel résultat attendez-vous ?"
                      {...step3Form.register('attentes')}
                      className="border-brand-200 focus-visible:ring-brand-950/20"
                    />
                    {step3Form.formState.errors.attentes && (
                      <p className="text-xs text-destructive">{step3Form.formState.errors.attentes.message}</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── STEP 4 ──────────────────────────────────────── */}
              {currentStep === 4 && (
                <div className="space-y-6">
                  <input ref={photosInputRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? [])
                      if (!files.length) return
                      setUploadedPhotos((prev) => [...prev, ...files.map((f) => ({ url: URL.createObjectURL(f), name: f.name }))])
                      e.currentTarget.value = ''
                    }}
                  />
                  <input ref={docsInputRef} type="file" accept="application/pdf" multiple className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? [])
                      if (!files.length) return
                      setUploadedDocs((prev) => [...prev, ...files.map((f) => ({ url: URL.createObjectURL(f), name: f.name }))])
                      e.currentTarget.value = ''
                    }}
                  />

                  {[
                    {
                      label: 'Photos (face, profil, 3/4)',
                      hint: 'JPG, PNG — Max 10 MB par fichier',
                      files: uploadedPhotos,
                      setFiles: setUploadedPhotos,
                      ref: photosInputRef,
                    },
                    {
                      label: 'Documents médicaux (résultats, analyses, ordonnances)',
                      hint: 'PDF — Max 20 MB par fichier',
                      files: uploadedDocs,
                      setFiles: setUploadedDocs,
                      ref: docsInputRef,
                    },
                  ].map(({ label, hint, files, setFiles, ref }) => (
                    <div key={label}>
                      <Label className="mb-2 block text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                        {label}
                      </Label>
                      <div
                        className="rounded-xl p-5 sm:p-8 text-center cursor-pointer transition-all"
                        style={{
                          border: '2px dashed rgba(228,200,189,0.7)',
                          background: 'rgba(253,234,218,0.08)',
                        }}
                        onClick={() => ref.current?.click()}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#062a30'
                          e.currentTarget.style.background = 'rgba(6,42,48,0.04)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'rgba(228,200,189,0.7)'
                          e.currentTarget.style.background = 'rgba(253,234,218,0.08)'
                        }}
                      >
                        <Upload className="h-7 w-7 mx-auto mb-3" style={{ color: '#81572d' }} />
                        <p className="text-sm font-medium text-foreground">Cliquez pour ajouter</p>
                        <p className="text-xs mt-1" style={{ color: '#929292' }}>{hint}</p>
                      </div>
                      {files.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {files.map((f, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                              style={{ background: 'rgba(253,234,218,0.3)', border: '1px solid rgba(228,200,189,0.4)' }}
                            >
                              <span className="truncate text-foreground">{f.name}</span>
                              <button
                                onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                                className="text-muted-foreground hover:text-destructive ml-2 flex-shrink-0"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {step4Error && (
                    <div
                      className="rounded-xl p-3 text-xs flex items-center gap-2"
                      style={{ background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.2)', color: '#c0392b' }}
                    >
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                      {step4Error}
                    </div>
                  )}

                  <div
                    className="rounded-xl p-3 text-xs"
                    style={{ background: 'rgba(6,42,48,0.04)', border: '1px solid rgba(6,42,48,0.08)', color: '#062a30' }}
                  >
                    Vos documents sont chiffrés et accessibles uniquement par l'équipe médicale.
                  </div>
                </div>
              )}

              {/* ── STEP 5 — Confirmation ──────────────────────── */}
              {currentStep === 5 && (
                <div className="space-y-4">
                  <div
                    className="rounded-xl p-5"
                    style={{ background: 'rgba(6,42,48,0.04)', border: '1px solid rgba(6,42,48,0.1)' }}
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <CheckCircle2 className="h-4 w-4" style={{ color: '#81572d' }} />
                      <p className="text-sm font-semibold tracking-wide" style={{ color: '#062a30' }}>
                        Récapitulatif de votre dossier
                      </p>
                    </div>
                    <div className="space-y-3 text-sm">
                      {[
                        {
                          label: 'Interventions souhaitées',
                          value: selectedInterventions.length > 0 ? selectedInterventions.join(', ') : 'Non renseigné',
                        },
                        {
                          label: 'Antécédents',
                          value: antecedents.length > 0 ? `${antecedents.length} renseigné(s)` : 'Aucun',
                        },
                        { label: 'Photos uploadées', value: uploadedPhotos.length },
                        { label: 'Documents PDF', value: uploadedDocs.length },
                      ].map(({ label, value }) => (
                        <div
                          key={label}
                          className="flex justify-between items-center py-2"
                          style={{ borderBottom: '1px solid rgba(228,200,189,0.4)' }}
                        >
                          <span style={{ color: '#929292' }}>{label}</span>
                          <span className="font-medium text-right" style={{ color: '#282727' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    className="rounded-xl p-3 text-xs"
                    style={{ background: 'rgba(129,87,45,0.06)', border: '1px solid rgba(129,87,45,0.15)', color: '#81572d' }}
                  >
                    En soumettant ce formulaire, vous confirmez que les informations fournies sont exactes et complètes.
                  </div>

                  {!user && (
                    <div
                      className="rounded-xl p-3"
                      style={{ background: 'rgba(6,42,48,0.04)', border: '1px solid rgba(6,42,48,0.1)' }}
                    >
                      <label className="flex items-start gap-3 text-sm" style={{ color: '#282727' }}>
                        <Checkbox
                          checked={privacyAccepted}
                          onCheckedChange={(v) => {
                            const accepted = !!v
                            setPrivacyAccepted(accepted)
                            if (accepted) setPrivacyError('')
                          }}
                          className="mt-0.5"
                        />
                        <span>
                          J'accepte que mes données médicales soient traitées par l'équipe du Dr. Mehdi Chennoufi
                          dans le cadre de ma prise en charge.{' '}
                          <a
                            href="#"
                            onClick={(e) => e.preventDefault()}
                            className="underline"
                            style={{ color: '#81572d' }}
                          >
                            Politique de confidentialité
                          </a>
                        </span>
                      </label>
                      {privacyError && (
                        <p className="mt-2 text-xs text-destructive">{privacyError}</p>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-[0.12em] uppercase transition-all"
                    style={{
                      background: '#062a30',
                      color: '#fdeada',
                      border: 'none',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#0d3d45'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#062a30'
                    }}
                  >
                    Soumettre mon dossier médical
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Navigation ───────────────────────────────────── */}
          {currentStep < 5 && (
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-0 justify-between pb-2">
              <button
                type="button"
                onClick={handleBack}
                disabled={currentStep === 1}
                className="w-full sm:w-auto justify-center flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm transition-all disabled:opacity-40"
                style={{
                  background: 'rgba(255,255,255,0.85)',
                  border: '1px solid rgba(228,200,189,0.6)',
                  color: '#282727',
                }}
              >
                <ChevronLeft className="h-4 w-4" />
                Précédent
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="w-full sm:w-auto justify-center flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold tracking-wide transition-all"
                style={{
                  background: '#062a30',
                  color: '#fdeada',
                  border: 'none',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#0d3d45' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#062a30' }}
              >
                Suivant
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer
        className="py-3 text-center text-xs tracking-widest uppercase"
        style={{ background: '#062a30', color: 'rgba(253,234,218,0.35)' }}
      >
        © 2026 Dr. Mehdi Chennoufi — Chirurgien Esthétique
      </footer>
    </div>
  )
}
