import {
  CheckCircle2, Clock, AlertCircle, FileText, Heart,
  Calendar, CalendarDays, MessageSquare, ChevronRight, RefreshCw, ArrowRight, Ban,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePatientDossier, type PatientDossierData } from '@/hooks/usePatientDossier'
import { STATUS_LABELS, formatDate, formatRelative, cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import type { DossierStatus } from '@/types'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Parcours étapes ──────────────────────────────────────────────────────────

const PARCOURS = [
  { key: 'formulaire_complete', label: 'Dossier médical',    desc: 'Formulaire + documents' },
  { key: 'rapport_genere',      label: 'Analyse médicale',   desc: 'Rapport du médecin' },
  { key: 'devis_envoye',        label: 'Devis reçu',         desc: 'Offre personnalisée' },
  { key: 'date_reservee',       label: 'Date réservée',      desc: 'Intervention planifiée' },
  { key: 'logistique',          label: 'Logistique',         desc: 'Organisation du séjour' },
  { key: 'intervention',        label: 'Intervention',       desc: 'Jour J' },
  { key: 'post_op',             label: 'Suivi post-op',      desc: '6 mois de suivi' },
] as const

/** Mappe le statut réel vers l’étape visible du parcours. */
function resolveParcoursKey(status: DossierStatus): (typeof PARCOURS)[number]['key'] | null {
  if (status === 'abstention' || status === 'suivi_termine') return null
  if (status === 'nouveau' || status === 'formulaire_en_cours' || status === 'formulaire_complete') {
    return 'formulaire_complete'
  }
  if (status === 'en_analyse' || status === 'rapport_genere' || status === 'rapport_modifie') return 'rapport_genere'
  if (status === 'devis_preparation' || status === 'devis_envoye') return 'devis_envoye'
  if (status === 'devis_accepte' || status === 'date_reservee') return 'date_reservee'
  if (status === 'logistique') return 'logistique'
  if (status === 'intervention') return 'intervention'
  if (status === 'post_op') return 'post_op'
  return 'formulaire_complete'
}

function getProgress(status: DossierStatus): number {
  if (status === 'abstention') return 0
  if (status === 'suivi_termine') return 100
  const key = resolveParcoursKey(status)
  if (!key) return 0
  const idx = PARCOURS.findIndex((s) => s.key === key)
  if (idx < 0) return 0
  return Math.round(((idx + 0.35) / PARCOURS.length) * 100)
}

type NextStep = {
  title: string
  description: string
  ctaLabel?: string
  href?: string
  tone: 'action' | 'wait' | 'pause'
  icon: LucideIcon
}

function resolveNextStep(patient: PatientDossierData): NextStep {
  const formSubmitted = patient.formulaire?.status === 'submitted'
  const hasUpcomingRdv = patient.prochainsRdv.some(
    (r) => r.statut === 'planifie' || r.statut === 'confirme',
  )
  const needsRdvConfirm = patient.prochainsRdv.some((r) => r.statut === 'planifie')

  if (patient.status === 'abstention') {
    return {
      title: 'Dossier en pause',
      description:
        'Votre dossier est actuellement en abstention. Contactez l’équipe si vous souhaitez le réouvrir ou poser une question.',
      ctaLabel: 'Contacter l’équipe',
      href: '/patient/chat',
      tone: 'pause',
      icon: Ban,
    }
  }

  if (patient.status === 'suivi_termine') {
    return {
      title: 'Parcours terminé',
      description: 'Votre suivi est clôturé. L’équipe reste disponible via le chat si besoin.',
      ctaLabel: 'Ouvrir le chat',
      href: '/patient/chat',
      tone: 'wait',
      icon: CheckCircle2,
    }
  }

  if (!formSubmitted || patient.status === 'nouveau' || patient.status === 'formulaire_en_cours') {
    return {
      title: 'Compléter votre formulaire médical',
      description:
        'C’est la prochaine étape pour que le médecin puisse analyser votre dossier.',
      ctaLabel: 'Remplir mon formulaire',
      href: '/patient/formulaire',
      tone: 'action',
      icon: FileText,
    }
  }

  if (patient.devis?.statut === 'envoye') {
    return {
      title: 'Consulter et répondre à votre devis',
      description:
        'Un devis personnalisé vous attend. Lisez-le puis acceptez ou refusez.',
      ctaLabel: 'Voir mon devis',
      href: '/patient/devis',
      tone: 'action',
      icon: FileText,
    }
  }

  if (needsRdvConfirm) {
    return {
      title: 'Confirmer votre rendez-vous',
      description:
        'Une date vous a été proposée. Confirmez-la ou demandez une autre date.',
      ctaLabel: 'Voir mon agenda',
      href: '/patient/agenda',
      tone: 'action',
      icon: Calendar,
    }
  }

  if (
    patient.planningSejour?.available &&
    (patient.status === 'devis_accepte' || patient.status === 'date_reservee')
  ) {
    return {
      title: 'Consulter votre planning de séjour',
      description: patient.planningSejour.moisLabel
        ? `Votre planning (${patient.planningSejour.moisLabel}) est prêt.`
        : 'Votre planning de séjour a été finalisé par l’équipe.',
      ctaLabel: 'Voir mon planning',
      href: '/patient/planning-sejour',
      tone: 'action',
      icon: CalendarDays,
    }
  }

  if (
    (patient.status === 'devis_accepte' || patient.devis?.statut === 'accepte') &&
    !hasUpcomingRdv
  ) {
    return {
      title: 'Planifier une date',
      description:
        'Votre devis est accepté. Consultez l’agenda pour la suite de la planification.',
      ctaLabel: 'Ouvrir mon agenda',
      href: '/patient/agenda',
      tone: 'action',
      icon: Calendar,
    }
  }

  if (patient.status === 'post_op') {
    return {
      title: 'Suivi post-opératoire',
      description: 'Consultez votre espace de suivi et échangez avec l’équipe si besoin.',
      ctaLabel: 'Voir le suivi post-op',
      href: '/patient/post-op',
      tone: 'action',
      icon: Heart,
    }
  }

  if (
    patient.status === 'en_analyse' ||
    patient.status === 'rapport_genere' ||
    patient.status === 'rapport_modifie' ||
    patient.status === 'devis_preparation' ||
    patient.status === 'formulaire_complete'
  ) {
    return {
      title: 'Aucune action de votre côté',
      description:
        'Votre dossier est entre les mains de l’équipe. Vous serez notifiée dès qu’une étape nécessitera votre réponse.',
      ctaLabel: 'Écrire à l’équipe',
      href: '/patient/chat',
      tone: 'wait',
      icon: Clock,
    }
  }

  if (
    patient.status === 'date_reservee' ||
    patient.status === 'logistique' ||
    patient.status === 'intervention'
  ) {
    return {
      title: 'Préparation en cours',
      description:
        'L’équipe organise la suite de votre parcours. Surveillez vos notifications et le chat.',
      ctaLabel: 'Voir mon agenda',
      href: '/patient/agenda',
      tone: 'wait',
      icon: Clock,
    }
  }

  return {
    title: 'Besoin d’aide ?',
    description: 'L’équipe est disponible pour répondre à vos questions.',
    ctaLabel: 'Contacter l’équipe',
    href: '/patient/chat',
    tone: 'wait',
    icon: MessageSquare,
  }
}

// ─── Skeleton de chargement ───────────────────────────────────────────────────

function DossierSkeleton() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-36 w-full rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="lg:col-span-2 h-72 rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function DossierPage() {
  const navigate = useNavigate()
  const { data: patient, loading, error, refresh } = usePatientDossier()

  if (loading) return <DossierSkeleton />

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-16">
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="max-w-2xl mx-auto mt-16">
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              Votre dossier est en cours de création...
            </p>
            <Button variant="brand" onClick={() => navigate('/patient/formulaire')}>
              Compléter mon formulaire médical
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const progress = getProgress(patient.status)
  const nextStep = resolveNextStep(patient)
  const NextIcon = nextStep.icon
  const currentParcoursKey = resolveParcoursKey(patient.status)
  const currentParcoursIdx = currentParcoursKey
    ? PARCOURS.findIndex((s) => s.key === currentParcoursKey)
    : -1

  const secondaryLinks = [
    {
      label: 'Mon formulaire médical',
      href: '/patient/formulaire',
      desc: patient.formulaire?.status === 'submitted' ? 'Soumis ✓' : 'À compléter',
      icon: FileText,
    },
    {
      label: 'Mon devis',
      href: '/patient/devis',
      desc: patient.devis ? `Devis ${patient.devis.statut}` : 'En attente',
      icon: FileText,
    },
    {
      label: 'Mon agenda',
      href: '/patient/agenda',
      desc: patient.prochainsRdv.length > 0
        ? `${patient.prochainsRdv.length} RDV`
        : 'Aucun RDV',
      icon: Calendar,
    },
    ...(patient.planningSejour?.available
      ? [{
          label: 'Planning séjour',
          href: '/patient/planning-sejour',
          desc: patient.planningSejour.moisLabel ?? 'Disponible',
          icon: CalendarDays,
        }]
      : []),
    {
      label: 'Chat',
      href: '/patient/chat',
      desc: 'Contacter l’équipe',
      icon: MessageSquare,
    },
  ]

  return (
    <div className="space-y-6 max-w-5xl mx-auto">

      {/* ── En-tête ── */}
      <div
        className="rounded-2xl p-4 sm:p-6 shadow-lg relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #062a30 0%, #0d3d45 55%, #1a4a3a 100%)' }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, #e4c8bd 0%, transparent 50%)' }}
        />
        <div
          className="absolute bottom-0 left-0 h-px w-full"
          style={{ background: 'linear-gradient(to right, transparent, #81572d, transparent)' }}
        />

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm mb-1" style={{ color: 'rgba(228,200,189,0.7)' }}>Bonjour,</p>
            <h2 className="text-xl sm:text-2xl font-bold" style={{ color: '#fdeada' }}>
              {patient.prenom} {patient.nom}
            </h2>
            <p className="text-sm mt-1" style={{ color: 'rgba(228,200,189,0.6)' }}>
              Dossier créé le {formatDate(patient.dateCreation)}
            </p>
          </div>
          <div className="text-left sm:text-right space-y-2">
            <div
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: 'rgba(129,87,45,0.35)', color: '#fdeada', border: '1px solid rgba(228,200,189,0.3)' }}
            >
              {STATUS_LABELS[patient.status] ?? patient.status}
            </div>
            <p className="text-xs block" style={{ color: 'rgba(228,200,189,0.55)' }}>
              Dernière activité {formatRelative(patient.derniereActivite)}
            </p>
            <p className="text-xs font-mono font-semibold" style={{ color: 'rgba(228,200,189,0.8)' }}>
              {patient.dossierNumber}
            </p>
          </div>
        </div>

        <div className="relative mt-6">
          <div className="flex justify-between text-xs mb-2" style={{ color: 'rgba(228,200,189,0.6)' }}>
            <span>Progression du parcours</span>
            <span className="font-bold" style={{ color: '#fdeada' }}>{progress}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(to right, #81572d, #e4c8bd)',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Une seule prochaine étape ── */}
      <div
        className={cn(
          'rounded-2xl border px-4 py-5 sm:px-6 sm:py-6 shadow-sm',
          nextStep.tone === 'action' && 'border-brand-200 bg-gradient-to-br from-brand-50 to-white',
          nextStep.tone === 'wait' && 'border-slate-200 bg-slate-50/80',
          nextStep.tone === 'pause' && 'border-amber-200 bg-amber-50/90',
        )}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Votre prochaine étape
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div
            className={cn(
              'h-12 w-12 rounded-2xl flex items-center justify-center shrink-0',
              nextStep.tone === 'action' && 'bg-brand-100 text-brand-800',
              nextStep.tone === 'wait' && 'bg-slate-200 text-slate-700',
              nextStep.tone === 'pause' && 'bg-amber-100 text-amber-800',
            )}
          >
            <NextIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-slate-900">{nextStep.title}</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">{nextStep.description}</p>
          </div>
          {nextStep.ctaLabel && nextStep.href && (
            <Button
              variant={nextStep.tone === 'action' ? 'brand' : 'outline'}
              size="lg"
              className="w-full sm:w-auto shrink-0 gap-2 h-12 px-5 text-sm font-semibold"
              onClick={() => navigate(nextStep.href!)}
            >
              {nextStep.ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Timeline ── */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Où vous en êtes</CardTitle>
            </CardHeader>
            <CardContent>
              {patient.status === 'abstention' && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
                  Parcours en pause (abstention). Les étapes ci-dessous restent indicatives.
                </p>
              )}
              <div className="space-y-0">
                {PARCOURS.map((step, index) => {
                  const done =
                    patient.status !== 'abstention' &&
                    currentParcoursIdx >= 0 &&
                    index < currentParcoursIdx
                  const current =
                    patient.status !== 'abstention' &&
                    currentParcoursKey === step.key
                  const upcoming = !done && !current

                  return (
                    <div key={step.key} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                            done && 'border-emerald-500 bg-emerald-500',
                            current && 'border-brand-500 bg-brand-50 ring-4 ring-brand-100',
                            upcoming && 'border-border bg-background',
                          )}
                        >
                          {done ? (
                            <CheckCircle2 className="h-4 w-4 text-white" />
                          ) : current ? (
                            <Clock className="h-4 w-4 text-brand-600" />
                          ) : (
                            <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                          )}
                        </div>
                        {index < PARCOURS.length - 1 && (
                          <div className={cn('w-0.5 flex-1 min-h-[24px]', done ? 'bg-emerald-300' : 'bg-border')} />
                        )}
                      </div>
                      <div className={cn('pb-6', index === PARCOURS.length - 1 && 'pb-0')}>
                        <p
                          className={cn(
                            'text-sm font-semibold',
                            done && 'text-foreground',
                            current && 'text-brand-700',
                            upcoming && 'text-muted-foreground',
                          )}
                        >
                          {step.label}
                          {current && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-700">
                              Étape actuelle
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Colonne droite ── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Accès rapide</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {secondaryLinks.map((action) => {
                const Icon = action.icon
                return (
                  <button
                    key={action.href}
                    type="button"
                    onClick={() => navigate(action.href)}
                    className="w-full flex items-center gap-3 rounded-lg p-2.5 hover:bg-muted/50 transition-all group text-left"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{action.label}</p>
                      <p className="text-xs text-muted-foreground">{action.desc}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </button>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">N° Dossier</p>
                <p className="text-sm font-mono font-semibold text-foreground">
                  {patient.dossierNumber}
                </p>
              </div>
              {patient.sourceContact && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Source de contact</p>
                  <Badge variant="info" className="capitalize">
                    {patient.sourceContact}
                  </Badge>
                </div>
              )}
              <div className="space-y-1 pt-1 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Email : </span>
                  {patient.email}
                </p>
                {patient.phone && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Tél : </span>
                    {patient.phone}
                  </p>
                )}
                {patient.ville && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Ville : </span>
                    {patient.ville}{patient.pays ? `, ${patient.pays}` : ''}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
