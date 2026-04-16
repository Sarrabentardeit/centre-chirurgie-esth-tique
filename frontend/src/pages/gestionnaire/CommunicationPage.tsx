import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEffect, useMemo, useState } from 'react'
import { gestionnaireApi, type GestionnaireTemplate } from '@/lib/api'
import { RefreshCw } from 'lucide-react'

export default function CommunicationPage() {
  const [templates, setTemplates] = useState<GestionnaireTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await gestionnaireApi.getCommunicationTemplates()
      setTemplates(res.templates)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const map = useMemo(() => {
    const m = new Map<string, GestionnaireTemplate>()
    templates.forEach((t) => m.set(t.key, t))
    return m
  }, [templates])

  const ordered: Array<'formulaireAck' | 'devisSent' | 'refus'> = ['formulaireAck', 'devisSent', 'refus']

  const patchTemplate = async (
    key: 'formulaireAck' | 'devisSent' | 'refus',
    patch: Partial<Pick<GestionnaireTemplate, 'content' | 'channel' | 'active'>>
  ) => {
    const tpl = map.get(key)
    if (!tpl) return
    setSavingKey(key)
    setError(null)
    try {
      await gestionnaireApi.updateCommunicationTemplate(key, {
        content: patch.content ?? tpl.content,
        channel: patch.channel ?? tpl.channel,
        active: patch.active ?? tpl.active,
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.')
    } finally {
      setSavingKey(null)
    }
  }

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
          onClick={() => void gestionnaireApi.resetAllCommunicationTemplates().then(load).catch(() => setError('Reset impossible.'))}
        >
          Réinitialiser défaut
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" /> Chargement des templates...
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Textes d'accompagnement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Variables disponibles: {'{prenom}'}, {'{nom}'}, {'{reason}'}.
          </p>
          {ordered.map((key) => {
            const tpl = map.get(key)
            if (!tpl) return null
            return (
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
                    disabled={savingKey === key}
                    onClick={() => void patchTemplate(key, { active: !tpl.active })}
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
                    onValueChange={(v) => void patchTemplate(key, { channel: v as 'chat' | 'notification' | 'both' })}
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
                    disabled={savingKey === key}
                    onClick={() => void gestionnaireApi.resetCommunicationTemplate(key).then(load).catch(() => setError('Reset impossible.'))}
                  >
                    Reset ce template
                  </Button>
                </div>
              </div>

              <Textarea
                rows={4}
                value={tpl.content}
                onChange={(e) => {
                  const value = e.target.value
                  setTemplates((prev) => prev.map((t) => (t.key === key ? { ...t, content: value } : t)))
                }}
              />
              <div className="flex justify-end">
                <Button size="sm" variant="outline" disabled={savingKey === key} onClick={() => void patchTemplate(key, { content: tpl.content })}>
                  Enregistrer ce texte
                </Button>
              </div>

              <div className="rounded-md bg-muted/60 border p-2">
                <p className="text-xs font-medium mb-1">Aperçu</p>
                <p className="text-sm text-muted-foreground">{preview(tpl.content)}</p>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Dernière modification: {formatDateTime(tpl.updatedAt)} par {tpl.updatedBy}
              </p>
            </div>
          )})}
        </CardContent>
      </Card>
    </div>
  )
}

