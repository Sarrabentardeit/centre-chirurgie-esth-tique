import { formatDiagnosticLetterHtml } from '@/lib/diagnosticFormat'
import { cn } from '@/lib/utils'

type DiagnosticFormattedViewProps = {
  text: string
  interventionLabels?: string[]
  className?: string
}

export function DiagnosticFormattedView({
  text,
  interventionLabels,
  className,
}: DiagnosticFormattedViewProps) {
  const html = formatDiagnosticLetterHtml(text, interventionLabels)
  return (
    <div
      className={cn(
        'diagnostic-formatted text-sm text-slate-700 leading-relaxed',
        '[&_p]:mb-1.5 [&_p:last-child]:mb-0',
        '[&_strong]:font-semibold [&_strong]:text-slate-900',
        '[&_em]:italic [&_em]:text-[#282727]',
        '[&_mark]:px-0.5',
        '[&_.diagnostic-op-title]:mt-4 [&_.diagnostic-op-title:first-child]:mt-0',
        '[&_.diagnostic-op-title]:mb-2 [&_.diagnostic-op-title]:text-[15px]',
        '[&_.diagnostic-op-title_strong]:font-bold',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
