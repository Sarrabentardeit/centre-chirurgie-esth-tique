import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold, Italic, Underline as UnderlineIcon,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Undo2, Redo2, Palette,
} from 'lucide-react'
import { DEVIS_CHARTE, DEVIS_TOOLBAR_COLORS } from '@/lib/devisCharte'

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

export function RichDocToolbar({ editor }: { editor: Editor | null }) {
  const [colorOpen, setColorOpen] = useState(false)
  if (!editor) return null

  return (
    <div className="no-print relative flex items-center gap-0.5 px-3 py-2 bg-white border-b border-slate-200 flex-wrap">
      <ToolBtn title="Annuler" onClick={() => editor.chain().focus().undo().run()}><Undo2 className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn title="Refaire" onClick={() => editor.chain().focus().redo().run()}><Redo2 className="h-3.5 w-3.5" /></ToolBtn>
      <ToolSep />
      <ToolBtn active={editor.isActive('bold')} title="Gras" onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn active={editor.isActive('italic')} title="Italique" onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn active={editor.isActive('underline')} title="Souligner" onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn active={editor.isActive('highlight')} title="Surligner" onClick={() => editor.chain().focus().toggleHighlight().run()}>
        <span className="text-xs font-bold" style={{ background: DEVIS_CHARTE.cream, padding: '0 2px', borderRadius: 2 }}>A</span>
      </ToolBtn>
      <ToolSep />
      <ToolBtn active={editor.isActive({ textAlign: 'left' })} title="Aligner à gauche" onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn active={editor.isActive({ textAlign: 'center' })} title="Centrer" onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn active={editor.isActive({ textAlign: 'right' })} title="Aligner à droite" onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight className="h-3.5 w-3.5" /></ToolBtn>
      <ToolSep />
      <ToolBtn active={editor.isActive('bulletList')} title="Liste à puces" onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></ToolBtn>
      <ToolBtn active={editor.isActive('orderedList')} title="Liste numérotée" onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></ToolBtn>
      <ToolSep />
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
