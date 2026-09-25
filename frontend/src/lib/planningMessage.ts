/** Message d’accompagnement du planning, prérempli avant envoi. */
export function buildPlanningChatMessage(input: {
  patientFullName: string
  dateArrivee?: string | null
  transport?: string | null
}): string {
  const prenom = input.patientFullName.trim().split(/\s+/)[0] || 'Madame'
  const chauffeur = input.transport?.trim().split(/\s+/)[0] || 'Naceur'
  let closing = 'Bons préparatifs et à bientôt.'
  if (input.dateArrivee?.trim()) {
    const d = new Date(input.dateArrivee)
    if (!Number.isNaN(d.getTime())) {
      const label = new Intl.DateTimeFormat('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Africa/Tunis',
      }).format(d)
      closing = `Bons préparatifs et à ${label}.`
    }
  }

  return [
    `Bonjour Madame ${prenom},`,
    '',
    `J'espère que vous allez bien et que vous continuez à suivre votre traitement pré chirurgical.`,
    '',
    `Je vous invite à trouver en pièce jointe le détail de votre planning médical avec le cabinet du Dr CHENNOUFI.`,
    '',
    `Votre chauffeur, ${chauffeur}, prendra contact avec vous la veille pour se présenter à vous et vous préciser le lieu de rencontre à la sortie de douane.`,
    '',
    `Au plaisir de vous accueillir, je reste à votre entière disposition en cas de besoin.`,
    '',
    closing,
    '',
    `Bien à vous`,
    '',
    `N.B : Prévoir vos bilans sanguins et autres examens médicaux en version papier pour le dossier de la clinique ainsi que vos bas de contention pour le retour en avion.`,
    '',
    `Houda Chennoufi`,
    `Conciergerie & coordination patients`,
    `Cabinet du Dr Mehdi Chennoufi`,
    `Chirurgie Esthétique, Plastique et Réparatrice`,
    `SCULPTURE, SMOOTH & SMILE`,
  ].join('\n')
}
