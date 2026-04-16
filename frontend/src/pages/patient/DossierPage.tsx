import {
  CheckCircle2, Clock, AlertCircle, FileText,
  Calendar, MessageSquare, ChevronRight, RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePatientDossier } from '@/hooks/usePatientDossier'
import { STATUS_LABELS, formatDate, formatRelative } from '@/lib/utils'
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

const STATUS_ORDER: DossierStatus[] = [
  'nouveau', 'formulaire_en_cours', 'formulaire_complete',
  'en_analyse', 'rapport_genere', 'devis_preparation', 'devis_envoye',
  'devis_accepte', 'date_reservee', 'logistique', 'intervention',
  'post_op', 'suivi_termine',
]

function getProgress(status: DossierStatus): number {
  const idx = STATUS_ORDER.indexOf(status)
  return Math.round((idx / (STATUS_ORDER.length - 1)) * 100)
}

function isStepDone(stepKey: string, currentStatus: DossierStatus): boolean {
  return STATUS_ORDER.indexOf(stepKey as DossierStatus) <= STATUS_ORDER.indexOf(currentStatus)
}

function isCurrentStep(stepKey: string, currentStatus: DossierStatus): boolean {
  const sIdx = STATUS_ORDER.indexOf(stepKey as DossierStatus)
  const cIdx = STATUS_ORDER.indexOf(currentStatus)
  return sIdx === cIdx
}

function isNextStep(stepKey: string, currentStatus: DossierStatus): boolean {
  const sIdx = STATUS_ORDER.indexOf(stepKey as DossierStatus)
  const cIdx = STATUS_ORDER.indexOf(currentStatus)
  return sIdx === cIdx + 1
}

// ─── Skeleton de chargement ───────────────────────────────────────────────────

function DossierSkeleton() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Skeleton className="h-40 w-full rounded-2xl" />
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

  // ── Chargement ──
  if (loading) return <DossierSkeleton />

  // ── Erreur ──
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

  // ── Pas encore de dossier ──
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

  // ── Alerte formulaire non soumis ──
  const showFormulaireAlert =
    patient.status === 'nouveau' ||
    patient.status === 'formulaire_en_cours' ||
    !patient.formulaire ||
    patient.formulaire.status !== 'submitted'

  // ── Alerte devis en attente ──
  const showDevisAlert = patient.devis?.statut === 'envoye'

  return (
    <div className="space-y-6 max-w-5xl mx-auto">

      {/* ── En-tête de bienvenue ── */}
      <div
        className="rounded-2xl p-6 shadow-lg relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #062a30 0%, #0d3d45 55%, #1a4a3a 100%)' }}
      >
        {/* Décoration background */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, #e4c8bd 0%, transparent 50%)' }}
        />
        <div
          className="absolute bottom-0 left-0 h-px w-full"
          style={{ background: 'linear-gradient(to right, transparent, #81572d, transparent)' }}
        />

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm mb-1" style={{ color: 'rgba(228,200,189,0.7)' }}>Bonjour,</p>
            <h2 className="text-2xl font-bold" style={{ color: '#fdeada' }}>
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

        {/* Barre de progression */}
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

      {/* ── Alertes contextuelles ── */}
      <div className="space-y-2">
        {showFormulaireAlert && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">
                Formulaire médical incomplet
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Veuillez compléter et soumettre votre formulaire pour que votre dossier soit traité.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-amber-700 hover:bg-amber-100 shrink-0"
              onClick={() => navigate('/patient/formulaire')}
            >
              Compléter
            </Button>
          </div>
        )}

        {showDevisAlert && (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-800">
                Votre devis est disponible
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                Un devis personnalisé vous a été envoyé. Consultez-le et donnez votre réponse.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-emerald-700 hover:bg-emerald-100 shrink-0"
              onClick={() => navigate('/patient/devis')}
            >
              Voir le devis
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Timeline du parcours ── */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Votre Parcours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                {PARCOURS.map((step, index) => {
                  const done = isStepDone(step.key, patient.status)
                  const current = isCurrentStep(step.key, patient.status) && !done
                  const next = isNextStep(step.key, patient.status) && !done

                  return (
                    <div key={step.key} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                            done
                              ? 'border-emerald-500 bg-emerald-500'
                              : current
                              ? 'border-brand-500 bg-brand-50'
                              : 'border-border bg-background'
                          }`}
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
                          <div className={`w-0.5 flex-1 min-h-[24px] ${done ? 'bg-emerald-300' : 'bg-border'}`} />
                        )}
                      </div>
                      <div className={`pb-6 ${index === PARCOURS.length - 1 ? 'pb-0' : ''}`}>
                        <p
                          className={`text-sm font-semibold ${
                            done ? 'text-foreground' : current ? 'text-brand-700' : 'text-muted-foreground'
                          }`}
                        >
                          {step.label}
                          {current && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-700">
                              En cours
                            </span>
                          )}
                          {next && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              À venir
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

          {/* Actions rapides */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Actions Rapides</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                {
                  label: 'Mon formulaire médical',
                  icon: FileText,
                  href: '/patient/formulaire',
                  desc: patient.formulaire?.status === 'submitted' ? 'Soumis ✓' : 'À compléter',
                  color: 'text-blue-600',
                  bg: 'bg-blue-50',
                },
                {
                  label: 'Mon devis',
                  icon: FileText,
                  href: '/patient/devis',
                  desc: patient.devis ? `Devis ${patient.devis.statut}` : 'En attente',
                  color: 'text-emerald-600',
                  bg: 'bg-emerald-50',
                },
                {
                  label: 'Prendre rendez-vous',
                  icon: Calendar,
                  href: '/patient/agenda',
                  desc: patient.prochainsRdv.length > 0
                    ? `${patient.prochainsRdv.length} RDV à venir`
                    : 'Aucun RDV',
                  color: 'text-purple-600',
                  bg: 'bg-purple-50',
                },
                {
                  label: "Contacter l'équipe",
                  icon: MessageSquare,
                  href: '/patient/chat',
                  desc: 'Chat disponible',
                  color: 'text-brand-600',
                  bg: 'bg-brand-50',
                },
              ].map((action) => {
                const Icon = action.icon
                return (
                  <button
                    key={action.href}
                    onClick={() => navigate(action.href)}
                    className="w-full flex items-center gap-3 rounded-lg p-3 hover:bg-muted/50 transition-all group text-left"
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${action.bg}`}>
                      <Icon className={`h-4 w-4 ${action.color}`} />
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

          {/* Infos du dossier */}
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
