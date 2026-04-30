import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import {
  ArrowLeft, Printer, RotateCcw, CheckCircle2,
  Bold, Italic, Underline as UnderlineIcon,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Undo2, Redo2, Palette, RefreshCw,
} from 'lucide-react'
import { gestionnaireApi, type GestionnairePatientDetail } from '@/lib/api'

/* ─────────────────────────────────────────────────────────
   CONSTANTES
───────────────────────────────────────────────────────── */
const OG = '#c75000'
const CONTENT_BREAK = '|||EDITOR_BREAK|||'

const TOOLBAR_COLORS = [
  { label: 'Noir',    value: '#1a1a1a' },
  { label: 'Orange',  value: OG        },
  { label: 'Rouge',   value: '#c0392b' },
  { label: 'Bleu',    value: '#1d4ed8' },
  { label: 'Gris',    value: '#6b7280' },
]

/* ─────────────────────────────────────────────────────────
   CSS GLOBAL (éditeur + impression)
───────────────────────────────────────────────────────── */
const GLOBAL_CSS = `
.ProseMirror {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12.5px;
  line-height: 1.6;
  color: #1a1a1a;
  outline: none;
  min-height: 20px;
}
.ProseMirror p { margin: 1.5px 0; }
.ProseMirror ul,
.ProseMirror ol { padding-left: 20px; margin: 3px 0; }
.ProseMirror li { margin: 1px 0; }
.ProseMirror hr { border: none; border-top: 1px solid #d1d5db; margin: 10px 0; }
.ProseMirror strong { font-weight: 700; }
.ProseMirror em { font-style: italic; }
.ProseMirror u { text-decoration: underline; }
.ProseMirror mark { background: #fde68a; padding: 0 1px; }

/* Impression */
@media print {
  @page { size: A4 portrait; margin: 12mm 14mm; }
  .no-print { display: none !important; }
  html, body { background: white !important; height: auto !important; overflow: visible !important; }
  .editor-root { position: static !important; height: auto !important; overflow: visible !important; }
  .editor-scroll { overflow: visible !important; height: auto !important; padding: 0 !important; }
  .doc-shell {
    width: auto !important; max-width: none !important; min-height: auto !important;
    margin: 0 !important; padding: 0 !important; box-shadow: none !important;
  }
  .doc-table th, .doc-table td {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
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

/* ─────────────────────────────────────────────────────────
   GÉNÉRATION HTML PARTIE HAUTE
   (date → récap → diagnostic → détails → examens → offre de prix inclut/exclut)
───────────────────────────────────────────────────────── */
function buildTopHtml(p: GestionnairePatientDetail): string {
  const pay = (p.formulaires?.[0]?.payload ?? {}) as Record<string, unknown>
  const rap = p.rapports?.[0]
  const dv  = p.devis?.find(d => d.statut === 'brouillon')
            ?? p.devis?.find(d => ['envoye', 'accepte'].includes(d.statut))
            ?? null

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
  const nuitsClin  = rap?.nuitsClinique ?? 0
  const anesthType = rap?.anesthesieGenerale === true  ? 'Générale'
                   : rap?.anesthesieGenerale === false ? 'Locale / Sédation'
                   : '—'
  const dureeHosp  = nuitsClin > 0
    ? `1 nuit préopératoire et ${nuitsClin} nuit${nuitsClin > 1 ? 's' : ''} postopératoire${nuitsClin > 1 ? 's' : ''} en clinique`
    : '—'

  /* Durée totale séjour */
  const noteLines   = (dv?.notesSejour ?? '').split('\n')
  const convStr     = noteLines.find(l => l.startsWith('DELAIS_CONVALESCENCE:'))?.replace('DELAIS_CONVALESCENCE:', '').trim() ?? ''
  const convNights  = parseNights(convStr) ?? 0
  const totalNights = nuitsClin + convNights
  const dureeTotale = totalNights > 0 ? `${totalNights + 1} jours / ${totalNights} nuits` : '—'
  const convLabel   = convNights > 0
    ? `${convNights} nuit${convNights > 1 ? 's' : ''} de convalescence à l'hôtel`
    : (convStr || '—')

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

  /* Raccourcis HTML */
  const o = (t: string) => `<span style="color:${OG};font-weight:700">${t}</span>`
  const h = (t: string) => `<p style="margin-top:8px"><strong><u>${t}</u></strong></p>`
  const f = (label: string, val: string) => `<p>${o(label)} <span style="color:#1a1a1a">${val}</span></p>`

  const ref  = `Devis ${p.dossierNumber}/${new Date().getFullYear()}`
  const date = `Tunis le ${todayFr()}`

  return `
<p style="text-align:right">${date}</p>
<p></p>
<p>Bonjour,</p>
<p>Nous vous remercions de la confiance que vous nous avez accordée.</p>
<p>Suite à votre demande de devis, nous avons le plaisir de vous faire parvenir ci-dessous notre meilleure offre pour l'organisation de votre séjour médical en Tunisie.</p>
<p></p>
<p style="text-align:center"><strong style="color:${OG}">${ref}</strong></p>
<p></p>

${h('Récapitulatif de votre demande :')}
${f('Intervention souhaitée :', inter)}
${f('Nom Prénom :', nom)}
${f('Âge / Mensurations :', ageMens)}
${f('Traitement en cours :', trait)}
${f('Allergie :', allerg)}
${f('Antécédents médicaux :', antecMed)}
${f('Antécédents chirurgicaux :', antecCh)}
${f('Adresse :', adresse)}
${f('Tél. Mobile :', tel)}
<p></p>

${h('Diagnostic du chirurgien : Dr CHENNOUFI Mehdi')}
<p>${diagnostic.replace(/\n/g, '<br/>')}</p>
<p></p>
<p>${o('Durée TOTALE du séjour :')} <strong>${dureeTotale}</strong></p>

<hr/>

${h("Détails de l'intervention :")}
${f('Intervention proposée :', interRec)}
${f("Type d'anesthésie :", anesthType)}
${f("Durée d'Intervention :", '—')}
${f("Durée d'Hospitalisation :", dureeHosp)}
${f('Clinique retenue :', 'DIDON Clinic')}
${f("Durée d'arrêt de travail (depuis l'intervention) :", '15 jours en moyenne')}
${f('Chirurgien traitant :', 'Dr. CHENNOUFI Mehdi')}
<p></p>

${h('Détails de votre séjour de convalescence :')}
${f('Durée de séjour post hospitalisation en Tunisie :', convLabel)}
${f('Hôtel de séjour sélectionné :', '—')}
${f("Nombre d'adultes :", '1')}
${f('Nbr Bébés (0 – 2 ans) :', '0')}
${f('Nbr Enfants (2 – 12 ans) :', '0')}
${f('Type de chambre :', 'Single')}
${f('Arrangement :', "Pension Complète (la pension n'inclut pas les dépenses personnelles tel que téléphone, boissons, les soins de beauté, les excursions…)")}
<p></p>

${h("À titre de traitement préventif, prenez 2 semaines avant l'intervention :")}
<ul>
<li>Tardyferon 80mg : 2 comprimés par jour pour traitement préventif de l'Anémie</li>
<li>Arnica montana 9 CH à raison de 5 granulés (4 fois par jour)</li>
<li>Arrêt de l'Aspégic / Anti-inflammatoire / Aspirine 10 jours avant la chirurgie.</li>
</ul>
<p></p>

${h('Examens médicaux nécessaires avant votre arrivée en Tunisie : (Validité Maximum 3 mois)')}
${examHtml}
<p></p>

${h('Offre de prix :')}
<p>${o('Votre devis inclut :')}</p>
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

<p>${o('Notre forfait exclut :')}</p>
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
  const totalStr = fmtNum(total)
  const o = (t: string) => `<span style="color:${OG};font-weight:700">${t}</span>`

  return `
