import { gestionnaireApi, type GestionnairePatientDetail } from '@/lib/api'
import { ensurePlanningDocShell } from '@/lib/planningSejourBranding'
import { DEFAULT_TND_PER_EUR } from '@/lib/moneyWords'
import {
  buildPlanningSejourHtml,
  collectPlanningFieldValues,
  needsPlanningTemplateUpgrade,
  refreshPlanningLinkedFields,
  stampPlanningTemplateVersion,
  type PlanningLogistiqueHint,
} from '@/lib/planningSejourTemplate'

async function resolveTndPerEur(): Promise<number> {
  try {
    const taux = await gestionnaireApi.getTauxEur()
    if (taux.tndPerEur > 0) return taux.tndPerEur
  } catch {
    /* défaut */
  }
  return DEFAULT_TND_PER_EUR
}

/**
 * Régénère le HTML au modèle PDF courant si l’ancien contenu est obsolète,
 * puis persiste (statut inchangé). Sinon rafraîchit seulement les liens.
 */
export async function ensurePlanningContentUpToDate(
  patientId: string,
  patient: GestionnairePatientDetail,
  log: PlanningLogistiqueHint | null | undefined,
  existingContent: string | null | undefined,
  statut?: 'brouillon' | 'finalise' | null,
): Promise<{ html: string; migrated: boolean }> {
  const tndPerEur = await resolveTndPerEur()
  const raw = (existingContent ?? '').trim()

  if (!raw || needsPlanningTemplateUpgrade(raw)) {
    const html = buildPlanningSejourHtml(patient, log, { tndPerEur })
    await gestionnaireApi.updatePlanningSejour(patientId, {
      content: html,
      ...(statut === 'brouillon' || statut === 'finalise' ? { statut } : {}),
    })
    return { html, migrated: true }
  }

  const refreshed = stampPlanningTemplateVersion(
    ensurePlanningDocShell(
      refreshPlanningLinkedFields(raw, collectPlanningFieldValues(patient, log, { tndPerEur })),
    ),
  )
  if (refreshed !== raw) {
    await gestionnaireApi.updatePlanningSejour(patientId, { content: refreshed })
  }
  return { html: refreshed, migrated: false }
}
