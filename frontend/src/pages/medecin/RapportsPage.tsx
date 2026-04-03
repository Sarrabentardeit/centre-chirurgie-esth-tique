import { useMemo } from 'react'
import { FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useDemoStore } from '@/store/demoStore'

export default function RapportsPage() {
  const patients = useDemoStore((s) => s.patients)

  const patientsWithReport = useMemo(
    () => patients.filter((p) => Boolean(p.rapportMedical)),
    [patients]
  )

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Rapports Médicaux</h2>
        <p className="text-sm text-muted-foreground">
          Synthèse des rapports générés pour vos patientes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rapports disponibles ({patientsWithReport.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {patientsWithReport.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun rapport disponible pour le moment.</p>
          ) : (
            patientsWithReport.map((patient) => (
              <div
                key={patient.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-white px-3 py-2.5"
              >
                <div className="rounded-md bg-brand-50 p-1.5">
                  <FileText className="h-4 w-4 text-brand-700" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {patient.prenom} {patient.nom}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {patient.rapportMedical?.resume || 'Rapport médical généré'}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
