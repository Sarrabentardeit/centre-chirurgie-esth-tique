export const ANTECEDENTS_MEDICAUX = [
  'Diabète',
  'Tension artérielle',
  'Maladie cardiaque',
  'Problèmes de coagulation',
  'Troubles thyroïdiens',
  'Asthme',
  'Épilepsie',
  'Dépression / Anxiété',
] as const

export const GROUPES_SANGUINS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const

export const INTERVENTION_CATEGORIES = [
  {
    key: 'visage',
    title: 'Chirurgie du Visage',
    items: [
      'Blépharoplastie des Paupières Supérieures',
      'Blépharoplastie des paupières inférieures',
      'Lifting CervicoFacial (Deep Plane Face Lift)',
      'NANOFAT Lipofilling du Visage (Comblement avec graisse)',
      'Liposuccion du Menton',
      'Traitement de la boule de bichât',
      'Lifting du Sourcil (Fox Eyes)',
      'Lifting de la Lèvre Supérieure (Lip Lift)',
      'Traitement des oreilles décollées',
      'Rhinoplastie (Chirurgie du Nez)',
      'Autres (visage à préciser)',
    ],
  },
  {
    key: 'seins',
    title: 'Chirurgie Mammaire',
    items: [
      'Augmentation Mammaire par Prothèses',
      'Augmentation Mammaire Hybride (Prothèses + Lipofilling)',
      'Lifting Mammaire sans prothèses',
      'Lifting Mammaire avec Pose de Prothèses',
      'Réduction Mammaire',
      'Changement de Prothèses Mammaires',
      'Retrait de Prothèses Mammaires',
      'Autres (mammaire à préciser)',
    ],
  },
  {
    key: 'silhouette',
    title: 'Chirurgie de la Silhouette',
    items: [
      'Lipoaspiration Haute Définition VASER - Cou',
      'Lipoaspiration Haute Définition VASER - Bras',
      'Lipoaspiration Haute Définition VASER - Dos',
      'Lipoaspiration Haute Définition VASER - Flancs',
      'Lipoaspiration Haute Définition VASER - Ventre',
      'Lipoaspiration Haute Définition VASER - 360° (ventre, flancs et dos)',
      'Lipoaspiration Haute Définition VASER - Cuisses Antérieures',
      'Lipoaspiration Haute Définition VASER - Cuisses Intérieures',
      'Lipoaspiration Haute Définition VASER - Cuisses Postérieures',
      'Lipoaspiration Haute Définition VASER - Culotte de Cheval',
      'Lipoaspiration Haute Définition VASER - Genoux',
      'Lipoaspiration Haute Définition VASER - Mollets',
      'Lipoaspiration Haute Définition VASER - Chevilles',
      'Traitement du Lipœdème',
      'Lifting des Bras',
      "Abdominoplastie (Lifting de l'abdomen)",
      'Body Lift (Abdominoplastie Circulaire : ventre et dos)',
      'Lifting des Cuisses',
      'Lipofilling du Postérieur (Brazilian Butt Lift)',
      'Traitement du relâchement cutané (faible à modéré) par JPlasma',
      'Autres (silhouette à préciser)',
    ],
  },
] as const

export const MOIS_PERIODE = [
  { value: '01', label: 'Janvier' },
  { value: '02', label: 'Février' },
  { value: '03', label: 'Mars' },
  { value: '04', label: 'Avril' },
  { value: '05', label: 'Mai' },
  { value: '06', label: 'Juin' },
  { value: '07', label: 'Juillet' },
  { value: '08', label: 'Août' },
  { value: '09', label: 'Septembre' },
  { value: '10', label: 'Octobre' },
  { value: '11', label: 'Novembre' },
  { value: '12', label: 'Décembre' },
] as const

export function buildPeriodeSouhaitee(mois: string, annee: string): string {
  const row = MOIS_PERIODE.find((x) => x.value === mois)
  if (!row || !annee.trim()) return ''
  return `${row.label} ${annee.trim()}`
}

export function parsePeriodeSouhaitee(s: string | undefined): { mois: string; annee: string } {
  if (!s?.trim()) return { mois: '', annee: '' }
  const t = s.trim()
  const iso = t.match(/^(\d{4})-(\d{2})$/)
  if (iso) return { annee: iso[1], mois: iso[2] }
  const isoDay = t.match(/^(\d{4})-(\d{2})-\d{2}$/)
  if (isoDay) return { annee: isoDay[1], mois: isoDay[2] }
  for (const { value, label } of MOIS_PERIODE) {
    const re = new RegExp(`^${label}\\s+(\\d{4})$`, 'i')
    const m = t.match(re)
    if (m) return { mois: value, annee: m[1] }
  }
  return { mois: '', annee: '' }
}
