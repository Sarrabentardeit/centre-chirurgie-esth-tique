import { Users, FileText, Calendar, TrendingUp, Clock, AlertCircle, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useNavigate } from 'react-router-dom'
import { MOCK_PATIENTS, MOCK_RENDEZVOUS, MOCK_NOTIFICATIONS } from '@/mocks/data'
import { STATUS_LABELS, STATUS_COLORS, formatDate, formatRelative } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

const CHART_DATA = [
  { mois: 'Oct', patients: 12 },
  { mois: 'Nov', patients: 18 },
  { mois: 'Déc', patients: 14 },
  { mois: 'Jan', patients: 22 },
  { mois: 'Fév', patients: 28 },
  { mois: 'Mar', patients: 24 },
]

const SOURCE_DATA = [
  { source: 'Instagram', count: 45, color: 'bg-pink-400' },
  { source: 'WhatsApp', count: 30, color: 'bg-emerald-400' },
  { source: 'Google', count: 20, color: 'bg-blue-400' },
  { source: 'Direct', count: 5, color: 'bg-slate-400' },
]

export default function DashboardMedecinPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const notifications = MOCK_NOTIFICATIONS.filter((n) => n.userId === user?.id && !n.lu)
  const newDossiers = MOCK_PATIENTS.filter((p) =>
    ['formulaire_complete', 'en_analyse'].includes(p.status)
  )
  const rdvToday = MOCK_RENDEZVOUS.filter((r) => r.date === '2026-04-15')

  const stats = [
    {
      label: 'Patients actifs',
      value: MOCK_PATIENTS.filter((p) => p.status !== 'suivi_termine').length,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      change: '+3 ce mois',
    },
    {
      label: 'Dossiers à analyser',
      value: newDossiers.length,
      icon: FileText,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      change: 'En attente',
      urgent: newDossiers.length > 0,
    },
    {
      label: 'RDV ce mois',
      value: MOCK_RENDEZVOUS.length,
      icon: Calendar,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      change: '2 cette semaine',
    },
    {
      label: 'Taux conversion',
      value: '68%',
      icon: TrendingUp,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      change: '+5% vs mois dernier',
    },
  ]

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Greeting */}
      <div>
        <h2 className="text-xl font-bold text-foreground">Bonjour, {user?.name}</h2>
        <p className="text-muted-foreground text-sm">
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Notifications urgentes */}
      {notifications.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              {notifications.length} notification(s) non lue(s)
            </p>
            <p className="text-xs text-amber-700 mt-0.5">{notifications[0].message}</p>
          </div>
          <Button variant="ghost" size="sm" className="text-amber-700 hover:bg-amber-100">
            Voir tout
          </Button>
        </div>
      )}

      {/* KPI Stats */}
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
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{stat.label}</p>
                <p className="text-xs text-muted-foreground/70 mt-1">{stat.change}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Évolution des patients (6 mois)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={CHART_DATA}>
                <defs>
                  <linearGradient id="colorPatients" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c44828" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#c44828" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mois" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                />
                <Area
                  type="monotone"
                  dataKey="patients"
                  stroke="#c44828"
                  strokeWidth={2}
                  fill="url(#colorPatients)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Sources */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sources de contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {SOURCE_DATA.map((s) => (
              <div key={s.source}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{s.source}</span>
                  <span className="text-muted-foreground">{s.count}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${s.color} transition-all duration-700`}
                    style={{ width: `${s.count}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Dossiers à analyser */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Dossiers à analyser</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate('/medecin/patients')}>
            Voir tous <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </CardHeader>
        <CardContent>
          {newDossiers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aucun dossier en attente d'analyse.
            </p>
          ) : (
            <div className="space-y-2">
              {newDossiers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl border p-3 hover:bg-muted/50 cursor-pointer transition-all group"
                  onClick={() => navigate(`/medecin/patients/${p.id}`)}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-brand-100 text-brand-700 text-sm font-semibold">
                      {p.prenom[0]}{p.nom[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {p.prenom} {p.nom}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.sourceContact} • {formatRelative(p.derniereActivite)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs ${STATUS_COLORS[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prochains RDV */}
      {rdvToday.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand-600" />
              Prochains rendez-vous
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rdvToday.map((rdv) => {
              const patient = MOCK_PATIENTS.find((p) => p.id === rdv.patientId)
              return (
                <div key={rdv.id} className="flex items-center gap-3 rounded-xl border-l-4 border-l-brand-500 bg-brand-50/50 p-3">
                  <div className="text-center min-w-[50px]">
                    <p className="text-lg font-bold text-brand-700">{rdv.heure}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(rdv.date)}</p>
                  </div>
                  <div className="w-px h-8 bg-border" />
                  <div>
                    <p className="text-sm font-semibold">
                      {patient?.prenom} {patient?.nom}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{rdv.type}</p>
                    {rdv.notes && <p className="text-xs text-muted-foreground/70 mt-0.5">{rdv.notes}</p>}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
