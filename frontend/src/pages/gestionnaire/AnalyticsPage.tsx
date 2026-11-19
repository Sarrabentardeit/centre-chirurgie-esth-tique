import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, PieChart, Pie, Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useEffect, useMemo, useState } from 'react'
import {
  gestionnaireApi,
  type GestionnaireAnalyticsBucket,
  type GestionnaireAnalyticsDevisBucket,
  type GestionnaireAnalyticsMonthly,
  type GestionnaireAnalyticsSource,
} from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { formatSourceConnaissanceLabel } from '@/lib/sourceConnaissance'
import { RefreshCw } from 'lucide-react'

const CHART_COLORS = ['#81572d', '#0284c7', '#059669', '#c44828', '#7c3aed', '#d97706', '#64748b', '#be123c', '#0d9488', '#a16207']

const DEVIS_BUCKET_COLORS: Record<string, string> = {
  non_traiter: '#7c3aed',
  traiter: '#0284c7',
  accepte: '#059669',
  abstention: '#d97706',
}

const AGE_LABELS: Record<string, string> = {
  '<25': 'Moins de 25 ans',
  '25-34': '25–34 ans',
  '35-44': '35–44 ans',
  '45-54': '45–54 ans',
  '55+': '55 ans et plus',
  non_renseigne: 'Non renseigné',
}

const SEXE_LABELS: Record<string, string> = {
  femme: 'Femme',
  homme: 'Homme',
  non_renseigne: 'Non renseigné',
}

type AnalyticsKpis = {
  nonTraiterRate: number
  nonTraiterCount: number
  nonTraiterBase: number
  treatedRate: number
  treatedCount: number
  treatedBase: number
  abstentionRate: number
  abstentionCount: number
  abstentionBase: number
}

const EMPTY_KPIS: AnalyticsKpis = {
  nonTraiterRate: 0,
  nonTraiterCount: 0,
  nonTraiterBase: 0,
  treatedRate: 0,
  treatedCount: 0,
  treatedBase: 0,
  abstentionRate: 0,
  abstentionCount: 0,
  abstentionBase: 0,
}

type DistRow = {
  key: string
  label: string
  count: number
  pct: number
  fill: string
}

type ProfilTab = 'sources' | 'age' | 'sexe' | 'interventions' | 'pays'

const PROFIL_TABS: Array<{ id: ProfilTab; label: string; column: string }> = [
  { id: 'sources', label: 'Sources', column: 'Source' },
  { id: 'age', label: 'Âge', column: 'Tranche' },
  { id: 'sexe', label: 'Sexe', column: 'Sexe' },
  { id: 'interventions', label: 'Interventions', column: 'Intervention' },
  { id: 'pays', label: 'Pays', column: 'Pays' },
]

function toDistRows(
  items: Array<{ key: string; count: number }>,
  labelOf: (key: string) => string,
): DistRow[] {
  const total = items.reduce((n, s) => n + s.count, 0)
  return items.map((s, i) => ({
    key: s.key,
    label: labelOf(s.key),
    count: s.count,
    pct: total > 0 ? Math.round((s.count / total) * 100) : 0,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }))
}

function formatPaysLabel(key: string): string {
  if (key === 'non_renseigne') return 'Non renseigné'
  return key
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toLocaleUpperCase('fr-FR') + w.slice(1) : w))
    .join(' ')
}

