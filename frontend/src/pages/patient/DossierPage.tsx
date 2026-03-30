import { CheckCircle2, Clock, AlertCircle, FileText, Calendar, MessageSquare, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { STATUS_LABELS, formatDate, formatRelative } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import type { DossierStatus } from '@/types'
import { useMemo } from 'react'

const PARCOURS = [
  { key: 'formulaire_complete', label: 'Dossier médical', desc: 'Formulaire + documents' },
  { key: 'rapport_genere', label: 'Analyse médicale', desc: 'Rapport du médecin' },
  { key: 'devis_envoye', label: 'Devis reçu', desc: 'Offre personnalisée' },
  { key: 'date_reservee', label: 'Date réservée', desc: 'Intervention planifiée' },
  { key: 'logistique', label: 'Logistique', desc: 'Organisation du séjour' },
  { key: 'intervention', label: 'Intervention', desc: 'Jour J' },
  { key: 'post_op', label: 'Suivi post-op', desc: '6 mois de suivi' },
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
  const stepIdx = STATUS_ORDER.indexOf(stepKey as DossierStatus)
  const currentIdx = STATUS_ORDER.indexOf(currentStatus)
  return stepIdx <= currentIdx
}

function isCurrentStep(stepKey: string, currentStatus: DossierStatus): boolean {
  const stepIdx = STATUS_ORDER.indexOf(stepKey as DossierStatus)
  const currentIdx = STATUS_ORDER.indexOf(currentStatus)
  return stepIdx === currentIdx || stepIdx === currentIdx + 1
}

export default function DossierPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  // Select store arrays only (stable references). Then derive filtered lists with useMemo
  // to avoid creating new arrays inside zustand selectors (can trigger re-render loops).
  const patients = useDemoStore((s) => s.patients)
  const notificationsStore = useDemoStore((s) => s.notifications)
  const devisStore = useDemoStore((s) => s.devis)

  const patient = useMemo(() => {
    if (!user) return null
    return patients.find((p) => p.userId === user.id) ?? null
  }, [patients, user?.id])

  const notifications = useMemo(() => {
    if (!user) return []
    return notificationsStore.filter((n) => n.userId === user.id && !n.lu)
  }, [notificationsStore, user?.id])

  const devis = useMemo(() => {
    if (!patient) return []
    return devisStore.filter((d) => d.patientId === patient.id)
  }, [devisStore, patient?.id])

  if (!patient) {
    return (
      <div className="max-w-2xl mx-auto mt-16">
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Dossier patient en cours de création...
          </CardContent>
        </Card>
      </div>
    )
  }
  const progress = getProgress(patient.status)

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Welcome Header */}
      <div className="rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 p-6 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-brand-100 text-sm mb-1">Bonjour,</p>
            <h2 className="text-2xl font-bold">{patient.prenom} {patient.nom}</h2>
            <p className="text-brand-200 text-sm mt-1">
              Dossier créé le {formatDate(patient.dateCreation)}
            </p>
          </div>
          <div className="text-right">
            <Badge className="bg-white/20 text-white border-white/30 text-sm px-3 py-1">
              {STATUS_LABELS[patient.status]}
            </Badge>
            <p className="text-brand-200 text-xs mt-2">
              Dernière activité {formatRelative(patient.derniereActivite)}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-5">
          <div className="flex justify-between text-xs text-brand-200 mb-2">
            <span>Progression du parcours</span>
            <span className="font-semibold text-white">{progress}%</span>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Notifications actives */}
      {notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
            >
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800">{n.titre}</p>
                <p className="text-xs text-amber-700 mt-0.5">{n.message}</p>
              </div>
              {n.lienAction && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-amber-700 hover:bg-amber-100 shrink-0"
                  onClick={() => navigate(n.lienAction!)}
                >
                  Voir
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline du parcours */}
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

                  return (
                    <div key={step.key} className="flex gap-4">
                      {/* Timeline line + dot */}
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
                          <div
                            className={`w-0.5 flex-1 min-h-[24px] ${done ? 'bg-emerald-300' : 'bg-border'}`}
                          />
                        )}
                      </div>
                      {/* Content */}
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

        {/* Quick Actions */}
        <div className="space-y-4">
          {/* Quick Actions Card */}
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
                  desc: 'Compléter / voir',
                  color: 'text-blue-600',
                  bg: 'bg-blue-50',
                },
                {
                  label: 'Mes devis',
                  icon: FileText,
                  href: '/patient/devis',
                  desc: devis.length > 0 ? `${devis.length} devis disponible` : 'Aucun devis',
                  color: 'text-emerald-600',
                  bg: 'bg-emerald-50',
                },
                {
                  label: 'Prendre rendez-vous',
                  icon: Calendar,
                  href: '/patient/agenda',
                  desc: 'Choisir une date',
                  color: 'text-purple-600',
                  bg: 'bg-purple-50',
                },
                {
                  label: 'Contacter l\'équipe',
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

          {/* Source contact info */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Source de contact</p>
              <Badge variant="info" className="capitalize">
                {patient.sourceContact}
              </Badge>
              <div className="mt-3 space-y-1">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Email : </span>{patient.email}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Tél : </span>{patient.phone}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
