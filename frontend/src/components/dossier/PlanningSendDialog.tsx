import { useEffect, useState } from 'react'
import { AlertCircle, RefreshCw, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { gestionnaireApi } from '@/lib/api'
import { buildPlanningChatMessage } from '@/lib/planningMessage'
import { finishWhatsAppPopup, prepareWhatsAppPopup } from '@/lib/whatsappDevis'
import { toast } from '@/store/toastStore'

type PlanningSendDialogProps = {
  open: boolean
  channel: 'chat' | 'whatsapp'
  patientId: string
  patientName: string
  dateArrivee?: string | null
  transport?: string | null
  getHtml: () => string | Promise<string>
  onClose: () => void
}

export function PlanningSendDialog({
  open,
  channel,
  patientId,
  patientName,
  dateArrivee,
  transport,
  getHtml,
  onClose,
}: PlanningSendDialogProps) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setMessage(buildPlanningChatMessage({
      patientFullName: patientName,
      dateArrivee,
      transport,
    }))
  }, [open, patientName, dateArrivee, transport])

  if (!open) return null

  const send = async () => {
    const contenu = message.trim()
    if (!contenu) {
      setError('Le message ne peut pas être vide.')
      return
    }
    const popup = channel === 'whatsapp' ? prepareWhatsAppPopup() : null
    setSending(true)
    setError(null)
    try {
      const html = await getHtml()
      if (!html.trim()) {
        throw new Error('Le planning est vide.')
      }
      const r = await gestionnaireApi.sendPlanningSejour(patientId, { html, message: contenu })
      if (channel === 'whatsapp') {
        if (!finishWhatsAppPopup(popup, r.whatsappUrl)) {
          toast({
            title: 'Planning envoyé dans le chat. Numéro WhatsApp manquant.',
            variant: 'error',
          })
        } else {
          toast({ title: 'Planning envoyé dans le chat. WhatsApp ouvert.', variant: 'success' })
        }
      } else {
        toast({ title: 'Planning envoyé dans le chat de la patiente.', variant: 'success' })
      }
      onClose()
    } catch (e) {
      try { popup?.close() } catch { /* ignore */ }
      setError(e instanceof Error ? e.message : 'Envoi impossible.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => !sending && onClose()}
        aria-label="Fermer"
      />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl border border-border flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">
              {channel === 'whatsapp' ? 'Message WhatsApp' : 'Message chat'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {patientName || 'Patiente'} — modifiable avant envoi. Le PDF du planning est joint.
            </p>
          </div>
          <button
            type="button"
            className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"
            disabled={sending}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 flex-1 min-h-0 overflow-y-auto space-y-3">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={16}
            className="text-sm leading-relaxed resize-y min-h-[280px]"
            disabled={sending}
          />
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>
        <div className="px-5 py-4 border-t border-border flex flex-col-reverse sm:flex-row gap-2 sm:justify-end shrink-0">
          <Button type="button" variant="outline" disabled={sending} onClick={onClose}>
            Annuler
          </Button>
          <Button type="button" variant="brand" className="gap-2" disabled={sending} onClick={() => void send()}>
            {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Envoyer à la patiente
          </Button>
        </div>
      </div>
    </div>
  )
}
