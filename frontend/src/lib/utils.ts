import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { DossierStatus } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'dd/MM/yyyy', { locale: fr })
}

/** `YYYY-MM-DD` (champ `<input type="date">`) en français, sans décalage fuseau. */
export function formatIsoDateFrLong(iso: string | null | undefined): string {
  if (!iso?.trim()) return '—'
  const m = iso.trim().slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return formatDate(iso)
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return iso.trim()
  return format(new Date(y, mo - 1, d), 'd MMMM yyyy', { locale: fr })
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), "dd/MM/yyyy 'à' HH:mm", { locale: fr })
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: fr })
}

export const STATUS_LABELS: Record<DossierStatus, string> = {
  nouveau: 'Nouveau',
  formulaire_en_cours: 'Formulaire en cours',
  formulaire_complete: 'Formulaire complété',
  en_analyse: 'En analyse médicale',
  rapport_genere: 'Rapport généré',
  rapport_modifie: 'Rapport modifié',
  devis_preparation: 'Devis en préparation',
  devis_envoye: 'Devis envoyé',
  devis_accepte: 'Devis accepté',
  date_reservee: 'Date réservée',
  logistique: 'Logistique en cours',
  intervention: 'Intervention',
  post_op: 'Suivi post-opératoire',
  suivi_termine: 'Suivi terminé',
  abstention: 'Abstention',
}

/** Aligné charte teal / bronze / amber / emerald / slate */
export const STATUS_COLORS: Record<DossierStatus, string> = {
  nouveau: 'bg-slate-100 text-slate-700 border-slate-200',
  formulaire_en_cours: 'bg-amber-50 text-amber-800 border-amber-200',
  formulaire_complete: 'bg-brand-100 text-brand-800 border-brand-200',
  en_analyse: 'bg-[rgba(6,42,48,0.08)] text-brand-950 border-[rgba(6,42,48,0.15)]',
  rapport_genere: 'bg-[rgba(6,42,48,0.08)] text-brand-950 border-[rgba(6,42,48,0.15)]',
  rapport_modifie: 'bg-amber-50 text-amber-900 border-amber-300',
  devis_preparation: 'bg-amber-50 text-amber-800 border-amber-200',
  devis_envoye: 'bg-brand-100 text-brand-800 border-brand-200',
  devis_accepte: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  date_reservee: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  logistique: 'bg-brand-100 text-brand-800 border-brand-200',
  intervention: 'bg-rose-50 text-rose-800 border-rose-200',
  post_op: 'bg-[rgba(6,42,48,0.08)] text-brand-950 border-[rgba(6,42,48,0.15)]',
  suivi_termine: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  abstention: 'bg-slate-200 text-slate-600 border-slate-300',
}

export const PARCOURS_STEPS: Array<{ key: DossierStatus; label: string; icon: string }> = [
  { key: 'formulaire_complete', label: 'Dossier médical', icon: '📋' },
  { key: 'rapport_genere', label: 'Analyse médicale', icon: '🩺' },
  { key: 'devis_envoye', label: 'Devis reçu', icon: '📄' },
  { key: 'date_reservee', label: 'Date réservée', icon: '📅' },
  { key: 'logistique', label: 'Logistique', icon: '✈️' },
  { key: 'intervention', label: 'Intervention', icon: '🏥' },
  { key: 'post_op', label: 'Suivi post-op', icon: '💊' },
]

export function getStepIndex(status: DossierStatus): number {
  const steps: DossierStatus[] = [
    'formulaire_complete',
    'en_analyse',
    'rapport_genere',
    'rapport_modifie',
    'devis_preparation',
    'devis_envoye',
    'devis_accepte',
    'date_reservee',
    'logistique',
    'intervention',
    'post_op',
    'suivi_termine',
  ]
  return steps.indexOf(status)
}

export type CurrencyUnit = 'TND' | 'EUR' | 'DZD'
export const APP_CURRENCY: CurrencyUnit = 'TND'

