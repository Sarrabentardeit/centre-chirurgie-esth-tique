import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useDemoStore } from '@/store/demoStore'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function CommunicationPage() {
  const { user } = useAuthStore()
  const communicationTemplates = useDemoStore((s) => s.communicationTemplates)
  const setCommunicationTemplateContent = useDemoStore((s) => s.setCommunicationTemplateContent)
  const setCommunicationTemplateChannel = useDemoStore((s) => s.setCommunicationTemplateChannel)
  const toggleCommunicationTemplate = useDemoStore((s) => s.toggleCommunicationTemplate)
  const resetCommunicationTemplate = useDemoStore((s) => s.resetCommunicationTemplate)
  const resetAllCommunicationTemplates = useDemoStore((s) => s.resetAllCommunicationTemplates)

  const preview = (content: string) =>
    content
      .split('{prenom}').join('Amira')
      .split('{nom}').join('Benali')
      .split('{reason}').join('Motif médical expliqué')

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Communication & Templates</h2>
          <p className="text-sm text-muted-foreground">
            Personnalisez les textes automatiques d'accompagnement envoyés aux patientes.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            resetAllCommunicationTemplates(user?.name ?? 'Gestionnaire')
          }}
        >
          Réinitialiser défaut
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Textes d'accompagnement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Variables disponibles: {'{prenom}'}, {'{nom}'}, {'{reason}'}.
          </p>
          {([
            ['formulaireAck', communicationTemplates.formulaireAck],
            ['devisSent', communicationTemplates.devisSent],
            ['refus', communicationTemplates.refus],
          ] as const).map(([key, tpl]) => (
            <div key={key} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-sm font-semibold">{tpl.title}</label>
                <div className="flex items-center gap-2">
                  <Badge variant={tpl.active ? 'success' : 'secondary'}>
                    {tpl.active ? 'Actif' : 'Inactif'}
                  </Badge>
                  <Button
                    size="sm"
                    variant={tpl.active ? 'outline' : 'brand-outline'}
                    onClick={() => toggleCommunicationTemplate(key, !tpl.active, user?.name ?? 'Gestionnaire')}
                  >
                    {tpl.active ? 'Désactiver' : 'Activer'}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Canal d'envoi</p>
                  <Select
                    value={tpl.channel}
                    onValueChange={(v) => setCommunicationTemplateChannel(key, v as 'chat' | 'notification' | 'both', user?.name ?? 'Gestionnaire')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="both">Chat + Notification</SelectItem>
                      <SelectItem value="chat">Chat uniquement</SelectItem>
                      <SelectItem value="notification">Notification uniquement</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="self-end">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => resetCommunicationTemplate(key, user?.name ?? 'Gestionnaire')}
                  >
                    Reset ce template
                  </Button>
                </div>
              </div>

              <Textarea
                rows={4}
                value={tpl.content}
                onChange={(e) => setCommunicationTemplateContent(key, e.target.value, user?.name ?? 'Gestionnaire')}
              />

              <div className="rounded-md bg-muted/60 border p-2">
                <p className="text-xs font-medium mb-1">Aperçu</p>
                <p className="text-sm text-muted-foreground">{preview(tpl.content)}</p>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Dernière modification: {formatDateTime(tpl.updatedAt)} par {tpl.updatedBy}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

