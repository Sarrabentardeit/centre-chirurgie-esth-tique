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

const schema = z.object({
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(1, 'Le mot de passe est requis'),
})

type FormData = z.infer<typeof schema>

export default function PatientAccessPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { handleLogin, isLoading } = useAuth()
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setError(null)
    const result = await handleLogin(data.email, data.password, ['patient'])
    if (!result.success) {
      setError(result.error ?? 'Erreur de connexion.')
    }
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('/login-left.jpg')`,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/80 via-brand-800/60 to-brand-600/40" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="inline-flex w-fit items-center">
            <img
              src="/acces-patient-logo1-crop.png"
              alt="Dr. Mehdi Chennoufi - Chirurgie Esthétique"
              className="w-[280px] object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.42)]"
            />
          </div>

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

          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-white text-2xl font-bold">2 000+</p>
              <p className="text-white/60 text-xs mt-1">Patients accompagnés</p>
            </div>
            <div className="text-center">
              <p className="text-white text-2xl font-bold">98%</p>
              <p className="text-white/60 text-xs mt-1">Satisfaction</p>
            </div>
            <div className="text-center">
              <p className="text-white text-2xl font-bold">15 ans</p>
              <p className="text-white/60 text-xs mt-1">D'expérience</p>
            </div>
          </div>
        </div>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center p-6 lg:p-12 xl:p-16"
        style={{
          backgroundColor: '#f5ede3',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'%3E%3Cfilter id='b'%3E%3CfeGaussianBlur stdDeviation='2'/%3E%3C/filter%3E%3Cpath d='M0 80 Q220 60 380 130 Q580 200 780 150 Q950 100 1200 160' fill='none' stroke='%23d4a96a' stroke-width='1.5' opacity='0.45' filter='url(%23b)'/%3E%3Cpath d='M80 0 Q160 120 140 260 Q110 380 220 560 Q300 700 260 800' fill='none' stroke='%23c9906a' stroke-width='1.8' opacity='0.35' filter='url(%23b)'/%3E%3Cpath d='M1200 80 Q1000 160 880 260 Q720 370 560 340 Q380 310 220 400 Q100 460 0 430' fill='none' stroke='%23c8956b' stroke-width='1.2' opacity='0.3' filter='url(%23b)'/%3E%3Cpath d='M550 0 Q600 100 570 220 Q530 370 640 480 Q720 560 700 800' fill='none' stroke='%23d4a96a' stroke-width='1.4' opacity='0.38' filter='url(%23b)'/%3E%3C/svg%3E\")",
          backgroundSize: 'cover',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-[#282727]/18 via-[#062a30]/8 to-transparent" />
        <div className="absolute top-6 right-8 hidden lg:flex items-center gap-2 rounded-full border border-[#d9b9a7] bg-white/70 px-3 py-1.5 backdrop-blur-sm">
          <Heart className="h-3.5 w-3.5 text-[#81572d]" />
          <span className="text-[11px] uppercase tracking-[0.12em] text-[#282727]">Dr. Mehdi Chennoufi</span>
        </div>

        <div className="w-full max-w-[33rem]">
        <div className="relative overflow-hidden rounded-[2rem] border border-[#dcc1b0] bg-white/95 shadow-[0_35px_90px_rgba(40,39,39,0.22)] backdrop-blur-sm">
          <div className="absolute -top-20 -right-24 h-52 w-52 rounded-full bg-[#fdeada]/80 blur-2xl" />
          <div className="absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-[#062a30]/[0.08] blur-2xl" />
          <div className="h-2 w-full bg-gradient-to-r from-[#81572d] via-[#e4c8bd] to-[#062a30]" />
          <div className="relative p-8 lg:p-10">
          <div className="mb-8 relative">
            <div className="absolute -top-1 right-0 h-10 w-10 rounded-full border border-[#e4c8bd] bg-[#fdeada]/60 flex items-center justify-center shadow-sm">
              <Heart className="h-4 w-4 text-[#81572d]" />
            </div>
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[#81572d] mb-2">
              Accès sécurisé
            </p>
            <h1 className="text-[2rem] font-semibold text-[#282727] mb-2 leading-tight">Bienvenue</h1>
            <p className="max-w-sm text-[#7f7772] leading-relaxed">
              Connectez-vous à votre espace patiente.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#282727]">Adresse email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#929292]" />
                <Input
                  id="email"
                  type="email"
                  placeholder="votre@email.com"
                  className={cn('h-12 pl-9 border-[#ddc0ad] bg-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] focus-visible:ring-[#062a30]/25 focus-visible:border-[#062a30]/30 rounded-xl transition-all', errors.email && 'border-destructive focus-visible:ring-destructive')}
                  {...register('email')}
                />
              </div>
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#282727]">Mot de passe</Label>
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
                  className={cn('h-12 pl-9 pr-10 border-[#ddc0ad] bg-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] focus-visible:ring-[#062a30]/25 focus-visible:border-[#062a30]/30 rounded-xl transition-all', errors.password && 'border-destructive focus-visible:ring-destructive')}
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
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full h-12 gap-2 rounded-xl bg-gradient-to-r from-[#81572d] via-[#7a522a] to-[#6b4825] text-white shadow-[0_14px_30px_rgba(129,87,45,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:from-[#6f4b27] hover:to-[#5a3e20]" disabled={isLoading}>
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

          <div className="relative my-7">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#e4c8bd]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="rounded-full border border-[#ead6ca] bg-white px-3 py-1 text-[#8e8580]">Accès patient sécurisé</span>
            </div>
          </div>

          <div className="mb-5">
            <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-[#e4c8bd] bg-[#fffdfa] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
              <span className="flex h-11 items-center justify-center rounded-lg border border-[#ddbca9] bg-white px-1.5 text-center text-[10px] leading-tight font-medium text-[#282727]">
                Confidentialité médicale
              </span>
              <span className="flex h-11 items-center justify-center rounded-lg border border-[#ddbca9] bg-white px-1.5 text-center text-[10px] leading-tight font-medium text-[#282727]">
                Espace sécurisé
              </span>
              <span className="flex h-11 items-center justify-center rounded-lg border border-[#ddbca9] bg-white px-1.5 text-center text-[10px] leading-tight font-medium text-[#282727]">
                Accès réservé patient
              </span>
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-[#8d847f]">
            Première visite ?{' '}
            <button
              type="button"
              onClick={() => navigate('/formulaire')}
              className="font-medium text-[#81572d] hover:underline"
            >
              Compléter le formulaire
            </button>
          </p>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
