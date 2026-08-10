import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in', className)}>
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-2xl bg-brand-100/80 blur-xl scale-110" aria-hidden />
        <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 border border-brand-200/80 flex items-center justify-center shadow-sm">
          <Icon className="h-7 w-7 text-brand-600" strokeWidth={1.5} />
        </div>
      </div>
      <p className="font-display text-lg font-semibold text-brand-950 tracking-tight">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground mt-1.5 max-w-sm leading-relaxed">{description}</p>
      )}
      {(actionLabel || secondaryLabel) && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
          {actionLabel && onAction && (
            <Button variant="brand" size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryLabel && onSecondary && (
            <Button variant="outline" size="sm" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
