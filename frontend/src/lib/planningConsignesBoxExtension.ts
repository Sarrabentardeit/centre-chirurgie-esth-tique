import { Node, mergeAttributes } from '@tiptap/core'

/**
 * Cadre noir « CONSIGNES POSTOPÉRATOIRES » (comme le PDF Type séjour).
 * Conserve <div class="planning-consignes-box">…</div> dans TipTap.
 */
export const PlanningConsignesBox = Node.create({
  name: 'planningConsignesBox',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML() {
    return [{ tag: 'div.planning-consignes-box' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ class: 'planning-consignes-box' }, HTMLAttributes), 0]
  },
})
