import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import { ArrowLeft, Printer, RotateCcw, CheckCircle2, RefreshCw } from 'lucide-react'
import { RichDocToolbar } from '@/components/editor/RichDocToolbar'
import { gestionnaireApi, type GestionnairePatientDetail } from '@/lib/api'
import { parseSejourMeta } from '@/lib/devisSejourNotes'
import { formatDevisTitle, getDevisDisplayNumber } from '@/lib/utils'
import { buildDevisAmountSentence, replaceDevisAmountPlaceholders } from '@/lib/moneyWords'
import {
  DEVIS_HEADER_SUBTITLE,
  DEVIS_LOGO_SRC,
  DEVIS_SIGNATURE,
  buildDevisContactFooterHtml,
  buildDevisDocumentEndHtml,
  buildDevisHeaderLogoHtml,
} from '@/lib/devisBranding'
import {
  DEVIS_ACCENT,
  DEVIS_CHARTE,
  buildDevisPrintStyles,
  devisFieldRow,
  devisHighlightBox,
  devisLabel,
  devisSectionHeading,
  devisSeparator,
} from '@/lib/devisCharte'
// RichDocToolbar — barre d'outils partagée avec Planning séjour

const CONTENT_BREAK = '|||EDITOR_BREAK|||'

/* ─────────────────────────────────────────────────────────
   CSS GLOBAL (éditeur + impression)
───────────────────────────────────────────────────────── */
const GLOBAL_CSS = `
.ProseMirror {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12.5px;
  line-height: 1.6;
  color: ${DEVIS_CHARTE.charcoal};
  outline: none;
  min-height: 20px;
}
.ProseMirror p { margin: 1.5px 0; }
.ProseMirror ul,
.ProseMirror ol { padding-left: 20px; margin: 3px 0; }
.ProseMirror li { margin: 1px 0; }
.ProseMirror hr { border: none; border-top: 1px solid ${DEVIS_CHARTE.rose}; margin: 14px 0 12px; }
.ProseMirror strong { font-weight: 700; }
.ProseMirror em { font-style: italic; }
.ProseMirror u { text-decoration: underline; }
.ProseMirror mark { background: ${DEVIS_CHARTE.cream}; padding: 0 1px; }
.ProseMirror li { break-inside: avoid; page-break-inside: avoid; }
.doc-shell .tiptap { min-height: 0; }

.devis-contact-footer {
  padding: 14px 0 4px;
  border-top: 1px solid ${DEVIS_CHARTE.rose};
  background: transparent;
  text-align: center;
  font-size: 10.5px;
  line-height: 1.55;
}
.devis-contact-footer .contact-line {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 3px 0;
  color: ${DEVIS_CHARTE.charcoal};
  text-decoration: none;
}
.devis-contact-footer svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  stroke: ${DEVIS_ACCENT};
  fill: none;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.devis-logo-block { display: flex; flex-direction: column; align-items: center; max-width: 168px; }
.devis-logo-block .logo-img { width: 158px; height: auto; display: block; object-fit: contain; border-radius: 6px; }
.devis-logo-block .logo-slogan {
  margin: 9px 0 0; padding-top: 8px; width: 100%; text-align: center;
  font-size: 9px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase;
  color: ${DEVIS_ACCENT}; border-top: 1px solid ${DEVIS_CHARTE.rose}; line-height: 1.35;
}

/* Impression directe (Ctrl+P depuis le navigateur — non utilisée normalement) */
@media print {
  @page { size: A4 portrait; margin: 0mm; }
  .no-print { display: none !important; }
  html, body { background: white !important; height: auto !important; overflow: visible !important; }
  .editor-root { position: static !important; height: auto !important; overflow: visible !important; }
  .editor-scroll { overflow: visible !important; height: auto !important; padding: 0 !important; }
  .doc-shell {
    width: auto !important; max-width: none !important; min-height: 0 !important;
    margin: 0 !important; padding: 0 !important; box-shadow: none !important;
  }
  .doc-table th, .doc-table td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .avoid-break { break-inside: avoid; page-break-inside: avoid; }
}
`

