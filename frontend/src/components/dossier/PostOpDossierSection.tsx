import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PostOpSection } from '@/components/dossier/PostOpSection'
import {
  PostOpAvisSection,
  PostOpClotureSection,
  PostOpDemandesSection,
  PostOpNotesSection,
  PostOpPhotosGallery,
  PostOpRetourSection,
} from '@/components/dossier/PostOpStaffSections'
import { gestionnaireApi, gestionnairePostOpApi, type SuiviPostOp } from '@/lib/api'
import { daysSinceDate } from '@/lib/postOpSteps'
import { formatDate } from '@/lib/utils'

type Props = {
  patientId: string
  patientName: string
  onStatusChange?: (status: string) => void
}

export function PostOpDossierSection({ patientId, patientName, onStatusChange }: Props) {
  const [suivi, setSuivi] = useState<SuiviPostOp | null>(null)
  const [dateIntervention, setDateIntervention] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await gestionnaireApi.getPostOp(patientId)
      setSuivi(res.suivi)
      setDateIntervention(res.dateInterventionLogistique)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => { void load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement du suivi post-op…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => void load()}>
          Réessayer
        </Button>
      </div>
    )
  }

  const interventionDate = suivi?.dateIntervention ?? dateIntervention
  const jours = suivi ? daysSinceDate(suivi.dateIntervention) : null

  return (
    <div className="rounded-xl border bg-white px-4 sm:px-5 divide-y">
      <p className="py-4 text-sm text-muted-foreground">
        {interventionDate
          ? `Intervention le ${formatDate(interventionDate)}${jours != null ? ` · J+${jours}` : ''}`
          : 'Date d’intervention non renseignée'}
      </p>

      <PostOpRetourSection
        patientId={patientId}
        patientName={patientName}
        suivi={suivi}
        api={gestionnairePostOpApi}
        onChange={setSuivi}
      />

      <PostOpPhotosGallery suivi={suivi} />

      <PostOpDemandesSection patientId={patientId} suivi={suivi} api={gestionnairePostOpApi} onChange={setSuivi} />

      <PostOpSection title="Compte rendu">
        <p className="text-sm text-slate-700">
          {suivi?.compteRendu
            ? 'Rédigé, visible par la patiente.'
            : suivi?.compteRenduDemandeAt
              ? `Demandé le ${formatDate(suivi.compteRenduDemandeAt)}. À rédiger par le médecin.`
              : 'Pas demandé. Il n’est rédigé que si la patiente le demande.'}
        </p>
      </PostOpSection>

      <PostOpAvisSection suivi={suivi} />

      <PostOpNotesSection patientId={patientId} suivi={suivi} api={gestionnairePostOpApi} onChange={setSuivi} />

      <PostOpClotureSection
        patientId={patientId}
        suivi={suivi}
        api={gestionnairePostOpApi}
        onChange={setSuivi}
        onStatusChange={onStatusChange}
      />
    </div>
  )
}
