import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Eye, EyeOff, Heart, User as UserIcon, Mail, Phone, Lock,
  ArrowRight, CheckCircle2, Instagram, MessageCircle, Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { authApi } from '@/lib/api'
import type { User } from '@/types'

const inscriptionSchema = z.object({
  prenom: z.string().min(2, 'Prénom requis (min. 2 caractères)'),
  nom: z.string().min(2, 'Nom requis (min. 2 caractères)'),
  email: z.string().email('Adresse email invalide'),
  phone: z.string().min(8, 'Numéro de téléphone invalide'),
  password: z.string().min(8, 'Mot de passe : minimum 8 caractères'),
  confirmPassword: z.string(),
  source: z.enum(['instagram', 'whatsapp', 'google', 'direct'], {
    errorMap: () => ({ message: 'Veuillez sélectionner une source' }),
  }),
  consentement: z.literal(true, {
    errorMap: () => ({ message: 'Vous devez accepter les conditions' }),
  }),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword'],
})

type InscriptionForm = z.infer<typeof inscriptionSchema>

const SOURCES = [
  { key: 'instagram', label: 'Instagram', icon: Instagram, color: 'border-pink-300 bg-pink-50 text-pink-700' },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  { key: 'google', label: 'Google', icon: Search, color: 'border-blue-300 bg-blue-50 text-blue-700' },
  { key: 'direct', label: 'Recommandation', icon: UserIcon, color: 'border-purple-300 bg-purple-50 text-purple-700' },
] as const

const STEPS = [
  { id: 1, label: 'Identité' },
  { id: 2, label: 'Contact & Mot de passe' },
  { id: 3, label: 'Confirmation' },
]

