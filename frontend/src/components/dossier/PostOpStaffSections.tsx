import { useEffect, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  EyeOff,
  Loader2,
  Send,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { PostOpSection } from '@/components/dossier/PostOpSection'
import type { PostOpNoteInterne, PostOpStaffApi, SuiviPostOp } from '@/lib/api'
import { buildPostOpRetourMessage } from '@/lib/postOpMessage'
import { photoDayOffset } from '@/lib/postOpSteps'
import { formatDate, formatRelative } from '@/lib/utils'

function errMessage(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback
}

function formatMontant(value: number) {
  const abs = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Math.abs(value))
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${abs} TND`
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive border border-destructive/20">
      <AlertCircle className="h-4 w-4 shrink-0" /> {message}
    </div>
  )
}

// ─── 2 · Retour à domicile ───────────────────────────────────────────────────

type StaffSectionProps = {
  patientId: string
  suivi: SuiviPostOp | null
  api: PostOpStaffApi
  onChange: (suivi: SuiviPostOp) => void
}

export function PostOpRetourSection({
  patientId,
  patientName,
  suivi,
  api,
  onChange,
}: StaffSectionProps & { patientName: string }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState<'platform' | 'whatsapp' | null>(null)
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null)
  const [hasPhone, setHasPhone] = useState<boolean | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [marking, setMarking] = useState(false)
  const [sectionError, setSectionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setWhatsappUrl(null)
    setHasPhone(null)
    setFeedback(null)
    api
      .getWhatsapp(patientId)
      .then((res) => {
        if (cancelled) return
        setWhatsappUrl(res.whatsappUrl)
        setHasPhone(res.hasPhone)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [api, patientId])

  const openDialog = () => {
    setMessage(buildPostOpRetourMessage(patientName))
    setError(null)
    setOpen(true)
  }

  const handleSendPlatform = async () => {
    const text = message.trim()
    if (!text) {
      setError('Le message ne peut pas être vide.')
      return
    }
    setSending('platform')
    setError(null)
    setFeedback(null)
    try {
      const res = await api.sendRetour(patientId, text)
      onChange(res.suivi)
      setWhatsappUrl(res.whatsappUrl)
      setHasPhone(res.hasPhone)
      setFeedback('Message envoyé dans le chat de la plateforme.')
      setOpen(false)
    } catch (e) {
      setError(errMessage(e, 'Envoi impossible.'))
    } finally {
      setSending(null)
    }
  }

  const handleSendWhatsapp = async () => {
    const text = message.trim()
    if (!text) {
      setError('Le message ne peut pas être vide.')
      return
    }
    if (hasPhone === false) {
      setError('Aucun téléphone enregistré pour cette patiente.')
      return
    }
    const waWindow = window.open('about:blank', '_blank')
    if (!waWindow) {
      setError('Le navigateur a bloqué la fenêtre. Autorisez les pop-ups, puis réessayez.')
      return
    }
    setSending('whatsapp')
    setError(null)
    setFeedback(null)
    try {
      const res = await api.sendRetour(patientId, text, { markOnly: true })
      onChange(res.suivi)
      setWhatsappUrl(res.whatsappUrl)
      setHasPhone(res.hasPhone)
      if (waWindow) {
        if (res.whatsappUrl) waWindow.location.href = res.whatsappUrl
        else waWindow.close()
      }
      if (!res.hasPhone) {
        setError('Aucun téléphone enregistré : WhatsApp n’a pas pu s’ouvrir.')
        return
      }
      setFeedback('WhatsApp ouvert avec le message. Validez l’envoi dans WhatsApp. Rien n’a été posté dans le chat de la plateforme.')
      setOpen(false)
    } catch (e) {
      waWindow?.close()
      setError(errMessage(e, 'Ouverture de WhatsApp impossible.'))
    } finally {
      setSending(null)
    }
  }

  const handleMarkSent = async () => {
    setMarking(true)
    setSectionError(null)
    try {
      const res = await api.sendRetour(patientId, undefined, { markOnly: true })
      onChange(res.suivi)
      setFeedback('Étape enregistrée : le message est considéré comme déjà envoyé (rien n’a été renvoyé à la patiente).')
    } catch (e) {
      setSectionError(errMessage(e, 'Enregistrement impossible.'))
    } finally {
      setMarking(false)
    }
  }

  const sentAt = suivi?.retourMessageAt

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !sending && setOpen(false)}
            aria-label="Fermer"
          />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl border border-border flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">Message de retour à domicile</p>
                <p className="text-xs text-muted-foreground truncate">
                  {patientName || 'Patiente'} — modifiable. Choisissez WhatsApp ou la plateforme.
                </p>
              </div>
              <button
                type="button"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"
                disabled={sending !== null}
                onClick={() => setOpen(false)}
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 flex-1 min-h-0 overflow-y-auto space-y-3">
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={14}
                className="text-sm leading-relaxed resize-y min-h-[260px]"
                disabled={sending !== null}
              />
              {error && (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              )}
            </div>
            <div className="px-5 py-4 border-t border-border flex flex-col-reverse sm:flex-row sm:flex-wrap gap-2 sm:justify-end shrink-0">
              <Button type="button" variant="outline" disabled={sending !== null} onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={sending !== null || hasPhone !== true}
                title={hasPhone === false ? 'Aucun téléphone enregistré pour cette patiente' : undefined}
                onClick={() => void handleSendWhatsapp()}
              >
                {sending === 'whatsapp' ? <Loader2 className="h-4 w-4 animate-spin" /> : <WhatsAppIcon className="h-4 w-4 text-emerald-600" />}
                Envoyer par WhatsApp
              </Button>
              <Button
                type="button"
                variant="brand"
                className="gap-2"
                disabled={sending !== null}
                onClick={() => void handleSendPlatform()}
              >
                {sending === 'platform' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Envoyer depuis la plateforme
              </Button>
            </div>
          </div>
        </div>
      )}

      <PostOpSection title="Message de retour" note={sentAt ? `Envoyé le ${formatDate(sentAt)}` : 'Pas encore envoyé'}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-sm">
            <p className="text-slate-700">
              {sentAt ? 'La patiente a reçu le message de suivi.' : 'À envoyer quand la patiente est rentrée chez elle.'}
            </p>
            {feedback && <p className="text-xs text-muted-foreground">{feedback}</p>}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button type="button" variant={sentAt ? 'outline' : 'brand'} size="sm" className="gap-2" onClick={openDialog}>
              <Send className="h-4 w-4" />
              {sentAt ? 'Renvoyer le message' : 'Envoyer le message'}
            </Button>
            {whatsappUrl && (
              <Button asChild type="button" variant="outline" size="sm" className="gap-2">
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className="h-4 w-4 text-emerald-600" />
                  WhatsApp
                </a>
              </Button>
            )}
          </div>
        </div>
        {sectionError && <InlineError message={sectionError} />}
        {!sentAt && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">Message déjà envoyé en dehors de l’application ?</p>
            <Button type="button" variant="ghost" size="sm" disabled={marking} onClick={() => void handleMarkSent()}>
              {marking ? 'Enregistrement…' : 'Marquer comme déjà envoyé'}
            </Button>
          </div>
        )}
      </PostOpSection>
    </>
  )
}

// ─── 3 · Photos (lecture) ────────────────────────────────────────────────────

export function PostOpPhotosGallery({
  suivi,
  children,
}: {
  suivi: SuiviPostOp | null
  children?: ReactNode
}) {
  const photos = suivi?.photos ?? []
  const sorted = suivi
    ? [...photos].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    : []
  const compare = sorted.length >= 2 ? { before: sorted[0], after: sorted[sorted.length - 1] } : null

  return (
    <PostOpSection title="Photos" note={photos.length > 0 ? String(photos.length) : undefined}>
      {!suivi || photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune photo.</p>
      ) : (
        <>
          {compare && (
            <div className="rounded-xl border p-3">
              <p className="text-xs font-semibold mb-2 text-slate-700">Comparaison première / dernière photo</p>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                {([['Première', compare.before], ['Dernière', compare.after]] as const).map(([label, p]) => (
                  <div key={label} className="space-y-1">
                    <img src={p.url} alt={label} className="w-full aspect-square object-cover rounded-lg border" />
                    <p className="text-[11px] text-muted-foreground">
                      {label} · J+{photoDayOffset(suivi, p)} ({formatDate(p.date)})
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {sorted.map((photo, i) => (
              <a
                key={`${photo.url}-${i}`}
                href={photo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="relative rounded-xl overflow-hidden border bg-muted group"
              >
                <img src={photo.url} alt={`Photo de suivi ${i + 1}`} className="w-full aspect-square object-cover" />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                  <p className="text-white text-[11px] font-semibold">J+{photoDayOffset(suivi, photo)}</p>
                  {photo.note && <p className="text-white/80 text-[10px] truncate">{photo.note}</p>}
                </div>
              </a>
            ))}
          </div>
        </>
      )}
      {children}
    </PostOpSection>
  )
}

// ─── 4 · Questions et demandes ───────────────────────────────────────────────

export function PostOpDemandesSection({ patientId, suivi, api, onChange }: StaffSectionProps) {
  const [error, setError] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({})
  const [replyingId, setReplyingId] = useState<string | null>(null)

  const demandes = suivi?.demandes ?? []
  const pendingCount = demandes.filter((d) => !d.reponse).length

  const handleReply = async (demandeId: string) => {
    const text = (replyDraft[demandeId] ?? '').trim()
    if (!text) return
    setReplyingId(demandeId)
    setError(null)
    try {
      const res = await api.answerDemande(patientId, demandeId, text)
      onChange(res.suivi)
      setReplyDraft((prev) => ({ ...prev, [demandeId]: '' }))
    } catch (e) {
      setError(errMessage(e, 'Réponse non enregistrée.'))
    } finally {
      setReplyingId(null)
    }
  }

  return (
    <PostOpSection title="Questions de la patiente" note={pendingCount > 0 ? `${pendingCount} sans réponse` : undefined}>
      {error && <InlineError message={error} />}
      {demandes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune question.</p>
      ) : (
        [...demandes].reverse().map((d) => (
          <div key={d.id} className="rounded-xl border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">Patiente · {formatRelative(d.createdAt)}</p>
              {d.reponse ? (
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Répondu</Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200">À traiter</Badge>
              )}
            </div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{d.message}</p>
            {d.reponse ? (
              <div className="rounded-lg bg-emerald-50/70 border border-emerald-100 px-3 py-2">
                <p className="text-sm whitespace-pre-wrap leading-relaxed text-emerald-900">{d.reponse}</p>
                <p className="text-[11px] text-emerald-700 mt-1">
                  {d.reponsePar ?? 'Équipe'}
                  {d.reponseAt ? ` · ${formatRelative(d.reponseAt)}` : ''}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Textarea
                  rows={2}
                  value={replyDraft[d.id] ?? ''}
                  onChange={(e) => setReplyDraft((prev) => ({ ...prev, [d.id]: e.target.value }))}
                  placeholder="Votre réponse à la patiente…"
                  className="resize-none text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="brand"
                  className="gap-2"
                  disabled={replyingId === d.id || !(replyDraft[d.id] ?? '').trim()}
                  onClick={() => void handleReply(d.id)}
                >
                  {replyingId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Répondre
                </Button>
              </div>
            )}
          </div>
        ))
      )}
    </PostOpSection>
  )
}

// ─── 6 · Avis (lecture) ──────────────────────────────────────────────────────

export function PostOpAvisSection({ suivi }: { suivi: SuiviPostOp | null }) {
  const q = suivi?.questionnaire
  return (
    <PostOpSection title="Avis" note={q ? `${q.note}/5` : 'Pas encore répondu'}>
      {q ? (
        <div className="flex items-start gap-4">
          <div className="flex gap-0.5 pt-0.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star key={s} className={`h-5 w-5 ${s <= q.note ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`} />
            ))}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{q.note}/5</p>
            {q.commentaire && <p className="text-sm text-muted-foreground italic mt-0.5">« {q.commentaire} »</p>}
            <p className="text-[11px] text-muted-foreground mt-1">Répondu {formatRelative(q.reponduAt)}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4 shrink-0" /> La patiente n’a pas encore rempli le questionnaire.
        </div>
      )}
    </PostOpSection>
  )
}

// ─── Clôture du dossier ──────────────────────────────────────────────────────

export function PostOpClotureSection({
  patientId,
  suivi,
  api,
  onChange,
  onStatusChange,
}: StaffSectionProps & { onStatusChange?: (status: string) => void }) {
  const [remarques, setRemarques] = useState(suivi?.clotureRemarques ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRemarques(suivi?.clotureRemarques ?? '')
  }, [patientId, suivi?.clotureRemarques])

  if (!suivi) {
    return (
      <PostOpSection title="Clôturer">
        <p className="text-sm text-muted-foreground">Possible après l’envoi du message de retour.</p>
      </PostOpSection>
    )
  }

  const closed = Boolean(suivi.clotureAt)
  const pending = (suivi.demandes ?? []).filter((d) => !d.reponse).length
  const crPending = Boolean(suivi.compteRenduDemandeAt) && !suivi.compteRendu

  const warnings: string[] = []
  if (!suivi.retourMessageAt) warnings.push('le message de retour n’est pas marqué comme envoyé')
  if (pending > 0) warnings.push(`${pending} demande(s) de la patiente sans réponse`)
  if (crPending) warnings.push('le compte rendu demandé n’est pas encore rédigé')

  const run = async (action: () => Promise<{ suivi: SuiviPostOp; status: string }>) => {
    setBusy(true)
    setError(null)
    try {
      const res = await action()
      onChange(res.suivi)
      onStatusChange?.(res.status)
    } catch (e) {
      setError(errMessage(e, 'Action impossible.'))
    } finally {
      setBusy(false)
    }
  }

  const handleCloturer = () => {
    if (warnings.length > 0) {
      const ok = window.confirm(`Clôturer quand même ?\n\nAttention : ${warnings.join(' ; ')}.`)
      if (!ok) return
    }
    void run(() => api.cloturer(patientId, remarques))
  }

  return (
    <PostOpSection title="Clôturer le dossier" note={closed ? `Clôturé le ${formatDate(suivi.clotureAt!)}` : undefined}>
      {error && <InlineError message={error} />}

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <EyeOff className="h-3.5 w-3.5" /> Remarques de clôture
          <span className="normal-case font-normal">(déroulement du séjour, mises à jour — interne)</span>
        </label>
        <Textarea
          rows={5}
          value={remarques}
          onChange={(e) => setRemarques(e.target.value)}
          disabled={closed || busy}
          placeholder="Ex. séjour sans incident, nuit supplémentaire en clinique, changement de transfert, points à retenir…"
          className="resize-y text-sm leading-relaxed"
        />
      </div>

      {closed ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
          <p className="text-sm text-emerald-900">
            Dossier clôturé le {formatDate(suivi.clotureAt!)}
            {suivi.cloturePar ? ` par ${suivi.cloturePar}` : ''}.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void run(() => api.rouvrir(patientId))}
          >
            Rouvrir le suivi
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {warnings.length > 0 && (
            <p className="text-xs text-amber-800 flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              À vérifier avant de clôturer : {warnings.join(' ; ')}.
            </p>
          )}
          <Button type="button" variant="brand" className="gap-2" disabled={busy} onClick={handleCloturer}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Clôturer le dossier
          </Button>
        </div>
      )}
    </PostOpSection>
  )
}

// ─── Notes internes ──────────────────────────────────────────────────────────

export function PostOpNotesSection({ patientId, suivi, api, onChange }: StaffSectionProps) {
  const [error, setError] = useState<string | null>(null)
  const [noteType, setNoteType] = useState<'deroulement' | 'depense'>('deroulement')
  const [noteText, setNoteText] = useState('')
  const [noteMontant, setNoteMontant] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const notes = suivi?.notesInternes ?? []
  const totalEcart = notes.reduce((sum, n) => sum + (n.montant ?? 0), 0)
  const hasMontants = notes.some((n) => n.montant != null)

  const handleAdd = async () => {
    const texte = noteText.trim()
    if (!texte) return
    const montantNum =
      noteType === 'depense' && noteMontant.trim() !== '' ? Number(noteMontant.replace(',', '.')) : null
    if (montantNum !== null && !Number.isFinite(montantNum)) {
      setError('Montant invalide.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await api.addNote(patientId, { type: noteType, texte, montant: montantNum })
      onChange(res.suivi)
      setNoteText('')
      setNoteMontant('')
    } catch (e) {
      setError(errMessage(e, 'Note non enregistrée.'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (note: PostOpNoteInterne) => {
    setDeletingId(note.id)
    setError(null)
    try {
      const res = await api.deleteNote(patientId, note.id)
      onChange(res.suivi)
    } catch (e) {
      setError(errMessage(e, 'Suppression impossible.'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <PostOpSection tone="internal" title="Notes internes" note="Non visible par la patiente">
      {error && <InlineError message={error} />}

      {!suivi ? (
        <p className="text-sm text-muted-foreground">
          Les notes seront disponibles dès l’ouverture du suivi (envoi du message de retour).
        </p>
      ) : (
        <>
          <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['deroulement', 'Déroulement du séjour'],
                  ['depense', 'Dépense en plus / en moins'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setNoteType(value)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    noteType === value
                      ? 'border-brand-300 bg-brand-50 text-brand-800'
                      : 'border-border bg-white text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Textarea
              rows={3}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder={
                noteType === 'depense'
                  ? 'Détail de la dépense ou de l’économie (ex. nuit supplémentaire en clinique, transfert annulé…)'
                  : 'Comment s’est déroulé le séjour, mises à jour, incidents…'
              }
              className="resize-none text-sm bg-white"
            />
            {noteType === 'depense' && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Montant en TND (+ dépense supplémentaire, − économie)
                </label>
                <Input
                  inputMode="decimal"
                  value={noteMontant}
                  onChange={(e) => setNoteMontant(e.target.value)}
                  placeholder="ex. 350 ou -120"
                  className="h-9 max-w-[220px] bg-white"
                />
              </div>
            )}
            <Button type="button" size="sm" variant="brand" disabled={saving || !noteText.trim()} onClick={() => void handleAdd()}>
              {saving ? 'Enregistrement…' : 'Ajouter la note'}
            </Button>
          </div>

          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune note pour l’instant.</p>
          ) : (
            <div className="space-y-2">
              {[...notes].reverse().map((n) => (
                <div key={n.id} className="rounded-xl border p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          className={
                            n.type === 'depense'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }
                        >
                          {n.type === 'depense' ? 'Dépense' : 'Déroulement'}
                        </Badge>
                        {n.montant != null && (
                          <span
                            className={`text-sm font-semibold ${
                              n.montant > 0 ? 'text-rose-700' : n.montant < 0 ? 'text-emerald-700' : 'text-slate-600'
                            }`}
                          >
                            {formatMontant(n.montant)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{n.texte}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {n.auteur} · {formatRelative(n.createdAt)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Supprimer la note"
                      disabled={deletingId === n.id}
                      onClick={() => void handleDelete(n)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {hasMontants && (
                <p className="text-sm font-semibold text-right pt-1">
                  Écart total :{' '}
                  <span className={totalEcart > 0 ? 'text-rose-700' : totalEcart < 0 ? 'text-emerald-700' : ''}>
                    {formatMontant(totalEcart)}
                  </span>
                </p>
              )}
            </div>
          )}
        </>
      )}
    </PostOpSection>
  )
}