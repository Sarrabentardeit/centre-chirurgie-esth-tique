import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Paragraph from '@tiptap/extension-paragraph'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'

/** Garde les classes HTML (ex. devis-ref-title) — TipTap les retire sinon. */
const DevisParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: (element) => element.getAttribute('class'),
        renderHTML: (attributes) => {
          if (!attributes.class) return {}
          return { class: attributes.class }
        },
      },
    }
  },
})

/** font-size dans les spans TextStyle (sinon TipTap le strip). */
const DevisTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize || null,
        renderHTML: (attributes) => {
          if (!attributes.fontSize) return {}
          return { style: `font-size: ${attributes.fontSize}` }
        },
      },
    }
  },
})
import { ArrowLeft, Printer, RotateCcw, CheckCircle2, RefreshCw, Send } from 'lucide-react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { toast } from '@/store/toastStore'
import { RichDocToolbar } from '@/components/editor/RichDocToolbar'
import { gestionnaireApi, type GestionnairePatientDetail } from '@/lib/api'
import { formatDevisPdfFileName, getDevisDisplayNumber } from '@/lib/utils'
import { replaceDevisAmountPlaceholders, DEFAULT_TND_PER_EUR } from '@/lib/moneyWords'
import { inlineHtmlImages } from '@/lib/pdf'
import {
  DEVIS_LOGO_SRC,
  DEVIS_SIGNATURE,
  buildDevisContactFooterHtml,
  buildDevisHeaderLogoHtml,
} from '@/lib/devisBranding'
import {
  DEVIS_ACCENT,
  DEVIS_CHARTE,
  DEVIS_OFFER_PREVIEW_CSS,
  buildDevisOfferBlockHtml,
} from '@/lib/devisCharte'
import {
  buildDevisLetterBottomHtml,
  buildDevisLetterTopHtml,
  letterContextFromGestionnairePatient,
  refreshDevisLetterTopHtml,
  sejourPdfFromContext,
  type DevisLetterContext,
} from '@/lib/devisLetterHtml'
import { buildGestionnaireDevisExportHtml, DEVIS_CONTENT_BREAK } from '@/lib/devisExportHtml'
// RichDocToolbar — barre d'outils partagée avec Planning séjour

const CONTENT_BREAK = DEVIS_CONTENT_BREAK

