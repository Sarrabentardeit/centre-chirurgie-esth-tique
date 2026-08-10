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
  success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  error:   'border-rose-200 bg-rose-50 text-rose-950',
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed z-[200] flex flex-col gap-2 pointer-events-none
        bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 left-3
        sm:left-auto sm:right-4 sm:bottom-6 sm:w-80"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.variant]
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-xl border px-3.5 py-3 shadow-lg',
              'animate-in fade-in slide-in-from-bottom-2 duration-200',
              STYLES[t.variant],
            )}
          >
            <Icon className="h-4 w-4 shrink-0 mt-0.5 opacity-80" />
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
