import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'

type Props = {
  onRefresh: () => void | Promise<void>
  disabled?: boolean
  className?: string
  children: React.ReactNode
}

export function PullToRefresh({ onRefresh, disabled, className, children }: Props) {
  const { containerRef, pullDistance, refreshing, threshold } = usePullToRefresh({
    onRefresh,
    disabled,
  })
  const progress = Math.min(1, pullDistance / threshold)
  const show = pullDistance > 4 || refreshing

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center transition-[height,opacity] duration-150',
          show ? 'opacity-100' : 'opacity-0',
        )}
        style={{ height: refreshing ? 40 : Math.max(pullDistance, 0) }}
        aria-hidden
      >
        <div
          className={cn(
            'mt-1 flex h-8 w-8 items-center justify-center rounded-full border border-brand-200 bg-white shadow-sm',
            refreshing && 'animate-pulse',
          )}
          style={{
            transform: `scale(${0.75 + progress * 0.25}) rotate(${progress * 180}deg)`,
          }}
        >
          <Loader2
            className={cn(
              'h-4 w-4 text-brand-600',
              refreshing && 'animate-spin',
            )}
          />
        </div>
      </div>
      <div
        style={{
          transform: pullDistance || refreshing ? `translateY(${refreshing ? 40 : pullDistance * 0.35}px)` : undefined,
          transition: pullingTransition(pullDistance, refreshing),
        }}
      >
        {children}
      </div>
    </div>
  )
}

function pullingTransition(distance: number, refreshing: boolean) {
  if (refreshing) return 'transform 0.2s ease-out'
  if (distance === 0) return 'transform 0.2s ease-out'
  return 'none'
}
