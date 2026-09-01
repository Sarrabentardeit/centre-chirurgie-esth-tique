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
    id: 'vis-lip-lift',
    category: 'visage',
    label: 'Lifting de la Lèvre Supérieure (Lip Lift)',
    template: lines(
      'L’analyse de votre région péribuccale met en évidence une distance relativement importante entre la base du nez et la lèvre supérieure, appelée distance naso-labiale.',
      'Avec le temps, cette distance peut également s’allonger progressivement et contribuer à donner à la partie inférieure du visage un aspect plus mature. La lèvre supérieure peut alors paraître moins visible et moins définie, malgré un volume labial satisfaisant.',
      'Dans votre cas, l’objectif n’est donc pas nécessairement d’augmenter le volume des lèvres, mais plutôt de rééquilibrer leurs proportions et leur position.',
      'Le lip lift consiste à raccourcir de manière contrôlée la distance entre la base du nez et la lèvre supérieure.',
      'L’intervention est réalisée par une incision dissimulée au niveau de la jonction naturelle située sous les narines. Une petite quantité de peau est retirée de manière personnalisée, puis la lèvre supérieure est délicatement repositionnée vers le haut.',
      'Ce geste permet notamment d’augmenter la visibilité de la lèvre rouge et de mieux définir l’arc de Cupidon.',
      'Le lip lift ne consiste pas à ajouter du volume comme une injection d’acide hyaluronique : il s’agit avant tout d’une modification des proportions et de la position de la lèvre.',
      'La quantité de peau retirée est soigneusement calculée afin d’obtenir un résultat naturel et d’éviter une élévation excessive de la lèvre.',
      'LES SUITES :',
      'Le résultat recherché est une lèvre supérieure plus visible, mieux définie et mieux proportionnée au reste du visage.',
      'Le sourire et l’expression du visage doivent rester naturels.',
      'L’intervention peut également donner une impression de lèvre supérieure légèrement plus volumineuse sans véritable ajout de volume, simplement par l’augmentation de sa partie visible.',
      'LA CONVALESCENCE :',
      'Un œdème de la lèvre supérieure est habituel durant les premiers jours. Une sensation de tension ou de tiraillement peut également être ressentie initialement.',
      'De petites ecchymoses peuvent apparaître, mais elles restent généralement modérées.',
      'Les sutures sont habituellement retirées autour du 5e au 7e jour.',
      'La cicatrice évolue progressivement. Elle est initialement plus visible puis s’affine et s’éclaircit au fil des semaines et des mois.',
      'Une période d’environ 7 à 10 jours est généralement recommandée avant une reprise confortable de la vie sociale, même si l’évolution est individuelle.',
      'RÉSULTAT FINAL :',
      'La modification de la position de la lèvre est visible relativement rapidement, mais l’œdème et la cicatrice continuent à évoluer progressivement.',
      'Le résultat s’affine au cours des premières semaines et des premiers mois.',
      'La cicatrice nécessite également une maturation progressive, pouvant se poursuivre pendant plusieurs mois.',
      'LE BUT :',
      'Rééquilibrer les proportions de la lèvre supérieure et du tiers inférieur du visage, sans donner un aspect artificiel.',
      'L’objectif est d’obtenir une lèvre supérieure plus élégante, mieux définie et naturellement visible, avec une cicatrice discrète au niveau de la base du nez.',
      'Le lip lift est ainsi conçu comme une chirurgie de proportion et d’harmonie, plutôt que comme une simple augmentation du volume des lèvres.',
      VIS_AVION,
    ),
  },
  {
    id: 'vis-nanofat',
    category: 'visage',
    label: 'NANOFAT Lipofilling du Visage',
    template: lines(
      'L’analyse de votre visage met en évidence une altération de la qualité cutanée, avec une peau moins lumineuse, une perte progressive de tonicité et certaines irrégularités ou zones de fragilité liées au vieillissement cutané.',
      'Avec le temps, la peau perd progressivement en élasticité et en qualité. Le renouvellement cellulaire ralentit et les tissus deviennent moins homogènes, ce qui peut donner au visage un aspect plus terne et moins frais.',
      'Dans votre cas, l’objectif du traitement NANOFAT est avant tout d’améliorer la qualité de la peau et son aspect général, plutôt que d’apporter un volume important.',
      'Le traitement consiste à prélever une petite quantité de tissu graisseux autologue, généralement au niveau d’une zone donneuse adaptée.',
      'Cette graisse est ensuite préparée et transformée afin d’obtenir une fraction très fine appelée Nanofat.',
      'Le Nanofat est ensuite réinjecté en très petites quantités dans les zones présentant une altération de la qualité cutanée.',
      'Contrairement à un lipofilling classique, dont l’objectif principal est de restaurer des volumes, le Nanofat est principalement utilisé comme un traitement biologique de la qualité cutanée.',
      'Il peut notamment être indiqué pour améliorer l’aspect de certaines zones fines ou fragiles, telles que le contour des yeux, les joues, les tempes, la région péribuccale ou certaines cicatrices, selon les besoins de chaque patiente.',
      'RÉSULTATS :',
      'L’objectif est d’obtenir progressivement une peau plus homogène, plus lumineuse et d’apparence plus saine, avec une amélioration de sa texture et de sa qualité.',
      'Le traitement peut également contribuer à atténuer l’aspect de certaines irrégularités cutanées et à améliorer la souplesse des tissus.',
      'Le résultat est volontairement subtil et naturel.',
      'Il ne s’agit pas de modifier les volumes du visage ou de créer des contours artificiels, mais d’améliorer progressivement la qualité globale de la peau.',
      'LES SUITES :',
      'Le traitement est généralement bien toléré.',
      'Un œdème modéré, une sensibilité ou de petites ecchymoses peuvent apparaître au niveau des zones traitées et de la zone de prélèvement.',
      'Ces phénomènes diminuent progressivement au cours des premiers jours.',
      'La reprise des activités sociales est généralement possible rapidement, souvent après quelques jours, selon l’importance de l’œdème et les zones traitées.',
      'L’amélioration n’est pas nécessairement immédiate.',
      'La qualité de la peau évolue progressivement au cours des semaines et des mois suivant le traitement.',
      'Le résultat définitif doit donc être apprécié progressivement, avec une amélioration de la texture, de la luminosité et de la qualité cutanée qui peut se poursuivre pendant plusieurs mois.',
      'Selon l’état initial de la peau et les objectifs recherchés, plusieurs séances peuvent parfois être proposées pour optimiser le résultat.',
      'LE BUT :',
      'Réveiller la qualité naturelle de votre peau sans modifier votre visage.',
      'Le Nanofat s’inscrit dans une approche de médecine et de chirurgie régénérative visant à améliorer progressivement la qualité des tissus grâce à votre propre tissu graisseux.',
      'L’objectif est un visage plus lumineux, plus homogène et plus jeune d’apparence, tout en conservant totalement vos expressions et vos caractéristiques naturelles.',
      VIS_AVION,
    ),
  },
  {
    id: 'vis-lipofilling',
    category: 'visage',
    label: 'Lipofilling classique du Visage',
    template: lines(
      'L’analyse de votre visage met en évidence une perte ou une insuffisance de certains volumes graisseux, participant à une modification progressive des proportions et des contours du visage.',
      'Avec le temps, le vieillissement s’accompagne d’une redistribution et d’une diminution de certains compartiments graisseux. Les tempes peuvent se creuser, les pommettes perdre de leur projection, le contour des yeux devenir plus marqué et certaines zones du visage perdre leur aspect plein et harmonieux.',
      'L’objectif du traitement LIPOFILLING est donc de restaurer de manière ciblée les volumes qui ont été perdus, afin de retrouver des proportions plus équilibrées et un aspect plus jeune, sans modifier votre identité faciale.',
      'Le lipofilling consiste à prélever une petite quantité de votre propre tissu graisseux, généralement au niveau d’une zone donneuse présentant un excès graisseux approprié.',
      'Après préparation et purification, la graisse est réinjectée avec précision dans les différentes régions du visage nécessitant une restauration volumétrique.',
      'Selon votre anatomie, les zones pouvant être traitées comprennent notamment :',
      '• les pommettes et le tiers moyen du visage ;',
      '• les tempes ;',
      '• les cernes et la région sous-orbitaire ;',
      '• les sillons nasogéniens ;',
      '• les commissures et la région péribuccale ;',
      '• le menton ou la ligne mandibulaire.',
      'Le traitement est entièrement personnalisé : la quantité de graisse injectée et les zones traitées sont déterminées en fonction de vos proportions faciales et de l’effet recherché.',
      'L’objectif n’est pas de remplir systématiquement les rides ou les creux, mais de restaurer les volumes anatomiques qui participent à l’harmonie du visage.',
      'LES RÉSULTATS :',
      'Le lipofilling permet de restaurer les volumes et les contours du visage avec votre propre tissu.',
      'Le visage peut ainsi retrouver davantage de projection au niveau des pommettes, une meilleure harmonie du tiers moyen et une transition plus douce entre les différentes régions du visage.',
      'Le résultat recherché est un visage plus équilibré, plus reposé et naturellement rajeuni, sans effet de surcorrection.',
      'Une partie de la graisse injectée est naturellement résorbée au cours des premières semaines et des premiers mois. Le résultat final dépend donc de la prise de graisse de chaque patiente.',
      'LES SUITES :',
      'Un œdème est habituel après l’intervention et peut être plus important durant les premiers jours.',
      'Des ecchymoses peuvent également apparaître au niveau des zones injectées ainsi que sur la zone de prélèvement.',
      'L’œdème diminue progressivement au cours des 1 à 3 premières semaines, avec une amélioration progressive de l’aspect du visage.',
      'La reprise de la vie sociale dépend de l’importance de l’œdème et des ecchymoses, mais une période d’environ 10 à 15 jours peut être envisagée pour retrouver une apparence socialement confortable.',
      'LE RÉSULTAT :',
      'Le résultat est visible dès les premières semaines, mais il ne faut pas juger le résultat définitif trop précocement.',
      'Une partie du volume injecté se résorbe naturellement pendant les premiers mois. Le volume restant correspond à la prise graisseuse durable.',
      'Le résultat final est généralement apprécié autour de 3 à 6 mois, lorsque les tissus sont stabilisés.',
      'La graisse qui prend durablement est considérée comme stable, même si le visage continue naturellement à évoluer avec le vieillissement, les variations de poids et les facteurs individuels.',
      'L’OBJECTIF :',
      'Restaurer les volumes perdus, rééquilibrer les proportions et rajeunir le visage sans le transformer.',
      'Le lipofilling permet d’utiliser votre propre tissu graisseux comme matériau de comblement naturel afin de recréer des volumes harmonieux, subtils et personnalisés.',
      'Notre objectif est de retrouver un visage plus équilibré et naturellement rajeuni, avec un résultat qui respecte pleinement vos traits, vos expressions et votre identité.',
      VIS_AVION,
    ),
  },
  {
    id: 'vis-fox-eyes',
    category: 'visage',
    label: 'Lifting du Sourcil (Fox Eyes)',
    template: lines(
      'L’analyse de votre regard met en évidence une légère descente de la partie externe du sourcil et des tissus temporaux, pouvant donner au regard un aspect moins ouvert et moins dynamique.',
      'La queue du sourcil joue un rôle essentiel dans l’équilibre du regard. Avec le temps, son abaissement progressif peut contribuer à alourdir la partie externe de la paupière supérieure et à accentuer certaines ridules de la région temporale.',
      'Dans votre cas, l’objectif du LIFTING TEMPORAL « FOX EYES » est de rehausser délicatement la partie externe du sourcil et du regard, afin d’obtenir un regard plus ouvert, étiré et élégant.',
      'Le Temporal Lift, parfois appelé « Fox Eyes Lift », consiste à repositionner de manière contrôlée les tissus de la région temporale et la partie latérale du sourcil.',
      'Le geste est réalisé par de petites incisions dissimulées dans le cuir chevelu de la région temporale. Les tissus sont mobilisés et repositionnés vers le haut et légèrement vers l’extérieur afin de créer une élévation subtile de la queue du sourcil.',
      'Le degré de traction est soigneusement adapté à votre anatomie et à vos attentes.',
      'L’objectif n’est pas de modifier radicalement la forme de l’œil, mais de créer une tension latérale élégante et naturelle, donnant davantage d’ouverture au regard.',
      'Selon votre anatomie, le geste peut éventuellement être associé à d’autres procédures du regard ou du visage afin d’obtenir un résultat globalement harmonieux.',
      'Le résultat recherché est un regard :',
      '• plus ouvert ;',
      '• légèrement plus étiré vers l’extérieur ;',
      '• avec une queue du sourcil plus haute et mieux définie ;',
      '• plus dynamique et plus élégant.',
      'L’effet « Fox Eyes » doit rester subtil et proportionné à votre visage. Une traction excessive pourrait donner un résultat artificiel ou modifier de façon trop importante l’expression.',
      'LES SUITES :',
      'Un œdème modéré ainsi que des ecchymoses peuvent apparaître au niveau des tempes et de la région périoculaire.',
      'Une sensation de tension au niveau du cuir chevelu et des tempes est fréquente durant les premiers jours.',
      'La majorité de l’œdème et des ecchymoses diminue progressivement au cours des 7 à 15 premiers jours.',
      'La reprise des activités sociales est généralement envisageable après environ 10 à 15 jours, selon l’évolution individuelle.',
      'LE RÉSULTAT :',
      'Une élévation du sourcil est visible dès les premiers jours, mais le résultat initial est masqué en partie par l’œdème.',
      'Les tissus se détendent progressivement et le résultat se stabilise au cours des semaines suivantes.',
      'Le résultat final est généralement apprécié après 2 à 3 mois, lorsque les tissus se sont assouplis et que les cicatrices commencent à devenir discrètes.',
      'NOTRE OBJECTIF :',
      'Ouvrir et dynamiser le regard sans le transformer.',
      'Le Temporal Lift permet de créer une élévation élégante de la partie externe du sourcil et une légère orientation ascendante du regard.',
      'Notre objectif est un résultat féminin, subtil et naturel, avec une véritable harmonie entre le sourcil, la paupière et l’ensemble du visage.',
      'Le « Fox Eyes » ne doit pas être considéré comme la création d’un nouveau regard, mais comme une mise en valeur de votre regard naturel par un repositionnement précis de ses structures latérales.',
    ),
  },
  {
    id: 'vis-lipo-menton-cou',
    category: 'visage',
    label: 'Liposuccion du Double Menton et du Cou',
    template: lines(
      'L’analyse de votre tiers inférieur du visage met en évidence une présence graisseuse au niveau sous-mentonnier et cervical, contribuant à estomper la définition naturelle de l’ovale du visage et de la ligne mandibulaire.',
      'Cette accumulation graisseuse peut être constitutionnelle ou liée aux variations de poids et au vieillissement. Elle peut persister même chez une personne ayant une silhouette relativement mince.',
      'L’objectif de la liposuccion du double menton et du cou est de redéfinir l’ovale du visage et l’angle cervico-mentonnier, afin d’obtenir un profil plus net et plus harmonieux.',
      'La liposuccion, assistée aux ultrasons (VASER) sous-mentonnière et cervicale consiste à retirer de manière précise et contrôlée l’excès graisseux responsable de l’aspect de double menton.',
      'Le geste est réalisé à l’aide de micro-canules, permettant un traitement progressif et homogène des tissus graisseux.',
      'La graisse est retirée non seulement au niveau central sous le menton, mais également de manière ciblée dans les régions adjacentes lorsque cela est nécessaire, afin de créer une transition harmonieuse entre :',
      '• le menton ;',
      '• la ligne mandibulaire ;',
      '• le cou ;',
      '• et les parties latérales du visage.',
      'Les ultrasons permettent une aspiration plus douce, plus fine et plus harmonieuse que la lipoaspiration classique.',
      'L’objectif n’est pas simplement de « vider » la graisse, mais de sculpter les contours afin de redessiner progressivement l’ovale.',
      'Les ultrasons permettent en outre la rétraction cutanée naturelle après la liposuccion et participent à l’amélioration de la définition du cou et de la mandibule.',
      'Le traitement doit permettre :',
      '• de réduire ou supprimer le double menton ;',
      '• de mieux définir la ligne mandibulaire ;',
      '• d’améliorer l’angle entre le menton et le cou ;',
      '• de rendre l’ovale du visage plus net ;',
      '• d’obtenir un profil plus harmonieux.',
      'Le résultat recherché est une définition naturelle de l’ovale, sans créer une ligne mandibulaire artificiellement dessinée.',
      'LES SUITES :',
      'Un œdème et une sensation de tension du cou sont habituels après l’intervention.',
      'Des ecchymoses peuvent également apparaître au niveau du cou et de la région sous-mentonnière.',
      'Le port d’une contention cervicale est recommandé pendant les vingt premiers jours afin d’accompagner la rétraction des tissus et de limiter l’œdème.',
      'Le drainage lymphatique est un complément indispensable à la chirurgie et doit être fait dès la première semaine à raison de quatre séances par semaines pendant au moins quatre semaines.',
      'La majorité des ecchymoses diminue au cours des 7 à 15 premiers jours.',
      'L’œdème profond peut cependant persister plus longtemps, et le cou peut continuer à s’affiner progressivement au cours des semaines suivantes.',
      'Une amélioration du contour du visage est généralement perceptible dès les premières semaines.',
      'Cependant, le résultat ne doit pas être jugé trop précocement : les tissus continuent à se rétracter et à se remodeler progressivement après la disparition de l’œdème.',
      'Le résultat esthétique est généralement bien apprécié vers 2 à 3 mois, avec une amélioration pouvant continuer à se préciser jusqu’à 6 mois.',
      'NOTRE OBJECTIF :',
      'Redessiner l’ovale du visage et harmoniser la transition entre le visage et le cou.',
      'L’objectif n’est pas simplement de retirer de la graisse, mais de réaliser une véritable sculpture douce des contours cervico-faciaux.',
      'Lorsque les conditions anatomiques sont favorables, cette technique permet d’obtenir un profil plus net, plus élégant et naturellement défini, tout en conservant les proportions et l’identité de votre visage.',
      SIL_DRAINAGE,
      VIS_AVION,
    ),
  },
  {
    id: 'vis-rhinoplastie',
    category: 'visage',
    label: 'Rhinoplastie (Chirurgie du Nez)',
    template: lines(
      'Après l’analyse attentive de vos photos et de vos attentes, votre nez présente principalement une bosse dorsale associée à une pointe nasale globuleuse et insuffisamment définie.',
      'Ces caractéristiques donnent au nez une présence plus importante dans l’harmonie globale du visage, notamment de profil.',
      'L’objectif de l’intervention de RHINOPLASTIE sera donc de rééquilibrer le nez avec vos traits, tout en préservant son caractère naturel et votre identité.',
      'Correction de la bosse',
      'La bosse correspond à une saillie du dorsum nasal, constituée par une combinaison de structures osseuses et cartilagineuses.',
      'La rhinoplastie permettra de réduire cette bosse et de remodeler le dorsum, afin d’obtenir une ligne de profil plus douce, régulière et harmonieuse.',
      'Selon votre anatomie, une réduction contrôlée du dorsum associée, si nécessaire, à un remodelage des structures osseuses permettra de restaurer une meilleure continuité entre la racine du nez, le dorsum et la pointe.',
      'Affinement de la pointe globuleuse',
      'La pointe apparaît relativement large et arrondie, avec une définition cartilagineuse insuffisante.',
      'Le travail consistera à remodeler très précisément les cartilages de la pointe, afin de diminuer son aspect globuleux et d’améliorer sa définition.',
      'Selon les caractéristiques de votre nez, ce remodelage pourra être associé à une modification de la projection ou de la rotation de la pointe afin d’obtenir un résultat cohérent avec votre profil.',
      'L’objectif n’est pas de créer une pointe extrêmement fine ou artificielle, mais une pointe plus élégante, mieux définie et proportionnée à votre visage.',
      'Une rhinoplastie sur mesure',
      'La rhinoplastie moderne ne consiste pas simplement à « réduire le nez ». Chaque geste est déterminé en fonction de l’anatomie, de la qualité de la peau, des proportions du visage et du résultat recherché.',
      'Notre objectif sera de conserver une apparence naturelle au repos comme en mouvement, avec un résultat qui s’intègre harmonieusement à votre visage et ne donne pas l’impression d’un nez opéré.',
      'Les suites opératoires',
      'Un œdème du nez est normal après l’intervention. Des ecchymoses autour des yeux peuvent également apparaître, notamment lorsqu’un remodelage osseux est nécessaire.',
      'Une attelle nasale est habituellement conservée environ 7 jours. Les ecchymoses diminuent généralement de manière importante au cours des 7 à 10 premiers jours.',
      'La majorité des patientes peuvent retrouver une vie sociale relativement normale après environ 10 à 15 jours, même si un discret œdème peut encore être présent.',
      'Il est également normal que le nez paraisse initialement plus gonflé et moins défini que le résultat attendu, en particulier au niveau de la pointe.',
      'L’évolution du résultat',
      'La rhinoplastie est une intervention dont le résultat se révèle progressivement.',
      'Une amélioration esthétique est visible dès les premières semaines, mais le nez continue à s’affiner et à se dégonfler progressivement.',
      'Le résultat est généralement considéré comme proche de son aspect définitif vers 6 à 12 mois. La pointe peut cependant continuer à évoluer au-delà de cette période, particulièrement lorsque la peau est épaisse.',
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
    id: 'sil-jplasma',
    category: 'silhouette',
    label: 'J-Plasma / Renuvion',
    template: lines(
      'L’analyse de votre silhouette met en évidence une laxité cutanée et une perte de tonicité des tissus au niveau de la ou des zones que vous souhaitez traiter.',
      'Cette perte de fermeté peut être liée au vieillissement, aux variations de poids, aux grossesses ou simplement aux caractéristiques individuelles de la peau.',
      'Le J-Plasma / Renuvion est particulièrement intéressant lorsque la peau présente une laxité modérée, avec une capacité de rétraction encore présente, mais insuffisante pour obtenir seule le niveau de raffermissement souhaité.',
      'Les zones pouvant être traitées comprennent notamment le ventre, les bras, le dos, les flancs, les cuisses, les genoux, les fesses, le cou et certaines régions du visage, selon l’indication.',
      'Le J-Plasma / Renuvion utilise une énergie plasma délivrée sous la peau afin de produire une action thermique contrôlée sur les tissus sous-cutanés.',
      'Cette énergie permet une contraction immédiate des fibres de collagène, suivie d’un processus progressif de remodelage du collagène au cours des semaines et des mois suivants.',
      'Lorsque cela est indiqué, le traitement peut être associé à une liposuccion.',
      'Cette association permet de traiter deux composantes complémentaires :',
      'La liposuccion sculpte les volumes et retire l’excès graisseux, tandis que le J-Plasma favorise la rétraction et le raffermissement de la peau.',
      'La stratégie est adaptée à chaque zone et à la qualité de la peau afin d’obtenir une contraction homogène et naturelle.',
      'L’objectif est d’améliorer progressivement :',
      '• la fermeté de la peau ;',
      '• la tonicité des tissus ;',
      '• la qualité et l’aspect de la peau ;',
      '• la définition des contours corporels ;',
      '• l’aspect de certaines zones présentant une laxité cutanée modérée.',
      'Le résultat recherché est un raffermissement naturel, sans aspect excessivement tendu.',
      'Il est important de préciser que le J-Plasma ne remplace pas systématiquement une chirurgie d’exérèse cutanée. En présence d’un excès cutané important, une chirurgie telle qu’une abdominoplastie, une brachioplastie ou une cruroplastie peut rester plus adaptée.',
      'LES SUITES :',
      'Un œdème et une sensation de tension sont habituels après le traitement.',
      'Des ecchymoses, une sensibilité ou une sensation de chaleur peuvent également être observées dans les zones traitées.',
      'Lorsque le J-Plasma est associé à une liposuccion, les suites sont principalement liées à la combinaison des deux procédures et peuvent nécessiter une période de récupération plus importante.',
      'Une contention adaptée à la zone traitée peut être recommandée afin de limiter l’œdème et d’accompagner la rétraction des tissus.',
      'La reprise des activités dépend de la zone et de l’étendue du traitement, mais l’amélioration de l’œdème est généralement progressive au cours des premières semaines.',
      'LE RÉSULTAT :',
      'Une première contraction des tissus peut être observée relativement rapidement après le traitement.',
      'Cependant, le résultat définitif ne doit pas être évalué précocement.',
      'Le remodelage du collagène se poursuit progressivement pendant plusieurs mois, permettant une amélioration progressive de la fermeté et de la qualité de la peau.',
      'Le résultat est généralement mieux apprécié vers 6 mois à 10 mois, avec une maturation pouvant se poursuivre au-delà.',
      'NOTRE OBJECTIF :',
      'Raffermir et remodeler les tissus afin d’améliorer la silhouette et la qualité de la peau, sans modifier artificiellement les proportions du corps.',
      'Le J-Plasma / Renuvion constitue ainsi une technologie de rétraction cutanée et de raffermissement des tissus, particulièrement intéressante chez les patientes présentant une laxité cutanée modérée, notamment lorsqu’elle est associée à une liposuccion.',
      'Chaque traitement est personnalisé en fonction de la zone concernée, de la quantité de graisse présente, de la qualité de la peau et du degré de laxité afin d’obtenir un résultat harmonieux, naturel et proportionné.',
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
