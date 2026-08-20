export type DiagnosticCategoryKey = 'mammaire' | 'visage' | 'silhouette'

export type DiagnosticOperation = {
  id: string
  category: DiagnosticCategoryKey
  label: string
  /** Texte officiel / modèle. Vide pour « Autre ». */
  template: string
  isAutre?: boolean
}

export const DIAGNOSTIC_CATEGORIES: {
  key: DiagnosticCategoryKey
  title: string
}[] = [
  { key: 'mammaire', title: 'Chirurgie Mammaire' },
  { key: 'visage', title: 'Chirurgie du Visage' },
  { key: 'silhouette', title: 'Chirurgie de la Silhouette' },
]

function lines(...parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join('\n')
}

const CONTENTION_SEINS = lines(
  'Nécessité de porter un vêtement compressif (soutien-gorge fourni par le chirurgien) pendant 6 semaines après l’intervention.',
  'Des auto-massages vous seront expliqués et recommandés pendant 6 semaines.',
  'Prévoir pour le retour en avion des bas de contention anti-varices.',
)

const PROTHESES_CHOIX = lines(
  'Les prothèses utilisées seront de la marque MENTOR ou SILIMED.',
  'Le choix de la forme et de la taille (volume en cc) des implants se fera au moment de la consultation préopératoire au moyen de simulations par prothèses d’essais.',
)

const DELAI_SEINS =
  'La forme et l’aspect définitifs du sein seront observés à partir de 10 à 12 semaines.'

export const DIAGNOSTIC_OPERATIONS: DiagnosticOperation[] = [
  // ── Mammaire (textes du document Devis Types Mammaire) ────────────────────
  {
    id: 'mam-augmentation-protheses',
    category: 'mammaire',
    label: 'Augmentation Mammaire par pose de prothèses',
    template: lines(
      'À l’examen des photos, vous présentez une hypotrophie mammaire (faible volume mammaire).',
      'L’intervention indiquée est une Augmentation Mammaire par pose de prothèses pour redonner du volume et du galbe.',
      'Les prothèses seront posées selon la technique mini-invasive appelée PRESERVÉ.',
      'La cicatrice sera placée au niveau du sillon sous-mammaire, elle sera courte et camouflée par le galbe naturel du sein.',
      DELAI_SEINS,
      PROTHESES_CHOIX,
      'Nécessité de porter un vêtement compressif (soutien-gorge fourni) pendant 6 semaines après l’intervention.',
      'Des auto-massages vous seront expliqués et recommandés pendant 6 semaines.',
      'Prévoir pour le retour en avion des bas de contention anti-varices.',
    ),
  },
  {
    id: 'mam-hybride',
    category: 'mammaire',
    label: 'Augmentation Mammaire Hybride',
    template: lines(
      'À l’examen des photos, vous présentez une hypotrophie mammaire (faible volume) avec asymétrie.',
      'L’intervention indiquée est une Augmentation Mammaire Hybride (par pose de prothèses + lipofilling) pour donner du volume et du galbe au sein en corrigeant l’asymétrie.',
      'La graisse traitée et injectée sera prélevée au niveau de l’intercuisse ou au niveau de l’abdomen.',
      'Les prothèses utilisées seront posées selon la technique mini-invasive appelée PRESERVÉ.',
      'La cicatrice sera placée au niveau du sillon sous-mammaire, elle sera courte et camouflée dans le galbe naturel du sein.',
      DELAI_SEINS,
      PROTHESES_CHOIX,
      CONTENTION_SEINS,
    ),
  },
  {
    id: 'mam-lifting-protheses',
    category: 'mammaire',
    label: 'Lifting Mammaire avec pose de prothèses',
    template: lines(
      'À l’examen des photos, vous présentez une ptose (seins tombants) avec un faible volume mammaire.',
      'L’intervention indiquée est un Lifting Mammaire avec augmentation de volume par prothèses.',
      'Cette intervention redressera la position des aréoles et permettra de redonner du galbe et une forme harmonieuse au sein.',
      'La cicatrice sera en T inversé : une autour de l’aréole, une verticale plus ou moins une cicatrice horizontale.',
      DELAI_SEINS,
      PROTHESES_CHOIX,
      CONTENTION_SEINS,
    ),
  },
  {
    id: 'mam-lifting-seul',
    category: 'mammaire',
    label: 'Lifting Mammaire (sans pose de prothèses)',
    template: lines(
      'À l’examen des photos, vous présentez une ptose (seins tombants) avec un volume mammaire suffisant.',
      'L’intervention indiquée est un Lifting Mammaire sans pose de prothèses.',
      'Cette intervention redressera la position des aréoles et permettra de remonter le sein et de lui donner fermeté et forme harmonieuse.',
      'La cicatrice sera en T inversé : une autour de l’aréole, une verticale plus ou moins une cicatrice horizontale.',
      DELAI_SEINS,
      CONTENTION_SEINS,
    ),
  },
  {
    id: 'mam-reduction',
    category: 'mammaire',
    label: 'Réduction Mammaire',
    template: lines(
      'À l’examen des photos, vous présentez une hypertrophie mammaire avec ptose (seins tombants).',
      'L’intervention indiquée est une Réduction Mammaire.',
      'Cette intervention redressera la position des aréoles, diminuera le volume et permettra de redonner du galbe, de la fermeté et une forme harmonieuse du sein.',
      'La cicatrice sera en T inversé : une autour de l’aréole, une verticale avec une cicatrice horizontale.',
      DELAI_SEINS,
      CONTENTION_SEINS,
    ),
  },
  {
    id: 'mam-tubereux',
    category: 'mammaire',
    label: 'Seins Tubéreux (avec pose de prothèse)',
    template: lines(
      'À l’examen des photos, vous présentez des seins tubéreux Grade  (anomalie de distribution de la base des seins avec un aspect allongé en tubercule, non arrondis et concentration de tout le volume du sein derrière l’aréole).',
      'L’intervention indiquée est une Cure de Seins Tubéreux avec pose de prothèses.',
      'Cette intervention permettra de redistribuer la glande et corriger la base du sein, avec une correction de la taille et la position des aréoles.',
      DELAI_SEINS,
      PROTHESES_CHOIX,
      CONTENTION_SEINS,
    ),
  },
  {
    id: 'mam-changement',
    category: 'mammaire',
    label: 'Changement de Prothèses Mammaires',
    template: lines(
      'L’intervention indiquée est un Changement de Prothèses Mammaires.',
      'La cicatrice reprendra le tracé de l’ancienne cicatrice.',
      DELAI_SEINS,
      PROTHESES_CHOIX,
      CONTENTION_SEINS,
    ),
  },
  {
    id: 'mam-changement-lifting',
    category: 'mammaire',
    label: 'Changement de Prothèses Mammaires avec Lifting',
    template: lines(
      'À l’examen des photos, vous présentez une ptose mammaire (seins tombants).',
      'Vu votre souhait de changer les prothèses, il faut impérativement associer un lifting pour traiter le relâchement au même temps que le changement.',
      'L’intervention indiquée est un Changement de Prothèses Mammaires avec Lifting.',
      'La cicatrice sera en T inversé : une autour de l’aréole, une verticale avec une cicatrice horizontale.',
      DELAI_SEINS,
      PROTHESES_CHOIX,
      CONTENTION_SEINS,
    ),
  },
  {
    id: 'mam-retrait-lifting',
    category: 'mammaire',
    label: 'Retrait de Prothèses Mammaires avec Lifting',
    template: lines(
      'À l’examen des photos, vous présentez une ptose mammaire (seins tombants) avec un volume suffisant.',
      'Vu votre souhait de retrait des prothèses, il faut impérativement associer un lifting pour traiter le relâchement au même temps que le retrait.',
      'L’intervention indiquée est un Retrait de Prothèses Mammaires avec Lifting.',
      'La cicatrice sera en T inversé : une autour de l’aréole, une verticale avec une cicatrice horizontale.',
      DELAI_SEINS,
      CONTENTION_SEINS,
    ),
  },
  {
    id: 'mam-autre',
    category: 'mammaire',
    label: 'Autre (mammaire à préciser)',
    template: '',
    isAutre: true,
  }
]

