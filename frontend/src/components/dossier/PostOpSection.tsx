import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  note?: ReactNode
  tone?: 'default' | 'internal'
  id?: string
  className?: string
  children: ReactNode
}

export function PostOpSection({ title, note, tone = 'default', id, className, children }: Props) {
  const internal = tone === 'internal'
  return (
    <section
      id={id}
      className={cn('py-5 first:pt-0', internal && '-mx-1 rounded-lg bg-amber-50/80 px-4', className)}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {note && <div className="shrink-0 text-xs text-muted-foreground">{note}</div>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
