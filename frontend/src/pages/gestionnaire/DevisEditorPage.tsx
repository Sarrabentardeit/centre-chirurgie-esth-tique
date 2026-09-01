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

/** Couleur texte — !important pour passer devant les styles charte (libellés saumon, etc.). */
const DevisColor = Color.extend({
  addGlobalAttributes() {
    const parent = this.parent?.()
    if (!parent) return []
    return parent.map((group) => ({
      ...group,
      attributes: {
        ...group.attributes,
        color: {
          ...group.attributes?.color,
          parseHTML: (element: HTMLElement) =>
            element.style.color?.replace(/\s*!important\s*$/i, '').trim() || null,
          renderHTML: (attributes: { color?: string | null }) => {
            if (!attributes.color) return {}
            return { style: `color: ${attributes.color} !important` }
          },
        },
      },
    }))
  },
})

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
      style: {
        default: null,
        parseHTML: (element) => element.getAttribute('style'),
        renderHTML: (attributes) => {
          if (!attributes.style) return {}
          return { style: attributes.style }
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
          return { style: `font-size: ${attributes.fontSize} !important` }
        },
      },
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

/** Conserve les classes fluo (offer-fluo-disclaimer, offer-fluo-payment, etc.) sur les surlignages. */
const DevisHighlight = Highlight.extend({
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
import { ArrowLeft, Printer, RotateCcw, CheckCircle2, RefreshCw, Send } from 'lucide-react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { toast } from '@/store/toastStore'
import { RichDocToolbar } from '@/components/editor/RichDocToolbar'
import { gestionnaireApi, type GestionnairePatientDetail } from '@/lib/api'
import { formatDate, formatDevisPdfFileName, formatDevisTitle, getDevisDisplayNumber } from '@/lib/utils'
import { DEFAULT_TND_PER_EUR, replaceDevisAmountPlaceholders } from '@/lib/moneyWords'
import { inlineHtmlImages } from '@/lib/pdf'
import {
  DEVIS_LOGO_SRC,
  DEVIS_SIGNATURE_BLOCK,
  DEVIS_SIGNATURE_BLOCK_STYLE,
  buildDevisContactFooterHtml,
  buildDevisHeaderLogoHtml,
} from '@/lib/devisBranding'
import {
  DEVIS_ACCENT,
  DEVIS_CHARTE,
  DEVIS_FLUO_GRAY,
  DEVIS_FONT_FAMILY,
  DEVIS_BODY_FONT_SIZE,
  DEVIS_OFFER_PRICE_FONT_SIZE,
  DEVIS_HIGHLIGHT_COLORS,
  DEVIS_OFFER_PREVIEW_CSS,
  devisEmptyParagraphCss,
  devisOfferSejourFluoCss,
  devisRefTitleCss,
  devisSectionHeadingCss,
  markDevisSpacerParagraphs,
  prepareDevisHtmlForEditor,
  buildOfferDescEditorHtml,
  defaultOfferSubtitleHtml,
  defaultOfferHeadDescHtml,
  defaultOfferHeadPriceHtml,
  ensureTarifHintSalmonHtml,
  looksLikeOfferDescHtml,
  restoreOfferSejourFluoInHtml,
} from '@/lib/devisCharte'
import {
  buildDevisLetterBottomHtml,
  buildDevisLetterTopHtml,
  letterContextFromGestionnairePatient,
  pickRapport,
  sejourPdfFromContext,
  syncDureeTotaleSejourInHtml,
  type DevisLetterContext,
} from '@/lib/devisLetterHtml'
import { diagnosticDarkFluoCss, diagnosticBlockGapCss, diagnosticZoneLeadCss, diagnosticVisageCss } from '@/lib/diagnosticFormat'
import { buildGestionnaireDevisExportHtml, hasPersonalizedDevisLetter, joinDevisCustomContent, loadDevisCustomContentForEditor } from '@/lib/devisExportHtml'
// RichDocToolbar — barre d'outils partagée avec Planning séjour

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function loadOfferEditorHtml(
  stored: string | null | undefined,
  fallbackTitle: string,
  sejourLine = '',
  typeChambre = '',
): string {
  const raw = stored?.trim() ?? ''
  if (looksLikeOfferDescHtml(raw) && raw.startsWith('<')) return restoreOfferSejourFluoInHtml(raw)
  return buildOfferDescEditorHtml(raw || fallbackTitle, sejourLine, typeChambre)
}

function offerTotalEditorHtml(display: string): string {
  const safe = escapeHtmlText(display.trim() || '0')
  return `<p>${safe}</p>`
}

function loadOfferTotalEditorHtml(stored: string | null | undefined, fallback: string): string {
  const raw = stored?.trim() ?? ''
  if (!raw) return offerTotalEditorHtml(fallback)
  if (raw.startsWith('<')) return raw
  return offerTotalEditorHtml(raw)
}

function htmlToPlainText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function readOfferTitle(editor: Editor | null, fallback: string): string {
  const text = editor?.getText()?.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
  return text || fallback
}

function readOfferTotalDisplay(editor: Editor | null, fallback: string): string {
  const text = editor?.getText()?.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
  return text || fallback
}

/* ─────────────────────────────────────────────────────────
   CSS GLOBAL (éditeur + impression)
───────────────────────────────────────────────────────── */
const GLOBAL_CSS = `
.doc-shell {
  font-family: ${DEVIS_FONT_FAMILY};
  font-size: ${DEVIS_BODY_FONT_SIZE};
}
.ProseMirror {
  font-family: ${DEVIS_FONT_FAMILY};
  font-size: ${DEVIS_BODY_FONT_SIZE};
  line-height: 1.7;
  color: ${DEVIS_CHARTE.charcoal};
  outline: none;
  min-height: 420px;
}
.ProseMirror p { margin: 0 0 8px; }
/* Espacements manuels (Entrée) — aligné sur le PDF */
${devisEmptyParagraphCss('.ProseMirror')}
.ProseMirror ul,
.ProseMirror ol { padding-left: 22px; margin: 0 0 8px; }
.ProseMirror ol { list-style-type: decimal; }
.ProseMirror ol > li,
.ProseMirror ul > li { margin: 0 0 6px; break-inside: avoid; page-break-inside: avoid; }
.ProseMirror ol ul { list-style-type: disc; margin-top: 4px; margin-bottom: 0; }
.ProseMirror hr { border: none; border-top: 1px solid ${DEVIS_CHARTE.rose}; margin: 14px 0 12px; }
.ProseMirror strong { font-weight: 700; }
.ProseMirror em { font-style: italic; color: ${DEVIS_CHARTE.charcoal}; }
.ProseMirror .devis-letter-intro,
.ProseMirror .devis-letter-intro em,
.doc-shell .devis-letter-intro,
.doc-shell .devis-letter-intro em {
  font-style: italic;
}
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
.doc-section-bottom .ProseMirror mark.offer-fluo-disclaimer,
.doc-shell .doc-section-bottom mark.offer-fluo-disclaimer,
.doc-section-bottom .ProseMirror mark.offer-fluo-payment,
.doc-shell .doc-section-bottom mark.offer-fluo-payment,
.doc-section-bottom .ProseMirror mark.offer-fluo-validity,
.doc-shell .doc-section-bottom mark.offer-fluo-validity,
.doc-section-bottom .ProseMirror mark[data-color="#808080"] {
  background-color: ${DEVIS_FLUO_GRAY.gray50};
  color: #FFFFFF;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
${diagnosticDarkFluoCss('.doc-section-top .ProseMirror', '.doc-shell .doc-section-top', { editable: true })}
${diagnosticBlockGapCss('.doc-section-top .ProseMirror', '.doc-shell .doc-section-top')}
${diagnosticZoneLeadCss('.doc-section-top .ProseMirror', '.doc-shell .doc-section-top', { editable: true })}
${diagnosticVisageCss('.doc-section-top .ProseMirror', '.doc-shell .doc-section-top')}
.doc-section-offer,
.doc-section-offer > div,
.doc-section-offer .ProseMirror,
.doc-section-offer .tiptap {
  display: block;
  min-height: 1.4em;
  font-weight: inherit;
  font-size: inherit;
  line-height: 1.5;
  color: inherit;
  cursor: text;
}
.doc-section-offer .ProseMirror p { margin: 0 0 6px; display: block; }
.doc-section-offer .ProseMirror p:last-child { margin-bottom: 0; }
${devisOfferSejourFluoCss('.doc-section-offer')}
${devisOfferSejourFluoCss('.doc-offer-preview')}
.doc-section-offer-sub,
.doc-section-offer-head {
  cursor: text;
}
.doc-section-offer-sub .ProseMirror,
.doc-section-offer-sub .tiptap,
.doc-section-offer-head .ProseMirror,
.doc-section-offer-head .tiptap {
  min-height: 1.2em;
  outline: none;
}
.doc-section-offer-sub .ProseMirror p,
.doc-section-offer-head .ProseMirror p {
  margin: 0;
}
.doc-offer-preview .op-title {
  line-height: 1.5;
}
.doc-section-offer-total .ProseMirror,
.doc-section-offer-total .tiptap {
  min-height: 28px;
  font-weight: 700;
  font-size: ${DEVIS_OFFER_PRICE_FONT_SIZE};
  line-height: 1.2;
  color: ${DEVIS_CHARTE.charcoal};
  text-align: center;
  letter-spacing: 0.02em;
}
.doc-section-offer-total .ProseMirror p { margin: 0; text-align: center; }
.doc-offer-preview.is-editing {
  outline: 2px solid ${DEVIS_ACCENT}55;
  outline-offset: 4px;
  border-radius: 4px;
}

/* Titres de section + libellés saumon — mode éditable (palette couleur) */
${devisSectionHeadingCss('.ProseMirror', { editable: true })}
${devisSectionHeadingCss('.doc-shell', { editable: true })}
/* Couleur / surlignage manuel TipTap — y compris titres de section */
.ProseMirror span[style*="color"],
.ProseMirror mark[style*="background"],
.doc-shell .ProseMirror span[style*="color"],
.doc-shell .ProseMirror mark[style*="background"] {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.ProseMirror .devis-heading [style*="color"],
.ProseMirror .devis-heading mark,
.doc-shell .devis-heading [style*="color"],
.doc-shell .devis-heading mark {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* Titre centré « Devis MC-… » — saumon + fond gris (réf. Word) */
${devisRefTitleCss('.ProseMirror')}
${devisRefTitleCss('.doc-shell')}
.ProseMirror .devis-ref-title u,
.doc-shell .devis-ref-title u {
  text-decoration: underline !important;
  border-bottom: none !important;
  text-underline-offset: 2px;
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
.devis-contact-footer svg.icon-whatsapp {
  stroke: none;
  fill: ${DEVIS_ACCENT};
}
.devis-contact-footer svg.icon-whatsapp path {
  stroke: none;
  fill: inherit;
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
  min-height: 1123px; /* hauteur A4 à 96dpi — le document grandit si le texte est long */
  height: auto;
  overflow: visible;
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
  .doc-section-offer .ProseMirror,
  .doc-section-offer .tiptap,
  .doc-section-offer-sub .ProseMirror,
  .doc-section-offer-sub .tiptap,
  .doc-section-offer-head .ProseMirror,
  .doc-section-offer-head .tiptap,
  .doc-section-offer-total .ProseMirror,
  .doc-section-offer-total .tiptap { min-height: 1.2em !important; }
  .ProseMirror { font-size: ${DEVIS_BODY_FONT_SIZE}; line-height: 1.75; }
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
function fmtNum(n: number) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n || 0))
}

function letterCtx(
  p: GestionnairePatientDetail,
  activeDevis?: Parameters<typeof letterContextFromGestionnairePatient>[1],
): DevisLetterContext {
  return letterContextFromGestionnairePatient(p, activeDevis)
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
  const [initialOfferTitle, setInitialOfferTitle] = useState<string>('')
  const [initialOfferTotal, setInitialOfferTotal] = useState<string>('')
  const [initialOfferSubtitle, setInitialOfferSubtitle] = useState<string>('')
  const [initialOfferHeadDesc, setInitialOfferHeadDesc] = useState<string>('')
  const [initialOfferHeadPrice, setInitialOfferHeadPrice] = useState<string>('')
  const [activeZone, setActiveZone] = useState<
    'top' | 'bottom' | 'offer' | 'offerTotal' | 'offerSub' | 'offerHeadDesc' | 'offerHeadPrice'
  >('top')
  const [tndPerEur, setTndPerEur] = useState(DEFAULT_TND_PER_EUR)

  const devisIdRef    = useRef<string | null>(null)
  const saveTimerRef  = useRef<ReturnType<typeof setTimeout>>()
  const editorTopRef = useRef<Editor | null>(null)
  const editorBotRef = useRef<Editor | null>(null)
  const editorOfferRef = useRef<Editor | null>(null)
  const editorOfferTotalRef = useRef<Editor | null>(null)
  const editorOfferSubRef = useRef<Editor | null>(null)
  const editorOfferHeadDescRef = useRef<Editor | null>(null)
  const editorOfferHeadPriceRef = useRef<Editor | null>(null)
  const tndPerEurRef = useRef(DEFAULT_TND_PER_EUR)
  /** Empêche une auto-save TipTap trop tôt (ex. total encore à l’ancienne valeur). */
  const readyToSaveRef = useRef(false)
  const offerTotalTouchedRef = useRef(false)
  const hydratedRef = useRef({
    top: '', bot: '', offer: '', total: '', sub: '', headDesc: '', headPrice: '',
  })

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
    readyToSaveRef.current = false
    offerTotalTouchedRef.current = false
    hydratedRef.current = { top: '', bot: '', offer: '', total: '', sub: '', headDesc: '', headPrice: '' }
    setLoading(true); setError(null)
    try {
      const [{ patient: p }, taux] = await Promise.all([
        gestionnaireApi.getPatient(patientId),
        gestionnaireApi.getTauxEur().catch(() => null),
      ])
      const tndPerEurRate = taux?.tndPerEur ?? DEFAULT_TND_PER_EUR
      setTndPerEur(tndPerEurRate)
      tndPerEurRef.current = tndPerEurRate
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
      const ctx = letterCtx(p, dv ?? undefined)
      const sv = sejourPdfFromContext(ctx)
      const defaultOffer =
        (pickRapport(ctx)?.interventionsRecommandees ?? [])
          .filter(Boolean)
          .join(' + ')
        || lignes.find((l) => l.description?.trim())?.description.trim()
        || 'Séjour médical personnalisé'
      const defaultDescHtml = buildOfferDescEditorHtml(defaultOffer, sv.sejourLine, sv.typeChambre)

      if (dv) {
        const personalized = hasPersonalizedDevisLetter(dv.customContent)
        const loaded = loadDevisCustomContentForEditor({
          customContent: dv.customContent,
          defaultTopHtml: buildTopHtml(p, dv),
          defaultBotHtml: buildBottomHtml(total, tndPerEurRate),
          defaultOfferTitle: defaultDescHtml,
          defaultOfferTotal: fmtNum(total),
          defaultOfferSubtitle: defaultOfferSubtitleHtml(),
          defaultOfferHeadDesc: defaultOfferHeadDescHtml(),
          defaultOfferHeadPrice: defaultOfferHeadPriceHtml(),
          lignesTotal: total,
          tndPerEur: tndPerEurRate,
          devis: dv,
          letterContext: ctx,
        })
        setInitialTopHtml(syncDureeTotaleSejourInHtml(loaded.topHtml, sv.dureeTotale))
        setInitialBottomHtml(loaded.botHtml)
        setInitialOfferTitle(
          looksLikeOfferDescHtml(loaded.offerTitle)
            ? restoreOfferSejourFluoInHtml(loaded.offerTitle)
            : buildOfferDescEditorHtml(loaded.offerTitle, sv.sejourLine, sv.typeChambre),
        )
        setInitialOfferTotal(loaded.offerTotal)
        setInitialOfferSubtitle(
          personalized
            ? (loaded.offerSubtitle || defaultOfferSubtitleHtml())
            : prepareDevisHtmlForEditor(loaded.offerSubtitle || defaultOfferSubtitleHtml()),
        )
        setInitialOfferHeadDesc(
          personalized
            ? (loaded.offerHeadDesc || defaultOfferHeadDescHtml())
            : prepareDevisHtmlForEditor(loaded.offerHeadDesc || defaultOfferHeadDescHtml()),
        )
        setInitialOfferHeadPrice(
          personalized
            ? (loaded.offerHeadPrice || defaultOfferHeadPriceHtml())
            : ensureTarifHintSalmonHtml(
                prepareDevisHtmlForEditor(loaded.offerHeadPrice || defaultOfferHeadPriceHtml()),
              ),
        )
        offerTotalTouchedRef.current = false
      } else {
        setInitialTopHtml(buildTopHtml(p, undefined))
        setInitialBottomHtml(buildBottomHtml(0, tndPerEurRate))
        setInitialOfferTitle(defaultDescHtml)
        setInitialOfferTotal(fmtNum(0))
        setInitialOfferSubtitle(defaultOfferSubtitleHtml())
        setInitialOfferHeadDesc(defaultOfferHeadDescHtml())
        setInitialOfferHeadPrice(defaultOfferHeadPriceHtml())
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [patientId, requestedDevisId])

  useEffect(() => { void load() }, [load])

  const flushSave = useCallback(async (opts?: { force?: boolean }) => {
    const id = devisIdRef.current
    if (!id) return false
    if (!opts?.force && !readyToSaveRef.current) return false
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = undefined
    }
    const topHtml = markDevisSpacerParagraphs(editorTopRef.current?.getHTML() ?? '')
    const botHtml = markDevisSpacerParagraphs(editorBotRef.current?.getHTML() ?? '')
    const offerTitle = editorOfferRef.current?.getHTML()?.trim()
      || readOfferTitle(editorOfferRef.current, 'Séjour médical personnalisé')
    const offerTotal = editorOfferTotalRef.current?.getHTML()?.trim()
      || readOfferTotalDisplay(editorOfferTotalRef.current, '0')
    const offerChrome = {
      subtitle: editorOfferSubRef.current?.getHTML()?.trim() || defaultOfferSubtitleHtml(),
      headDesc: editorOfferHeadDescRef.current?.getHTML()?.trim() || defaultOfferHeadDescHtml(),
      headPrice: editorOfferHeadPriceRef.current?.getHTML()?.trim() || defaultOfferHeadPriceHtml(),
    }
    if (!topHtml.trim() && !botHtml.trim()) return false
    setSaving(true)
    try {
      await gestionnaireApi.saveDevisCustomContent(
        id,
        joinDevisCustomContent(
          topHtml,
          botHtml,
          offerTitle,
          offerTotal,
          offerTotalTouchedRef.current,
          offerChrome,
        ),
      )
      setSaved(true)
      return true
    } catch (e) {
      console.error('[DevisEditor] sauvegarde customContent échouée', e)
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  const snapshotCustomContent = useCallback((): string | null => {
    const topHtml = markDevisSpacerParagraphs(editorTopRef.current?.getHTML() ?? '')
    const botHtml = markDevisSpacerParagraphs(editorBotRef.current?.getHTML() ?? '')
    if (!topHtml.trim() && !botHtml.trim()) return null
    const offerTitle = editorOfferRef.current?.getHTML()?.trim()
      || readOfferTitle(editorOfferRef.current, 'Séjour médical personnalisé')
    const offerTotal = editorOfferTotalRef.current?.getHTML()?.trim()
      || readOfferTotalDisplay(editorOfferTotalRef.current, '0')
    return joinDevisCustomContent(
      topHtml,
      botHtml,
      offerTitle,
      offerTotal,
      offerTotalTouchedRef.current,
      {
        subtitle: editorOfferSubRef.current?.getHTML()?.trim() || defaultOfferSubtitleHtml(),
        headDesc: editorOfferHeadDescRef.current?.getHTML()?.trim() || defaultOfferHeadDescHtml(),
        headPrice: editorOfferHeadPriceRef.current?.getHTML()?.trim() || defaultOfferHeadPriceHtml(),
      },
    )
  }, [])

  const syncOfferTotalFromLignes = useCallback((amount: number) => {
    const ed = editorOfferTotalRef.current
    if (!ed) return
    const display = fmtNum(amount)
    const next = offerTotalEditorHtml(display)
    if (ed.getText().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() !== display) {
      ed.commands.setContent(next, { emitUpdate: false })
    }
  }, [])

  /* Auto-save rapide (dès qu’on tape, sans cliquer Sauvegarder) */
  const triggerSave = useCallback(() => {
    setSaved(false)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void flushSave()
    }, 400)
  }, [flushSave])

  // Sauvegarde à la fermeture / changement d’onglet
  useEffect(() => {
    const onLeave = () => {
      const id = devisIdRef.current
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = undefined
      }
      if (id && readyToSaveRef.current) {
        const content = snapshotCustomContent()
        if (content) gestionnaireApi.saveDevisCustomContentKeepalive(id, content)
      }
      void flushSave({ force: true })
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onLeave()
    }
    window.addEventListener('pagehide', onLeave)
    window.addEventListener('beforeunload', onLeave)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onLeave)
      window.removeEventListener('beforeunload', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      onLeave()
    }
  }, [flushSave, snapshotCustomContent])

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
      DevisColor,
      DevisHighlight.configure({ multicolor: true }),
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
      DevisColor,
      DevisHighlight.configure({ multicolor: true }),
    ],
    content: initialBottomHtml || '<p></p>',
    onFocus: () => setActiveZone('bottom'),
    onUpdate: triggerSave,
  })
  const editorOffer = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        blockquote: false,
        codeBlock: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        paragraph: false,
      }),
      DevisParagraph,
      Underline,
      TextAlign.configure({ types: ['paragraph'] }),
      DevisTextStyle,
      DevisColor,
      DevisHighlight.configure({ multicolor: true }),
    ],
    content: loadOfferEditorHtml(initialOfferTitle, 'Séjour médical personnalisé'),
    onFocus: () => setActiveZone('offer'),
    onUpdate: triggerSave,
  })
  const editorOfferTotal = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        blockquote: false,
        codeBlock: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        paragraph: false,
      }),
      DevisParagraph,
      Underline,
      TextAlign.configure({ types: ['paragraph'] }),
      DevisTextStyle,
      DevisColor,
      DevisHighlight.configure({ multicolor: true }),
    ],
    content: loadOfferTotalEditorHtml(initialOfferTotal, '0'),
    onFocus: () => {
      setActiveZone('offerTotal')
      offerTotalTouchedRef.current = true
    },
    onUpdate: () => {
      offerTotalTouchedRef.current = true
      triggerSave()
    },
  })
  const makeOfferChromeExts = () => [
    StarterKit.configure({
      heading: false,
      horizontalRule: false,
      blockquote: false,
      codeBlock: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      paragraph: false,
    }),
    DevisParagraph,
    Underline,
    TextAlign.configure({ types: ['paragraph'] }),
    DevisTextStyle,
    DevisColor,
    DevisHighlight.configure({ multicolor: true }),
  ]
  const editorOfferSub = useEditor({
    immediatelyRender: false,
    extensions: makeOfferChromeExts(),
    content: initialOfferSubtitle || defaultOfferSubtitleHtml(),
    onFocus: () => setActiveZone('offerSub'),
    onUpdate: triggerSave,
  })
  const editorOfferHeadDesc = useEditor({
    immediatelyRender: false,
    extensions: makeOfferChromeExts(),
    content: initialOfferHeadDesc || defaultOfferHeadDescHtml(),
    onFocus: () => setActiveZone('offerHeadDesc'),
    onUpdate: triggerSave,
  })
  const editorOfferHeadPrice = useEditor({
    immediatelyRender: false,
    extensions: makeOfferChromeExts(),
    content: initialOfferHeadPrice || defaultOfferHeadPriceHtml(),
    onFocus: () => setActiveZone('offerHeadPrice'),
    onUpdate: triggerSave,
  })
  editorTopRef.current = editorTop
  editorBotRef.current = editorBot
  editorOfferRef.current = editorOffer
  editorOfferTotalRef.current = editorOfferTotal
  editorOfferSubRef.current = editorOfferSub
  editorOfferHeadDescRef.current = editorOfferHeadDesc
  editorOfferHeadPriceRef.current = editorOfferHeadPrice

  /* Appliquer le HTML chargé une seule fois (ne pas écraser les edits en cours). */
  useEffect(() => {
    if (!editorTop || !initialTopHtml || loading) return
    if (hydratedRef.current.top === initialTopHtml) return
    editorTop.commands.setContent(initialTopHtml, { emitUpdate: false })
    hydratedRef.current.top = initialTopHtml
  }, [editorTop, initialTopHtml, loading])
  useEffect(() => {
    if (!editorBot || !initialBottomHtml || loading) return
    if (hydratedRef.current.bot === initialBottomHtml) return
    editorBot.commands.setContent(initialBottomHtml, { emitUpdate: false })
    hydratedRef.current.bot = initialBottomHtml
  }, [editorBot, initialBottomHtml, loading])
  useEffect(() => {
    if (!editorOffer || loading) return
    const next = loadOfferEditorHtml(initialOfferTitle, 'Séjour médical personnalisé')
    if (hydratedRef.current.offer === next) return
    editorOffer.commands.setContent(next, { emitUpdate: false })
    hydratedRef.current.offer = next
  }, [editorOffer, initialOfferTitle, loading])
  useEffect(() => {
    if (!editorOfferTotal || loading) return
    const next = loadOfferTotalEditorHtml(initialOfferTotal, '0')
    if (hydratedRef.current.total === next) return
    editorOfferTotal.commands.setContent(next, { emitUpdate: false })
    hydratedRef.current.total = next
  }, [editorOfferTotal, initialOfferTotal, loading])
  useEffect(() => {
    if (!editorOfferSub || loading) return
    const next = initialOfferSubtitle || defaultOfferSubtitleHtml()
    if (hydratedRef.current.sub === next) return
    editorOfferSub.commands.setContent(next, { emitUpdate: false })
    hydratedRef.current.sub = next
  }, [editorOfferSub, initialOfferSubtitle, loading])
  useEffect(() => {
    if (!editorOfferHeadDesc || loading) return
    const next = initialOfferHeadDesc || defaultOfferHeadDescHtml()
    if (hydratedRef.current.headDesc === next) return
    editorOfferHeadDesc.commands.setContent(next, { emitUpdate: false })
    hydratedRef.current.headDesc = next
  }, [editorOfferHeadDesc, initialOfferHeadDesc, loading])
  useEffect(() => {
    if (!editorOfferHeadPrice || loading) return
    const next = ensureTarifHintSalmonHtml(initialOfferHeadPrice || defaultOfferHeadPriceHtml())
    if (hydratedRef.current.headPrice === next) return
    editorOfferHeadPrice.commands.setContent(next, { emitUpdate: false })
    hydratedRef.current.headPrice = next
  }, [editorOfferHeadPrice, initialOfferHeadPrice, loading])
  useEffect(() => {
    if (loading) return
    readyToSaveRef.current = true
  }, [loading])

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
      await flushSave({ force: true })

      // PDF chat = exactement ce qui est à l’écran
      const fullHtml = await inlineHtmlImages(buildDevisFullHtml())
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
    if (!window.confirm(
      'Réinitialiser ce document avec le diagnostic actuel du rapport lié à ce devis (une correction du même rapport est reprise, pas un rapport plus récent) ?',
    )) return
    const dvReset =
      (devisId ? patient.devis?.find((d) => d.id === devisId) : null)
      ?? patient.devis?.find((d) => d.statut === 'brouillon')
      ?? patient.devis?.find((d) => ['envoye', 'accepte'].includes(d.statut))
      ?? null
    const totalReset = (dvReset?.lignes ?? []).reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)
    const rapReset = pickRapport(letterCtx(patient, dvReset ?? undefined))
    const defaultOffer =
      (rapReset?.interventionsRecommandees ?? []).filter(Boolean).join(' + ')
      || (dvReset?.lignes ?? []).find((l) => l.description?.trim())?.description.trim()
      || 'Séjour médical personnalisé'
    // Régénère depuis cases + tableau prestations (écrase les edits TipTap — voulu)
    const svReset = sejourPdfFromContext(letterCtx(patient, dvReset ?? undefined))
    editorTop?.commands.setContent(buildTopHtml(patient, dvReset ?? undefined))
    editorBot?.commands.setContent(buildBottomHtml(totalReset, tndPerEur))
    editorOffer?.commands.setContent(buildOfferDescEditorHtml(defaultOffer, svReset.sejourLine, svReset.typeChambre))
    editorOfferTotal?.commands.setContent(offerTotalEditorHtml(fmtNum(totalReset)))
    editorOfferSub?.commands.setContent(defaultOfferSubtitleHtml())
    editorOfferHeadDesc?.commands.setContent(defaultOfferHeadDescHtml())
    editorOfferHeadPrice?.commands.setContent(defaultOfferHeadPriceHtml())
    setInitialOfferTitle(buildOfferDescEditorHtml(defaultOffer, svReset.sejourLine, svReset.typeChambre))
    setInitialOfferTotal(fmtNum(totalReset))
    setInitialOfferSubtitle(defaultOfferSubtitleHtml())
    setInitialOfferHeadDesc(defaultOfferHeadDescHtml())
    setInitialOfferHeadPrice(defaultOfferHeadPriceHtml())
    offerTotalTouchedRef.current = false
    readyToSaveRef.current = true
    setSaved(false)
    void flushSave()
  }

  /* Calculs financiers (utilisés par l’aperçu et l’export PDF) */
  const dv =
    (devisId ? patient?.devis?.find((d) => d.id === devisId) : null)
    ?? patient?.devis?.find((d) => d.statut === 'brouillon')
    ?? patient?.devis?.find((d) => ['envoye', 'accepte'].includes(d.statut))
    ?? null
  const rap = patient ? pickRapport(letterCtx(patient, dv ?? undefined)) : null
  const lignes = dv?.lignes ?? []
  const total = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)
  const devisHeaderRef =
    getDevisDisplayNumber(dv, patient?.dossierNumber) || patient?.dossierNumber || ''

  const interventionLabel = (rap?.interventionsRecommandees ?? []).filter(Boolean).join(' + ')
  const firstLigneLabel = lignes.find((l) => l.description?.trim())?.description.trim() ?? ''
  const defaultOperationTitle =
    interventionLabel || firstLigneLabel || 'Séjour médical personnalisé'
  const defaultOfferTotal = fmtNum(total)

  /* Si le total devis change (retour modal), resynchroniser tableau + phrase en lettres */
  useEffect(() => {
    if (loading || !readyToSaveRef.current) return
    syncOfferTotalFromLignes(total)
    const bot = editorBotRef.current
    if (bot) {
      const current = bot.getHTML()
      const next = replaceDevisAmountPlaceholders(current, total, tndPerEurRef.current)
      if (next !== current) bot.commands.setContent(next, { emitUpdate: false })
    }
  }, [total, loading, syncOfferTotalFromLignes])

  /* Construit le HTML complet — reprend l’écran tel quel (pas de resync qui écrase les corrections). */
  const buildDevisFullHtml = () => {
    if (!patient || !dv) return ''
    const topHtml = editorTopRef.current?.getHTML() ?? ''
    const offerHtml = editorOfferRef.current?.getHTML() ?? ''
    const offer = offerHtml.trim().startsWith('<')
      ? offerHtml
      : (htmlToPlainText(offerHtml) || defaultOperationTitle)
    const offerTotalHtml = editorOfferTotalRef.current?.getHTML() ?? ''
    const offerTotalDisp = offerTotalHtml.trim().startsWith('<')
      ? offerTotalHtml
      : (htmlToPlainText(offerTotalHtml) || defaultOfferTotal)
    const botHtml = editorBotRef.current?.getHTML() ?? ''

    return buildGestionnaireDevisExportHtml({
      devis: dv,
      patient,
      topHtml,
      botHtml,
      operationTitle: offer,
      operationTotal: offerTotalDisp,
      subtitleHtml: editorOfferSubRef.current?.getHTML() ?? '',
      headDescHtml: editorOfferHeadDescRef.current?.getHTML() ?? '',
      headPriceHtml: editorOfferHeadPriceRef.current?.getHTML() ?? '',
      tndPerEur,
      preserveTopHtml: true,
      preserveBotHtml: true,
    })
  }

  /* Export PDF — même moteur Chromium que l’envoi chat (fichier identique) */
  const handlePrint = async () => {
    const topHtml  = editorTopRef.current?.getHTML() ?? ''
    const botHtml  = editorBotRef.current?.getHTML() ?? ''
    const offerTitle = readOfferTitle(editorOfferRef.current, defaultOperationTitle)

    if (!topHtml && !botHtml && !offerTitle) {
      window.alert("Le document est vide. Réinitialisez ou saisissez du contenu d'abord.")
      return
    }

    setExporting(true)
    try {
      // Persister avant export → patient / chat voient la même version
      await flushSave({ force: true })
      const html = await inlineHtmlImages(buildDevisFullHtml())
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
          <p className="text-[11px] text-slate-400 hidden sm:block">
            {formatDevisTitle(dv, patient.dossierNumber)}
            {dv?.version != null ? ` · Version ${dv.version}` : ''}
            {dv?.dateCreation ? ` · ${formatDate(dv.dateCreation)}` : ''}
            {' · '}
            Zone active : <strong>{
              activeZone === 'top'
                ? 'Corps du document'
                : activeZone === 'offerSub'
                  ? 'Titre du tableau'
                  : activeZone === 'offerHeadDesc'
                    ? 'En-tête Description'
                    : activeZone === 'offerHeadPrice'
                      ? 'En-tête Tarif'
                      : activeZone === 'offer'
                        ? 'Contenu du tableau'
                        : activeZone === 'offerTotal'
                          ? 'Total offre'
                          : 'Bas du document'
            }</strong>
          </p>
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

      {/* ══ Toolbar ══ */}
      <RichDocToolbar
        editor={
        activeZone === 'offerTotal'
          ? editorOfferTotal
          : activeZone === 'offer'
            ? editorOffer
            : activeZone === 'offerSub'
              ? editorOfferSub
              : activeZone === 'offerHeadDesc'
                ? editorOfferHeadDesc
                : activeZone === 'offerHeadPrice'
                  ? editorOfferHeadPrice
                  : activeZone === 'top'
                    ? editorTop
                    : editorBot
      }
        highlightColors={DEVIS_HIGHLIGHT_COLORS}
      />

      {/* ══ Document A4 — aperçu écran / mobile ══ */}
      <div className="editor-scroll flex-1 overflow-auto py-4 sm:py-8 px-2 sm:px-4">
        <div
          className="doc-shell bg-white shadow-2xl mx-auto"
          style={{
            width: 794,
            minWidth: 794,
            minHeight: 1123,
            padding: '36px 44px 40px',
            fontFamily: DEVIS_FONT_FAMILY,
            fontSize: 14,
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

          {/* ── Tableau offre (titre, en-têtes et contenu éditables) ── */}
          {lignes.length > 0 && (
            <div
              className={`avoid-break doc-offer-preview${
                activeZone === 'offer'
                || activeZone === 'offerTotal'
                || activeZone === 'offerSub'
                || activeZone === 'offerHeadDesc'
                || activeZone === 'offerHeadPrice'
                  ? ' is-editing'
                  : ''
              }`}
              style={{ flexShrink: 0 }}
            >
              <div className="offer-block">
                <div className="offer-subtitle doc-section-offer-sub">
                  <EditorContent editor={editorOfferSub} />
                </div>
                <table className="offer-table">
                  <thead>
                    <tr>
                      <th className="col-desc doc-section-offer-head">
                        <EditorContent editor={editorOfferHeadDesc} />
                      </th>
                      <th className="col-price doc-section-offer-head">
                        <EditorContent editor={editorOfferHeadPrice} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="desc-cell">
                        <div className="op-title doc-section-offer">
                          <EditorContent editor={editorOffer} />
                        </div>
                      </td>
                      <td className="price-cell">
                        <span className="price-amount doc-section-offer-total">
                          <EditorContent editor={editorOfferTotal} />
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Bas de document (modalités + validité) ── */}
          <div className="doc-section-bottom">
            <EditorContent editor={editorBot} />
          </div>

          <div className="avoid-break" style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{
                fontWeight: DEVIS_SIGNATURE_BLOCK_STYLE.fontWeight,
                fontSize: DEVIS_SIGNATURE_BLOCK_STYLE.nameFontSize,
                color: DEVIS_SIGNATURE_BLOCK_STYLE.color,
                margin: 0,
              }}
              >
                {DEVIS_SIGNATURE_BLOCK.name}
              </p>
              <p style={{
                fontWeight: DEVIS_SIGNATURE_BLOCK_STYLE.fontWeight,
                fontSize: DEVIS_SIGNATURE_BLOCK_STYLE.specialtyFontSize,
                color: DEVIS_SIGNATURE_BLOCK_STYLE.color,
                margin: '1px 0 0',
              }}
              >
                {DEVIS_SIGNATURE_BLOCK.specialty}
              </p>
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
