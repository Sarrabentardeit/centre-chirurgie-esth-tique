import { useEffect } from 'react'
import { AlertCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ConfirmDialogProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  error?: string | null
  onConfirm: () => void | Promise<void>
  icon?: React.ReactNode
  children?: React.ReactNode
  confirmVariant?: 'destructive' | 'default'
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  loading = false,
  error = null,
  onConfirm,
  icon,
  children,
  confirmVariant = 'destructive',
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, loading, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => !loading && onClose()}
        aria-label="Fermer"
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-2">
          <div className="flex items-start gap-3 min-w-0">
            {icon && <div className="shrink-0 mt-0.5">{icon}</div>}
            <div className="min-w-0">
              <h2 id="confirm-dialog-title" className="font-semibold text-base text-slate-900 leading-snug">
                {title}
              </h2>
              {description && (
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{description}</p>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-slate-400"
            disabled={loading}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {children && <div className="px-5 pb-3">{children}</div>}

        {error && (
          <div className="mx-5 mb-3 flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/80 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            onClick={() => void onConfirm()}
            disabled={loading}
            className={cn(confirmVariant === 'destructive' && 'bg-destructive hover:bg-destructive/90')}
          >
            {loading ? 'Traitement…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
