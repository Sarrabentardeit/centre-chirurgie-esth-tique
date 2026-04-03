import { Calendar, Clock, User } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useDemoStore } from '@/store/demoStore'
import { formatDate } from '@/lib/utils'

export default function AgendaMedecinPage() {
  const patients = useDemoStore((s) => s.patients)
  const rdv = useDemoStore((s) => s.rdv)

  const planned = rdv
    .slice()
    .sort((a, b) => {
      const da = `${a.date}T${a.heure}:00`
      const db = `${b.date}T${b.heure}:00`
      return new Date(da).getTime() - new Date(db).getTime()
    })

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Agenda médecin</h2>
        <p className="text-sm text-muted-foreground">
          Vue globale des rendez-vous planifiés.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rendez-vous ({planned.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {planned.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun rendez-vous planifié.</p>
          ) : (
            planned.map((item) => {
              const patient = patients.find((p) => p.id === item.patientId)
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2.5"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Calendar className="h-4 w-4 text-brand-600" />
                      {formatDate(item.date)}
                      <Clock className="h-4 w-4 ml-2 text-brand-600" />
                      {item.heure}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="h-3.5 w-3.5" />
                      {patient ? `${patient.prenom} ${patient.nom}` : 'Patient inconnu'}
                    </div>
                  </div>
                  <Badge variant={item.statut === 'confirme' ? 'success' : 'warning'}>
                    {item.statut === 'confirme' ? 'Confirmé' : 'En attente'}
                  </Badge>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
