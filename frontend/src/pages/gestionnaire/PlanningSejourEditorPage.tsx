import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import {
  ArrowLeft, Printer, RotateCcw, CheckCircle2, RefreshCw,
} from 'lucide-react'
import { gestionnaireApi, type GestionnairePatientDetail } from '@/lib/api'
import { DEVIS_ACCENT } from '@/lib/devisCharte'
import { ensurePlanningDocShell, PLANNING_HIGHLIGHT_COLORS } from '@/lib/planningSejourBranding'
import { buildPlanningSejourPrintPage, buildPlanningSejourPrintStyles } from '@/lib/planningSejourPrint'
import { DEFAULT_TND_PER_EUR } from '@/lib/moneyWords'
import {
  buildPlanningSejourHtml,
  moisLabelFromDate,
  type PlanningLogistiqueHint,
} from '@/lib/planningSejourTemplate'
import { RichDocToolbar } from '@/components/editor/RichDocToolbar'

const GLOBAL_CSS = buildPlanningSejourPrintStyles()

export default function PlanningSejourEditorPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()

  const [patient, setPatient] = useState<GestionnairePatientDetail | null>(null)
  const [logistique, setLogistique] = useState<PlanningLogistiqueHint | null>(null)
  const [moisLabel, setMoisLabel] = useState('')
  const [statut, setStatut] = useState<'brouillon' | 'finalise'>('brouillon')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [initialHtml, setInitialHtml] = useState('')

  const patientIdRef = useRef<string | null>(null)
  const moisLabelRef = useRef('')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const editorRef = useRef<Editor | null>(null)

  useEffect(() => {
    const s = document.createElement('style')
    s.id = 'planning-editor-css'
    s.innerHTML = GLOBAL_CSS
    document.head.appendChild(s)
    return () => document.getElementById('planning-editor-css')?.remove()
  }, [])

  const load = useCallback(async () => {
    if (!patientId) return
    setLoading(true)
    setError(null)
    try {
      const [{ patient: p }, detail] = await Promise.all([
        gestionnaireApi.getPatient(patientId),
        gestionnaireApi.getPlanningSejourDetail(patientId),
      ])
      setPatient(p)
      patientIdRef.current = patientId
      const log = detail.logistique
      setLogistique(log)
      const ml = detail.planning?.moisLabel ?? detail.moisLabelDefault
      setMoisLabel(ml)
      moisLabelRef.current = ml
      setStatut(detail.planning?.statut === 'finalise' ? 'finalise' : 'brouillon')

      let tndPerEur = DEFAULT_TND_PER_EUR
      try {
        const taux = await gestionnaireApi.getTauxEur()
        if (taux.tndPerEur > 0) tndPerEur = taux.tndPerEur
      } catch {
        /* taux par défaut */
      }

      if (detail.planning?.content?.trim()) {
        setInitialHtml(ensurePlanningDocShell(detail.planning.content))
      } else {
        setInitialHtml(buildPlanningSejourHtml(p, log, { tndPerEur }))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => { void load() }, [load])

  const persist = useCallback(async (nextStatut?: 'brouillon' | 'finalise') => {
    const id = patientIdRef.current
    if (!id) return
    const html = editorRef.current?.getHTML() ?? ''
    setSaving(true)
    try {
      await gestionnaireApi.updatePlanningSejour(id, {
        content: html,
        moisLabel: moisLabelRef.current || null,
        statut: nextStatut,
      })
      if (nextStatut) setStatut(nextStatut)
      setSaved(true)
    } catch {
      /* silencieux en auto-save */
    } finally {
      setSaving(false)
    }
  }, [])

  const triggerSave = useCallback(() => {
    setSaved(false)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => void persist(), 1800)
  }, [persist])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, horizontalRule: {} }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Image.configure({ inline: true, allowBase64: false }),
    ],
    content: initialHtml,
    onUpdate: triggerSave,
    editorProps: {
      attributes: { class: 'planning-editor ProseMirror' },
    },
  })
  editorRef.current = editor

  useEffect(() => {
    if (editor && initialHtml && !editor.getText().trim()) {
      editor.commands.setContent(initialHtml)
    }
  }, [editor, initialHtml])

  const handleReset = async () => {
    if (!patient) return
    if (!window.confirm('Réinitialiser le planning avec les données actuelles du dossier (modèle Word) ?')) return
    let tndPerEur = DEFAULT_TND_PER_EUR
    try {
      const taux = await gestionnaireApi.getTauxEur()
      if (taux.tndPerEur > 0) tndPerEur = taux.tndPerEur
    } catch {
      /* taux par défaut */
    }
    const html = buildPlanningSejourHtml(patient, logistique, { tndPerEur })
    editor?.commands.setContent(html)
    const ml = moisLabelFromDate(
      logistique?.dateArrivee ? new Date(`${logistique.dateArrivee}T12:00:00`) : null,
    )
    setMoisLabel(ml)
    moisLabelRef.current = ml
    setSaved(false)
    void persist('brouillon')
  }

  const handlePrint = () => {
    const bodyHtml = editorRef.current?.getHTML() ?? ''
    if (!bodyHtml.trim()) {
      window.alert('Le document est vide. Réinitialisez ou saisissez du contenu.')
      return
    }

    const popup = window.open('', '_blank', 'width=1050,height=960')
    if (!popup) {
      window.alert('Autorisez les popups pour exporter en PDF.')
      return
    }

    const title = `Planning séjour — ${patient?.user.fullName ?? ''}${moisLabel ? ` (${moisLabel})` : ''}`
    const wrapped = ensurePlanningDocShell(bodyHtml, window.location.origin)

    popup.document.write(buildPlanningSejourPrintPage(wrapped, title))
    popup.document.close()
    popup.focus()
    setTimeout(() => { popup.print(); popup.close() }, 400)
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center gap-4">
        <RefreshCw className="h-8 w-8 text-slate-300 animate-spin" />
        <p className="text-sm text-slate-400">Chargement du planning…</p>
      </div>
    )
  }

  if (error || !patient) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-red-500 font-medium">{error ?? 'Patient introuvable.'}</p>
        <button type="button" onClick={() => navigate('/gestionnaire/planning-sejour')} className="text-sm text-slate-500 underline">
          Retour à la liste
        </button>
      </div>
    )
  }

  return (
    <div className="editor-root fixed inset-0 bg-white z-50 flex flex-col">
      <div className="no-print shrink-0 bg-white border-b border-slate-200 shadow-sm flex items-center gap-3 px-4 py-2.5 flex-wrap">
        <button
          type="button"
          onClick={() => navigate('/gestionnaire/planning-sejour')}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <div className="w-px h-5 bg-slate-200 mx-1 hidden sm:block" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">
            Planning séjour — {patient.user.fullName}
            {moisLabel ? ` (${moisLabel})` : ''}
          </p>
          <p className="text-[11px] text-slate-400">
            Modèle Word · {statut === 'finalise' ? 'Finalisé' : 'Brouillon'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-medium shrink-0">
          {saving ? (
            <>
              <RefreshCw className="h-3 w-3 animate-spin text-slate-400" />
              <span className="text-slate-400">Sauvegarde…</span>
            </>
          ) : saved ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              <span className="text-emerald-600">Sauvegardé</span>
            </>
          ) : (
            <span className="text-slate-300">Non sauvegardé</span>
          )}
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser
          </button>
          <button
            type="button"
            onClick={() => void persist()}
            disabled={saving}
            className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Sauvegarder
          </button>
          <button
            type="button"
            onClick={() => void persist('finalise')}
            disabled={saving}
            className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50"
          >
            Finaliser
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 h-8 px-4 text-xs font-semibold text-white rounded-lg"
            style={{ background: DEVIS_ACCENT }}
          >
            <Printer className="h-3.5 w-3.5" /> Exporter PDF
          </button>
        </div>
      </div>

      <div className="no-print shrink-0 mx-4 sm:mx-6 mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-900 leading-snug">
        <strong className="font-semibold">Modèle de base.</strong>{' '}
        Design Word : logo en tête, couleurs rose/or, jours sur fond gris, image « Bon séjour » en fin.
        Après modification du devis ou de la logistique, cliquez <strong>Réinitialiser</strong> pour régénérer depuis le dossier.
      </div>

      <RichDocToolbar editor={editor} highlightColors={PLANNING_HIGHLIGHT_COLORS} />

      <div className="editor-scroll flex-1 overflow-auto py-8 px-4 flex justify-center bg-white">
        <div
          className="doc-shell bg-white shadow-2xl"
          style={{
            width: 794,
            maxWidth: '100%',
            padding: '48px 56px 56px',
            boxSizing: 'border-box',
            background: '#fff',
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}
