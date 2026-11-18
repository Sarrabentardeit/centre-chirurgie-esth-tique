import { Node, mergeAttributes } from '@tiptap/core'
import { PLANNING_TEMPLATE_VERSION } from '@/lib/planningSejourBranding'

/**
 * Conserve le wrapper <div class="planning-doc" data-planning-template="…">
 * (sinon TipTap l’enlève et la migration auto ne peut plus se baser sur la version).
 */
export const PlanningDoc = Node.create({
  name: 'planningDoc',
  topNode: false,
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      templateVersion: {
        default: PLANNING_TEMPLATE_VERSION,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-planning-template')
          const n = raw ? Number.parseInt(raw, 10) : PLANNING_TEMPLATE_VERSION
          return Number.isFinite(n) ? n : PLANNING_TEMPLATE_VERSION
        },
        renderHTML: (attributes) => ({
          'data-planning-template': String(attributes.templateVersion ?? PLANNING_TEMPLATE_VERSION),
        }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'div.planning-doc' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ class: 'planning-doc' }, HTMLAttributes), 0]
  },
})
