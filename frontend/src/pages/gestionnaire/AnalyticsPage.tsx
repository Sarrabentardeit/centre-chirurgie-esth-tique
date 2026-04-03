import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const CONVERSION_DATA = [
  { step: 'Leads', count: 100 },
  { step: 'Formulaires', count: 72 },
  { step: 'Devis', count: 45 },
  { step: 'RDV', count: 30 },
  { step: 'Interventions', count: 22 },
]

export default function AnalyticsPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Analytics</h2>
        <p className="text-sm text-muted-foreground">
          Performance du parcours patient et conversion commerciale.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Entonnoir de conversion</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={CONVERSION_DATA} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis dataKey="step" type="category" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={90} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
              <Bar dataKey="count" fill="#81572d" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
