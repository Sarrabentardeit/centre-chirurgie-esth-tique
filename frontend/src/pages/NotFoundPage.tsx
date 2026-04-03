import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-2">Erreur 404</p>
        <h1 className="text-3xl font-semibold mb-3">Page introuvable</h1>
        <p className="text-sm text-muted-foreground mb-6">
          La page demandée n&apos;existe pas ou a été déplacée.
        </p>
        <Link
          to="/formulaire"
          className="inline-flex items-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          Revenir à l&apos;accueil
        </Link>
      </div>
    </div>
  )
}
