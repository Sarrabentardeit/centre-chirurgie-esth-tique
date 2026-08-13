import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Printer, RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { patientApi } from '@/lib/api'
import { formatDate, cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'

export default function PlanningSejourPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [planning, setPlanning] = useState<{
    content: string
    moisLabel: string | null
    updatedAt: string
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await patientApi.getMyPlanningSejour()
      setPlanning(res.planning)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <PageHeader
        title="Mon planning de séjour"
        description={
          planning?.moisLabel
            ? `Séjour · ${planning.moisLabel}`
            : 'Itinéraire et organisation de votre séjour en Tunisie.'
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
            {planning && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" />
                Imprimer
              </Button>
            )}
          </div>
        }
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && !planning ? (
        <p className="text-sm text-muted-foreground text-center py-10">Chargement…</p>
      ) : !planning ? (
        <EmptyState
          icon={CalendarDays}
          title="Planning pas encore disponible"
          description="Dès que l’équipe finalise votre planning de séjour, il apparaîtra ici."
          actionLabel="Voir mon dossier"
          onAction={() => navigate('/patient/dossier')}
          secondaryLabel="Ouvrir le chat"
          onSecondary={() => navigate('/patient/chat')}
        />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Mis à jour le {formatDate(planning.updatedAt)}
          </p>
          <div
            className="rounded-2xl border border-border bg-white p-4 sm:p-6 shadow-sm overflow-x-auto print:border-0 print:shadow-none planning-sejour-patient"
            dangerouslySetInnerHTML={{ __html: planning.content }}
          />
        </div>
      )}
    </div>
  )
}