export default function AnalyticsPage() {
  const [devisBuckets, setDevisBuckets] = useState<GestionnaireAnalyticsDevisBucket[]>([])
  const [monthlyDevis, setMonthlyDevis] = useState<GestionnaireAnalyticsMonthly[]>([])
  const [sourceDistribution, setSourceDistribution] = useState<GestionnaireAnalyticsSource[]>([])
  const [ageDistribution, setAgeDistribution] = useState<GestionnaireAnalyticsBucket[]>([])
  const [sexeDistribution, setSexeDistribution] = useState<GestionnaireAnalyticsBucket[]>([])
  const [interventionDistribution, setInterventionDistribution] = useState<GestionnaireAnalyticsBucket[]>([])
  const [paysDistribution, setPaysDistribution] = useState<GestionnaireAnalyticsBucket[]>([])
  const [kpis, setKpis] = useState<AnalyticsKpis>(EMPTY_KPIS)
  const [profilTab, setProfilTab] = useState<ProfilTab>('sources')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await gestionnaireApi.getAnalytics()
      setDevisBuckets(res.devisBuckets ?? [])
      setMonthlyDevis(res.monthlyDevis)
      setSourceDistribution(res.sourceDistribution ?? [])
      setAgeDistribution(res.ageDistribution ?? [])
      setSexeDistribution(res.sexeDistribution ?? [])
      setInterventionDistribution(res.interventionDistribution ?? [])
      setPaysDistribution(res.paysDistribution ?? [])
      setKpis({
        nonTraiterRate: res.kpis.nonTraiterRate ?? 0,
        nonTraiterCount: res.kpis.nonTraiterCount ?? 0,
        nonTraiterBase: res.kpis.nonTraiterBase ?? 0,
        treatedRate: res.kpis.treatedRate ?? 0,
        treatedCount: res.kpis.treatedCount ?? 0,
        treatedBase: res.kpis.treatedBase ?? 0,
        abstentionRate: res.kpis.abstentionRate ?? 0,
        abstentionCount: res.kpis.abstentionCount ?? 0,
        abstentionBase: res.kpis.abstentionBase ?? 0,
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

  const { bucketRows, totalBuckets, chartData } = useMemo(() => {
    const total = devisBuckets.reduce((n, b) => n + b.count, 0)
    const rows = devisBuckets.map((b) => ({
      key: b.key,
      label: b.label,
      count: b.count,
      pct: total > 0 ? Math.round((b.count / total) * 100) : 0,
      fill: DEVIS_BUCKET_COLORS[b.key] ?? '#81572d',
    }))
    return {
      bucketRows: rows,
      totalBuckets: total,
      chartData: [...rows].reverse(),
    }
  }, [devisBuckets])

  const chartHeight = Math.max(220, chartData.length * 36 + 40)

  const sourceRows = useMemo(
    () =>
      toDistRows(
        sourceDistribution.map((s) => ({ key: s.source, count: s.count })),
        (key) => (key === 'non_renseigne' ? 'Non renseigné' : formatSourceConnaissanceLabel(key)),
      ),
    [sourceDistribution],
  )

  const ageRows = useMemo(
    () => toDistRows(ageDistribution, (key) => AGE_LABELS[key] ?? key),
    [ageDistribution],
  )

  const sexeRows = useMemo(
    () => toDistRows(sexeDistribution, (key) => SEXE_LABELS[key] ?? key),
    [sexeDistribution],
  )

  const interventionRows = useMemo(
    () =>
      toDistRows(interventionDistribution, (key) =>
        key === 'non_renseigne' ? 'Non renseigné' : key,
      ),
    [interventionDistribution],
  )

  const paysRows = useMemo(
    () => toDistRows(paysDistribution, formatPaysLabel),
    [paysDistribution],
  )

  const profilByTab: Record<ProfilTab, DistRow[]> = {
    sources: sourceRows,
    age: ageRows,
    sexe: sexeRows,
    interventions: interventionRows,
    pays: paysRows,
  }

  const activeProfil = PROFIL_TABS.find((t) => t.id === profilTab) ?? PROFIL_TABS[0]
  const profilRows = profilByTab[activeProfil.id]
  const profilTotal = profilRows.reduce((n, r) => n + r.count, 0)

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Chiffres alignés sur Gestion des devis (patients uniques).
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
            <p className="text-sm text-muted-foreground">Taux devis non traiter</p>
            <p className="text-2xl font-bold mt-1">{kpis.nonTraiterRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Taux devis traité</p>
            <p className="text-2xl font-bold mt-1">{kpis.treatedRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Taux devis abstention</p>
            <p className="text-2xl font-bold mt-1">{kpis.abstentionRate}%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Statuts devis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {bucketRows.map((row) => (
              <div
                key={row.key}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  {row.label}
                </p>
                <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{row.count}</p>
                <p className="text-[11px] text-slate-500 mt-1">{row.pct}%</p>
              </div>
            ))}
          </div>

          {bucketRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Aucun dossier à afficher.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    dataKey="label"
                    type="category"
                    width={110}
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
                      <Cell key={row.key} fill={row.fill} />
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
                <ul className="divide-y divide-slate-100">
                  {bucketRows.map((row) => (
                    <li key={row.key} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-3 py-2.5 text-sm">
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
                  <span>Total</span>
                  <span className="tabular-nums">{totalBuckets}</span>
                  <span className="tabular-nums w-10 text-right">100%</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Évolution devis</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            Nombre de devis traités chaque mois depuis septembre (hors supprimés).
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={monthlyDevis}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mois" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="total" name="Traités" stroke="#81572d" strokeWidth={2} />
              <Line type="monotone" dataKey="accepte" name="Acceptés" stroke="#10b981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-3 flex gap-2 flex-wrap">
            <Badge variant="outline">Marron : traités</Badge>
            <Badge variant="outline">Vert : acceptés</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Profil des patients</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            Formulaire soumis (hors abstention) — sources, âge, sexe, interventions et pays.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200">
            {PROFIL_TABS.map((tab) => {
              const active = profilTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setProfilTab(tab.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {profilRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Aucune donnée pour ce KPI.</p>
          ) : profilTab === 'interventions' ? (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 bg-slate-50 border-b text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <span>{activeProfil.column}</span>
                <span className="tabular-nums">Nb</span>
                <span className="tabular-nums w-12 text-right">%</span>
              </div>
              <ul className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
                {profilRows.map((row) => (
                  <li key={row.key} className="grid grid-cols-[1fr_auto_auto] gap-3 items-start px-3 py-2.5 text-sm">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="mt-1.5 h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: row.fill }} />
                      <span className="font-medium text-slate-800 leading-snug">{row.label}</span>
                    </div>
                    <span className="tabular-nums font-semibold text-slate-900">{row.count}</span>
                    <span className="tabular-nums text-slate-500 w-12 text-right">{row.pct}%</span>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 bg-slate-50 border-t text-xs font-semibold text-slate-700">
                <span>Total</span>
                <span className="tabular-nums">{profilTotal}</span>
                <span className="tabular-nums w-12 text-right">100%</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-center">
              <div className="rounded-xl border border-slate-200 bg-white p-2 min-h-[280px]">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={profilRows}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={95}
                      paddingAngle={2}
                    >
                      {profilRows.map((row) => (
                        <Cell key={row.key} fill={row.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [`${value} patient${Number(value) > 1 ? 's' : ''}`, 'Effectif']}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                    />
                    <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 bg-slate-50 border-b text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <span>{activeProfil.column}</span>
                  <span className="tabular-nums">Nb</span>
                  <span className="tabular-nums w-10 text-right">%</span>
                </div>
                <ul className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
                  {profilRows.map((row) => (
                    <li key={row.key} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-3 py-2.5 text-sm">
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
                  <span>Total</span>
                  <span className="tabular-nums">{profilTotal}</span>
                  <span className="tabular-nums w-10 text-right">100%</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