const BY_ID = new Map(DIAGNOSTIC_OPERATIONS.map((op) => [op.id, op]))

export function operationsForCategory(key: DiagnosticCategoryKey): DiagnosticOperation[] {
  return DIAGNOSTIC_OPERATIONS.filter((op) => op.category === key)
}

export function composeDiagnosticTemplates(ids: string[]): string {
  const ops = ids
    .map((id) => BY_ID.get(id))
    .filter((op): op is DiagnosticOperation => Boolean(op?.template))
  return ops
    .map((op, i) => `${i + 1} - ${op.label}\n\n${op.template}`)
    .join('\n\n')
}

export function interventionLabelsFromIds(ids: string[]): string[] {
  return ids.flatMap((id) => {
    const op = BY_ID.get(id)
    if (!op || op.isAutre) return []
    return [op.label]
  })
}

function normalizeLabel(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Retrouve les interventions dont le modèle est encore présent dans le diagnostic. */
export function inferSelectedOperationIds(diagnostic: string): string[] {
  const text = diagnostic.trim()
  if (!text) return []
  const withTpl = DIAGNOSTIC_OPERATIONS.filter((op) => op.template)
  const byTitle = new Map(withTpl.map((op) => [normalizeLabel(op.label), op.id]))
  const titleHits: string[] = []
  const titleRe = /^(\d+)\s*[-–.]\s+(.+)$/gm
  let m: RegExpExecArray | null
  while ((m = titleRe.exec(text))) {
    const id = byTitle.get(normalizeLabel(m[2]))
    if (id) titleHits.push(id)
  }
  if (titleHits.length > 0) return titleHits

  const exact = withTpl.find((op) => op.template.trim() === text)
  if (exact) return [exact.id]
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  if (blocks.length > 1) {
    const ids: string[] = []
    for (const block of blocks) {
      const match = withTpl.find((op) => op.template.trim() === block)
      if (match) ids.push(match.id)
    }
    if (ids.length === blocks.length) return ids
  }
  return withTpl.filter((op) => text.includes(op.template.trim())).map((op) => op.id)
}
