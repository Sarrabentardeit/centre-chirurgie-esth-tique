import { CalendarDays, CheckCircle2, FilePenLine, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { GestionnairePlanningSejourSummary } from '@/lib/api'
import { cn, formatDateTime } from '@/lib/utils'

type PlanningSejourDossierSectionProps = {
  patientId: string
  planning: GestionnairePlanningSejourSummary | null | undefined
  logistiqueComplete: boolean
  onOpenEditor: (patientId: string) => void
}

export function PlanningSejourDossierSection({
  patientId,
  planning,
  logistiqueComplete,
  onOpenEditor,
}: PlanningSejourDossierSectionProps) {
  const isFinalise = planning?.statut === 'finalise'
  const hasContent = planning?.hasContent === true

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'rounded-xl border px-4 py-3',
          isFinalise
            ? 'border-emerald-200 bg-emerald-50/80'
            : 'border-sky-100 bg-sky-50/70',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Planning séjour patiente</p>
            <p className="text-xs text-slate-600 mt-0.5">
              {isFinalise
                ? 'Planning finalisé — prêt à envoyer ou imprimer.'
                : hasContent
                  ? 'Brouillon en cours — complétez ou finalisez dans l’éditeur.'
                  : 'Créez le planning à partir des infos logistiques et du devis accepté.'}
            </p>
            {planning?.moisLabel && (
              <p className="text-xs text-slate-500 mt-1">Période : {planning.moisLabel}</p>
            )}
            {planning?.updatedAt && (
              <p className="text-[11px] text-slate-400 mt-1">
                Dernière modification : {formatDateTime(planning.updatedAt)}
              </p>
            )}
          </div>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border',
              isFinalise
                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                : 'bg-white text-sky-800 border-sky-200',
            )}
          >
            {isFinalise ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Finalisé
              </>
            ) : (
              'Brouillon'
            )}
          </span>
        </div>
      </div>

      {!logistiqueComplete && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Conseil : validez d’abord les 4 points de la logistique pour un planning plus fiable.
        </p>
      )}

      <Button
        type="button"
        variant="brand"
        className="gap-2 h-11 text-sm font-semibold"
        onClick={() => onOpenEditor(patientId)}
      >
        {hasContent ? <Pencil className="h-4 w-4" /> : <FilePenLine className="h-4 w-4" />}
        {hasContent ? 'Personnaliser le planning' : 'Créer le planning séjour'}
      </Button>

      <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
        <CalendarDays className="h-3.5 w-3.5" />
        L’éditeur reprend automatiquement les dates et l’hébergement saisis en logistique.
      </p>
    </div>
  )
}
