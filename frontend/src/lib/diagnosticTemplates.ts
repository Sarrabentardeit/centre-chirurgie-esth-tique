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
  shortTitle: string
}[] = [
  { key: 'mammaire', title: 'Chirurgie Mammaire', shortTitle: 'Mammaire' },
  { key: 'visage', title: 'Chirurgie du Visage', shortTitle: 'Visage' },
  { key: 'silhouette', title: 'Chirurgie de la Silhouette', shortTitle: 'Silhouette' },
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

const SIL_VASER =
  'Lipoaspiration selon la technique VASER MICROAIRE HD pour avoir un rendu plus harmonieux et esthétique au niveau de la silhouette.'
const SIL_OED_WORDS =
  'Les œdèmes et les bleus seront présents pendant au moins trois à quatre semaines.'
const SIL_OED_DIGITS =
  'Les œdèmes et les bleus seront présents pendant au moins 3 à 4 semaines.'
const SIL_RESULT =
  'Le résultat définitif ne pourra être perçu qu’à partir de 12 à 16 semaines après l’intervention.'
const SIL_CONV =
  'Convalescence plus facile et confortable car la technique utilisée est moins invasive.'
const SIL_DRAINAGE = 'Prévoir 6 semaines de drainage lymphatique en post opératoire.'
const SIL_BBL_DRAINAGE =
  'Prévoir 6 semaines de drainage lymphatique des zones aspirées et non des zones injectées en post opératoire.'
const SIL_AVION =
  'Prévoir pour le retour en avion et pendant les 15 premiers jours des bas de contention anti-varices.'
const SIL_NB =
  'N.B : Pour les Lipo, il est assez fréquent d’avoir recours à des transfusions post opératoires donc prévoir un budget supplémentaire de 250DT par poche de sang en cas de besoin.'

const VIS_AVION =
  'Prévoir pour le retour en avion et pendant les 15 premiers jours des bas de contention anti-varices.'

function silContention(kind: 'Panty/gaine' | 'Panty' | 'Manchettes'): string {
  return `Nécessité de porter un vêtement compressif (fourni par le chirurgien) pendant 6 semaines après l’intervention. (${kind})`
}

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
  },

  // ── Visage (textes du document Devis Type Visage) ─────────────────────────
  {
    id: 'vis-dpfl',
    category: 'visage',
    label: 'Deep Plane Face Lift (DPFL)',
    template: lines(
      'Le vieillissement du visage entraîne progressivement une perte de tonicité et un relâchement des tissus. Il se manifeste notamment par l’apparition de bajoues, de cordes platysmales au niveau du cou, une perte de définition de l’ovale du visage et un relâchement des structures musculaires et des tissus profonds du visage et du cou.',
      'Le Deep Plane Face Lift est une technique de lifting permettant de repositionner en profondeur et de façon naturelle les tissus du visage et du cou afin de redéfinir l’ovale, atténuer les bajoues et améliorer le contour cervico-facial, tout en conservant une expression naturelle.',
      'Les cicatrices sont dissimulées dans les tempes chevelues, autour de l’oreille, puis se prolongent discrètement derrière l’oreille plongeant dans le cuir chevelu.',
      'Leur évolution est progressive et leur visibilité très limitée au début, diminue généralement avec le temps et finit par disparaître au bout de quelques semaines.',
      'L’évolution est marquée par quelques œdèmes et bleus surtout au bas du cou pendant 10 jours.',
      'Le résultat définitif sera stabilisé au bout de 12 à 16 semaines.',
      'Prévoir 6 semaines de drainage lymphatique en post opératoire.',
    ),
  },
  {
    id: 'vis-bleph-sup',
    category: 'visage',
    label: 'Blépharoplastie supérieure',
    template: lines(
      'Le vieillissement des paupières entraîne progressivement un excès de peau au niveau des paupières supérieures, donnant au regard un aspect plus lourd et fatigué.',
      'Cet excès peut parfois s’accompagner d’une petite accumulation graisseuse au coin interne.',
      'La blépharoplastie supérieure consiste à retirer de manière mesurée l’excès de peau et, si nécessaire, la petite poche graisseuse afin de dégager le regard et lui redonner un aspect plus ouvert et reposé, tout en conservant son expression naturelle.',
      'La cicatrice est dissimulée dans le pli naturel de la paupière supérieure, ce qui la rend généralement très discrète une fois cicatrisée.',
      'Les fils seront retirés au bout de 07 jours.',
      'Les bleus et œdèmes persistent pendant 15 jours.',
      'Le résultat définitif sera stabilisé au bout de 12 à 16 semaines.',
      VIS_AVION,
    ),
  },
  {
    id: 'vis-bleph-inf',
    category: 'visage',
    label: 'Blépharoplastie inférieure',
    template: lines(
      'Le vieillissement de la paupière inférieure se traduit principalement par l’apparition de poches sous les yeux, associées à un relâchement cutané et musculaire donnant au regard un aspect fatigué.',
      'La blépharoplastie inférieure permet de traiter les poches graisseuses, de corriger l’excès cutané et le relâchement musculaire.',
      'Ceci permet de rajeunir et lisser le contour de l’œil, tout en conservant un résultat naturel.',
      'Des œdèmes et des bleus seront présents pendant 15 jours.',
      'La cicatrice est située juste sous les cils et se prolonge discrètement dans le pli de la patte d’oie.',
      'La cicatrice sera rapidement invisible au bout de quelques semaines.',
      'Le résultat définitif sera stabilisé à partir de 12 à 16 semaines.',
      VIS_AVION,
    ),
  },
  {
    id: 'vis-autre',
    category: 'visage',
    label: 'Autre (visage à préciser)',
    template: '',
    isAutre: true,
  },

  // ── Silhouette (textes du document Devis Type silhouette) ─────────────────
  {
    id: 'sil-lipo-abdominoplastie',
    category: 'silhouette',
    label: 'Lipo Circulaire / Abdominoplastie',
    template: lines(
      'AU NIVEAU DU VENTRE, FLANCS ET DOS, vous présentez un excédent graisseux avec relâchement cutané au niveau du ventre et écartement des muscles droits de l’abdomen : DIASTASIS.',
      'L’intervention indiquée est une Abdominoplastie (lifting du ventre) avec Cure de DIASTASIS associée à une Lipoaspiration de la graisse du cercle abdominal pour à la fois aspirer l’excédent de graisse et retendre la peau en excédent au niveau du bas ventre.',
      'La cicatrice de l’abdominoplastie se situe d’une épine iliaque à une autre et est à la limite des poils pubiens (souvent cachée par les sous-vêtements).',
      SIL_VASER,
      SIL_OED_WORDS,
      SIL_RESULT,
      SIL_CONV,
      silContention('Panty/gaine'),
      SIL_DRAINAGE,
      SIL_AVION,
      SIL_NB,
    ),
  },
  {
    id: 'sil-liposuccion',
    category: 'silhouette',
    label: 'Liposuccion',
    template: lines(
      'AU NIVEAU DU ……………, vous présentez des lipoméries (localisations graisseuses)',
      'L’intervention indiquée est une Lipoaspiration assistée au Vaser et MICROAIRE HD.',
      'Cette intervention permettra de sculpter et de redéfinir la silhouette.',
      SIL_OED_WORDS,
      SIL_RESULT,
      SIL_CONV,
      silContention('Panty'),
      SIL_DRAINAGE,
      SIL_AVION,
      SIL_NB,
    ),
  },
  {
    id: 'sil-lipoedeme',
    category: 'silhouette',
    label: 'Lipœdème',
    template: lines(
      'Au niveau des membres inférieurs, vous présentez un lipœdème stade…',
      'Il s’agit d’une accumulation symétrique et disproportionnée de graisse, au niveau des jambes qui s’accompagne fréquemment de douleurs, sensibilité au toucher, sensations de lourdeur et tendance aux ecchymoses.',
      'L’intervention indiquée est une LYMPHO SPARING liposuction avec des micro canules et assistée par la technique PAL MICROAIRE : canules vibrantes.',
      'Les suites seront marquées par œdèmes et ecchymoses pendant 3 à 4 semaines.',
      SIL_RESULT,
      SIL_CONV,
      silContention('Panty'),
      SIL_DRAINAGE,
      SIL_AVION,
      SIL_NB,
    ),
  },
  {
    id: 'sil-bbl',
    category: 'silhouette',
    label: 'BBL',
    template: lines(
      'AU NIVEAU DE LA SILHOUETTE, vous présentez des lipoméries (localisations graisseuses) au niveau du dos des flancs et de l’abdomen avec un volume fessier que vous jugez insuffisant.',
      'L’intervention indiquée est une Lipoaspiration assistée au Vaser et MICROAIRE HD 360 degrés (dos, flancs et abdomen) avec Lipofilling fessier (injection de graisse dans les fesses)',
      'Cette intervention permettra dans un premier temps d’aspirer la graisse en excédent pour affiner et redéfinir la silhouette.',
      'La graisse aspirée sera traitée et réinjectée au niveau des fesses pour augmenter et harmoniser leur volume.',
      'L’injection de graisse se fait dans le issus sous cutanée et jamais dans le muscle fessier. Ceci permet de diminuer le risque d’embolie graisseuse.',
      'La combinaison de la lipoaspiration des flancs et le lipofilling fessier augmentera le contraste entre ses deux régions et marquera de manière très significative votre taille.',
      'La graisse injectée peut parfois se résorber jusqu’à 30 % ou 40 % et la résorption peut parfois être asymétrique.',
      'Le risque majeur de cette intervention est l’embolie pulmonaire graisseuse (passage de graisse dans les vaisseaux sanguins) qui peut être parfois fatale.',
      'Le voyage n’est pas recommandé avant dix jours après l’intervention.',
      SIL_OED_DIGITS,
      SIL_RESULT,
      'Un coussin d’assise spécial est recommandé pendant les 6 premières semaines pour diminuer la pression sur la graisse injectée en position assise et allongée sur le dos.',
      silContention('Panty'),
      SIL_BBL_DRAINAGE,
      SIL_AVION,
      SIL_NB,
    ),
  },
  {
    id: 'sil-lift-bras',
    category: 'silhouette',
    label: 'Lift des bras',
    template: lines(
      'AU NIVEAU DES BRAS, vous présentez un excédent graisseux et cutané au niveau des faces internes des bras.',
      'L’intervention indiquée est un Lifting des Bras.',
      'Cette intervention sera débutée par une Lipoaspiration pour harmoniser les volumes des bras.',
      'La cicatrice sera longitudinale discrète et placée le long des faces internes des bras.',
      SIL_VASER,
      SIL_OED_DIGITS,
      SIL_RESULT,
      SIL_CONV,
      silContention('Manchettes'),
      SIL_DRAINAGE,
      SIL_AVION,
      SIL_NB,
    ),
  },
  {
    id: 'sil-autre',
    category: 'silhouette',
    label: 'Autre (silhouette à préciser)',
    template: '',
    isAutre: true,
  },
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
