import {
  CheckCircle2,
  Clock,
  FileEdit,
  FileText,
  Ban,
  Send,
  Stethoscope,
  Package,
  Calendar,
  CircleDot,
  type LucideIcon,
} from 'lucide-react'
import type { DossierStatus } from '@/types'
import { cn } from '@/lib/utils'

/** Palette unifiée — teal / bronze / amber / emerald / slate */
export type StatusTone = 'slate' | 'amber' | 'brand' | 'teal' | 'emerald' | 'rose'

const TONE_CLASS: Record<StatusTone, string> = {
  slate:   'bg-slate-100 text-slate-700 border-slate-200',
  amber:   'bg-amber-50 text-amber-800 border-amber-200',
  brand:   'bg-brand-100 text-brand-800 border-brand-200',
  teal:    'bg-[rgba(6,42,48,0.08)] text-brand-950 border-[rgba(6,42,48,0.15)]',
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rose:    'bg-rose-50 text-rose-800 border-rose-200',
}

export type DevisStatut = 'brouillon' | 'envoye' | 'accepte' | 'refuse'

const DOSSIER_UI: Record<DossierStatus, { label: string; tone: StatusTone; icon: LucideIcon }> = {
  nouveau:              { label: 'Nouveau',           tone: 'slate',   icon: CircleDot },
  formulaire_en_cours:  { label: 'Form. en cours',    tone: 'amber',   icon: Clock },
  formulaire_complete:  { label: 'Form. complété',    tone: 'brand',   icon: FileText },
  en_analyse:           { label: 'En analyse',        tone: 'teal',    icon: Stethoscope },
  rapport_genere:       { label: 'Rapport généré',    tone: 'teal',    icon: Stethoscope },
  rapport_modifie:      { label: 'Rapport modifié',   tone: 'amber',   icon: FileEdit },
  devis_preparation:    { label: 'Devis en cours',    tone: 'amber',   icon: FileEdit },
  devis_envoye:         { label: 'Devis envoyé',      tone: 'brand',   icon: Send },
  devis_accepte:        { label: 'Devis accepté',     tone: 'emerald', icon: CheckCircle2 },
  date_reservee:        { label: 'Date réservée',     tone: 'emerald', icon: Calendar },
  logistique:           { label: 'Logistique',        tone: 'brand',   icon: Package },
  intervention:         { label: 'Intervention',      tone: 'rose',    icon: Stethoscope },
  post_op:              { label: 'Post-op',           tone: 'teal',    icon: Clock },
  suivi_termine:        { label: 'Suivi terminé',     tone: 'emerald', icon: CheckCircle2 },
  abstention:           { label: 'Abstention',        tone: 'slate',   icon: Ban },
}

const DEVIS_UI: Record<DevisStatut, { label: string; tone: StatusTone; icon: LucideIcon }> = {
  brouillon: { label: 'Brouillon', tone: 'amber',   icon: FileEdit },
  envoye:    { label: 'Envoyé',    tone: 'brand',   icon: Send },
  accepte:   { label: 'Accepté',   tone: 'emerald', icon: CheckCircle2 },
  refuse:    { label: 'Refusé',    tone: 'rose',    icon: Ban },
}

export function dossierStatusUi(status: DossierStatus) {
  return DOSSIER_UI[status] ?? DOSSIER_UI.nouveau
}

export function devisStatusUi(statut: string) {
  return DEVIS_UI[statut as DevisStatut] ?? DEVIS_UI.brouillon
}

type StatusBadgeProps = {
  kind: 'dossier' | 'devis'
  value: string
  className?: string
  showIcon?: boolean
}

export function StatusBadge({ kind, value, className, showIcon = true }: StatusBadgeProps) {
  const ui = kind === 'dossier'
    ? dossierStatusUi(value as DossierStatus)
    : devisStatusUi(value)
  const Icon = ui.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none whitespace-nowrap',
        TONE_CLASS[ui.tone],
        className,
      )}
    >
      {showIcon && <Icon className="h-3 w-3 shrink-0 opacity-80" />}
      {ui.label}
    </span>
  )
}
