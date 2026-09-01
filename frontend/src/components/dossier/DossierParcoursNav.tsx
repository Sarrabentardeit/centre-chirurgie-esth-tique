import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DossierParcoursStep = {
  key: string
  label: string
  done: boolean
  current: boolean
}

export type DossierAnchor = {
  id: string
  label: string
  badge?: string
  hidden?: boolean
  highlight?: boolean
}

type DossierParcoursNavProps = {
  steps: DossierParcoursStep[]
  anchors: DossierAnchor[]
  onAnchorClick: (sectionId: string) => void
}

export function DossierParcoursNav({ steps, anchors, onAnchorClick }: DossierParcoursNavProps) {
  const visibleAnchors = anchors.filter((a) => !a.hidden)

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      <div className="px-4 sm:px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
          Parcours du dossier
        </p>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {steps.map((step, index) => (
            <div key={step.key} className="flex items-center gap-1.5 sm:gap-2">
              <div
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-semibold border',
                  step.current
                    ? 'bg-brand-100 text-brand-900 border-brand-200'
                    : step.done
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-slate-50 text-slate-500 border-slate-200',
                )}
              >
                {step.done && !step.current ? (
                  <Check className="h-3 w-3 shrink-0" />
                ) : (
                  <span className="h-4 w-4 rounded-full bg-white/80 border border-current flex items-center justify-center text-[9px] shrink-0">
                    {index + 1}
                  </span>
                )}
                {step.label}
              </div>
              {index < steps.length - 1 && (
                <span className="text-slate-300 hidden sm:inline" aria-hidden>
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="px-3 sm:px-4 py-3 flex flex-wrap gap-2">
        {visibleAnchors.map((anchor) => (
          <button
            key={anchor.id}
            type="button"
            onClick={() => onAnchorClick(anchor.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs sm:text-sm font-semibold transition-colors min-h-[40px]',
              anchor.highlight
                ? 'border-brand-300 bg-brand-50 text-brand-900 animate-pulse'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300',
            )}
          >
            {anchor.label}
            {anchor.badge && (
              <span className="text-[10px] font-bold rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5">
                {anchor.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
