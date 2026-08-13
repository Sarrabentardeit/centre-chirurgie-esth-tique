import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
  /** z-index layer */
  zIndexClass?: string
}

/**
 * Bottom sheet mobile — swipe down on handle/header to dismiss.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  className,
  zIndexClass = 'z-[80]',
}: Props) {
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const startY = useRef(0)
  const dragY = useRef(0)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!open) {
      setOffset(0)
      setDragging(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0]?.clientY ?? 0
    dragY.current = 0
    setDragging(true)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging) return
    const y = e.touches[0]?.clientY ?? 0
    const delta = Math.max(0, y - startY.current)
    dragY.current = delta
    setOffset(delta)
  }

  const onTouchEnd = () => {
    setDragging(false)
    if (dragY.current > 88) {
      onClose()
      setOffset(0)
      return
    }
    setOffset(0)
  }

  return (
    <div className={cn('fixed inset-0 lg:hidden', zIndexClass)} role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 transition-opacity"
        style={{ opacity: Math.max(0.15, 1 - offset / 240) }}
        aria-label="Fermer"
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'absolute inset-x-0 bottom-0 rounded-t-2xl border border-brand-200 bg-white shadow-2xl',
          'pb-safe',
          className,
        )}
        style={{
          transform: `translateY(${offset}px)`,
          transition: dragging ? 'none' : 'transform 0.22s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="touch-none px-2 pt-2"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-brand-200" />
          {title && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-brand-600/80">
              {title}
            </p>
          )}
        </div>
        <div className="px-2 pb-2">{children}</div>
      </div>
    </div>
  )
}