export default function InscriptionPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sourceParam = searchParams.get('source') as InscriptionForm['source'] | null
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const { login } = useAuthStore()

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    setValue,
    formState: { errors },
  } = useForm<InscriptionForm>({
    resolver: zodResolver(inscriptionSchema),
    defaultValues: {
      source: sourceParam ?? undefined,
    },
  })

  const selectedSource = watch('source')
  const consentement = watch('consentement')

  const handleNext = async () => {
    const fields: Array<keyof InscriptionForm> =
      step === 1 ? ['prenom', 'nom', 'source'] : ['email', 'phone', 'password', 'confirmPassword']
    const valid = await trigger(fields)
    if (valid) setStep((s) => s + 1)
  }

  const onSubmit = async (data: InscriptionForm) => {
    setSubmitError(null)
    setIsLoading(true)
    try {
      const result = await authApi.register({
        email: data.email,
        password: data.password,
        fullName: `${data.prenom} ${data.nom}`,
        phone: data.phone,
      })
      const user: User = {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: 'patient',
      }
      login(user, result.accessToken, result.refreshToken)
      setIsLoading(false)
      setDone(true)
      setTimeout(() => navigate('/patient/formulaire'), 2500)
    } catch (err) {
      setIsLoading(false)
      setSubmitError(err instanceof Error ? err.message : 'Impossible de créer le compte.')
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-white p-6">
        <div className="text-center max-w-sm animate-fade-in">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 mx-auto mb-6">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">Compte créé !</h2>
          <p className="text-muted-foreground mb-2">
            Bienvenue sur votre espace patient. Vous allez être redirigé vers votre formulaire médical.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-brand-600">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Redirection en cours...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-2/5 relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1629909613654-28e377c37b09?q=80&w=2668&auto=format&fit=crop')`,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/85 via-brand-800/70 to-brand-600/50" />
        <div className="relative z-10 flex flex-col justify-between p-10 w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm border border-white/30">
              <Heart className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-white font-bold leading-none">Dr. Mehdi Chennoufi</p>
              <p className="text-white/70 text-xs">Chirurgie Esthétique</p>
            </div>
          </div>

          {/* Steps preview */}
          <div className="space-y-4">
            <p className="text-white/80 text-sm font-medium uppercase tracking-wide mb-6">
              Votre parcours en 4 étapes
            </p>
            {[
              { num: '01', label: 'Créez votre compte', desc: 'Simple et rapide' },
              { num: '02', label: 'Remplissez votre dossier médical', desc: 'Informations & photos' },
              { num: '03', label: 'Recevez votre devis personnalisé', desc: 'Sous 48-72h' },
              { num: '04', label: 'Planifiez votre intervention', desc: 'À votre convenance' },
            ].map((s, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 border border-white/30">
                  <span className="text-white text-xs font-bold">{s.num}</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{s.label}</p>
                  <p className="text-white/60 text-xs">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Reassurance */}
          <div className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 p-4">
            <p className="text-white text-sm font-semibold mb-1">🔒 Confidentialité garantie</p>
            <p className="text-white/70 text-xs">
              Vos données médicales sont chiffrées et accessibles uniquement par l'équipe du Dr. Mehdi Chennoufi.
            </p>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center bg-white p-6 lg:p-12 overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600">
              <Heart className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-foreground">Dr. Mehdi Chennoufi</p>
              <p className="text-xs text-muted-foreground">Chirurgie Esthétique</p>
            </div>
          </div>

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground mb-1">Créer votre dossier</h1>
            <p className="text-muted-foreground text-sm">
              Rejoignez l'espace patient du Dr. Mehdi Chennoufi
            </p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-8">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <div className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all',
                  s.id < step ? 'bg-emerald-500 text-white' :
                  s.id === step ? 'bg-brand-600 text-white' :
                  'bg-muted text-muted-foreground'
                )}>
                  {s.id < step ? <CheckCircle2 className="h-4 w-4" /> : s.id}
                </div>
                <span className={cn(
                  'text-xs font-medium hidden sm:block',
                  s.id === step ? 'text-brand-700' : 'text-muted-foreground'
                )}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={cn(
                    'h-px w-8 sm:w-12 transition-all',
                    s.id < step ? 'bg-emerald-300' : 'bg-border'
                  )} />
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>
            {submitError && (
              <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {submitError}
              </div>
            )}
            {/* STEP 1 — Identité */}
            {step === 1 && (
              <div className="space-y-4 animate-fade-in">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="prenom">Prénom <span className="text-destructive">*</span></Label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="prenom"
                        placeholder="Amira"
                        className={cn('pl-9', errors.prenom && 'border-destructive')}
                        {...register('prenom')}
                      />
                    </div>
                    {errors.prenom && <p className="text-xs text-destructive">{errors.prenom.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nom">Nom <span className="text-destructive">*</span></Label>
                    <Input
                      id="nom"
                      placeholder="Benali"
                      className={cn(errors.nom && 'border-destructive')}
                      {...register('nom')}
                    />
                    {errors.nom && <p className="text-xs text-destructive">{errors.nom.message}</p>}
                  </div>
                </div>

                {/* Source */}
                <div className="space-y-2">
                  <Label>Comment nous avez-vous connu ? <span className="text-destructive">*</span></Label>
                  <div className="grid grid-cols-2 gap-2">
                    {SOURCES.map(({ key, label, icon: Icon, color }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setValue('source', key, { shouldValidate: true })}
                        className={cn(
                          'flex items-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-medium transition-all text-left',
                          selectedSource === key
                            ? color + ' border-current'
                            : 'border-border text-muted-foreground hover:bg-muted/50'
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {label}
                        {selectedSource === key && (
                          <CheckCircle2 className="h-3.5 w-3.5 ml-auto shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                  {errors.source && (
                    <p className="text-xs text-destructive">{errors.source.message}</p>
                  )}
                </div>

                <Button type="button" variant="brand" size="lg" className="w-full mt-2" onClick={handleNext}>
                  Continuer <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}

            {/* STEP 2 — Contact & MDP */}
            {step === 2 && (
              <div className="space-y-4 animate-fade-in">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Adresse email <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="votre@email.com"
                      className={cn('pl-9', errors.email && 'border-destructive')}
                      {...register('email')}
                    />
                  </div>
                  {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone">Téléphone (WhatsApp de préférence) <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+213 555 123 456"
                      className={cn('pl-9', errors.phone && 'border-destructive')}
                      {...register('phone')}
                    />
                  </div>
                  {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Mot de passe <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min. 8 caractères"
                      className={cn('pl-9 pr-10', errors.password && 'border-destructive')}
                      {...register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirmer le mot de passe <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="Répéter le mot de passe"
                      className={cn('pl-9 pr-10', errors.confirmPassword && 'border-destructive')}
                      {...register('confirmPassword')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
                  )}
                </div>

                <div className="flex gap-3 mt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
                    Retour
                  </Button>
                  <Button type="button" variant="brand" className="flex-1" onClick={handleNext}>
                    Continuer <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3 — Confirmation */}
            {step === 3 && (
              <div className="space-y-5 animate-fade-in">
                {/* Summary */}
                <div className="rounded-xl bg-slate-50 border border-border p-4 space-y-2 text-sm">
                  <p className="font-semibold text-foreground mb-3">Récapitulatif</p>
                  {[
                    ['Nom complet', `${watch('prenom')} ${watch('nom')}`],
                    ['Email', watch('email')],
                    ['Téléphone', watch('phone')],
                    ['Source', SOURCES.find((s) => s.key === watch('source'))?.label ?? ''],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between items-center">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium text-right">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Consentement */}
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    {...register('consentement')}
                  />
                  <span className="text-sm text-muted-foreground leading-relaxed">
                    J'accepte que mes données médicales soient traitées par l'équipe du Dr. Mehdi Chennoufi
                    dans le cadre de ma prise en charge.{' '}
                    <a href="#" className="text-brand-600 underline">Politique de confidentialité</a>
                  </span>
                </label>
                {errors.consentement && (
                  <p className="text-xs text-destructive -mt-3">{errors.consentement.message}</p>
                )}

                <div className="rounded-lg bg-brand-50 border border-brand-200 p-3 text-xs text-brand-700">
                  <p className="font-semibold mb-1">Prochaine étape</p>
                  <p>Après la création de votre compte, vous serez redirigé vers votre formulaire médical.</p>
                </div>

                <div className="flex gap-3">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(2)}>
                    Retour
                  </Button>
                  <Button
                    type="submit"
                    variant="brand"
                    size="lg"
                    className="flex-1 gap-2"
                    disabled={isLoading || !consentement}
                  >
                    {isLoading ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Création...
                      </>
                    ) : (
                      <>
                        Créer mon compte
                        <CheckCircle2 className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Déjà un compte ?{' '}
            <button
              onClick={() => navigate('/acces-patient')}
              className="font-medium text-brand-600 hover:underline"
            >
              Se connecter
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
