import { FileCheck, Package, Bell, Users, ChevronRight, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useNavigate } from 'react-router-dom'
import { MOCK_PATIENTS, MOCK_DEVIS, MOCK_NOTIFICATIONS } from '@/mocks/data'
import { STATUS_LABELS, STATUS_COLORS, formatRelative } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

const CONVERSION_DATA = [
  { step: 'Leads', count: 100 },
  { step: 'Formulaires', count: 72 },
  { step: 'Devis', count: 45 },
  { step: 'RDV', count: 30 },
  { step: 'Interventions', count: 22 },
]

export default function DashboardGestionnairePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const notifications = MOCK_NOTIFICATIONS.filter((n) => n.userId === user?.id && !n.lu)
  const devisEnAttente = MOCK_DEVIS.filter((d) => d.statut === 'brouillon' || d.statut === 'envoye')
  const patientsLogistique = MOCK_PATIENTS.filter((p) =>
    ['date_reservee', 'logistique'].includes(p.status)
  )

  const stats = [
    {
      label: 'Patients actifs',
      value: MOCK_PATIENTS.length,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Devis en cours',
      value: devisEnAttente.length,
      icon: FileCheck,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      urgent: devisEnAttente.length > 0,
    },
    {
      label: 'Logistique à préparer',
      value: patientsLogistique.length,
      icon: Package,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      label: 'Notifications',
      value: notifications.length,
      icon: Bell,
      color: 'text-brand-600',
      bg: 'bg-brand-50',
      urgent: notifications.length > 0,
    },
  ]

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Greeting */}
      <div>
        <h2 className="text-xl font-bold">Bonjour, {user?.name}</h2>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Urgent notifications */}
      {notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.slice(0, 2).map((n) => (
            <div key={n.id} className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800">{n.titre}</p>
                <p className="text-xs text-amber-700">{n.message}</p>
              </div>
              {n.lienAction && (
                <Button size="sm" variant="ghost" className="text-amber-700 hover:bg-amber-100 shrink-0"
                  onClick={() => navigate(n.lienAction!)}>
                  Traiter
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className={stat.urgent ? 'border-amber-300 bg-amber-50/50' : ''}>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.bg}`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  {stat.urgent && (
                    <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  )}
                </div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Entonnoir de conversion</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={CONVERSION_DATA} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis dataKey="step" type="category" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={80} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                />
                <Bar dataKey="count" fill="#c44828" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Devis à traiter */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Devis à traiter</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/gestionnaire/devis')}>
              Voir tous <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {devisEnAttente.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun devis en attente.</p>
            ) : (
              <div className="space-y-2">
                {MOCK_PATIENTS.filter((p) =>
                  ['rapport_genere', 'devis_preparation'].includes(p.status)
                ).slice(0, 4).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-xl border p-3 hover:bg-muted/50 cursor-pointer group"
                    onClick={() => navigate(`/gestionnaire/devis/${p.id}`)}
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-purple-100 text-purple-700 text-sm font-semibold">
                        {p.prenom[0]}{p.nom[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{p.prenom} {p.nom}</p>
                      <p className="text-xs text-muted-foreground">Rapport finalisé • {formatRelative(p.derniereActivite)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Logistique en cours */}
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
                      {p.prenom[0]}{p.nom[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{p.prenom} {p.nom}</p>
                    <p className="text-xs text-muted-foreground">{p.ville}, {p.pays}</p>
                  </div>
                  <Badge className={`text-xs ${STATUS_COLORS[p.status]}`}>
                    {STATUS_LABELS[p.status]}
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
