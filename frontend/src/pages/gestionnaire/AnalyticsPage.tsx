import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useEffect, useState } from 'react'
import { gestionnaireApi, type GestionnaireAnalyticsMonthly, type GestionnaireAnalyticsStatus, type GestionnaireFunnelStep } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { RefreshCw } from 'lucide-react'
const PIE_COLORS = ['#81572d', '#c44828', '#d97706', '#2563eb', '#10b981', '#6b7280']

export default function AnalyticsPage() {
  const [funnel, setFunnel] = useState<GestionnaireFunnelStep[]>([])
  const [statusDistribution, setStatusDistribution] = useState<GestionnaireAnalyticsStatus[]>([])
  const [monthlyDevis, setMonthlyDevis] = useState<GestionnaireAnalyticsMonthly[]>([])
  const [kpis, setKpis] = useState<{ acceptanceRate: number; rdvRate: number }>({ acceptanceRate: 0, rdvRate: 0 })
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
      setKpis(res.kpis)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Performance du parcours patient et conversion commerciale.
          </p>
        </div>
        <button className="inline-flex items-center rounded-lg border px-3 py-2 text-sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Taux acceptation devis</p>
            <p className="text-2xl font-bold mt-1">{kpis.acceptanceRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Taux conversion RDV</p>
            <p className="text-2xl font-bold mt-1">{kpis.rdvRate}%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Entonnoir de conversion</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={funnel} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis dataKey="step" type="category" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={90} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
              <Bar dataKey="count" fill="#81572d" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Répartition des statuts</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={statusDistribution} dataKey="count" nameKey="status" outerRadius={90}>
                  {statusDistribution.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Évolution devis (6 mois)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthlyDevis}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mois" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="total" stroke="#81572d" strokeWidth={2} />
                <Line type="monotone" dataKey="accepte" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-3 flex gap-2 flex-wrap">
              <Badge variant="outline">Courbe marron: total devis</Badge>
              <Badge variant="outline">Courbe verte: devis acceptés</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
