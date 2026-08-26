import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import {
  DIAGNOSTIC_CATEGORIES,
  DIAGNOSTIC_OPERATIONS,
  composeDiagnosticTemplates,
  inferSelectedOperationIds,
  interventionLabelsFromIds,
  operationsForCategory,
  type DiagnosticCategoryKey,
} from '@/lib/diagnosticTemplates'
import { cn } from '@/lib/utils'

type DiagnosticPickerProps = {
  diagnostic: string
  onDiagnosticChange: (value: string) => void
  interventions: string
  onInterventionsChange: (value: string) => void
  disabled?: boolean
  /** Change when the rapport source changes (nouveau / autre version). */
  resetKey?: string
}

export function DiagnosticPicker({
  diagnostic,
  onDiagnosticChange,
  interventions,
  onInterventionsChange,
  disabled = false,
  resetKey,
}: DiagnosticPickerProps) {
  const [category, setCategory] = useState<DiagnosticCategoryKey>('mammaire')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [pendingIds, setPendingIds] = useState<string[] | null>(null)
  const lastAppliedRef = useRef('')

  const ops = useMemo(() => operationsForCategory(category), [category])
  const selectedOps = selectedIds
    .map((id) => DIAGNOSTIC_OPERATIONS.find((op) => op.id === id))
    .filter((op): op is NonNullable<typeof op> => Boolean(op))
  const selectedInCategory = selectedOps.filter((op) => op.category === category)
  const otherCategoryCounts = DIAGNOSTIC_CATEGORIES
    .filter((cat) => cat.key !== category)
    .map((cat) => ({
      key: cat.key,
      shortTitle: cat.shortTitle,
      count: selectedOps.filter((op) => op.category === cat.key).length,
    }))
    .filter((row) => row.count > 0)

  const syncFromDiagnostic = (text: string, fallbackCategory = false) => {
    const inferred = inferSelectedOperationIds(text)
    setSelectedIds(inferred)
    const composed = composeDiagnosticTemplates(inferred)
    lastAppliedRef.current = composed
    if (inferred[0]) {
      const op = DIAGNOSTIC_OPERATIONS.find((item) => item.id === inferred[0])
      if (op) setCategory(op.category)
    } else if (fallbackCategory) {
      setCategory('mammaire')
    }
    if (!disabled && inferred.length > 0) {
      const legacy = inferred
        .map((id) => DIAGNOSTIC_OPERATIONS.find((item) => item.id === id)?.template ?? '')
        .filter(Boolean)
        .join('\n\n')
      if (text.trim() === legacy.trim() && composed.trim() !== text.trim()) {
        onDiagnosticChange(composed)
      }
    }
  }

  useEffect(() => {
    syncFromDiagnostic(diagnostic, true)
    // Infer only when the rapport (or empty form) changes — not on each keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  useEffect(() => {
    if (selectedIds.length > 0) return
    const inferred = inferSelectedOperationIds(diagnostic)
    if (inferred.length === 0) return
    syncFromDiagnostic(diagnostic)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnostic])

  const isPristine = () => {
    const composed = composeDiagnosticTemplates(selectedIds)
    const current = diagnostic.trim()
    return !current || current === lastAppliedRef.current.trim() || current === composed.trim()
  }

  const applySelection = (nextIds: string[]) => {
    const composed = composeDiagnosticTemplates(nextIds)
    lastAppliedRef.current = composed
    setSelectedIds(nextIds)
    onDiagnosticChange(composed)

    const labels = interventionLabelsFromIds(nextIds)
    const previousLabels = interventionLabelsFromIds(selectedIds)
    const currentLines = interventions
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const previousSet = new Set(previousLabels)
    const keptCustom = currentLines.filter((line) => !previousSet.has(line))
    const nextLines = [...labels]
    for (const extra of keptCustom) {
      if (!nextLines.includes(extra)) nextLines.push(extra)
    }
    onInterventionsChange(nextLines.join('\n'))
  }

  const requestSelection = (nextIds: string[]) => {
    if (disabled) return
    if (isPristine()) {
      applySelection(nextIds)
      return
    }
    setPendingIds(nextIds)
  }

  const toggleOperation = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]
    requestSelection(next)
  }

  return (
    <div className={cn('space-y-3 min-w-0 max-w-full', disabled && 'pointer-events-none opacity-80')}>
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-0.5 px-0.5 pb-0.5">
        {DIAGNOSTIC_CATEGORIES.map((cat) => {
          const active = category === cat.key
          const count = selectedOps.filter((op) => op.category === cat.key).length
          return (
            <button
              key={cat.key}
              type="button"
              disabled={disabled}
              onClick={() => setCategory(cat.key)}
              className={cn(
                'shrink-0 rounded-full px-3.5 py-2 text-[13px] font-medium transition-all border',
                active
                  ? 'bg-[#062a30] text-white border-[#062a30] shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-[#062a30]/30 hover:bg-slate-50',
              )}
            >
              <span className="sm:hidden">{cat.shortTitle}</span>
              <span className="hidden sm:inline">{cat.title}</span>
              {count > 0 && (
                <span className={cn('ml-1.5 tabular-nums', active ? 'text-white/80' : 'text-slate-400')}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4 space-y-3 min-w-0">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#062a30]">
            {DIAGNOSTIC_CATEGORIES.find((c) => c.key === category)?.title}
          </p>
          <span className="text-[11px] text-muted-foreground">
            {selectedInCategory.length} sélectionnée{selectedInCategory.length > 1 ? 's' : ''}
          </span>
          {ops.length > 0 && (
            <span className="text-[11px] text-slate-400 sm:ml-auto">
              Le diagnostic reste modifiable
            </span>
          )}
        </div>

        {otherCategoryCounts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {otherCategoryCounts.map((row) => (
              <button
                key={row.key}
                type="button"
                disabled={disabled}
                onClick={() => setCategory(row.key)}
                className="text-[11px] text-[#81572d] underline-offset-2 hover:underline"
              >
                Aussi {row.shortTitle} ({row.count})
              </button>
            ))}
          </div>
        )}

        {ops.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-6 text-center">
            <p className="text-sm text-slate-500">Aucune intervention pour le moment.</p>
            <p className="text-[12px] text-slate-400 mt-1">
              Les modèles seront ajoutés dès réception du document.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
            {ops.map((op) => {
              const selected = selectedIds.includes(op.id)
              return (
                <button
                  key={op.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleOperation(op.id)}
                  className={cn(
                    'min-w-0 rounded-xl border px-3 py-2.5 text-left text-[13px] leading-snug transition-all break-words',
                    selected
                      ? 'border-[#062a30]/35 bg-white text-[#062a30] font-medium shadow-sm ring-1 ring-[#062a30]/10'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-[#062a30]/25 hover:bg-white',
                    op.isAutre && !selected && 'border-dashed',
                  )}
                >
                  {op.label}
                </button>
              )
            })}
          </div>
        )}

        {selectedInCategory.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1 min-w-0">
            {selectedInCategory.map((op) => (
              <button
                key={op.id}
                type="button"
                disabled={disabled}
                onClick={() => toggleOperation(op.id)}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#062a30]/15 bg-white px-2.5 py-1 text-[11px] font-medium text-[#062a30] hover:bg-slate-50"
              >
                <span className="truncate">{op.label}</span>
                <X className="h-3 w-3 shrink-0 opacity-60" />
              </button>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingIds !== null}
        onClose={() => setPendingIds(null)}
        title="Remplacer le diagnostic ?"
        description="Le texte actuel a été modifié. Le modèle de l’intervention choisie remplacera ce contenu. Vous pourrez ensuite le rééditer."
        confirmLabel="Remplacer"
        cancelLabel="Garder mon texte"
        confirmVariant="brand"
        onConfirm={() => {
          if (pendingIds) applySelection(pendingIds)
          setPendingIds(null)
        }}
      />
    </div>
  )
}
