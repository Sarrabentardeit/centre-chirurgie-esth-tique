import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Lock, Mail, ArrowRight, ShieldCheck, Stethoscope, BriefcaseBusiness } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

const loginSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(1, 'Le mot de passe est requis'),
})

type LoginForm = z.infer<typeof loginSchema>

/** Boutons médecin / gestionnaire démo : visibles uniquement en développement (masqués au `vite build`). */
const SHOW_DEMO_QUICK_LOGIN = import.meta.env.DEV

const DEMO_ACCOUNTS = [
  {
    role: 'Médecin',
    email: 'medecin@demo.com',
    color: 'bg-[#0a3940] border-[#1b5c62] text-[#fdeada]',
    icon: Stethoscope,
  },
  {
    role: 'Gestionnaire',
    email: 'gestionnaire@demo.com',
    color: 'bg-[#f5ebe2] border-[#d9b9a7] text-[#282727]',
    icon: BriefcaseBusiness,
  },
]

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [showDemoPassword, setShowDemoPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { handleLogin, isLoading } = useAuth()
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    setError(null)
    const result = await handleLogin(data.email, data.password, ['medecin', 'gestionnaire'])
    if (!result.success) {
      setError(result.error ?? 'Erreur de connexion.')
    }
  }

  const fillDemo = (email: string) => {
    setValue('email', email)
    setValue('password', 'demo1234')
    setError(null)
  }

  return (
    <div className="min-h-screen bg-[#061a1f]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative overflow-hidden border-b border-[#1f3a3f] lg:border-b-0 lg:border-r">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(228,200,189,0.14),transparent_40%),radial-gradient(circle_at_80%_70%,rgba(129,87,45,0.2),transparent_45%)]" />
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(228,200,189,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(228,200,189,0.12) 1px, transparent 1px)', backgroundSize: '34px 34px' }} />
          <div className="relative z-10 flex h-full flex-col justify-between p-8 sm:p-10 lg:p-14">
            <div className="inline-flex w-fit items-center rounded-2xl border border-[#e4c8bd]/25 bg-[#0a3138]/70 px-4 py-3 backdrop-blur-sm">
              <img src="/acces-patient-logo1-crop.png" alt="Logo Dr. Mehdi Chennoufi" className="h-12 w-auto object-contain" />
            </div>

            <div className="max-w-xl py-10">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#e4c8bd]/35 bg-[#e4c8bd]/10 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[#fdeada]">
                <ShieldCheck className="h-3.5 w-3.5" />
                Backoffice sécurisé
              </p>
              <h1 className="text-3xl sm:text-4xl lg:text-[2.8rem] font-semibold leading-tight text-white">
                Pilotage clinique
                <span className="block text-[#e4c8bd]">haut de gamme</span>
              </h1>
              <p className="mt-5 max-w-lg text-[#cdb8ad] text-base leading-relaxed">
                Interface premium dédiée au médecin et au gestionnaire pour la gestion des dossiers,
                communications et décisions cliniques.
              </p>
            </div>

            <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: 'Dossiers traités', value: '148', tone: 'bg-[#0e3a40]' },
                { label: 'Alertes critiques', value: '03', tone: 'bg-[#573922]' },
                { label: 'Temps moyen', value: '11m', tone: 'bg-[#243236]' },
              ].map((item) => (
                <div key={item.label} className={`rounded-xl border border-[#e4c8bd]/20 ${item.tone} px-3 py-2.5`}>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-[#d9b9a7]">{item.label}</p>
                  <p className="text-xl font-semibold text-white mt-1">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              {[
                { value: '24/7', label: 'Disponibilité' },
                { value: '256-bit', label: 'Chiffrement' },
                { value: 'Premium', label: 'Expérience' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-[#e4c8bd]/20 bg-[#0b2c32]/80 px-3 py-3 text-center">
                  <p className="text-white text-xl sm:text-2xl font-semibold">{stat.value}</p>
                  <p className="text-[#d9b9a7] text-[11px] mt-1 uppercase tracking-[0.08em]">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative flex items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: '#f7f7f7',
              backgroundImage: "linear-gradient(rgba(253,234,218,0.8), rgba(253,234,218,0.8)), radial-gradient(circle at 20% 30%, rgba(129,87,45,0.15), transparent 35%), radial-gradient(circle at 80% 70%, rgba(6,42,48,0.1), transparent 30%)",
              backgroundSize: 'cover',
            }}
          />
          <div className="relative w-full max-w-[29rem] overflow-hidden rounded-[1.8rem] border border-[#dcc1b0] bg-white/95 shadow-[0_32px_72px_rgba(40,39,39,0.2)] backdrop-blur-sm">
            <div className="h-1.5 w-full bg-gradient-to-r from-[#062a30] via-[#81572d] to-[#e4c8bd]" />
            <div className="p-7 sm:p-8">
              <div className="mb-7">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#81572d]">Connexion backoffice</p>
                <h2 className="text-3xl font-semibold text-[#282727] mb-2">Bienvenue</h2>
                <p className="text-[#7f7772]">
                  Connexion réservée au médecin et au gestionnaire.
                </p>
              </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[11px] uppercase tracking-[0.1em] text-[#282727]">Adresse email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#929292]" />
                <Input
                  id="email"
                  type="email"
                  placeholder="votre@email.com"
                  className={cn('h-12 rounded-xl border-[#ddc0ad] bg-white/90 pl-9 focus-visible:ring-[#062a30]/25 focus-visible:border-[#062a30]/30', errors.email && 'border-destructive focus-visible:ring-destructive')}
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-[11px] uppercase tracking-[0.1em] text-[#282727]">Mot de passe</Label>
                <button type="button" className="text-xs text-[#81572d] hover:underline">
                  Mot de passe oublié ?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#929292]" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className={cn('h-12 rounded-xl border-[#ddc0ad] bg-white/90 pl-9 pr-10 focus-visible:ring-[#062a30]/25 focus-visible:border-[#062a30]/30', errors.password && 'border-destructive focus-visible:ring-destructive')}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#929292] hover:text-[#282727]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive space-y-1">
                <p>{error}</p>
                {error.toLowerCase().includes('patient') && (
                  <p className="text-xs">
                    <button
                      type="button"
                      onClick={() => navigate('/acces-patient')}
                      className="font-semibold underline text-[#81572d]"
                    >
                      → Aller à l'espace patient
                    </button>
                  </p>
                )}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full h-12 gap-2 rounded-xl bg-gradient-to-r from-[#062a30] via-[#0c3f47] to-[#0f4f59] text-white shadow-[0_12px_28px_rgba(6,42,48,0.35)] hover:from-[#0b3b43] hover:to-[#125664]"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Connexion...
                </span>
              ) : (
                <>
                  Se connecter
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          {SHOW_DEMO_QUICK_LOGIN && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#e4c8bd]" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="rounded-full border border-[#ead6ca] bg-white px-3 py-1 text-[#8e8580]">Accès rapide démo</span>
                </div>
              </div>

              <div className="space-y-2.5">
                {DEMO_ACCOUNTS.map((account) => {
                  const RoleIcon = account.icon
                  return (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => fillDemo(account.email)}
                    className={cn(
                      'w-full flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-all hover:shadow-md',
                      account.color
                    )}
                  >
                    <span className="inline-flex items-center gap-2">
                      <RoleIcon className="h-4 w-4" />
                      {account.role}
                    </span>
                    <span className="font-normal opacity-75 text-xs">{account.email}</span>
                  </button>
                )})}
                <div className="rounded-lg border border-[#e7d8ce] bg-[#fcf8f5] px-3 py-2 text-center text-xs text-[#8d847f]">
                  Mot de passe démo :{' '}
                  <button
                    type="button"
                    onClick={() => setShowDemoPassword((v) => !v)}
                    className="font-medium text-[#81572d] hover:underline"
                  >
                    {showDemoPassword ? 'Masquer' : 'Voir le mot de passe'}
                  </button>
                  {showDemoPassword && (
                    <code className="ml-2 rounded bg-[#f3ece6] px-1 py-0.5 text-[#282727]">demo1234</code>
                  )}
                </div>
              </div>
            </>
          )}

          <p className="mt-6 text-center text-sm text-[#8d847f]">
            Pour les patientes, accès direct au formulaire:{' '}
            <button
              type="button"
              onClick={() => navigate('/formulaire')}
              className="font-medium text-[#81572d] hover:underline"
            >
              Compléter le formulaire
            </button>
            {' '}•{' '}
            <button
              type="button"
              onClick={() => navigate('/acces-patient')}
              className="font-medium text-[#81572d] hover:underline"
            >
              Accéder à mon compte patiente
            </button>
          </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
