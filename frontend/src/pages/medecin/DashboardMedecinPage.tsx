import { useEffect, useState } from 'react'
import {
  Users, FileText, Calendar, TrendingUp, Clock, AlertTriangle,
  ChevronRight, Stethoscope, Plus, ClipboardList, RefreshCw, AlertCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { useNavigate } from 'react-router-dom'
import { STATUS_LABELS, STATUS_COLORS, formatDate, formatRelative } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { medecinApi } from '@/lib/api'
import type { PatientListItem, RdvMedecin, DashboardMonthStat, DashboardSourceStat } from '@/lib/api'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const SOURCE_COLORS = ['bg-pink-400', 'bg-emerald-400', 'bg-blue-400', 'bg-amber-400', 'bg-violet-400', 'bg-slate-400']

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function DashSkeleton() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Skeleton className="h-48 lg:col-span-2 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  )
}

export default function DashboardMedecinPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const [stats, setStats]                 = useState({ totalPatients: 0, aAnalyser: 0, rdvAujourdhui: 0, rdvCetteSemaine: 0 })
  const [derniersPatients, setDerniers]   = useState<PatientListItem[]>([])
  const [prochainRdv, setProchainRdv]     = useState<RdvMedecin[]>([])
  const [evolutionPatients, setEvolutionPatients] = useState<DashboardMonthStat[]>([])
  const [sourcesContact, setSourcesContact]       = useState<DashboardSourceStat[]>([])

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const res = await medecinApi.getDashboard()
      setStats(res.stats)
      setDerniers(res.derniersPatients)
      setProchainRdv(res.prochainRdv)
      setEvolutionPatients(res.evolutionPatients)
      setSourcesContact(res.sourcesContact)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  if (loading) return <DashSkeleton />

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground text-sm">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Réessayer
        </Button>
      </div>
    )
  }

  const urgents = derniersPatients.filter((p) => p.status === 'formulaire_complete').slice(0, 5)

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Bonjour, Dr. {user?.name}</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="brand" size="sm" className="gap-1.5" onClick={() => navigate('/medecin/patients/nouveau')}>
            <Plus className="h-3.5 w-3.5" /> Patient
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/medecin/rapports')}>
            <Stethoscope className="h-3.5 w-3.5" /> Rapports
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/medecin/agenda')}>
            <Calendar className="h-3.5 w-3.5" /> Agenda
          </Button>
        </div>
      </div>

      {/* ── Alerte urgente ── */}
      {stats.aAnalyser > 0 && (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-amber-100 transition-colors"
          onClick={() => navigate('/medecin/patients?status=formulaire_complete')}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {stats.aAnalyser} dossier{stats.aAnalyser > 1 ? 's' : ''} en attente d'analyse
              </p>
              <p className="text-xs text-amber-700 mt-0.5">Ces patients attendent votre rapport médical.</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-amber-700 shrink-0">Voir →</span>
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Patients total',
            value: stats.totalPatients,
            icon: Users,
            color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100',
            sub: 'Tous dossiers',
            onClick: () => navigate('/medecin/patients'),
          },
          {
            label: 'À analyser',
            value: stats.aAnalyser,
            icon: FileText,
            color: stats.aAnalyser > 0 ? 'text-amber-600' : 'text-slate-400',
            bg: stats.aAnalyser > 0 ? 'bg-amber-50' : 'bg-slate-50',
            border: stats.aAnalyser > 0 ? 'border-amber-200' : 'border-slate-100',
            sub: 'Formulaires complets',
            urgent: stats.aAnalyser > 0,
            onClick: () => navigate('/medecin/patients'),
          },
          {
            label: "RDV aujourd'hui",
            value: stats.rdvAujourdhui,
            icon: Calendar,
            color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100',
            sub: `${stats.rdvCetteSemaine} cette semaine`,
            onClick: () => navigate('/medecin/agenda'),
          },
          {
            label: 'Derniers patients',
            value: derniersPatients.length,
            icon: ClipboardList,
            color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100',
            sub: 'Récemment actifs',
            onClick: () => navigate('/medecin/patients'),
          },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <button
              key={stat.label}
              onClick={stat.onClick}
              className={`rounded-xl border p-4 text-left hover:shadow-md transition-all ${stat.border} ${stat.bg}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`rounded-xl p-2 bg-white/80 ${stat.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                {stat.urgent && <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />}
              </div>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-sm font-medium text-foreground mt-0.5">{stat.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.sub}</p>
            </button>
          )
        })}
      </div>

      {/* ── Grille principale ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Évolution des patients (6 mois)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={evolutionPatients}>
                <defs>
                  <linearGradient id="colorPat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c44828" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#c44828" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mois" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '11px' }} />
                <Area type="monotone" dataKey="patients" stroke="#c44828" strokeWidth={2} fill="url(#colorPat)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sources de contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sourcesContact.map((s, idx) => (
              <div key={s.source}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">{s.source}</span>
                  <span className="text-muted-foreground">{s.count}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${SOURCE_COLORS[idx % SOURCE_COLORS.length]}`} style={{ width: `${s.count}%` }} />
                </div>
              </div>
            ))}
            {sourcesContact.length === 0 && (
              <p className="text-xs text-muted-foreground">Aucune source disponible.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Ligne basse ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Urgents */}
        <Card className={urgents.length > 0 ? 'border-amber-200' : ''}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className={`h-4 w-4 ${urgents.length > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
                À analyser
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate('/medecin/patients')}>
                Voir tout <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {urgents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">✅ Aucun dossier en attente</p>
            ) : (
              <div className="space-y-2">
                {urgents.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5 cursor-pointer hover:bg-amber-50 transition-colors group"
                    onClick={() => navigate(`/medecin/patients/${p.id}?tab=rapport`)}
                  >
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback className="bg-amber-100 text-amber-700 text-xs font-bold">
                        {getInitials(p.user.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{p.user.fullName}</p>
                      <p className="text-[10px] text-muted-foreground">{p.dossierNumber} · {formatRelative(p.updatedAt)}</p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-amber-600 transition-colors shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Prochains RDV */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-brand-600" /> Prochains RDV
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate('/medecin/agenda')}>
                Agenda <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {prochainRdv.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun RDV à venir</p>
            ) : (
              <div className="space-y-2">
                {prochainRdv.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 rounded-lg border-l-2 border-l-brand-400 bg-brand-50/40 px-3 py-2.5 cursor-pointer hover:bg-brand-50 transition-colors"
                    onClick={() => navigate('/medecin/agenda')}
                  >
                    <div className="text-center shrink-0">
                      <p className="text-sm font-bold text-brand-700">{r.heure}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDate(r.date.slice(0, 10))}</p>
                    </div>
                    <div className="w-px h-7 bg-border/60 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">
                        {r.patient ? r.patient.user.fullName : r.type}
                      </p>
                      <p className="text-[10px] text-muted-foreground capitalize">
                        {r.motif ?? r.type}
                      </p>
                    </div>
                    <Badge
                      variant={r.statut === 'confirme' ? 'success' : 'warning'}
                      className="text-[10px] ml-auto shrink-0"
                    >
                      {r.statut === 'confirme' ? 'Confirmé' : 'Planifié'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activité récente */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-600" /> Activité récente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {derniersPatients.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun patient</p>
            ) : (
              <div className="space-y-2">
                {derniersPatients.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() => navigate(`/medecin/patients/${p.id}`)}
                  >
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback className="bg-brand-100 text-brand-700 text-xs font-bold">
                        {getInitials(p.user.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{p.user.fullName}</p>
                      <p className="text-[10px] text-muted-foreground">{formatRelative(p.updatedAt)}</p>
                    </div>
                    <Badge className={`text-[10px] shrink-0 ${STATUS_COLORS[p.status as keyof typeof STATUS_COLORS] ?? ''}`}>
                      {STATUS_LABELS[p.status as keyof typeof STATUS_LABELS] ?? p.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
