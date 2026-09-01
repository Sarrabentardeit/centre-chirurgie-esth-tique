import type { GestionnaireLogistiqueDocuments, GestionnaireLogistiqueRow } from '@/lib/api'
import { toDatetimeLocalInput } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import { FileText, Plane, Receipt } from 'lucide-react'

export type LogistiqueDocumentKey = keyof GestionnaireLogistiqueDocuments

export const LOGISTIQUE_DOCUMENT_SLOTS = [
  { key: 'passport', label: 'Passeport', hint: 'Plusieurs images ou PDF', icon: FileText },
  { key: 'billet', label: "Billet d'avion", hint: 'Plusieurs images ou PDF', icon: Plane },
  { key: 'devisAccepte', label: 'Devis accepté', hint: 'Plusieurs images ou PDF', icon: Receipt },
] as const satisfies ReadonlyArray<{
  key: LogistiqueDocumentKey
  label: string
  hint: string
  icon: LucideIcon
}>

export const LOGISTIQUE_DOCUMENT_TOTAL = LOGISTIQUE_DOCUMENT_SLOTS.length
export const LOGISTIQUE_ESSENTIAL_TOTAL = LOGISTIQUE_DOCUMENT_TOTAL + 3

export function emptyLogistiqueDocuments(): GestionnaireLogistiqueDocuments {
  return { passport: [], billet: [], devisAccepte: [] }
}

function normalizeSlotFiles(value: unknown): GestionnaireLogistiqueDocuments['passport'] {
  if (!value) return []
  const items = Array.isArray(value) ? value : [value]
  return items.filter(
    (d): d is { url: string; name: string } =>
      Boolean(d && typeof d === 'object' && typeof (d as { url?: string }).url === 'string' && (d as { url: string }).url.trim()
        && typeof (d as { name?: string }).name === 'string' && (d as { name: string }).name.trim()),
  )
}

export function logistiqueDocumentsDoneCount(
  documents: GestionnaireLogistiqueDocuments | null | undefined,
): number {
  if (!documents) return 0
  return LOGISTIQUE_DOCUMENT_SLOTS.filter(({ key }) => normalizeSlotFiles(documents[key]).length > 0).length
}

export function logistiqueEssentialsDoneCount(row: GestionnaireLogistiqueRow | null | undefined): number {
  if (!row) return 0
  let n = logistiqueDocumentsDoneCount(row.documents)
  if (row.dateArrivee) n += 1
  if (row.dateDepart) n += 1
  if (row.dateIntervention) n += 1
  return n
}

export function logistiqueIsComplete(row: GestionnaireLogistiqueRow | null | undefined): boolean {
  return logistiqueEssentialsDoneCount(row) >= LOGISTIQUE_ESSENTIAL_TOTAL
}

export function logistiqueFromPatientRow(
  row: GestionnaireLogistiqueRow | null | undefined,
): GestionnaireLogistiqueRow {
  return {
    dateArrivee: row?.dateArrivee ? toDatetimeLocalInput(row.dateArrivee) : null,
    dateDepart: row?.dateDepart ? toDatetimeLocalInput(row.dateDepart) : null,
    dateIntervention: row?.dateIntervention ? toDatetimeLocalInput(row.dateIntervention) : null,
    documents: {
      passport: normalizeSlotFiles(row?.documents?.passport),
      billet: normalizeSlotFiles(row?.documents?.billet),
      devisAccepte: normalizeSlotFiles(row?.documents?.devisAccepte),
    },
    notes: row?.notes ?? '',
  }
}

/** @deprecated Utiliser logistiqueDocumentsDoneCount */
export const LOGISTIQUE_CHECKLIST_TOTAL = LOGISTIQUE_DOCUMENT_TOTAL
/** @deprecated Utiliser logistiqueDocumentsDoneCount */
export function logistiqueDoneCount(rowOrDocs: GestionnaireLogistiqueDocuments | null | undefined): number {
  return logistiqueDocumentsDoneCount(rowOrDocs)
}

export const POST_DEVIS_ACCEPTE_STATUSES = [
  'devis_accepte',
  'date_reservee',
  'logistique',
  'intervention',
  'post_op',
  'suivi_termine',
] as const

export function patientHasPostDevisAccepte(status: string, devis: Array<{ statut: string }>): boolean {
  if (POST_DEVIS_ACCEPTE_STATUSES.includes(status as (typeof POST_DEVIS_ACCEPTE_STATUSES)[number])) {
    return true
  }
  return devis.some((d) => d.statut === 'accepte')
}
