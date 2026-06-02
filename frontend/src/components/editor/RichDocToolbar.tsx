import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold, Italic, Underline as UnderlineIcon,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Undo2, Redo2, Palette, Highlighter, Eraser,
} from 'lucide-react'
import { DEVIS_CHARTE, DEVIS_TOOLBAR_COLORS } from '@/lib/devisCharte'

export type ToolbarColorSwatch = { label: string; value: string }

const DEFAULT_HIGHLIGHT_COLORS: ToolbarColorSwatch[] = [
  { label: 'Jaune', value: '#FFF59D' },
  { label: 'Crème', value: DEVIS_CHARTE.cream },
  { label: 'Rose', value: DEVIS_CHARTE.rose },
  { label: 'Gris clair', value: '#E5E7EB' },
  { label: 'Saumon clair', value: '#FFE8E4' },
  { label: 'Vert clair', value: '#E8F5E9' },
]

function ToolBtn({ active, onClick, title, children }: {
  active?: boolean; onClick: () => void; title: string; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      className={`h-8 w-8 flex items-center justify-center rounded-lg text-sm transition-colors ${
        active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  )
}

function ToolSep() {
  return <div className="w-px h-5 bg-slate-200 mx-1 shrink-0" />
}

type RichDocToolbarProps = {
  editor: Editor | null
  /** Couleurs de surlignage (fluo). Si absent : surlignage jaune simple. */
  highlightColors?: readonly ToolbarColorSwatch[]
}

export function RichDocToolbar({ editor, highlightColors }: RichDocToolbarProps) {
  const [colorOpen, setColorOpen] = useState(false)
  const [highlightOpen, setHighlightOpen] = useState(false)
  const hiColors = highlightColors ?? DEFAULT_HIGHLIGHT_COLORS

  if (!editor) return null

  const applyHighlight = (color: string) => {
    editor.chain().focus().toggleHighlight({ color }).run()
    setHighlightOpen(false)
  }

  return (
    <div className="no-print relative flex items-center gap-0.5 px-3 py-2 bg-white border-b border-slate-200 flex-wrap">
      <ToolBtn title="Annuler" onClick={() => editor.chain().focus().undo().run()}><Undo2 className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn title="Refaire" onClick={() => editor.chain().focus().redo().run()}><Redo2 className="h-3.5 w-3.5" /></ToolBtn>
      <ToolSep />
      <ToolBtn active={editor.isActive('bold')} title="Gras" onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn active={editor.isActive('italic')} title="Italique" onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn active={editor.isActive('underline')} title="Souligner" onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-3.5 w-3.5" /></ToolBtn>

      {/* Surlignage (fluo) — couleur au choix */}
      <div className="relative">
        <ToolBtn
          active={editor.isActive('highlight')}
          title="Surligner (fluo) — choisir la couleur"
          onClick={() => setHighlightOpen((v) => !v)}
        >
          <Highlighter className="h-3.5 w-3.5" />
        </ToolBtn>
        {highlightOpen && (
          <div
            className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl shadow-xl border border-slate-200 p-2 min-w-[168px]"
            onMouseLeave={() => setHighlightOpen(false)}
          >
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide px-1 mb-1.5">
              Couleur fluo
            </p>
            <div className="flex flex-wrap gap-1.5 items-center">
              {hiColors.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    applyHighlight(c.value)
                  }}
                  className="w-7 h-7 rounded-md border-2 border-white shadow ring-1 ring-slate-200 hover:scale-110 transition-transform"
                  style={{ background: c.value }}
                />
              ))}
              <input
                type="color"
                defaultValue="#FFF59D"
                className="w-7 h-7 rounded-md cursor-pointer border border-slate-200 p-0.5 shrink-0"
                title="Autre couleur (personnalisée)"
                onMouseDown={(e) => e.stopPropagation()}
                onInput={(e) => {
                  applyHighlight((e.target as HTMLInputElement).value)
                }}
              />
            </div>
            <p className="text-[9px] text-slate-400 px-1 mt-1.5 leading-tight">
              Pastilles rapides ou pipette pour toute autre couleur.
            </p>
            <button
              type="button"
              className="mt-2 w-full flex items-center justify-center gap-1 text-[11px] text-slate-600 hover:text-slate-900 py-1 rounded-md hover:bg-slate-50"
              onMouseDown={(e) => {
                e.preventDefault()
                editor.chain().focus().unsetHighlight().run()
                setHighlightOpen(false)
              }}
            >
              <Eraser className="h-3 w-3" />
              Retirer le surlignage
            </button>
          </div>
        )}
      </div>

      <ToolSep />
      <ToolBtn active={editor.isActive({ textAlign: 'left' })} title="Aligner à gauche" onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn active={editor.isActive({ textAlign: 'center' })} title="Centrer" onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn active={editor.isActive({ textAlign: 'right' })} title="Aligner à droite" onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight className="h-3.5 w-3.5" /></ToolBtn>
      <ToolSep />
      <ToolBtn active={editor.isActive('bulletList')} title="Liste à puces" onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn active={editor.isActive('orderedList')} title="Liste numérotée" onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></ToolBtn>
      <ToolSep />

      {/* Couleur du texte (pas le fluo) */}
      <div className="relative">
        <ToolBtn title="Couleur du texte" onClick={() => setColorOpen((v) => !v)}>
          <Palette className="h-3.5 w-3.5" />
        </ToolBtn>
        {colorOpen && (
          <div
            className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl shadow-xl border border-slate-200 p-2 flex gap-1.5"
            onMouseLeave={() => setColorOpen(false)}
          >
            {DEVIS_TOOLBAR_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
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