<p>La totalité des frais de votre séjour médical s'élève à <em>[montant en lettres]</em> Dinars Tunisiens (${totalStr} dt) soit à peu près (selon le cours de change du jour amené à évoluer) <em>[montant en euros]</em> euros.</p>
<p></p>
<p><strong>${o('Modalités de paiement :')}</strong></p>
<p>Elle devra être réglée en dinars tunisiens et en espèces et ce au moment de votre admission à la clinique en Tunisie.</p>
<p>Les cartes de crédit ne sont pas acceptées.</p>
<p></p>
<p><strong>${o("Validité de l'offre :")}</strong></p>
<p>La présente offre de prix sera valable pour une durée de trois (3) mois à compter de ce jour et seulement en période hors saison pour les hôtels (hors juillet/août et décembre).</p>
<p></p>
<p>Nous espérons que notre offre de prix vous agréera et nous tenons à votre entière disposition pour vous conseiller au mieux pour réussir votre séjour.</p>
`
}

/* ─────────────────────────────────────────────────────────
   BARRE D'OUTILS
───────────────────────────────────────────────────────── */
function ToolBtn({ active, onClick, title, children }: {
  active?: boolean; onClick: () => void; title: string; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      className={`h-8 w-8 flex items-center justify-center rounded-lg text-sm transition-colors ${
        active
          ? 'bg-slate-900 text-white'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  )
}
function ToolSep() {
  return <div className="w-px h-5 bg-slate-200 mx-1 shrink-0" />
}

