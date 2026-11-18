import { Mark, mergeAttributes } from '@tiptap/core'

/**
 * Conserve les « liens » planning : <span data-planning-field="prenom">…</span>
 * (sinon TipTap les retire au parse).
 */
export const PlanningField = Mark.create({
  name: 'planningField',
  inclusive: false,
  excludes: '',
  addAttributes() {
    return {
      field: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-planning-field'),
        renderHTML: (attributes) => {
          if (!attributes.field) return {}
          return { 'data-planning-field': attributes.field }
        },
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-planning-field]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})
