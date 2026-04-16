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
  devis_preparation: 'Devis en préparation',
  devis_envoye: 'Devis envoyé',
  devis_accepte: 'Devis accepté',
  date_reservee: 'Date réservée',
  logistique: 'Logistique en cours',
  intervention: 'Intervention',
  post_op: 'Suivi post-opératoire',
  suivi_termine: 'Suivi terminé',
}

export const STATUS_COLORS: Record<DossierStatus, string> = {
  nouveau: 'bg-slate-100 text-slate-700',
  formulaire_en_cours: 'bg-amber-100 text-amber-700',
  formulaire_complete: 'bg-blue-100 text-blue-700',
  en_analyse: 'bg-purple-100 text-purple-700',
  rapport_genere: 'bg-indigo-100 text-indigo-700',
  devis_preparation: 'bg-orange-100 text-orange-700',
  devis_envoye: 'bg-cyan-100 text-cyan-700',
  devis_accepte: 'bg-teal-100 text-teal-700',
  date_reservee: 'bg-green-100 text-green-700',
  logistique: 'bg-lime-100 text-lime-700',
  intervention: 'bg-rose-100 text-rose-700',
  post_op: 'bg-pink-100 text-pink-700',
  suivi_termine: 'bg-emerald-100 text-emerald-700',
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

export function getPatientDossierNumber(patient: {
  numeroDossier?: string
  id: string
  dateCreation?: string
}): string {
  if (patient.numeroDossier?.trim()) return patient.numeroDossier
  const year = patient.dateCreation?.slice(0, 4) || String(new Date().getFullYear())
  const suffix = patient.id.replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase().padStart(5, '0')
  return `DOS-${year}-${suffix}`
}