function Toolbar({ editor }: { editor: Editor | null }) {
  const [colorOpen, setColorOpen] = useState(false)
  if (!editor) return null

  return (
    <div className="no-print relative flex items-center gap-0.5 px-3 py-2 bg-white border-b border-slate-200 flex-wrap">
      <ToolBtn title="Annuler"  onClick={() => editor.chain().focus().undo().run()}><Undo2  className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn title="Refaire"  onClick={() => editor.chain().focus().redo().run()}><Redo2  className="h-3.5 w-3.5" /></ToolBtn>
      <ToolSep />
      <ToolBtn active={editor.isActive('bold')}      title="Gras"      onClick={() => editor.chain().focus().toggleBold().run()}><Bold          className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn active={editor.isActive('italic')}    title="Italique"  onClick={() => editor.chain().focus().toggleItalic().run()}><Italic        className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn active={editor.isActive('underline')} title="Souligner" onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn active={editor.isActive('highlight')} title="Surligner" onClick={() => editor.chain().focus().toggleHighlight().run()}>
        <span className="text-xs font-bold" style={{ background: '#fde68a', padding: '0 2px', borderRadius: 2 }}>A</span>
      </ToolBtn>
      <ToolSep />
      <ToolBtn active={editor.isActive({ textAlign: 'left' })}   title="Aligner à gauche" onClick={() => editor.chain().focus().setTextAlign('left').run()}>  <AlignLeft  className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn active={editor.isActive({ textAlign: 'center' })} title="Centrer"          onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn active={editor.isActive({ textAlign: 'right' })}  title="Aligner à droite" onClick={() => editor.chain().focus().setTextAlign('right').run()}> <AlignRight  className="h-3.5 w-3.5" /></ToolBtn>
      <ToolSep />
      <ToolBtn active={editor.isActive('bulletList')}  title="Liste à puces"     onClick={() => editor.chain().focus().toggleBulletList().run()}>  <List        className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn active={editor.isActive('orderedList')} title="Liste numérotée"   onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></ToolBtn>
      <ToolSep />
      <div className="relative">
        <ToolBtn title="Couleur du texte" onClick={() => setColorOpen(v => !v)}>
          <Palette className="h-3.5 w-3.5" />
        </ToolBtn>
        {colorOpen && (
          <div
            className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl shadow-xl border border-slate-200 p-2 flex gap-1.5"
            onMouseLeave={() => setColorOpen(false)}
          >
            {TOOLBAR_COLORS.map(c => (
              <button
                key={c.value}
                title={c.label}
                onMouseDown={(e) => {
                  e.preventDefault()
                  editor.chain().focus().setColor(c.value).run()
                  setColorOpen(false)
                }}
                className="w-6 h-6 rounded-full border-2 border-white shadow ring-1 ring-slate-200 hover:scale-110 transition-transform"
                style={{ background: c.value }}
              />
            ))}
            <input
              type="color"
              className="w-6 h-6 rounded cursor-pointer border border-slate-200"
              title="Couleur personnalisée"
              onInput={(e) => editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()}
            />
          </div>
        )}
      </div>
    </div>
  )
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
          setInitialTopHtml(top ?? buildTopHtml(p))
          setInitialBottomHtml(bot ?? buildBottomHtml(total))
        } else {
          setInitialTopHtml(dv.customContent)
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
      Highlight.configure({ multicolor: false }),
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
      Highlight.configure({ multicolor: false }),
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
    editorTop?.commands.setContent(buildTopHtml(patient))
    editorBot?.commands.setContent(buildBottomHtml(total))
    setSaved(false)
  }

  /* Export PDF via popup dédié */
  const handlePrint = () => {
    const docNode = document.querySelector('.doc-shell') as HTMLElement | null
    if (!docNode) return

    const popup = window.open('', '_blank', 'width=1050,height=960')
    if (!popup) {
      window.alert("Autorisez les popups pour exporter en PDF.")
      return
    }

    const printStyles = `
      <style>
        /* margin:0mm supprime les en-têtes/pieds de page du navigateur (date, titre, URL) */
        @page { size: A4 portrait; margin: 0mm; }
        *, *::before, *::after { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: white; }
        body {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 12.5px;
          line-height: 1.6;
          color: #1a1a1a;
        }
        /* Le padding remplace les marges @page supprimées */
        .print-wrap { padding: 12mm 14mm; }
        .no-print { display: none !important; }

        p { margin: 1.5px 0; }
        ul, ol { padding-left: 20px; margin: 3px 0; }
        li { margin: 1px 0; }
        hr { border: none; border-top: 1px solid #d1d5db; margin: 10px 0; }
        strong { font-weight: 700; }
        em { font-style: italic; }
        u { text-decoration: underline; }
        mark { background: #fde68a; padding: 0 1px; }

        .doc-table { width: 100%; border-collapse: collapse; }
        .doc-table th, .doc-table td {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .avoid-break { break-inside: avoid; page-break-inside: avoid; }
      </style>
    `

    popup.document.open()
    popup.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title></title>
  <base href="${window.location.origin}/" />
  ${printStyles}
</head>
<body>
  <div class="print-wrap">${docNode.innerHTML}</div>
</body>
</html>`)
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
      setTimeout(() => { if (loaded < imgs.length) { popup.print(); popup.close() } }, 1500)
    }
    setTimeout(waitAndPrint, 150)
  }

  /* Calculs financiers */
  const dv = patient?.devis?.find(d => d.statut === 'brouillon')
    ?? patient?.devis?.find(d => ['envoye', 'accepte'].includes(d.statut))
    ?? null
  const rap = patient?.rapports?.[0]
  const lignes = dv?.lignes ?? []
  const total = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)

  const interventionLabel = (rap?.interventionsRecommandees ?? []).filter(Boolean).join(' + ')
  const noteLines = (dv?.notesSejour ?? '').split('\n')
  const convStr = noteLines.find(l => l.startsWith('DELAIS_CONVALESCENCE:'))?.replace('DELAIS_CONVALESCENCE:', '').trim() ?? ''
  const convNights = parseNights(convStr) ?? 0
  const nuitsClin = rap?.nuitsClinique ?? 0
  const totalNights = nuitsClin + convNights
  const sejourLine = totalNights > 0 ? `Séjour ${totalNights + 1} jours / ${totalNights} nuits` : ''

  const offerLines = lignes.filter(l => l.description?.trim()).map(l =>
    l.quantite > 1 ? `${l.description.trim()} ×${l.quantite}` : l.description.trim()
  )
  const offerPrimary = interventionLabel || offerLines[0] || 'Séjour médical personnalisé'
  const offerExtras = offerLines.slice(interventionLabel ? 0 : 1).join('<br/>')
  const offerDescription = [offerPrimary, offerExtras, sejourLine].filter(Boolean).join('<br/>')

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
            style={{ background: OG }}
          >
            <Printer className="h-3.5 w-3.5" /> Exporter PDF
          </button>
        </div>
      </div>

      {/* ══ Toolbar ══ */}
      <Toolbar editor={activeZone === 'top' ? editorTop : editorBot} />

      {/* ══ Document A4 ══ */}
      <div className="editor-scroll flex-1 overflow-auto py-8 px-4 flex justify-center bg-white">
        <div
          className="doc-shell bg-white shadow-2xl"
          style={{
            width: 794,
            minHeight: 1123,
            padding: '44px 52px 52px',
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: 12.5,
            lineHeight: 1.6,
            color: '#1a1a1a',
            boxSizing: 'border-box',
            height: 'auto',
            backgroundColor: '#ffffff',
          }}
        >
          {/* ── En-tête : logo + numéro dossier ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
            <div style={{ width: 64, height: 64, overflow: 'hidden', borderRadius: 4, border: '1px solid #e5e7eb', background: '#f8f8f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src="/acces-patient-logo1-crop.png"
                alt="Logo"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
              <p style={{ fontWeight: 700, color: OG, margin: 0 }}>{patient.dossierNumber}</p>
              <p style={{ margin: '2px 0 0' }}>Dr. CHENNOUFI Mehdi — Chirurgie Esthétique</p>
            </div>
          </div>

          {/* ── Zone éditable HAUTE ── */}
          <EditorContent editor={editorTop} />

          {/* ── Tableau "Notre meilleure offre" ── */}
          {lignes.length > 0 && (
            <div className="avoid-break" style={{ marginTop: 14 }}>
              <hr style={{ borderTop: '1px solid #d1d5db', margin: '10px 0 14px' }} />
              <p style={{ fontWeight: 700, textDecoration: 'underline', marginBottom: 10, fontSize: 13, color: '#1a1a1a' }}>
                Notre meilleure offre :
              </p>
              <table className="doc-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ border: '1.5px solid #374151', padding: '7px 10px', textAlign: 'left', fontWeight: 700, background: '#f9fafb', width: '72%' }}>
                      Description
                    </th>
                    <th style={{ border: '1.5px solid #374151', padding: '7px 10px', textAlign: 'center', fontWeight: 700, background: '#f9fafb' }}>
                      Tarif en <span style={{ color: OG }}>dt</span>
                      <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#6b7280' }}>(Ferme et définitif)</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ border: '1.5px solid #374151', padding: '10px 10px', verticalAlign: 'top' }}>
                      <p style={{ margin: 0, fontWeight: 400 }}>Montant de votre séjour médical</p>
                      <p style={{ margin: '3px 0 0', fontWeight: 700, color: OG, lineHeight: 1.55 }} dangerouslySetInnerHTML={{ __html: offerDescription }} />
                    </td>
                    <td style={{ border: '1.5px solid #374151', padding: '10px', textAlign: 'center', verticalAlign: 'middle', fontWeight: 700, fontSize: 22, letterSpacing: '0.01em' }}>
                      {fmtNum(total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* ── Zone éditable BASSE (total en lettres + modalités + validité + clôture) ── */}
          <div style={{ marginTop: 12 }}>
            <EditorContent editor={editorBot} />
          </div>

          {/* ── Signature Dr. ── */}
          <div style={{ marginTop: 32, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>Dr CHENNOUFI Mehdi</p>
              <p style={{ fontSize: 12, color: '#555', margin: '2px 0 0' }}>Chirurgie Esthétique</p>
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

          {/* ── Pied de page ── */}
          <div style={{ marginTop: 20, paddingTop: 8, borderTop: '1px solid #e5e7eb', textAlign: 'center', fontSize: 10, color: '#aaa' }}>
            Centre Est — Dr Mehdi CHENNOUFI — Chirurgie Plastique &amp; Esthétique — Tunis, Tunisie
          </div>

        </div>
      </div>
    </div>
  )
}
