import { cn } from '@/lib/utils'

/** Skeleton aux couleurs charte (crème / bronze soft), pas gris générique. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-md bg-gradient-to-r from-brand-100 via-brand-200/70 to-brand-100',
        'bg-[length:200%_100%] animate-brand-shimmer',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
