import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, PieChart, Pie, Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useEffect, useMemo, useState } from 'react'
import {
  gestionnaireApi,
  type GestionnaireAnalyticsMonthly,
  type GestionnaireAnalyticsMonthlyPatients,
  type GestionnaireAnalyticsSource,
  type GestionnaireAnalyticsStatus,
  type GestionnaireFunnelStep,
} from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { dossierStatusLabel } from '@/lib/utils'
import { formatSourceConnaissanceLabel } from '@/lib/sourceConnaissance'
import { RefreshCw } from 'lucide-react'

const SOURCE_BAR_COLORS = ['#81572d', '#0284c7', '#059669', '#c44828', '#7c3aed', '#d97706', '#64748b', '#be123c']

/** Ordre métier du parcours (affichage détaillé). */
const STATUS_ORDER = [
  'nouveau',
  'formulaire_en_cours',
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
] as const

const STATUS_BAR_COLORS: Record<string, string> = {
  nouveau: '#94a3b8',
  formulaire_en_cours: '#64748b',
  formulaire_complete: '#475569',
  en_analyse: '#2563eb',
  rapport_genere: '#81572d',
  rapport_modifie: '#a16207',
  devis_preparation: '#d97706',
  devis_envoye: '#0284c7',
  devis_accepte: '#059669',
  date_reservee: '#0d9488',
  logistique: '#c44828',
  intervention: '#be123c',
  post_op: '#7c3aed',
  suivi_termine: '#166534',
  abstention: '#78716c',
}

type AnalyticsKpis = {
  acceptanceRate: number
  acceptanceAccepted: number
  acceptanceBase: number
  responseRate: number
  responseResponded: number
  responseBase: number
  rdvRate: number
  rdvPatients: number
  rdvBase: number
}

const EMPTY_KPIS: AnalyticsKpis = {
  acceptanceRate: 0,
  acceptanceAccepted: 0,
  acceptanceBase: 0,
  responseRate: 0,
  responseResponded: 0,
  responseBase: 0,
  rdvRate: 0,
  rdvPatients: 0,
  rdvBase: 0,
}

function statusRank(status: string): number {
  const i = STATUS_ORDER.indexOf(status as (typeof STATUS_ORDER)[number])
  return i === -1 ? 999 : i
}