/* ─────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────── */
function todayFr() {
  return new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
function computeAge(d: string) {
  try { return `${new Date().getFullYear() - new Date(d).getFullYear()} ans` } catch { return '' }
}
function arr(v: unknown): string[] { return Array.isArray(v) ? v.map(String).filter(Boolean) : [] }
function str(v: unknown): string { return typeof v === 'string' ? v.trim() : '' }
function fmtNum(n: number) { return n.toLocaleString('fr-TN', { minimumFractionDigits: 0 }) }
function parseNights(value: string): number | null {
  const m = value.match(/(\d+)\s*(nuit|nuits)/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/** Nuits saisies par le gestionnaire dans le devis (champ texte → entier > 0). */
function parseGestNights(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = Number.parseInt(t, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function pickDevis(p: GestionnairePatientDetail) {
  return (
    p.devis?.find((d) => d.statut === 'brouillon')
    ?? p.devis?.find((d) => ['envoye', 'accepte'].includes(d.statut))
    ?? null
  )
}

/** Textes séjour / clinique / hôtel pour le PDF (données devis + repli rapport / legacy). */
function sejourPdfFromPatient(p: GestionnairePatientDetail) {
  const rap = p.rapports?.[0]
  const dv = pickDevis(p)
  const sej = parseSejourMeta(dv?.notesSejour ?? '')
  const nGestClin = parseGestNights(sej.cliniqueNuits)
  const nGestHotel = parseGestNights(sej.hotelNuits)
  const nuitsClinRap = rap?.nuitsClinique ?? 0

  const noteLines = (dv?.notesSejour ?? '').split('\n')
  const convStr =
    noteLines.find((l) => l.startsWith('DELAIS_CONVALESCENCE:'))?.replace('DELAIS_CONVALESCENCE:', '').trim() ?? ''
  const convNightsLegacy = parseNights(convStr) ?? 0

  const nClinForHosp = nGestClin ?? (nuitsClinRap > 0 ? nuitsClinRap : null)
  const dureeHosp =
    nClinForHosp != null && nClinForHosp > 0
      ? `1 nuit préopératoire et ${nClinForHosp} nuit${nClinForHosp > 1 ? 's' : ''} postopératoire${nClinForHosp > 1 ? 's' : ''} en clinique`
      : '—'

  const cliniqueRetenue = sej.cliniqueNom.trim() || '—'

  const postHospLabel =
    nGestHotel != null
      ? `${nGestHotel} nuit${nGestHotel > 1 ? 's' : ''} à l'hôtel en Tunisie`
      : convNightsLegacy > 0
        ? `${convNightsLegacy} nuit${convNightsLegacy > 1 ? 's' : ''} de convalescence à l'hôtel`
        : (convStr || '—')

  const hotelSejour = sej.hotelNom.trim() || '—'

  const nClinTot = nGestClin ?? nuitsClinRap
  const nHotelTot = nGestHotel != null ? nGestHotel : convNightsLegacy
  const totalNights = nClinTot + nHotelTot
  const dureeTotale = totalNights > 0 ? `${totalNights + 1} jours / ${totalNights} nuits` : '—'
  const jours = totalNights + 1
  const sejourLine =
    totalNights > 0
      ? `Séjour ${totalNights} nuit${totalNights > 1 ? 's' : ''} / ${jours} jour${jours > 1 ? 's' : ''}`
      : ''

  return { dureeHosp, cliniqueRetenue, postHospLabel, hotelSejour, dureeTotale, sejourLine }
}

const SEJOUR_CONV_START = '<!-- DEVIS_SEJOUR_CONV -->'
const SEJOUR_CONV_END = '<!-- /DEVIS_SEJOUR_CONV -->'

type SejourPdfValues = ReturnType<typeof sejourPdfFromPatient>

function buildSejourConvalescenceHtml(sv: SejourPdfValues): string {
  return `${SEJOUR_CONV_START}
${devisSectionHeading('Détails de votre séjour de convalescence :')}
${devisFieldRow('Durée de séjour post hospitalisation en Tunisie :', sv.postHospLabel)}
${devisFieldRow('Hôtel de séjour sélectionné :', sv.hotelSejour)}
${devisFieldRow("Nombre d'adultes :", '1')}
${devisFieldRow('Nbr Enfants (2 – 12 ans) :', '0')}
${devisFieldRow('Type de chambre :', 'Single')}
${devisFieldRow('Arrangement :', "Pension Complète (la pension n'inclut pas les dépenses personnelles tel que téléphone, boissons, les soins de beauté, les excursions…)")}
${SEJOUR_CONV_END}`
}

/** Met à jour hôtel / nuits depuis le devis (même si le HTML a été sauvegardé avant). */
function refreshConvalescenceInTopHtml(html: string, p: GestionnairePatientDetail): string {
  const sv = sejourPdfFromPatient(p)
  const fresh = buildSejourConvalescenceHtml(sv)
  const blockRe = new RegExp(`${SEJOUR_CONV_START}[\\s\\S]*?${SEJOUR_CONV_END}`)
  let out = blockRe.test(html) ? html.replace(blockRe, fresh) : html
  out = out.replace(/<p>[^<]*Nbr Bébés[^<]*<\/p>\s*/gi, '')
  if (!blockRe.test(html) && sv.hotelSejour !== '—') {
    out = out.replace(
      /(Hôtel de séjour sélectionné\s*:\s*<\/span>\s*<span[^>]*>)([^<]*)(<\/span>)/i,
      `$1${sv.hotelSejour}$3`,
    )
  }
  return out
}

/**
 * Rafraîchit la valeur d'un champ « Label : valeur » dans le HTML sauvegardé,
 * indépendamment des balises (robuste à la normalisation TipTap).
 * Recherche le <p> dont le texte commence par `label` et reconstruit la ligne.
 */
function refreshDevisFieldByLabel(html: string, label: string, value: string): string {
  if (typeof window === 'undefined' || !value || value === '—') return html
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__root')
  if (!root) return html
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
  const target = normalize(label)
  let changed = false
  for (const p of Array.from(root.querySelectorAll('p'))) {
    if (normalize(p.textContent ?? '').startsWith(target)) {
      const tmp = doc.createElement('div')
      tmp.innerHTML = devisFieldRow(label, value)
      const fresh = tmp.firstElementChild
      if (fresh) {
        p.replaceWith(fresh)
        changed = true
      }
      break
    }
  }
  return changed ? root.innerHTML : html
}

/** Synchronise clinique + hôtel (et conv.) depuis le devis actuel. */
function refreshDossierFieldsInTopHtml(html: string, p: GestionnairePatientDetail): string {
  const sv = sejourPdfFromPatient(p)
  let out = refreshConvalescenceInTopHtml(html, p)
  out = refreshDevisFieldByLabel(out, 'Clinique retenue :', sv.cliniqueRetenue)
  out = refreshDevisFieldByLabel(out, 'Hôtel de séjour sélectionné :', sv.hotelSejour)
  return out
}

/* ─────────────────────────────────────────────────────────
   GÉNÉRATION HTML PARTIE HAUTE
   (date → récap → diagnostic → détails → examens → offre de prix inclut/exclut)
───────────────────────────────────────────────────────── */
function buildTopHtml(p: GestionnairePatientDetail): string {
  const pay = (p.formulaires?.[0]?.payload ?? {}) as Record<string, unknown>
  const rap = p.rapports?.[0]
  const sv = sejourPdfFromPatient(p)

  /* Infos patient */
  const inter    = arr(pay.typeIntervention).join(', ') || '—'
  const nom      = p.user.fullName
  const age      = str(pay.dateNaissance) ? computeAge(str(pay.dateNaissance)) : ''
  const mensStr  = [
    str(pay.poids) ? `${str(pay.poids)} kg` : '',
    str(pay.taille) ? `${str(pay.taille)} cm` : '',
  ].filter(Boolean).join(' ')
  const ageMens  = [age, mensStr].filter(Boolean).join(' — ') || '—'
  const trait    = pay.traitementEnCours === true ? (str(pay.traitementDetails) || 'Oui') : 'Aucun'
  const allerg   = arr(pay.allergies).join(', ') || 'Aucune'
  const antecMed = [...arr(pay.antecedentsMedicaux), str(pay.autresMaladiesChroniques)].filter(Boolean).join(', ') || 'Aucun'
  const antecCh  = pay.chirurgiesAnterieures === true ? (str(pay.chirurgiesDetails) || 'Oui') : 'Aucun'
  const adresse  = [p.ville, p.pays].filter(Boolean).join(' — ') || '—'
  const tel      = p.phone || '—'

  /* Rapport / intervention */
  const diagnostic = rap?.diagnostic?.trim() || '—'
  const interRec   = (rap?.interventionsRecommandees ?? []).join(', ') || '—'
  const anesthType = rap?.anesthesieGenerale === true ? 'Générale' : 'Locale / Sédation'

  /* Examens — bilan sanguin complet avec paragraphe standard */
  const examens       = rap?.examensDemandes ?? []
  const hasBilan      = examens.some(e => e.toLowerCase().includes('bilan sanguin'))
  const otherExamens  = examens.filter(e => !e.toLowerCase().includes('bilan sanguin'))

  let examHtml = `<p><em>Les examens doivent avoir une validité maximum de 3 mois — À envoyer à J-10 de la date d'intervention</em></p>`
  if (hasBilan) {
    examHtml += `<p>Un bilan sanguin préopératoire complet doit être effectué, avant la date d'intervention, afin de s'assurer de la faisabilité de l'intervention qui comprend :</p>`
    examHtml += `<ul>
<li>Bilan biologique (groupe sanguin, NFS, plaquettes, TP, TCA, CRP)</li>
<li>Bilan virologique HIV, Hépatite B et C.</li>
<li>URÉE CRÉÂT GLYCÉMIE. IONO ASAT ALAT</li>
</ul>`
  }
  if (otherExamens.length > 0) {
    examHtml += `<ul>${otherExamens.map(e => `<li>${e}</li>`).join('')}</ul>`
  }
  if (!hasBilan && otherExamens.length === 0) {
    examHtml += `<ul><li>À compléter par le médecin</li></ul>`
  }
  examHtml += `<p>Prévoir une copie papier des rapports médicaux pour la constitution de votre dossier médical à l'entrée de la clinique.</p>`

  const activeDevis =
    p.devis?.find((d) => d.statut === 'brouillon') ??
    p.devis?.find((d) => ['envoye', 'accepte'].includes(d.statut)) ??
    p.devis?.[0] ??
    null
  const ref  = formatDevisTitle(activeDevis, p.dossierNumber)
  const date = `Tunis le ${todayFr()}`

  return `
<p style="text-align:right">${date}</p>
<p></p>
<p>Bonjour,</p>
<p>Nous vous remercions de la confiance que vous nous avez accordée.</p>
<p>Suite à votre demande de devis, nous avons le plaisir de vous faire parvenir ci-dessous notre meilleure offre pour l'organisation de votre séjour médical en Tunisie.</p>
<p></p>
<p style="text-align:center"><strong style="color:${DEVIS_ACCENT}">${ref}</strong></p>
<p></p>

${devisSectionHeading('Récapitulatif de votre demande :')}
${devisFieldRow('Intervention souhaitée :', inter)}
${devisFieldRow('Nom Prénom :', nom)}
${devisFieldRow('Âge / Mensurations :', ageMens)}
${devisFieldRow('Traitement en cours :', trait)}
${devisFieldRow('Allergie :', allerg)}
${devisFieldRow('Antécédents médicaux :', antecMed)}
${devisFieldRow('Antécédents chirurgicaux :', antecCh)}
${devisFieldRow('Adresse :', adresse)}
${devisFieldRow('Tél. Mobile :', tel)}
<p></p>

${devisSectionHeading('Diagnostic du chirurgien : Dr CHENNOUFI Mehdi')}
<p>${diagnostic.replace(/\n/g, '<br/>')}</p>
<p></p>
${devisHighlightBox('Durée TOTALE du séjour :', sv.dureeTotale)}

${devisSeparator()}

${devisSectionHeading("Détails de l'intervention :")}
${devisFieldRow('Intervention proposée :', interRec)}
${devisFieldRow("Type d'anesthésie :", anesthType)}
${devisFieldRow("Durée d'Intervention :", '—')}
${devisFieldRow("Durée d'Hospitalisation :", sv.dureeHosp)}
${devisFieldRow('Clinique retenue :', sv.cliniqueRetenue)}
${devisFieldRow("Durée d'arrêt de travail (depuis l'intervention) :", '15 jours en moyenne')}
${devisFieldRow('Chirurgien traitant :', 'Dr. CHENNOUFI Mehdi')}
<p></p>

${buildSejourConvalescenceHtml(sv)}
<p></p>

${devisSectionHeading("À titre de traitement préventif, prenez 2 semaines avant l'intervention :")}
<ul>
<li>Tardyferon 80mg : 2 comprimés par jour pour traitement préventif de l'Anémie</li>
<li>Arnica montana 9 CH à raison de 5 granulés (4 fois par jour)</li>
<li>Arrêt de l'Aspégic / Anti-inflammatoire / Aspirine 10 jours avant la chirurgie.</li>
</ul>
<p></p>

${devisSectionHeading('Examens médicaux nécessaires avant votre arrivée en Tunisie : (Validité Maximum 3 mois)')}
${examHtml}
<p></p>

${devisSectionHeading('Offre de prix :')}
<p>${devisLabel('Votre devis inclut :')}</p>
<ul>
<li>Assistance depuis votre arrivée à l'aéroport de Tunis-Carthage et jusqu'à votre départ,</li>
<li>Transferts multiples aéroport/hôtel et hôtel/clinique,</li>
<li>Consultation préopératoire à Tunis,</li>
<li>Honoraires du chirurgien et de l'anesthésiste,</li>
<li>Frais de la clinique et séjour (bloc opératoire, consommables, pharmacie, médication…),</li>
<li>Les produits pharmaceutiques pour votre traitement postopératoire,</li>
<li>Convalescence dans un hôtel,</li>
<li>2 Séances de drainage lymphatique : massages par un kinésithérapeute,</li>
<li>Consultation post opératoire en Tunisie avant votre départ,</li>
<li>Suivi post-opératoire gratuit avec votre chirurgien ou son équipe pendant 6 mois.</li>
</ul>
<p></p>

<p>${devisLabel('Notre forfait exclut :')}</p>
<ul>
<li>Les vols aller-retour,</li>
<li>Les dépenses personnelles (extras à l'hôtel ou à la clinique tels que les boissons, téléphone, etc…),</li>
<li>Les poches de sang en cas de besoin de transfusion,</li>
<li>Le prolongement de votre séjour initial en cas de nécessité,</li>
<li>Les bilans sanguins préopératoires.</li>
</ul>
`
}

/* ─────────────────────────────────────────────────────────
   GÉNÉRATION HTML PARTIE BASSE
   (total en lettres → modalités → validité → clôture)
───────────────────────────────────────────────────────── */
function buildBottomHtml(total: number): string {
  const amountLine = buildDevisAmountSentence(total)

  return `
<p>${amountLine}</p>
<p></p>
<p><strong>${devisLabel('Modalités de paiement :')}</strong></p>
<p>Elle devra être réglée en dinars tunisiens et en espèces et ce au moment de votre admission à la clinique en Tunisie.</p>
<p>Les cartes de crédit ne sont pas acceptées.</p>
<p></p>
<p><strong>${devisLabel("Validité de l'offre :")}</strong></p>
<p>La présente offre de prix sera valable pour une durée de trois (3) mois à compter de ce jour et seulement en période hors saison pour les hôtels (hors juillet/août et décembre).</p>
<p></p>
<p>Nous espérons que notre offre de prix vous agréera et nous tenons à votre entière disposition pour vous conseiller au mieux pour réussir votre séjour.</p>
`
}

/* ─────────────────────────────────────────────────────────
   PAGE PRINCIPALE
───────────────────────────────────────────────────────── */
export default function DevisEditorPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()

  const [patient, setPatient]           = useState<GestionnairePatientDetail | null>(null)
  const [devisId, setDevisId]           = useState<string | null>(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [initialTopHtml, setInitialTopHtml] = useState<string>('')
  const [initialBottomHtml, setInitialBottomHtml] = useState<string>('')
  const [activeZone, setActiveZone] = useState<'top' | 'bottom'>('top')

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
      const { patient: p } = await gestionnaireApi.getPatient(patientId)
      setPatient(p)
      const dv = p.devis?.find(d => d.statut === 'brouillon')
               ?? p.devis?.find(d => ['envoye', 'accepte'].includes(d.statut))
               ?? null
      const id = dv?.id ?? null
      setDevisId(id)
      devisIdRef.current = id

      const lignes = dv?.lignes ?? []
      const total = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)
      if (dv?.customContent?.trim()) {
        if (dv.customContent.includes(CONTENT_BREAK)) {
          const [top, bot] = dv.customContent.split(CONTENT_BREAK)
          const topRaw = refreshDossierFieldsInTopHtml(top ?? buildTopHtml(p), p)
          setInitialTopHtml(topRaw)
          const bottomRaw = bot ?? buildBottomHtml(total)
          setInitialBottomHtml(replaceDevisAmountPlaceholders(bottomRaw, total))
        } else {
          setInitialTopHtml(refreshDossierFieldsInTopHtml(dv.customContent, p))
          setInitialBottomHtml(buildBottomHtml(total))
        }
      } else {
        setInitialTopHtml(buildTopHtml(p))
        setInitialBottomHtml(buildBottomHtml(total))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => { void load() }, [load])

  /* Auto-save (debounce 1.8s) */
  const triggerSave = useCallback(() => {
    setSaved(false)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const id = devisIdRef.current
      if (!id) return
      const topHtml = editorTopRef.current?.getHTML() ?? ''
      const botHtml = editorBotRef.current?.getHTML() ?? ''
      setSaving(true)
      try {
        await gestionnaireApi.saveDevisCustomContent(id, topHtml + CONTENT_BREAK + botHtml)
        setSaved(true)
      } catch { /* silencieux */ }
      finally { setSaving(false) }
    }, 1800)
  }, [])

  const editorTop = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, horizontalRule: {} }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: initialTopHtml,
    onFocus: () => setActiveZone('top'),
    onUpdate: triggerSave,
  })
  const editorBot = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: initialBottomHtml,
    onFocus: () => setActiveZone('bottom'),
    onUpdate: triggerSave,
  })
  editorTopRef.current = editorTop
  editorBotRef.current = editorBot

  /* Initialiser le contenu quand disponible */
  useEffect(() => {
    if (editorTop && initialTopHtml && !editorTop.getText().trim()) {
      editorTop.commands.setContent(initialTopHtml)
    }
  }, [editorTop, initialTopHtml])
  useEffect(() => {
    if (editorBot && initialBottomHtml && !editorBot.getText().trim()) {
      editorBot.commands.setContent(initialBottomHtml)
    }
  }, [editorBot, initialBottomHtml])

  /* Sauvegarde manuelle */
  const handleManualSave = async () => {
    const id = devisIdRef.current
    if (!id) return
    const topHtml = editorTopRef.current?.getHTML() ?? ''
    const botHtml = editorBotRef.current?.getHTML() ?? ''
    setSaving(true)
    try {
      await gestionnaireApi.saveDevisCustomContent(id, topHtml + CONTENT_BREAK + botHtml)
      setSaved(true)
    } catch { /* silencieux */ }
    finally { setSaving(false) }
  }

  /* Réinitialiser */
  const handleReset = () => {
    if (!patient) return
    if (!window.confirm('Réinitialiser le document avec les données actuelles du dossier ?')) return
    const dv = patient.devis?.find(d => d.statut === 'brouillon')
      ?? patient.devis?.find(d => ['envoye', 'accepte'].includes(d.statut))
      ?? null
    const total = (dv?.lignes ?? []).reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)
    editorTop?.commands.setContent(refreshConvalescenceInTopHtml(buildTopHtml(patient), patient))
    editorBot?.commands.setContent(buildBottomHtml(total))
    setSaved(false)
  }

  /* Calculs financiers (utilisés par l’aperçu et l’export PDF) */
  const dv = patient?.devis?.find((d) => d.statut === 'brouillon')
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

  /* Export PDF — HTML construit depuis le contenu TipTap (pas depuis le DOM React) */
  const handlePrint = () => {
    const topHtml  = editorTopRef.current?.getHTML() ?? ''
    const botHtml  = editorBotRef.current?.getHTML() ?? ''

    if (!topHtml && !botHtml) {
      window.alert("Le document est vide. Réinitialisez ou saisissez du contenu d'abord.")
      return
    }

    const popup = window.open('', '_blank', 'width=1050,height=960')
    if (!popup) { window.alert("Autorisez les popups pour exporter en PDF."); return }

    const logoUrl = `${window.location.origin}${DEVIS_LOGO_SRC}`
    const sigUrl  = `${window.location.origin}/signature.jpg`

    /* Tableau « Notre meilleure offre » */
    const tableHtml = lignes.length > 0 ? `
<div class="offer-block">
  <hr class="section-hr"/>
  <p class="section-title">Notre meilleure offre :</p>
  <table class="offer-table">
    <thead>
      <tr>
        <th class="col-desc">Description</th>
        <th class="col-price">Tarif en <span style="color:${DEVIS_ACCENT}">dt</span><br/><span class="price-sub">(Ferme et définitif)</span></th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="desc-cell">
          <div class="op-title">${operationTitle}</div>
          ${sejourLine ? `<div class="sejour-badge">${sejourLine}</div>` : ''}
        </td>
        <td class="price-cell">${fmtNum(total)}</td>
      </tr>
    </tbody>
  </table>
</div>` : ''

    const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <title>Devis ${devisHeaderRef}</title>
  <style>${buildDevisPrintStyles()}</style>
</head>
<body>
  <table class="page-table">

    <!-- ══ HEADER : se répète automatiquement sur chaque page ══ -->
    <thead>
      <tr><td>
        <div class="doc-header">
          ${buildDevisHeaderLogoHtml(logoUrl)}
          <div class="header-right">
            <div class="header-ref">${devisHeaderRef}</div>
            <div class="header-sub">${DEVIS_HEADER_SUBTITLE}</div>
          </div>
        </div>
      </td></tr>
    </thead>

    <!-- ══ FOOTER VIDE : espace réservé en bas de chaque page ══ -->
    <tfoot>
      <tr><td></td></tr>
    </tfoot>

    <!-- ══ CONTENU ══ -->
    <tbody>
      <tr><td>
        <div class="doc-body">${topHtml}</div>
        ${tableHtml}
        <div class="doc-body" style="margin-top:10px; break-before:avoid; page-break-before:avoid;">${botHtml}</div>
        ${buildDevisDocumentEndHtml(sigUrl)}
      </td></tr>
    </tbody>

  </table>
</body>
</html>`

    popup.document.open()
    popup.document.write(html)
    popup.document.close()
    popup.focus()

    const waitAndPrint = () => {
      const imgs = Array.from(popup.document.images)
      if (imgs.length === 0) { popup.print(); popup.close(); return }
      let loaded = 0
      const done = () => { if (++loaded >= imgs.length) { popup.print(); popup.close() } }
      imgs.forEach(img => {
        if (img.complete) done()
        else {
          img.addEventListener('load',  done, { once: true })
          img.addEventListener('error', done, { once: true })
        }
      })
      setTimeout(() => { if (loaded < imgs.length) { popup.print(); popup.close() } }, 2000)
    }
    setTimeout(waitAndPrint, 200)
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

  const draftForLetter = pickDevis(patient)
  const showStaleLetterHint = Boolean(draftForLetter?.customContent?.trim())

  return (
    <div className="editor-root fixed inset-0 bg-white z-50 flex flex-col">

      {/* ══ Barre de navigation ══ */}
      <div className="no-print shrink-0 bg-white border-b border-slate-200 shadow-sm flex items-center gap-3 px-4 py-2.5">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">
            Personnalisation du devis — {patient.user.fullName}
          </p>
          <p className="text-[11px] text-slate-400">Zone active : <strong>{activeZone === 'top' ? 'Corps du document' : 'Bas du document'}</strong></p>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-medium shrink-0">
          {saving
            ? <><RefreshCw className="h-3 w-3 animate-spin text-slate-400" /><span className="text-slate-400">Sauvegarde…</span></>
            : saved
              ? <><CheckCircle2 className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600">Sauvegardé</span></>
              : <span className="text-slate-300">Non sauvegardé</span>}
        </div>

        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser
          </button>
          <button
            onClick={handleManualSave}
            disabled={saving || !devisId}
            className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg disabled:opacity-50 transition-colors"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Sauvegarder
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 h-8 px-4 text-xs font-semibold text-white rounded-lg transition-colors"
            style={{ background: DEVIS_ACCENT }}
          >
            <Printer className="h-3.5 w-3.5" /> Exporter PDF
          </button>
        </div>
      </div>

      {showStaleLetterHint && (
        <div className="no-print shrink-0 mx-4 sm:mx-6 mb-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-900 leading-snug">
          <strong className="font-semibold">Contenu personnalisable.</strong>{' '}
          La <strong>clinique</strong> et l'<strong>hôtel</strong> se synchronisent automatiquement depuis le devis à chaque
          ouverture. Le reste du texte vient de votre dernière sauvegarde ici. Pour tout régénérer à partir du dossier actuel,
          cliquez <strong>Réinitialiser</strong> puis Sauvegarder.
        </div>
      )}

      {/* ══ Toolbar ══ */}
      <RichDocToolbar editor={activeZone === 'top' ? editorTop : editorBot} />

      {/* ══ Document A4 ══ */}
      <div className="editor-scroll flex-1 overflow-auto py-8 px-4 flex justify-center bg-white">
        <div
          className="doc-shell bg-white shadow-2xl"
          style={{
            width: 794,
            maxWidth: '100%',
            padding: '40px 48px 40px',
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: 12.5,
            lineHeight: 1.6,
            color: DEVIS_CHARTE.charcoal,
            boxSizing: 'border-box',
            backgroundColor: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* ── En-tête : logo + numéro dossier ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
            <div
              dangerouslySetInnerHTML={{
                __html: buildDevisHeaderLogoHtml(DEVIS_LOGO_SRC),
              }}
            />
            <div style={{ textAlign: 'right', fontSize: 11, color: DEVIS_CHARTE.gray, lineHeight: 1.5 }}>
              <p style={{ fontWeight: 700, color: DEVIS_ACCENT, margin: 0 }}>{devisHeaderRef}</p>
              <p style={{ margin: '2px 0 0', color: DEVIS_CHARTE.gray }}>{DEVIS_HEADER_SUBTITLE}</p>
            </div>
          </div>

          {/* ── Zone éditable HAUTE ── */}
          <div className="doc-section-top" style={{ flexShrink: 0 }}>
            <EditorContent editor={editorTop} />
          </div>

          {/* ── Tableau "Notre meilleure offre" ── */}
          {lignes.length > 0 && (
            <div className="avoid-break" style={{ flexShrink: 0 }}>
              <div style={{ height: 1, background: '#e5e7eb', margin: '0 0 12px' }} aria-hidden />
              <p style={{ fontWeight: 700, textDecoration: 'underline', marginBottom: 10, fontSize: 13, color: DEVIS_CHARTE.teal }}>
                Notre meilleure offre :
              </p>
              <table className="doc-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ border: `1.5px solid ${DEVIS_CHARTE.charcoal}`, padding: '7px 10px', textAlign: 'left', fontWeight: 700, background: DEVIS_CHARTE.cream, color: DEVIS_CHARTE.teal, width: '72%' }}>
                      Description
                    </th>
                    <th style={{ border: `1.5px solid ${DEVIS_CHARTE.charcoal}`, padding: '7px 10px', textAlign: 'center', fontWeight: 700, background: DEVIS_CHARTE.cream, color: DEVIS_CHARTE.teal }}>
                      Tarif en <span style={{ color: DEVIS_ACCENT }}>dt</span>
                      <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: DEVIS_CHARTE.gray }}>(Ferme et définitif)</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ border: `1.5px solid ${DEVIS_CHARTE.charcoal}`, padding: '10px 10px', verticalAlign: 'top' }}>
                      <p
                        style={{
                          margin: 0,
                          fontWeight: 700,
                          color: DEVIS_ACCENT,
                          lineHeight: 1.5,
                          background: DEVIS_CHARTE.cream,
                          padding: '8px 10px',
                          borderRadius: 4,
                          borderLeft: `3px solid ${DEVIS_CHARTE.teal}`,
                        }}
                      >
                        {operationTitle}
                      </p>
                      {sejourLine ? (
                        <p
                          style={{
                            margin: '8px 0 0',
                            fontWeight: 600,
                            fontSize: 12,
                          color: DEVIS_ACCENT,
                          background: DEVIS_CHARTE.rose,
                            padding: '6px 10px',
                            borderRadius: 4,
                            display: 'inline-block',
                            lineHeight: 1.45,
                          }}
                        >
                          {sejourLine}
                        </p>
                      ) : null}
                    </td>
                    <td style={{ border: `1.5px solid ${DEVIS_CHARTE.charcoal}`, padding: '10px', textAlign: 'center', verticalAlign: 'middle', fontWeight: 700, fontSize: 22, letterSpacing: '0.01em', color: DEVIS_CHARTE.charcoal }}>
                      {fmtNum(total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* ── Bas de document (suite + signature) ── */}
          <div className="doc-section-bottom">
            <EditorContent editor={editorBot} />
          </div>

          <div className="avoid-break" style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>{DEVIS_SIGNATURE.cabinet}</p>
              <p style={{ fontSize: 12, color: '#555', margin: '2px 0 0' }}>{DEVIS_SIGNATURE.specialty}</p>
              <img
                src="/signature.jpg"
                alt="Signature"
                style={{ marginTop: 6, width: 100, height: 50, objectFit: 'contain', display: 'block', marginLeft: 'auto' }}
                onError={(e) => {
                  const img = e.currentTarget as HTMLImageElement
                  if (!img.src.includes('/assets/')) { img.src = '/assets/signature.jpg'; return }
                  img.style.display = 'none'
                }}
              />
              <div style={{ marginTop: 6, width: 150, height: 1, borderBottom: '1px solid #d1d5db', marginLeft: 'auto' }} />
            </div>
          </div>

          <div
            className="no-print-devis-footer"
            dangerouslySetInnerHTML={{ __html: buildDevisContactFooterHtml() }}
            style={{ marginTop: 20 }}
          />

        </div>
      </div>
    </div>
  )
}