export function formatCurrency(amount: number, _currency: CurrencyUnit | string = APP_CURRENCY): string {
  // Normalisation globale: toute l'application affiche en TND.
  return new Intl.NumberFormat('fr-TN', {
    style: 'currency',
    currency: APP_CURRENCY,
    minimumFractionDigits: 0,
  }).format(amount)
}

const MC_REFERENCE_RE = /^MC-\d{2}-\d{3}-\d{4}$/

function isMcReference(value: string | null | undefined): boolean {
  return !!value?.trim() && MC_REFERENCE_RE.test(value.trim())
}

/** Référence dossier affichée (MC-MM-NNN-AAAA, alignée sur le devis). */
export function getPatientDisplayReference(patient: {
  dossierNumber: string
  devis?: Array<{ numeroDevis?: string | null }>
}): string {
  const numeroDevis = patient.devis?.[0]?.numeroDevis
  if (numeroDevis?.trim() && isMcReference(numeroDevis)) return numeroDevis.trim()
  if (isMcReference(patient.dossierNumber)) return patient.dossierNumber.trim()
  return patient.dossierNumber
}

export function getPatientDossierNumber(patient: {
  numeroDossier?: string
  dossierNumber?: string
  id: string
  dateCreation?: string
}): string {
  if (patient.dossierNumber?.trim()) return patient.dossierNumber.trim()
  if (patient.numeroDossier?.trim()) return patient.numeroDossier
  const year = patient.dateCreation?.slice(0, 4) || String(new Date().getFullYear())
  const suffix = patient.id.replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase().padStart(5, '0')
  return `DOS-${year}-${suffix}`
}

/** Référence affichée sur le PDF devis (MC-MM-NNN-AAAA). */
export function getDevisDisplayNumber(
  devis: { numeroDevis?: string | null } | null | undefined,
  dossierNumber?: string | null,
): string {
  if (devis?.numeroDevis?.trim()) return devis.numeroDevis.trim()
  if (dossierNumber?.trim() && isMcReference(dossierNumber)) return dossierNumber.trim()
  return ''
}

export function formatDevisTitle(
  devis: { numeroDevis?: string | null; version?: number | null } | null | undefined,
  dossierNumber?: string | null,
): string {
  const num = getDevisDisplayNumber(devis, dossierNumber)
  const base = num ? `Devis ${num}` : 'Devis'
  const v = devis?.version
  const versionNum =
    v != null && Number.isFinite(v) && v >= 1 ? Math.floor(v) : num ? 1 : null
  if (versionNum == null) return base
  const code = 96 + versionNum // 1 → a, 2 → b, 3 → c
  const letter = code >= 97 && code <= 122 ? String.fromCharCode(code) : String(versionNum)
  return `${base} -${letter}`
}

/**
 * Lettre de version pour l’affichage liste :
 * v1 → aucune, v2 → b, v3 → c, …
 */
export function getDevisVersionLetter(version: number): string | null {
  if (!Number.isFinite(version) || version < 2) return null
  const code = 96 + Math.floor(version) // 2 → 'b'
  if (code < 98 || code > 122) return String(Math.floor(version))
  return String.fromCharCode(code)
}

/** Nom affiché d’un devis : `MC-… NOM PRENOM` (+ ` -b`, ` -c`, … dès la 2ᵉ version). */
export function formatDevisListName(
  dossierNumber: string | null | undefined,
  patientFullName: string | null | undefined,
  version: number,
): string {
  const dossier = dossierNumber?.trim() || 'Dossier'
  const name = patientFullName?.trim() || ''
  const base = name ? `${dossier} ${name}` : dossier
  const letter = getDevisVersionLetter(version)
  return letter ? `${base} -${letter}` : base
}

/** Nom de fichier PDF (export / pièce jointe) selon la même règle. */
export function formatDevisPdfFileName(
  dossierNumber: string | null | undefined,
  patientFullName: string | null | undefined,
  version: number,
): string {
  const label = formatDevisListName(dossierNumber, patientFullName, version)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return `${label || 'Devis'}.pdf`
}
