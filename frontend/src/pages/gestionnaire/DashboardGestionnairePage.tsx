import { useCallback, useEffect, useState } from 'react'
import { FileCheck, Package, Bell, Users, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useNavigate } from 'react-router-dom'
import { STATUS_LABELS, STATUS_COLORS, formatRelative, cn } from '@/lib/utils'
import { EmptyState } from '@/components/EmptyState'
import { useAuthStore } from '@/store/authStore'
import { gestionnaireApi, type GestionnaireFunnelStep, type GestionnairePatientSummary } from '@/lib/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'

function initialsFromFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export default function DashboardGestionnairePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<{ totalPatients: number; devisEnCours: number; logistique: number; notifications: number } | null>(null)
  const [funnel, setFunnel] = useState<GestionnaireFunnelStep[]>([])
  const [devisATraiter, setDevisATraiter] = useState<GestionnairePatientSummary[]>([])
  const [patientsLogistique, setPatientsLogistique] = useState<GestionnairePatientSummary[]>([])
  const [notifPreview, setNotifPreview] = useState<Array<{ id: string; titre: string; message: string; lienAction?: string | null }>>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await gestionnaireApi.getDashboard()
      setStats(res.stats)
      setFunnel(res.funnel)
      setDevisATraiter(res.devisATraiter)
      setPatientsLogistique(res.patientsLogistique)
      const notifs = await gestionnaireApi.getNotifications()
      setNotifPreview(notifs.notifications.filter((n) => !n.lu).slice(0, 2))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const kpi = [
    {
      label: 'Patients actifs',
      value: stats?.totalPatients ?? 0,
      icon: Users,
      color: 'text-brand-950',
      bg: 'bg-[rgba(6,42,48,0.06)]',
    },
    {
      label: 'Devis en cours',
      value: stats?.devisEnCours ?? 0,
      icon: FileCheck,
      color: 'text-amber-700',
      bg: 'bg-amber-50',
      urgent: (stats?.devisEnCours ?? 0) > 0,
    },
    {
      label: 'Logistique',
      value: stats?.logistique ?? 0,
      icon: Package,
      color: 'text-brand-700',
      bg: 'bg-brand-50',
    },
    {
      label: 'Notifications',
      value: stats?.notifications ?? 0,
      icon: Bell,
      color: 'text-brand-600',
      bg: 'bg-brand-50',
      urgent: (stats?.notifications ?? 0) > 0,
    },
  ]

  if (loading && !stats) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto p-4">
        <Skeleton className="h-16 w-full max-w-md" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-semibold text-brand-950 tracking-tight">Bonjour, {user?.name}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {notifPreview.length > 0 && (
        <div className="space-y-2">
          {notifPreview.map((n) => (
            <div key={n.id} className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800">{n.titre}</p>
                <p className="text-xs text-amber-700">{n.message}</p>
              </div>
              {n.lienAction && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-amber-700 hover:bg-amber-100 shrink-0"
                  onClick={() => navigate(n.lienAction!)}
                >
                  Traiter
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bande KPI unique — moins de cartes empilées */}
      <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border">
          {kpi.map((stat) => {
            const Icon = stat.icon
            return (
              <div key={stat.label} className={cn('px-4 py-4', stat.urgent && 'bg-amber-50/40')}>
                <div className="flex items-center justify-between mb-2">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.bg}`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                  {stat.urgent && <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />}
                </div>
                <p className="text-2xl font-bold text-brand-950 tabular-nums">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Entonnoir de conversion</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={funnel} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis dataKey="step" type="category" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={80} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                <Bar dataKey="count" fill="#81572d" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Devis à traiter</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/gestionnaire/devis')}>
              Voir tous <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {devisATraiter.length === 0 ? (
              <EmptyState
                icon={FileCheck}
                title="Aucun devis à préparer"
                description="Les dossiers avec rapport médical apparaîtront ici."
                actionLabel="Ouvrir les devis"
                onAction={() => navigate('/gestionnaire/devis')}
                className="py-8"
              />
            ) : (
              <div className="space-y-2">
                {devisATraiter.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-xl border p-3 hover:bg-muted/50 cursor-pointer group"
                    onClick={() => navigate(`/gestionnaire/devis/${p.id}`)}
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-purple-100 text-purple-700 text-sm font-semibold">
                        {initialsFromFullName(p.user.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{p.user.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        Rapport prêt · {formatRelative(p.updatedAt)}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {patientsLogistique.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-brand-600" />
              Logistique à préparer
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/gestionnaire/logistique')}>
              Voir tous <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {patientsLogistique.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border-l-4 border-l-purple-500 bg-purple-50/50 p-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-purple-100 text-purple-700 text-sm">
                      {initialsFromFullName(p.user.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{p.user.fullName}</p>
                    <p className="text-xs text-muted-foreground">{[p.ville, p.pays].filter(Boolean).join(', ') || '—'}</p>
                  </div>
                  <Badge className={`text-xs ${STATUS_COLORS[p.status as keyof typeof STATUS_COLORS] ?? ''}`}>
                    {STATUS_LABELS[p.status as keyof typeof STATUS_LABELS] ?? p.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
