import { cn } from '@/lib/utils'

type Props = {
  count: number
  className?: string
  /** Compact = bottom nav */
  size?: 'sm' | 'md'
}

/** Badge non-lu avec apparition / changement animés. */
export function UnreadBadge({ count, className, size = 'md' }: Props) {
  if (count <= 0) return null
  const label = count > 9 ? '9+' : String(count)

  return (
    <span
      key={label}
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-red-500 font-bold leading-none text-white animate-badge-pop',
        size === 'sm'
          ? 'h-3.5 min-w-3.5 px-1 text-[8px] ring-[1.5px] ring-white'
          : 'h-5 min-w-5 px-1.5 text-xs border-0',
        className,
      )}
    >
      {label}
    </span>
  )
}
