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

type KpiItem = {
  key: string
  label: string
  value: number | string
  active?: boolean
  onClick?: () => void
  tone?: 'default' | 'amber' | 'brand' | 'emerald' | 'rose' | 'teal'
}

const KPI_TONE: Record<NonNullable<KpiItem['tone']>, string> = {
  default: 'bg-white border-border',
  amber:   'bg-amber-50/80 border-amber-200/80',
  brand:   'bg-brand-50/80 border-brand-200/80',
  emerald: 'bg-emerald-50/80 border-emerald-200/80',
  rose:    'bg-rose-50/80 border-rose-200/80',
  teal:    'bg-[rgba(6,42,48,0.04)] border-[rgba(6,42,48,0.12)]',
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
        return (
          <Comp
            key={item.key}
            type={item.onClick ? 'button' : undefined}
            onClick={item.onClick}
            className={cn(
              'shrink-0 min-w-[5.5rem] rounded-xl border px-3 py-2.5 text-left transition-all',
              KPI_TONE[item.tone ?? 'default'],
              item.onClick && 'hover:shadow-sm hover:border-brand-300 cursor-pointer',
              item.active && 'ring-2 ring-brand-500/40 border-brand-300 shadow-sm',
            )}
          >
            <p className="text-lg font-bold text-brand-950 leading-none tabular-nums">{item.value}</p>
            <p className="text-[10px] font-medium text-muted-foreground mt-1 whitespace-nowrap">{item.label}</p>
          </Comp>
        )
      })}
    </div>
  )
}