/* ─────────────────────────────────────────────────────────
   CSS GLOBAL (éditeur + impression)
───────────────────────────────────────────────────────── */
const GLOBAL_CSS = `
.ProseMirror {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 13px;
  line-height: 1.7;
  color: ${DEVIS_CHARTE.charcoal};
  outline: none;
  min-height: 420px;
}
.ProseMirror p { margin: 0 0 8px; }
.ProseMirror ul,
.ProseMirror ol { padding-left: 22px; margin: 0 0 10px; }
.ProseMirror ol { list-style-type: decimal; }
.ProseMirror ol > li { margin: 0 0 10px; break-inside: avoid; page-break-inside: avoid; }
.ProseMirror ul > li { margin: 0 0 5px; break-inside: avoid; page-break-inside: avoid; }
.ProseMirror ol ul { list-style-type: disc; margin-top: 6px; margin-bottom: 0; }
.ProseMirror hr { border: none; border-top: 1px solid ${DEVIS_CHARTE.rose}; margin: 14px 0 12px; }
.ProseMirror strong { font-weight: 700; }
.ProseMirror em { font-style: italic; color: ${DEVIS_CHARTE.gray}; }
.ProseMirror u { text-decoration: none; border-bottom: 1px solid ${DEVIS_CHARTE.rose}; }
.ProseMirror mark {
  padding: 0 1px;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
/* Ne pas écraser le fluo saumon/gris (style inline) */
.ProseMirror mark:not([style*="background"]) {
  background: ${DEVIS_CHARTE.cream};
}
.doc-shell .tiptap { min-height: 420px; }
.doc-section-bottom .ProseMirror,
.doc-section-bottom .tiptap { min-height: 180px; }

/* Sous-titres : brun, sans fond ni barre */
.ProseMirror .devis-heading,
.doc-shell .devis-heading {
  margin: 14px 0 8px;
  padding: 0;
  background: transparent;
  border: none;
  font-size: 13px;
  font-weight: 700;
  color: ${DEVIS_CHARTE.bronze};
}

/* Titre centré « Devis MC-… » — bronze + plus grand (éditeur) */
.ProseMirror .devis-ref-title,
.doc-shell .devis-ref-title {
  text-align: center !important;
  margin: 12px 0 10px;
  font-size: 18px;
  font-weight: 700;
  color: ${DEVIS_CHARTE.bronze};
  letter-spacing: 0.02em;
}
.ProseMirror .devis-ref-title strong,
.ProseMirror .devis-ref-title span,
.doc-shell .devis-ref-title strong,
.doc-shell .devis-ref-title span {
  color: ${DEVIS_CHARTE.bronze} !important;
  font-size: 18px !important;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.devis-contact-footer {
  padding: 10px 0 2px;
  border-top: 1px solid ${DEVIS_CHARTE.rose};
  background: transparent;
  text-align: center;
  font-size: 10.5px;
  line-height: 1.5;
}
.devis-contact-footer .contact-line {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 2px 0;
  color: ${DEVIS_CHARTE.charcoal};
  text-decoration: none;
}
.devis-contact-footer svg {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  stroke: ${DEVIS_ACCENT};
  fill: none;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.devis-logo-block { display: flex; flex-direction: column; align-items: center; max-width: 132px; }
.devis-logo-block .logo-img { width: 118px; height: auto; display: block; object-fit: contain; border-radius: 4px; }
.devis-logo-block .logo-slogan {
  margin: 6px 0 0; padding-top: 5px; width: 100%; text-align: center;
  font-size: 8px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase;
  color: ${DEVIS_ACCENT}; border-top: 1px solid ${DEVIS_CHARTE.rose}; line-height: 1.3;
}

/* Aperçu écran / mobile */
.editor-scroll {
  background:
    radial-gradient(1200px 400px at 50% -10%, rgba(129,87,45,0.06), transparent 60%),
    #f4f2ef;
}
.doc-shell {
  border: 1px solid rgba(40,39,39,0.06);
  border-radius: 4px;
  min-height: 1123px; /* hauteur A4 à 96dpi — zone éditeur lisible */
}
${DEVIS_OFFER_PREVIEW_CSS}

@media (max-width: 840px) {
  .editor-scroll { padding: 12px 10px !important; }
  .doc-shell {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    min-height: 70vh !important;
    padding: 22px 18px 28px !important;
    box-shadow: 0 8px 28px rgba(15,23,42,0.08) !important;
  }
  .ProseMirror,
  .doc-shell .tiptap { min-height: 280px; }
  .ProseMirror { font-size: 14px; line-height: 1.75; }
}

@media print {
  @page { size: A4 portrait; margin: 0mm; }
  .no-print { display: none !important; }
  html, body { background: white !important; height: auto !important; overflow: visible !important; }
  .editor-root { position: static !important; height: auto !important; overflow: visible !important; }
  .editor-scroll { overflow: visible !important; height: auto !important; padding: 0 !important; background: white !important; }
  .doc-shell {
    width: auto !important; max-width: none !important; min-height: 0 !important;
    margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: none !important;
  }
  .avoid-break { break-inside: avoid; page-break-inside: avoid; }
}
`

/* ─────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────── */
function fmtNum(n: number) { return n.toLocaleString('fr-TN', { minimumFractionDigits: 0 }) }

function letterCtx(
  p: GestionnairePatientDetail,
  activeDevis?: Parameters<typeof letterContextFromGestionnairePatient>[1],
): DevisLetterContext {
  return letterContextFromGestionnairePatient(p, activeDevis)
}

function sejourPdfFromPatient(p: GestionnairePatientDetail) {
  return sejourPdfFromContext(letterCtx(p))
}

function refreshDossierFieldsInTopHtml(
  html: string,
  p: GestionnairePatientDetail,
  activeDevis?: Parameters<typeof letterContextFromGestionnairePatient>[1],
): string {
  return refreshDevisLetterTopHtml(html, letterCtx(p, activeDevis))
}

function buildTopHtml(
  p: GestionnairePatientDetail,
  activeDevis?: Parameters<typeof letterContextFromGestionnairePatient>[1],
): string {
  return buildDevisLetterTopHtml(letterCtx(p, activeDevis))
}

