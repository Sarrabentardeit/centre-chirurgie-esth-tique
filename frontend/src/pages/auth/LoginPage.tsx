import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Heart, Lock, Mail, ArrowRight } from 'lucide-react'
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

const DEMO_ACCOUNTS = [
  { role: 'Patient', email: 'patient@demo.com', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { role: 'Médecin', email: 'medecin@demo.com', color: 'bg-brand-50 border-brand-200 text-brand-700' },
  { role: 'Gestionnaire', email: 'gestionnaire@demo.com', color: 'bg-purple-50 border-purple-200 text-purple-700' },
]

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
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
    const result = await handleLogin(data.email, data.password)
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
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('/login-left.jpg')`,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/80 via-brand-800/60 to-brand-600/40" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30">
              <Heart className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-lg leading-none">Dr. Mehdi Chennoufi</p>
              <p className="text-white/70 text-sm">Chirurgie Esthétique</p>
            </div>
          </div>

          {/* Quote */}
          <div className="max-w-md">
            <blockquote className="text-white text-3xl font-light leading-relaxed mb-6">
              "La beauté commence au moment où vous décidez d'être vous-même."
            </blockquote>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-white/30" />
              <p className="text-white/70 text-sm">Votre parcours, simplifié</p>
              <div className="h-px flex-1 bg-white/30" />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6">
            {[
              { value: '2 000+', label: 'Patients accompagnés' },
              { value: '98%', label: 'Satisfaction' },
              { value: '15 ans', label: "D'expérience" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-white text-2xl font-bold">{stat.value}</p>
                <p className="text-white/60 text-xs mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center bg-white p-6 lg:p-12">
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

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-2">Bienvenue</h1>
            <p className="text-muted-foreground">
              Connectez-vous à votre espace personnel.
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Adresse email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="votre@email.com"
                  className={cn('pl-9', errors.email && 'border-destructive focus-visible:ring-destructive')}
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe</Label>
                <button type="button" className="text-xs text-brand-600 hover:underline">
                  Mot de passe oublié ?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className={cn('pl-9 pr-10', errors.password && 'border-destructive focus-visible:ring-destructive')}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="brand"
              size="lg"
              className="w-full gap-2"
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

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-muted-foreground">Comptes de démonstration</span>
            </div>
          </div>

          {/* Demo accounts */}
          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => fillDemo(account.email)}
                className={cn(
                  'w-full flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-medium transition-all hover:shadow-sm',
                  account.color
                )}
              >
                <span>{account.role}</span>
                <span className="font-normal opacity-75 text-xs">{account.email}</span>
              </button>
            ))}
            <p className="text-center text-xs text-muted-foreground mt-1">
              Mot de passe : <code className="bg-muted px-1 py-0.5 rounded text-foreground">demo1234</code>
            </p>
          </div>

          {/* Register link */}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Nouvelle patiente ?{' '}
            <button
              type="button"
              onClick={() => navigate('/inscription')}
              className="font-medium text-brand-600 hover:underline"
            >
              Créer votre dossier
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
