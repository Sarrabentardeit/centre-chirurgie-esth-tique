import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDateTime, cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEffect, useMemo, useState } from 'react'
import {
  gestionnaireApi,
  type CommunicationTemplateKey,
  type GestionnaireTemplate,
} from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { toast } from '@/store/toastStore'
import { RefreshCw, RotateCcw, Save } from 'lucide-react'

const TEMPLATE_INFO: Record<
  CommunicationTemplateKey,
  { when: string }
> = {
  formulaireAck: {
    when: 'Quand la patiente soumet son formulaire.',
  },
  devisSent: {
    when: 'Quand vous envoyez un devis.',
  },
  refus: {
    when: 'Quand un devis est marqué non retenu.',
  },
  abstention: {
    when: 'Modèle prérempli pour un dossier en abstention.',
  },
  devisRappel: {
    when: 'Rappel pour un devis déjà envoyé (message + PDF).',
  },
  confirmationReservation: {
    when: 'Confirmation de séjour depuis la logistique (dates, devis, intervention).',
  },
}

const ORDER: CommunicationTemplateKey[] = [
  'formulaireAck',
  'devisSent',
  'refus',
  'abstention',
  'devisRappel',
  'confirmationReservation',
]

function isSystemDate(iso: string) {
  return !iso || new Date(iso).getTime() === 0
}

export default function CommunicationPage() {
  const [templates, setTemplates] = useState<GestionnaireTemplate[]>([])
  const [savedSnapshot, setSavedSnapshot] = useState<Record<string, string>>({})
  const [selectedKey, setSelectedKey] = useState<CommunicationTemplateKey>('formulaireAck')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await gestionnaireApi.getCommunicationTemplates()
      setTemplates(res.templates)
      const snap: Record<string, string> = {}
      res.templates.forEach((t) => {
        snap[t.key] = JSON.stringify({ content: t.content, channel: t.channel, active: t.active })
      })
      setSavedSnapshot(snap)
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

  const tpl = map.get(selectedKey)
  const info = TEMPLATE_INFO[selectedKey]
  const dirty = tpl
    ? savedSnapshot[tpl.key] !==
      JSON.stringify({ content: tpl.content, channel: tpl.channel, active: tpl.active })
    : false

  const updateLocal = (patch: Partial<Pick<GestionnaireTemplate, 'content' | 'channel' | 'active'>>) => {
    setTemplates((prev) =>
      prev.map((t) => (t.key === selectedKey ? { ...t, ...patch } : t)),
    )
  }

  const save = async () => {
    if (!tpl) return
    setSaving(true)
    setError(null)
    try {
      const next = { content: tpl.content, channel: tpl.channel, active: tpl.active }
      await gestionnaireApi.updateCommunicationTemplate(selectedKey, next)
      await load()
      toast({ title: 'Enregistré', variant: 'success' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.')
      toast({ title: 'Enregistrement impossible', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const resetAll = async () => {
    setSaving(true)
    setError(null)
    try {
      await gestionnaireApi.resetAllCommunicationTemplates()
      await load()
      toast({ title: 'Textes réinitialisés', variant: 'success' })
    } catch {
      setError('Reset impossible.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-10">
      <PageHeader
        title="Communication"
        description="Modifiez les textes envoyés aux patientes. Enregistrez pour appliquer."
        actions={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loading || saving}
            onClick={() => void resetAll()}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Défaut
          </Button>
        }
      />

      <p className="text-xs text-muted-foreground -mt-2">
        Variables : <code className="font-mono">{'{prenom}'}</code>,{' '}
        <code className="font-mono">{'{nom}'}</code>,{' '}
        <code className="font-mono">{'{reason}'}</code>
        {selectedKey === 'confirmationReservation' && (
          <>
            , <code className="font-mono">{'{dateArrivee}'}</code>,{' '}
            <code className="font-mono">{'{dateIntervention}'}</code>,{' '}
            <code className="font-mono">{'{dateDepart}'}</code>,{' '}
            <code className="font-mono">{'{dateDebutPreop}'}</code> (J-15),{' '}
            <code className="font-mono">{'{dateLimiteExamens}'}</code> (J+10),{' '}
            <code className="font-mono">{'{intervention}'}</code>,{' '}
            <code className="font-mono">{'{examensMedicaux}'}</code>,{' '}
            <code className="font-mono">{'{paysRetour}'}</code>,{' '}
            <code className="font-mono">{'{numeroDevis}'}</code>
          </>
        )}
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && templates.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-16 justify-center">
          <RefreshCw className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-start">
          {/* Liste */}
          <nav className="rounded-xl border border-border bg-white overflow-hidden">
            {ORDER.map((key) => {
              const item = map.get(key)
              if (!item) return null
              const selected = key === selectedKey
              const itemDirty =
                savedSnapshot[key] !==
                JSON.stringify({ content: item.content, channel: item.channel, active: item.active })
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  className={cn(
                    'w-full text-left px-3.5 py-3 border-b border-border last:border-b-0 transition-colors',
                    selected ? 'bg-brand-50/80' : 'hover:bg-muted/50',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('text-sm font-medium', selected ? 'text-brand-900' : 'text-foreground')}>
                      {item.title}
                    </span>
                    {itemDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={cn(
                        'text-[11px]',
                        item.active ? 'text-emerald-600' : 'text-muted-foreground',
                      )}
                    >
                      {item.active ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                </button>
              )
            })}
          </nav>

          {/* Éditeur */}
          {tpl && (
            <div className="rounded-xl border border-border bg-white p-4 sm:p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-foreground">{tpl.title}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{info.when}</p>
                </div>
                <Badge variant={tpl.active ? 'success' : 'secondary'}>
                  {tpl.active ? 'Actif' : 'Inactif'}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Canal
                  </label>
                  <Select
                    value={tpl.channel}
                    onValueChange={(v) =>
                      updateLocal({ channel: v as GestionnaireTemplate['channel'] })
                    }
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
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Statut
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between"
                    disabled={saving}
                    onClick={() => updateLocal({ active: !tpl.active })}
                  >
                    {tpl.active ? 'Désactiver' : 'Activer'}
                    <span className={cn('text-xs', tpl.active ? 'text-emerald-600' : 'text-muted-foreground')}>
                      {tpl.active ? 'On' : 'Off'}
                    </span>
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Message
                </label>
                <Textarea
                  rows={selectedKey === 'abstention' || selectedKey === 'devisRappel' ? 12 : 5}
                  value={tpl.content}
                  className="text-sm leading-relaxed"
                  onChange={(e) => updateLocal({ content: e.target.value })}
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-1 border-t border-border">
                <p className="text-[11px] text-muted-foreground">
                  {isSystemDate(tpl.updatedAt)
                    ? 'Version par défaut'
                    : `${formatDateTime(tpl.updatedAt)} · ${tpl.updatedBy}`}
                </p>
                <Button
                  size="sm"
                  variant="brand"
                  className="gap-1.5"
                  disabled={saving || !dirty}
                  onClick={() => void save()}
                >
                  {saving ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Enregistrer
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
