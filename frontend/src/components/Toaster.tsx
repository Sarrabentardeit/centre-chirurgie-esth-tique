import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { useToastStore } from '@/store/toastStore'
import { cn } from '@/lib/utils'

const ICONS = {
  default: Info,
  success: CheckCircle2,
  error: AlertCircle,
}

const STYLES = {
  default: 'border-brand-200 bg-white text-brand-950',
  success: 'border-brand-200 bg-brand-50 text-brand-950',
  error: 'border-rose-200 bg-rose-50 text-rose-950',
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed z-[200] flex flex-col gap-2 pointer-events-none
        bottom-[calc(var(--bottom-nav-h)+var(--safe-bottom)+0.75rem)] right-3 left-3
        sm:left-auto sm:right-4 sm:bottom-6 sm:w-80 lg:bottom-6"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.variant]
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-xl border px-3.5 py-3 shadow-lg',
              'animate-toast-in',
              STYLES[t.variant],
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                t.variant === 'success' && 'bg-brand-100 text-brand-700 animate-success-pop',
                t.variant === 'error' && 'bg-rose-100 text-rose-700',
                t.variant === 'default' && 'bg-brand-100 text-brand-700',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-snug">{t.title}</p>
              {t.description && (
                <p className="text-xs opacity-80 mt-0.5 leading-relaxed">{t.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded-md p-0.5 opacity-50 hover:opacity-100 transition-opacity"
              aria-label="Fermer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
