import { Node, mergeAttributes } from '@tiptap/core'

/**
 * Dernière page seule du planning (consignes + Bon séjour).
 * Conserve <div class="planning-last-page">…</div> dans TipTap.
 */
export const PlanningLastPage = Node.create({
  name: 'planningLastPage',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML() {
    return [{ tag: 'div.planning-last-page' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ class: 'planning-last-page' }, HTMLAttributes), 0]
  },
})