export default function AnalyticsPage() {
  const [funnel, setFunnel] = useState<GestionnaireFunnelStep[]>([])
  const [statusDistribution, setStatusDistribution] = useState<GestionnaireAnalyticsStatus[]>([])
  const [monthlyDevis, setMonthlyDevis] = useState<GestionnaireAnalyticsMonthly[]>([])
  const [monthlyPatients, setMonthlyPatients] = useState<GestionnaireAnalyticsMonthlyPatients[]>([])
  const [sourceDistribution, setSourceDistribution] = useState<GestionnaireAnalyticsSource[]>([])
  const [kpis, setKpis] = useState<AnalyticsKpis>(EMPTY_KPIS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await gestionnaireApi.getAnalytics()
      setFunnel(res.funnel)
      setStatusDistribution(res.statusDistribution)
      setMonthlyDevis(res.monthlyDevis)
      setMonthlyPatients(res.monthlyPatients ?? [])
      setSourceDistribution(res.sourceDistribution ?? [])
      setKpis({
        acceptanceRate: res.kpis.acceptanceRate,
        acceptanceAccepted: res.kpis.acceptanceAccepted ?? 0,
        acceptanceBase: res.kpis.acceptanceBase ?? 0,
        responseRate: res.kpis.responseRate ?? 0,
        responseResponded: res.kpis.responseResponded ?? 0,
        responseBase: res.kpis.responseBase ?? 0,
        rdvRate: res.kpis.rdvRate,
        rdvPatients: res.kpis.rdvPatients ?? 0,
        rdvBase: res.kpis.rdvBase ?? 0,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const { actifsRows, abstentionCount, totalActifs, totalAll, chartData } = useMemo(() => {
    const abstention = statusDistribution.find((s) => s.status === 'abstention')?.count ?? 0
    const actifs = statusDistribution
      .filter((s) => s.status !== 'abstention' && s.count > 0)
      .sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.count - a.count)
    const sumActifs = actifs.reduce((n, s) => n + s.count, 0)
    const rows = actifs.map((s) => ({
      status: s.status,
      label: dossierStatusLabel(s.status),
      count: s.count,
      pct: sumActifs > 0 ? Math.round((s.count / sumActifs) * 100) : 0,
      fill: STATUS_BAR_COLORS[s.status] ?? '#81572d',
    }))
    return {
      actifsRows: rows,
      abstentionCount: abstention,
      totalActifs: sumActifs,
      totalAll: sumActifs + abstention,
      chartData: [...rows].reverse(),
    }
  }, [statusDistribution])

  const chartHeight = Math.max(220, chartData.length * 28 + 40)

  const sourceRows = useMemo(() => {
    const total = sourceDistribution.reduce((n, s) => n + s.count, 0)
    return sourceDistribution.map((s, i) => ({
      ...s,
      label: s.source === 'non_renseigne' ? 'Non renseigné' : formatSourceConnaissanceLabel(s.source),
      pct: total > 0 ? Math.round((s.count / total) * 100) : 0,
      fill: SOURCE_BAR_COLORS[i % SOURCE_BAR_COLORS.length],
    }))
  }, [sourceDistribution])

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Chiffres en patients uniques (sauf évolution devis = nombre de devis créés).
          </p>
        </div>
        <button className="inline-flex items-center rounded-lg border px-3 py-2 text-sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Taux acceptation devis</p>
            <p className="text-2xl font-bold mt-1">{kpis.acceptanceRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {kpis.acceptanceAccepted} / {kpis.acceptanceBase} traités (comme Gestion des devis)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Taux de réponse devis</p>
            <p className="text-2xl font-bold mt-1">{kpis.responseRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {kpis.responseResponded} / {kpis.responseBase} ont répondu (accepté ou refusé)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Patients avec RDV</p>
            <p className="text-2xl font-bold mt-1">{kpis.rdvRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {kpis.rdvPatients} / {kpis.rdvBase} patients actifs
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Entonnoir (patients uniques)</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            Chaque patient compte au plus une fois à chaque étape.
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={funnel} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis dataKey="step" type="category" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={110} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
              <Bar dataKey="count" name="Patients" fill="#81572d" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Statuts de dossier (détail)</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            Répartition des patients par étape du parcours — actifs séparés de l’abstention.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Total dossiers</p>
              <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{totalAll}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Actifs</p>
              <p className="text-2xl font-bold text-sky-950 mt-1 tabular-nums">{totalActifs}</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">Abstention</p>
              <p className="text-2xl font-bold text-stone-800 mt-1 tabular-nums">{abstentionCount}</p>
              <p className="text-[11px] text-stone-500 mt-1">Hors parcours actif</p>
            </div>
          </div>

          {actifsRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Aucun dossier actif à afficher.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    dataKey="label"
                    type="category"
                    width={150}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(value) => [`${value} patient${Number(value) > 1 ? 's' : ''}`, 'Effectif']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                  />
                  <Bar dataKey="count" name="Patients" radius={[0, 4, 4, 0]}>
                    {chartData.map((row) => (
                      <Cell key={row.status} fill={row.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 bg-slate-50 border-b text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <span>Statut</span>
                  <span className="tabular-nums">Nb</span>
                  <span className="tabular-nums w-10 text-right">%</span>
                </div>
                <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                  {actifsRows.map((row) => (
                    <li key={row.status} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-3 py-2.5 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: row.fill }} />
                        <span className="truncate font-medium text-slate-800">{row.label}</span>
                      </div>
                      <span className="tabular-nums font-semibold text-slate-900">{row.count}</span>
                      <span className="tabular-nums text-slate-500 w-10 text-right">{row.pct}%</span>
                    </li>
                  ))}
                </ul>
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 bg-slate-50 border-t text-xs font-semibold text-slate-700">
                  <span>Total actifs</span>
                  <span className="tabular-nums">{totalActifs}</span>
                  <span className="tabular-nums w-10 text-right">100%</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Évolution devis (6 mois)</CardTitle>
            <p className="text-xs text-muted-foreground font-normal">
              Nombre de devis créés chaque mois (hors supprimés).
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthlyDevis}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mois" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="total" name="Créés" stroke="#81572d" strokeWidth={2} />
                <Line type="monotone" dataKey="accepte" name="Acceptés" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-3 flex gap-2 flex-wrap">
              <Badge variant="outline">Marron : créés</Badge>
              <Badge variant="outline">Vert : acceptés</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Nouveaux patients (6 mois)</CardTitle>
            <p className="text-xs text-muted-foreground font-normal">
              Dossiers créés chaque mois.
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthlyPatients}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mois" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="total" name="Nouveaux" stroke="#0284c7" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sources des patients</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            D’après le formulaire rempli par la patiente (dernier soumis, hors abstention).
          </p>
        </CardHeader>
        <CardContent>
          {sourceRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Aucune source renseignée.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-center">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={sourceRows}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {sourceRows.map((row) => (
                      <Cell key={row.source} fill={row.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [`${value} patient${Number(value) > 1 ? 's' : ''}`, 'Effectif']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                  />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 bg-slate-50 border-b text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <span>Source</span>
                  <span className="tabular-nums">Nb</span>
                  <span className="tabular-nums w-10 text-right">%</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {sourceRows.map((row) => (
                    <li key={row.source} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-3 py-2.5 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: row.fill }} />
                        <span className="truncate font-medium text-slate-800">{row.label}</span>
                      </div>
                      <span className="tabular-nums font-semibold text-slate-900">{row.count}</span>
                      <span className="tabular-nums text-slate-500 w-10 text-right">{row.pct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
