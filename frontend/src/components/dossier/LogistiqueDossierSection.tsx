import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, FileText, Loader2, RefreshCw, Send, Trash2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { chatApi, gestionnaireApi, type GestionnaireLogistiqueDocument, type GestionnaireLogistiqueDocuments, type GestionnaireLogistiqueRow } from '@/lib/api'
import {
  applyConfirmationReservationVars,
  CONFIRMATION_RESERVATION_FALLBACK,
  type ConfirmationReservationContext,
} from '@/lib/confirmationReservationMessage'
import { cn, datetimeLocalToIso } from '@/lib/utils'
import { downloadAttachment, isPdfUrl, resolveAttachmentUrl } from '@/lib/chatAttachments'
import {
  LOGISTIQUE_DOCUMENT_SLOTS,
  LOGISTIQUE_ESSENTIAL_TOTAL,
  logistiqueEssentialsDoneCount,
  logistiqueFromPatientRow,
  logistiqueIsComplete,
} from '@/lib/logistiqueChecklist'
import { feedbackSuccess, toast } from '@/store/toastStore'
import { invalidateCache } from '@/lib/cachedFetch'
import { queryKeys } from '@/lib/queryKeys'

type LogistiqueDossierSectionProps = {
  patientId: string
  initialData?: GestionnaireLogistiqueRow | null
  onSaved?: () => void
  patientName?: string
  dossierNumber?: string | null
  paysRetour?: string | null
  numeroDevis?: string | null
  interventionLabel?: string | null
  examensMedicaux?: string | null
}

