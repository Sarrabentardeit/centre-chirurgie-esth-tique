import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const LIST_PAGE_SIZE = 20

type Props = {
  page: number
  totalPages: number
  total: number
  pageSize?: number
  onPageChange: (page: number) => void
  className?: string
}

export function PaginationBar({
  page,
  totalPages,
  total,
  pageSize = LIST_PAGE_SIZE,
  onPageChange,
  className,
}: Props) {
  if (total <= 0 || totalPages <= 1) return null

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-border bg-muted/20',
        className,
      )}
    >
      <span className="text-xs text-muted-foreground">
        <span className="hidden sm:inline">
          {from}–{to} sur {total} ·{' '}
        </span>
        Page <strong className="text-foreground">{page}</strong> /{' '}
        <strong className="text-foreground">{totalPages}</strong>
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Page précédente"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Page suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function paginateSlice<T>(items: T[], page: number, pageSize = LIST_PAGE_SIZE) {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)
  const safePage = Math.min(Math.max(1, page), totalPages)
  const slice = items.slice((safePage - 1) * pageSize, safePage * pageSize)
  return { slice, total, totalPages, page: safePage }
}