function buildBottomHtml(total: number, tndPerEur = DEFAULT_TND_PER_EUR): string {
  return buildDevisLetterBottomHtml(total, tndPerEur)
}

/* ─────────────────────────────────────────────────────────
   PAGE PRINCIPALE
───────────────────────────────────────────────────────── */
export default function DevisEditorPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const requestedDevisId = searchParams.get('devisId')

  const [patient, setPatient]           = useState<GestionnairePatientDetail | null>(null)
  const [devisId, setDevisId]           = useState<string | null>(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [sending, setSending]           = useState(false)
  const [exporting, setExporting]       = useState(false)
  const [sentOk, setSentOk]             = useState(false)
  const [sendError, setSendError]       = useState<string | null>(null)
  const [confirmSendOpen, setConfirmSendOpen] = useState(false)
  const [initialTopHtml, setInitialTopHtml] = useState<string>('')
  const [initialBottomHtml, setInitialBottomHtml] = useState<string>('')
  const [activeZone, setActiveZone] = useState<'top' | 'bottom'>('top')
  const [tndPerEur, setTndPerEur] = useState(DEFAULT_TND_PER_EUR)

  const devisIdRef    = useRef<string | null>(null)
  const saveTimerRef  = useRef<ReturnType<typeof setTimeout>>()
  const editorTopRef = useRef<Editor | null>(null)
  const editorBotRef = useRef<Editor | null>(null)

  /* CSS global */
  useEffect(() => {
    const s = document.createElement('style')
    s.id = 'devis-editor-css'
    s.innerHTML = GLOBAL_CSS
    document.head.appendChild(s)
    return () => document.getElementById('devis-editor-css')?.remove()
  }, [])

  /* Chargement */
  const load = useCallback(async () => {
    if (!patientId) return
    setLoading(true); setError(null)
    try {
      const [{ patient: p }, taux] = await Promise.all([
        gestionnaireApi.getPatient(patientId),
        gestionnaireApi.getTauxEur().catch(() => null),
      ])
      const tndPerEurRate = taux?.tndPerEur ?? DEFAULT_TND_PER_EUR
      setTndPerEur(tndPerEurRate)
      setPatient(p)
      const dv =
        (requestedDevisId ? p.devis?.find((d) => d.id === requestedDevisId) : null)
        ?? p.devis?.find((d) => d.statut === 'brouillon')
        ?? p.devis?.find((d) => ['envoye', 'accepte'].includes(d.statut))
        ?? null
      const id = dv?.id ?? null
      setDevisId(id)
      devisIdRef.current = id

      const lignes = dv?.lignes ?? []
      const total = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)
      if (dv?.customContent?.trim()) {
        if (dv.customContent.includes(CONTENT_BREAK)) {
          const [top, bot] = dv.customContent.split(CONTENT_BREAK)
          // Sync auto : clinique/hôtel/nuits + cases inclut/exclut depuis notesSejour
          const topRaw = refreshDossierFieldsInTopHtml(top ?? buildTopHtml(p, dv), p, dv)
          setInitialTopHtml(topRaw)
          const bottomRaw = bot ?? buildBottomHtml(total, tndPerEurRate)
          setInitialBottomHtml(replaceDevisAmountPlaceholders(bottomRaw, total, tndPerEurRate))
          // Persister le HTML synchronisé (évite d’avoir besoin de « Réinitialiser »)
          if (id && topRaw !== (top ?? '')) {
            const contentToSave = `${topRaw}${CONTENT_BREAK}${replaceDevisAmountPlaceholders(bottomRaw, total, tndPerEurRate)}`
            void gestionnaireApi.saveDevisCustomContent(id, contentToSave).catch(() => undefined)
          }
        } else {
          const topRaw = refreshDossierFieldsInTopHtml(dv.customContent, p, dv)
          setInitialTopHtml(topRaw)
          setInitialBottomHtml(buildBottomHtml(total, tndPerEurRate))
          if (id && topRaw !== dv.customContent) {
            const contentToSave = `${topRaw}${CONTENT_BREAK}${buildBottomHtml(total, tndPerEurRate)}`
            void gestionnaireApi.saveDevisCustomContent(id, contentToSave).catch(() => undefined)
          }
        }
      } else {
        setInitialTopHtml(buildTopHtml(p, dv))
        setInitialBottomHtml(buildBottomHtml(total, tndPerEurRate))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [patientId, requestedDevisId])

  useEffect(() => { void load() }, [load])

  const flushSave = useCallback(async () => {
    const id = devisIdRef.current
    if (!id) return false
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = undefined
    }
    const topHtml = editorTopRef.current?.getHTML() ?? ''
    const botHtml = editorBotRef.current?.getHTML() ?? ''
    if (!topHtml.trim() && !botHtml.trim()) return false
    setSaving(true)
    try {
      await gestionnaireApi.saveDevisCustomContent(id, topHtml + CONTENT_BREAK + botHtml)
      setSaved(true)
      return true
    } catch (e) {
      console.error('[DevisEditor] sauvegarde customContent échouée', e)
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  /* Auto-save rapide (dès qu’on tape, sans cliquer Sauvegarder) */
  const triggerSave = useCallback(() => {
    setSaved(false)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void flushSave()
    }, 600)
  }, [flushSave])

  // Sauvegarde à la fermeture / changement d’onglet
  useEffect(() => {
    const onLeave = () => {
      void flushSave()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flushSave()
    }
    window.addEventListener('pagehide', onLeave)
    window.addEventListener('beforeunload', onLeave)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onLeave)
      window.removeEventListener('beforeunload', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      void flushSave()
    }
  }, [flushSave])

  const editorTop = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        horizontalRule: {},
        paragraph: false,
      }),
      DevisParagraph,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      DevisTextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: initialTopHtml || '<p></p>',
    onFocus: () => setActiveZone('top'),
    onUpdate: triggerSave,
  })
  const editorBot = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, paragraph: false }),
      DevisParagraph,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      DevisTextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: initialBottomHtml || '<p></p>',
    onFocus: () => setActiveZone('bottom'),
    onUpdate: triggerSave,
  })
  editorTopRef.current = editorTop
  editorBotRef.current = editorBot

  /* Appliquer le HTML chargé (examens rafraîchis inclus) dans l’éditeur */
  useEffect(() => {
    if (!editorTop || !initialTopHtml) return
    if (editorTop.getHTML() !== initialTopHtml) {
      editorTop.commands.setContent(initialTopHtml, { emitUpdate: false })
    }
  }, [editorTop, initialTopHtml])
  useEffect(() => {
    if (!editorBot || !initialBottomHtml) return
    if (editorBot.getHTML() !== initialBottomHtml) {
      editorBot.commands.setContent(initialBottomHtml, { emitUpdate: false })
    }
  }, [editorBot, initialBottomHtml])

  /* Sauvegarde manuelle */
  const handleManualSave = async () => {
    const ok = await flushSave()
    if (ok) toast({ title: 'Devis sauvegardé', variant: 'success' })
    else toast({ title: 'Sauvegarde impossible', variant: 'error' })
  }

  /** Valider + envoyer au patient — reste sur cette page (pas de retour liste). */
  const handleValidateAndSend = async () => {
    const id = devisIdRef.current
    if (!id) {
      setSendError('Aucun devis à envoyer. Créez d’abord un brouillon.')
      return
    }
    setSending(true)
    setSendError(null)
    setSentOk(false)
    try {
      // Toujours persister la version écran actuelle avant PDF / chat
      await flushSave()

      // PDF chat = HTML courant de l’éditeur (version sélectionnée + à jour)
      const fullHtml = await inlineHtmlImages(buildDevisFullHtml())
      // Re-sauve après refresh éventuel des champs dossier dans le HTML
      const topHtml = editorTopRef.current?.getHTML() ?? ''
      const botHtml = editorBotRef.current?.getHTML() ?? ''
      await gestionnaireApi.saveDevisCustomContent(id, topHtml + CONTENT_BREAK + botHtml)
      setSaved(true)

      await gestionnaireApi.sendDevis(id, { html: fullHtml })
      setSentOk(true)
      toast({
        title: 'Devis envoyé au patient',
        description: 'PDF personnalisé joint dans le chat.',
        variant: 'success',
      })

      await load()
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Envoi impossible.')
      toast({ title: 'Envoi impossible', description: e instanceof Error ? e.message : undefined, variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  /* Réinitialiser */
  const handleReset = () => {
    if (!patient) return
    if (!window.confirm('Réinitialiser le document avec les données actuelles du dossier ?')) return
    const dv =
      (devisId ? patient.devis?.find((d) => d.id === devisId) : null)
      ?? patient.devis?.find((d) => d.statut === 'brouillon')
      ?? patient.devis?.find((d) => ['envoye', 'accepte'].includes(d.statut))
      ?? null
    const total = (dv?.lignes ?? []).reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)
    // Régénère depuis cases + tableau prestations (écrase les edits TipTap — voulu)
    editorTop?.commands.setContent(buildTopHtml(patient, dv ?? undefined))
    editorBot?.commands.setContent(buildBottomHtml(total, tndPerEur))
    setSaved(false)
    void flushSave()
  }

  /* Calculs financiers (utilisés par l’aperçu et l’export PDF) */
  const dv =
    (devisId ? patient?.devis?.find((d) => d.id === devisId) : null)
    ?? patient?.devis?.find((d) => d.statut === 'brouillon')
    ?? patient?.devis?.find((d) => ['envoye', 'accepte'].includes(d.statut))
    ?? null
  const rap = patient?.rapports?.[0]
  const lignes = dv?.lignes ?? []
  const total = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)
  const devisHeaderRef =
    getDevisDisplayNumber(dv, patient?.dossierNumber) || patient?.dossierNumber || ''

  const interventionLabel = (rap?.interventionsRecommandees ?? []).filter(Boolean).join(' + ')
  const sejourLine = patient ? sejourPdfFromPatient(patient).sejourLine : ''
  const firstLigneLabel = lignes.find((l) => l.description?.trim())?.description.trim() ?? ''
  const operationTitle =
    interventionLabel || firstLigneLabel || 'Séjour médical personnalisé'

  /* Construit le HTML complet (même moteur que patient / médecin / chat). */
  const buildDevisFullHtml = () => {
    if (!patient || !dv) return ''
    let topHtml = editorTopRef.current?.getHTML() ?? ''
    // Ne rafraîchit PAS la section inclut/exclut (édits TipTap conservés)
    topHtml = refreshDossierFieldsInTopHtml(topHtml, patient, dv)
    editorTopRef.current?.commands.setContent(topHtml, { emitUpdate: false })
    const botHtml = editorBotRef.current?.getHTML() ?? ''
    return buildGestionnaireDevisExportHtml({
      devis: dv,
      patient,
      topHtml,
      botHtml,
      tndPerEur,
    })
  }

  /* Export PDF — même moteur Chromium que l’envoi chat (fichier identique) */
  const handlePrint = async () => {
    const topHtml  = editorTopRef.current?.getHTML() ?? ''
    const botHtml  = editorBotRef.current?.getHTML() ?? ''

    if (!topHtml && !botHtml) {
      window.alert("Le document est vide. Réinitialisez ou saisissez du contenu d'abord.")
      return
    }

    setExporting(true)
    try {
      // Persister avant export → patient / chat voient la même version
      await flushSave()
      const html = await inlineHtmlImages(buildDevisFullHtml())
      // Sauve aussi après éventuel refresh des champs dossier
      const top = editorTopRef.current?.getHTML() ?? ''
      const bot = editorBotRef.current?.getHTML() ?? ''
      const id = devisIdRef.current
      if (id) {
        await gestionnaireApi.saveDevisCustomContent(id, top + CONTENT_BREAK + bot)
        setSaved(true)
      }
      const blob = await gestionnaireApi.renderDevisPdf(html)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = formatDevisPdfFileName(
        patient?.dossierNumber ?? devisHeaderRef,
        patient?.user.fullName,
        dv?.version ?? 1,
      )
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Export PDF impossible.')
    } finally {
      setExporting(false)
    }
  }

  /* ── États chargement / erreur ── */
  if (loading) return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center gap-4">
      <RefreshCw className="h-8 w-8 text-slate-300 animate-spin" />
      <p className="text-sm text-slate-400">Chargement du dossier…</p>
    </div>
  )
  if (error || !patient) return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm text-red-500 font-medium">{error ?? 'Patient introuvable.'}</p>
      <button onClick={() => navigate(-1)} className="text-sm text-slate-500 underline">Retour</button>
    </div>
  )

  const draftForLetter =
    patient.devis?.find((d) => d.statut === 'brouillon')
    ?? patient.devis?.find((d) => ['envoye', 'accepte'].includes(d.statut))
    ?? null
  const showStaleLetterHint = Boolean(draftForLetter?.customContent?.trim())

  return createPortal(
    <div className="editor-root fixed inset-0 bg-white z-[100] flex flex-col">

      {/* ══ Barre de navigation ══ */}
      <div className="no-print shrink-0 bg-white border-b border-slate-200 shadow-sm flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5">
        <button
          onClick={() => {
            void (async () => {
              await flushSave()
              navigate(-1)
            })()
          }}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors shrink-0 min-h-10"
        >
          <ArrowLeft className="h-4 w-4" /> <span className="hidden xs:inline sm:inline">Retour</span>
        </button>
        <div className="hidden sm:block w-px h-5 bg-slate-200 mx-1" />
        <div className="flex-1 min-w-0 basis-[min(100%,12rem)] sm:basis-auto">
          <p className="text-sm font-bold text-slate-900 truncate">
            Personnalisation — {patient.user.fullName}
          </p>
          <p className="text-[11px] text-slate-400 hidden sm:block">Zone active : <strong>{activeZone === 'top' ? 'Corps du document' : 'Bas du document'}</strong></p>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-medium shrink-0 order-last sm:order-none w-full sm:w-auto justify-end">
          {saving
            ? <><RefreshCw className="h-3 w-3 animate-spin text-slate-400" /><span className="text-slate-400">Sauvegarde…</span></>
            : saved
              ? <><CheckCircle2 className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600">Sauvegardé</span></>
              : <span className="text-slate-300">Non sauvegardé</span>}
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 h-10 sm:h-8 px-3 text-xs font-semibold text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Réinitialiser</span>
          </button>
          <button
            onClick={handleManualSave}
            disabled={saving || !devisId}
            className="flex items-center gap-1.5 h-10 sm:h-8 px-3 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg disabled:opacity-50 transition-colors"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Sauvegarder
          </button>
          <button
            onClick={() => void handlePrint()}
            disabled={exporting}
            className="flex items-center gap-1.5 h-10 sm:h-8 px-4 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-60"
            style={{ background: DEVIS_ACCENT }}
          >
            <Printer className="h-3.5 w-3.5" /> {exporting ? 'Export…' : 'Exporter PDF'}
          </button>
        </div>
      </div>

      {showStaleLetterHint && (
        <div className="no-print shrink-0 mx-4 sm:mx-6 mb-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-900 leading-snug">
          <strong className="font-semibold">Contenu personnalisable.</strong>{' '}
          La <strong>clinique</strong>, l&apos;<strong>hôtel</strong>, les <strong>durées</strong> et la liste
          {' '}<strong>« Votre devis inclut / exclut »</strong> se synchronisent automatiquement depuis le devis
          à chaque ouverture. Le reste du texte vient de votre dernière sauvegarde ici.
          Pour tout régénérer (écraser le texte libre), cliquez <strong>Réinitialiser</strong> puis Sauvegarder.
        </div>
      )}

      {/* ══ Toolbar ══ */}
      <RichDocToolbar editor={activeZone === 'top' ? editorTop : editorBot} />

      {/* ══ Document A4 — aperçu écran / mobile ══ */}
      <div className="editor-scroll flex-1 overflow-auto py-4 sm:py-8 px-2 sm:px-4">
        <div
          className="doc-shell bg-white shadow-2xl mx-auto"
          style={{
            width: 794,
            minWidth: 794,
            minHeight: 1123,
            padding: '36px 44px 40px',
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: 13,
            lineHeight: 1.7,
            color: DEVIS_CHARTE.charcoal,
            boxSizing: 'border-box',
            backgroundColor: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
          }}
        >
          {/* ── En-tête allégé : logo uniquement (réf. dans le corps « Devis MC-… ») ── */}
          <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-start', flexShrink: 0 }}>
            <div
              dangerouslySetInnerHTML={{
                __html: buildDevisHeaderLogoHtml(DEVIS_LOGO_SRC),
              }}
            />
          </div>

          {/* ── Zone éditable HAUTE ── */}
          <div className="doc-section-top" style={{ flexShrink: 0 }}>
            <EditorContent editor={editorTop} />
          </div>

          {/* ── Tableau offre (même structure que le PDF) ── */}
          {lignes.length > 0 && (
            <div
              className="avoid-break doc-offer-preview"
              style={{ flexShrink: 0 }}
              dangerouslySetInnerHTML={{
                __html: buildDevisOfferBlockHtml({
                  operationTitle,
                  sejourLine,
                  totalFormatted: fmtNum(total),
                }),
              }}
            />
          )}

          {/* ── Bas de document (modalités + validité) ── */}
          <div className="doc-section-bottom">
            <EditorContent editor={editorBot} />
          </div>

          <div className="avoid-break" style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontWeight: 700, fontSize: 11.5, margin: 0 }}>{DEVIS_SIGNATURE.cabinet}</p>
              <p style={{ fontSize: 10, color: DEVIS_CHARTE.gray, margin: '1px 0 0' }}>{DEVIS_SIGNATURE.specialty}</p>
              <img
                src="/signature.jpg"
                alt="Signature"
                style={{ marginTop: 3, width: 72, height: 38, objectFit: 'contain', display: 'block', marginLeft: 'auto' }}
                onError={(e) => {
                  const img = e.currentTarget as HTMLImageElement
                  if (!img.src.includes('/assets/')) { img.src = '/assets/signature.jpg'; return }
                  img.style.display = 'none'
                }}
              />
              <div style={{ marginTop: 3, width: 110, height: 1, borderBottom: `1px solid ${DEVIS_CHARTE.rose}`, marginLeft: 'auto' }} />
            </div>
          </div>

          <div
            className="no-print-devis-footer"
            dangerouslySetInnerHTML={{ __html: buildDevisContactFooterHtml() }}
            style={{ marginTop: 8 }}
          />

        </div>
      </div>

      {/* ══ Pied de page : Valider et envoyer (reste sur l’éditeur) ══ */}
      <div className="no-print shrink-0 border-t border-slate-200 bg-white px-3 sm:px-5 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.06)]">
        {sendError && (
          <p className="text-xs text-red-600 mb-2 text-center sm:text-left">{sendError}</p>
        )}
        {(sentOk || dv?.statut === 'envoye') && !sendError && (
          <p className="text-xs text-emerald-600 mb-2 text-center sm:text-left flex items-center justify-center sm:justify-start gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {dv?.statut === 'envoye' || sentOk
              ? 'Devis validé et envoyé au patient. Vous restez sur cette page — Exporter PDF disponible ci-dessus.'
              : null}
          </p>
        )}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2">
          <p className="text-[11px] text-slate-400 text-center sm:text-left">
            {dv?.statut === 'accepte'
              ? 'Devis accepté par le patient.'
              : dv?.statut === 'envoye'
                ? 'Déjà envoyé. Modifiez le contenu puis sauvegardez si besoin.'
                : 'Enregistre le document puis l’envoie au patient, sans quitter cette page.'}
          </p>
          <button
            type="button"
            onClick={() => setConfirmSendOpen(true)}
            disabled={sending || saving || !devisId || dv?.statut === 'envoye' || dv?.statut === 'accepte' || sentOk}
            className="inline-flex items-center justify-center gap-2 h-11 sm:h-10 px-5 text-sm font-semibold text-white rounded-xl disabled:opacity-50 transition-colors shrink-0"
            style={{ background: DEVIS_ACCENT }}
          >
            {sending ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Envoi…</>
            ) : sentOk || dv?.statut === 'envoye' ? (
              <><CheckCircle2 className="h-4 w-4" /> Envoyé au patient</>
            ) : (
              <><Send className="h-4 w-4" /> Valider et envoyer</>
            )}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSendOpen}
        onClose={() => !sending && setConfirmSendOpen(false)}
        title="Envoyer ce devis au patient ?"
        description={`Le document sera enregistré puis transmis à ${patient?.user.fullName ?? 'la patiente'}. Confirmez uniquement si le devis est finalisé.`}
        confirmLabel="Envoyer"
        cancelLabel="Annuler"
        confirmVariant="brand"
        loading={sending}
        onConfirm={async () => {
          setConfirmSendOpen(false)
          await handleValidateAndSend()
        }}
        icon={
          <div className="h-11 w-11 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center">
            <Send className="h-5 w-5 text-brand-700" />
          </div>
        }
      />
    </div>,
    document.body,
  )
}
