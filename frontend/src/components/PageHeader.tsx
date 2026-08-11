import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PageHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

/** En-tête unifié des pages métier : titre display + une phrase + actions. */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3 flex-wrap', className)}>
      <div className="min-w-0">
        <h1 className="font-display text-2xl sm:text-[1.65rem] font-semibold text-brand-950 tracking-tight leading-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 max-w-xl leading-relaxed">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
    </div>
  )
}

type KpiTone = 'default' | 'amber' | 'sky' | 'emerald' | 'rose' | 'slate' | 'brand' | 'teal' | 'violet'

type KpiItem = {
  key: string
  label: string
  value: number | string
  active?: boolean
  onClick?: () => void
  tone?: KpiTone
}

/** Tons plus saturés et distincts — chiffre + libellé colorés pour être indicatifs. */
const KPI_TONE: Record<KpiTone, { card: string; value: string; label: string; active: string }> = {
  default: {
    card: 'bg-slate-50 border-slate-300',
    value: 'text-slate-900',
    label: 'text-slate-600',
    active: 'ring-2 ring-slate-400/55 border-slate-500 shadow-sm',
  },
  amber: {
    card: 'bg-amber-100 border-amber-400',
    value: 'text-amber-950',
    label: 'text-amber-800',
    active: 'ring-2 ring-amber-500/55 border-amber-500 shadow-sm',
  },
  sky: {
    card: 'bg-sky-100 border-sky-400',
    value: 'text-sky-950',
    label: 'text-sky-800',
    active: 'ring-2 ring-sky-500/55 border-sky-500 shadow-sm',
  },
  emerald: {
    card: 'bg-emerald-100 border-emerald-400',
    value: 'text-emerald-950',
    label: 'text-emerald-800',
    active: 'ring-2 ring-emerald-500/55 border-emerald-500 shadow-sm',
  },
  rose: {
    card: 'bg-rose-100 border-rose-400',
    value: 'text-rose-950',
    label: 'text-rose-800',
    active: 'ring-2 ring-rose-500/55 border-rose-500 shadow-sm',
  },
  slate: {
    card: 'bg-zinc-100 border-zinc-400',
    value: 'text-zinc-900',
    label: 'text-zinc-600',
    active: 'ring-2 ring-zinc-400/55 border-zinc-500 shadow-sm',
  },
  brand: {
    card: 'bg-[#f8e4d0] border-[#c4894a]',
    value: 'text-[#4a2f14]',
    label: 'text-[#8b5e34]',
    active: 'ring-2 ring-[#c4894a]/55 border-[#a66d35] shadow-sm',
  },
  teal: {
    card: 'bg-teal-100 border-teal-500',
    value: 'text-teal-950',
    label: 'text-teal-800',
    active: 'ring-2 ring-teal-500/55 border-teal-600 shadow-sm',
  },
  violet: {
    card: 'bg-violet-100 border-violet-400',
    value: 'text-violet-950',
    label: 'text-violet-800',
    active: 'ring-2 ring-violet-500/55 border-violet-500 shadow-sm',
  },
}

/** Bande KPI compacte — une seule rangée scrollable sur mobile. */
export function KpiStrip({ items, className }: { items: KpiItem[]; className?: string }) {
  return (
    <div
      className={cn(
        'flex gap-2 overflow-x-auto scrollbar-none pb-0.5 -mx-0.5 px-0.5',
        className,
      )}
    >
      {items.map((item) => {
        const Comp = item.onClick ? 'button' : 'div'
        const tone = KPI_TONE[item.tone ?? 'default']
        return (
          <Comp
            key={item.key}
            type={item.onClick ? 'button' : undefined}
            onClick={item.onClick}
            className={cn(
              'shrink-0 min-w-[5.5rem] rounded-xl border-2 px-3 py-2.5 text-left transition-all',
              tone.card,
              item.onClick && 'hover:shadow-sm cursor-pointer',
              item.active && tone.active,
            )}
          >
            <p className={cn('text-lg font-bold leading-none tabular-nums', tone.value)}>{item.value}</p>
            <p className={cn('text-[10px] font-semibold mt-1 whitespace-nowrap', tone.label)}>{item.label}</p>
          </Comp>
        )
      })}
    </div>
  )
}
