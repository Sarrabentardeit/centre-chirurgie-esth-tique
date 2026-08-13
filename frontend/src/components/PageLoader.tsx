import { RefreshCw } from 'lucide-react'

/** Fallback Suspense — affichage court pendant le chargement d’un chunk de page. */
export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <RefreshCw className="h-5 w-5 animate-spin text-brand-700" />
      <p className="text-sm">Chargement…</p>
    </div>
  )
}