function DocumentSlot({
  label,
  hint,
  files,
  uploading,
  onPick,
  onRemove,
}: {
  label: string
  hint: string
  files: GestionnaireLogistiqueDocument[]
  uploading: boolean
  onPick: (files: File[]) => void
  onRemove: (index: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const hasFiles = files.length > 0

  return (
    <div
      className={cn(
        'rounded-xl border p-4 space-y-3',
        hasFiles ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white',
      )}
    >
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
      </div>

      {files.map((doc, index) => {
        const resolvedUrl = doc.url ? resolveAttachmentUrl(doc.url) : null
        const isPdf = Boolean(doc.url && isPdfUrl(doc.url, doc.name))
        return (
          <div key={`${doc.url}-${index}`} className="flex items-start gap-3">
            {isPdf ? (
              <div className="h-14 w-14 rounded-lg border border-emerald-200 bg-white flex items-center justify-center shrink-0">
                <FileText className="h-6 w-6 text-emerald-700" />
              </div>
            ) : (
              <img
                src={resolvedUrl ?? doc.url}
                alt={doc.name}
                className="h-14 w-14 rounded-lg border border-emerald-200 object-cover shrink-0 bg-white"
              />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs font-medium text-slate-800 truncate">{doc.name}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-xs font-semibold text-brand-700 hover:underline"
                  onClick={() => {
                    if (resolvedUrl) window.open(resolvedUrl, '_blank', 'noopener,noreferrer')
                  }}
                >
                  Voir
                </button>
                {!isPdf && resolvedUrl && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-slate-600 hover:underline"
                    onClick={() => void downloadAttachment(resolvedUrl, doc.name)}
                  >
                    Télécharger
                  </button>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive shrink-0"
              onClick={() => onRemove(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })}

      <Button
        type="button"
        variant="outline"
        className="w-full h-11 gap-2 text-sm font-semibold"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Envoi en cours…
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            {hasFiles ? 'Ajouter un fichier' : 'Joindre image ou PDF'}
          </>
        )}
      </Button>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (picked.length > 0) onPick(picked)
        }}
      />
    </div>
  )
}

export function LogistiqueDossierSection({
  patientId,
  initialData,
  onSaved,
  patientName = '',
  dossierNumber = null,
  paysRetour = null,
  numeroDevis = null,
  interventionLabel = null,
  examensMedicaux = null,
}: LogistiqueDossierSectionProps) {
  const base = logistiqueFromPatientRow(initialData)
  const [documents, setDocuments] = useState<GestionnaireLogistiqueDocuments>(base.documents)
  const [dateArrivee, setDateArrivee] = useState(base.dateArrivee ?? '')
  const [dateDepart, setDateDepart] = useState(base.dateDepart ?? '')
  const [dateIntervention, setDateIntervention] = useState(base.dateIntervention ?? '')
  const [uploadingKey, setUploadingKey] = useState<keyof GestionnaireLogistiqueDocuments | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [confirmationMsg, setConfirmationMsg] = useState(CONFIRMATION_RESERVATION_FALLBACK)
  const [confirmationSending, setConfirmationSending] = useState(false)
  const [confirmationError, setConfirmationError] = useState<string | null>(null)

  useEffect(() => {
    const next = logistiqueFromPatientRow(initialData)
    setDocuments(next.documents)
    setDateArrivee(next.dateArrivee ?? '')
    setDateDepart(next.dateDepart ?? '')
    setDateIntervention(next.dateIntervention ?? '')
  }, [patientId, initialData])

  const rowSnapshot = (): GestionnaireLogistiqueRow => ({
    dateArrivee: dateArrivee || null,
    dateDepart: dateDepart || null,
    dateIntervention: dateIntervention || null,
    documents,
    notes: '',
  })

  const essentialsDone = logistiqueEssentialsDoneCount(rowSnapshot())
  const isComplete = logistiqueIsComplete(rowSnapshot())

  const persist = async (
    nextDocuments: GestionnaireLogistiqueDocuments,
    dates?: { dateArrivee: string; dateDepart: string; dateIntervention: string },
  ) => {
    await gestionnaireApi.updateLogistique(patientId, {
      documents: nextDocuments,
      dateArrivee: datetimeLocalToIso(dates?.dateArrivee ?? dateArrivee),
      dateDepart: datetimeLocalToIso(dates?.dateDepart ?? dateDepart),
      dateIntervention: datetimeLocalToIso(dates?.dateIntervention ?? dateIntervention),
    })
    await invalidateCache(queryKeys.logistique())
    onSaved?.()
  }

  const handleUpload = async (key: keyof GestionnaireLogistiqueDocuments, files: File[]) => {
    setUploadingKey(key)
    setError(null)
    try {
      const uploaded: GestionnaireLogistiqueDocument[] = []
      for (const file of files) {
        const res = await chatApi.upload(file)
        uploaded.push({ url: res.url, name: res.name || file.name })
      }
      const nextDocuments = {
        ...documents,
        [key]: [...(documents[key] ?? []), ...uploaded],
      }
      setDocuments(nextDocuments)
      await persist(nextDocuments)
      feedbackSuccess(
        uploaded.length > 1 ? 'Documents enregistrés' : 'Document enregistré',
        LOGISTIQUE_DOCUMENT_SLOTS.find((s) => s.key === key)?.label ?? 'Fichier',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de joindre le fichier.')
    } finally {
      setUploadingKey(null)
    }
  }

  const handleRemove = async (key: keyof GestionnaireLogistiqueDocuments, index: number) => {
    setError(null)
    try {
      const nextDocuments = {
        ...documents,
        [key]: (documents[key] ?? []).filter((_, i) => i !== index),
      }
      setDocuments(nextDocuments)
      await persist(nextDocuments)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de retirer le document.')
    }
  }

  const saveDates = async () => {
    setSaving(true)
    setError(null)
    try {
      await persist(documents)
      feedbackSuccess(
        isComplete ? 'Logistique complète' : 'Dates enregistrées',
        isComplete
          ? 'Les 3 documents et les 3 dates sont renseignés.'
          : `${essentialsDone}/${LOGISTIQUE_ESSENTIAL_TOTAL} élément(s) complété(s).`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de sauvegarder.')
    } finally {
      setSaving(false)
    }
  }

  const confirmationContext = (): ConfirmationReservationContext => ({
    fullName: patientName,
    dossierNumber,
    paysRetour,
    numeroDevis,
    intervention: interventionLabel,
    examensMedicaux,
    dateArrivee: dateArrivee || null,
    dateDepart: dateDepart || null,
    dateIntervention: dateIntervention || null,
  })

  const openConfirmationMessage = () => {
    setConfirmationError(null)
    setConfirmationOpen(true)
    const ctx = confirmationContext()
    setConfirmationMsg(applyConfirmationReservationVars(CONFIRMATION_RESERVATION_FALLBACK, ctx))
    void gestionnaireApi
      .getCommunicationTemplates()
      .then((res) => {
        const tpl = res.templates.find((t) => t.key === 'confirmationReservation')
        if (!tpl?.active || !tpl.content.trim()) return
        setConfirmationMsg(applyConfirmationReservationVars(tpl.content, ctx))
      })
      .catch(() => {
        /* repli déjà appliqué */
      })
  }

  const sendConfirmationMessage = async () => {
    const contenu = confirmationMsg.trim()
    if (!contenu) {
      setConfirmationError('Le message ne peut pas être vide.')
      return
    }
    setConfirmationSending(true)
    setConfirmationError(null)
    try {
      await chatApi.sendMessage({
        patientId,
        contenu,
        patientEmailKind: 'confirmation_reservation',
      })
      setConfirmationOpen(false)
      toast({
        title: 'Confirmation envoyée',
        description: 'La patiente a reçu le message dans le chat et par e-mail.',
        variant: 'success',
      })
    } catch (e) {
      setConfirmationError(e instanceof Error ? e.message : 'Envoi impossible.')
    } finally {
      setConfirmationSending(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-emerald-950">Documents et dates du séjour</p>
            <p className="text-xs text-emerald-900/80 mt-0.5">
              3 pièces jointes + 3 dates/heures — {essentialsDone} sur {LOGISTIQUE_ESSENTIAL_TOTAL} complété
            </p>
          </div>
          <div className="flex items-center gap-2 min-w-[140px]">
            <div className="h-2 flex-1 bg-white/80 rounded-full overflow-hidden border border-emerald-100">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${(essentialsDone / LOGISTIQUE_ESSENTIAL_TOTAL) * 100}%` }}
              />
            </div>
            <span className="text-xs font-bold text-emerald-800">
              {essentialsDone}/{LOGISTIQUE_ESSENTIAL_TOTAL}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {LOGISTIQUE_DOCUMENT_SLOTS.map(({ key, label, hint }) => (
          <DocumentSlot
            key={key}
            label={label}
            hint={hint}
            files={documents[key] ?? []}
            uploading={uploadingKey === key}
            onPick={(picked) => void handleUpload(key, picked)}
            onRemove={(index) => void handleRemove(key, index)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Date et heure arrivée</label>
          <input
            type="datetime-local"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
            value={dateArrivee}
            onChange={(e) => setDateArrivee(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Date et heure départ</label>
          <input
            type="datetime-local"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
            value={dateDepart}
            onChange={(e) => setDateDepart(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Date et heure intervention</label>
          <input
            type="datetime-local"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
            value={dateIntervention}
            onChange={(e) => setDateIntervention(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-11 px-4 text-sm font-semibold gap-2 border-emerald-200 text-emerald-900 hover:bg-emerald-50"
          onClick={openConfirmationMessage}
        >
          <Send className="h-4 w-4" />
          Envoyer message de confirmation
        </Button>
        <Button
          variant="brand"
          className="h-11 px-6 text-sm font-semibold sm:ml-auto"
          disabled={saving}
          onClick={() => void saveDates()}
        >
          {saving ? 'Sauvegarde…' : isComplete ? (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Enregistrer — dossier complet
            </>
          ) : (
            'Enregistrer les dates'
          )}
        </Button>
      </div>

      {confirmationOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !confirmationSending && setConfirmationOpen(false)}
            aria-label="Fermer"
          />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl border border-border flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">Message de confirmation</p>
                <p className="text-xs text-muted-foreground truncate">
                  {patientName || 'Patiente'} — prérempli depuis le dossier, modifiable avant envoi
                </p>
              </div>
              <button
                type="button"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"
                disabled={confirmationSending}
                onClick={() => setConfirmationOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 flex-1 min-h-0 overflow-y-auto space-y-3">
              <Textarea
                value={confirmationMsg}
                onChange={(e) => setConfirmationMsg(e.target.value)}
                rows={16}
                className="text-sm leading-relaxed resize-y min-h-[280px]"
                disabled={confirmationSending}
              />
              {confirmationError && (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {confirmationError}
                </p>
              )}
            </div>
            <div className="px-5 py-4 border-t border-border flex flex-col-reverse sm:flex-row gap-2 sm:justify-end shrink-0">
              <Button
                type="button"
                variant="outline"
                disabled={confirmationSending}
                onClick={() => setConfirmationOpen(false)}
              >
                Annuler
              </Button>
              <Button
                type="button"
                variant="brand"
                className="gap-2"
                disabled={confirmationSending}
                onClick={() => void sendConfirmationMessage()}
              >
                {confirmationSending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Envoyer à la patiente
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
