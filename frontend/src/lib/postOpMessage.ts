/** Message de retour à la maison, prérempli avant envoi (modifiable). */
export function buildPostOpRetourMessage(patientFullName: string): string {
  const prenom = patientFullName.trim().split(/\s+/)[0] || 'Madame'
  return [
    `Bonjour Madame ${prenom},`,
    '',
    `Nous espérons que votre retour à la maison s'est bien passé et que vous vous reposez bien.`,
    '',
    `Depuis votre espace patiente, rubrique « Suivi post-opératoire », vous pouvez dès maintenant :`,
    `- nous envoyer vos photos post-opératoires ;`,
    `- nous poser toutes vos questions ou vos demandes : l'équipe du Dr CHENNOUFI vous répondra directement dans cette même rubrique ;`,
    `- demander votre compte rendu opératoire si vous le souhaitez.`,
    '',
    `N'hésitez pas à nous solliciter au moindre doute.`,
    '',
    `Bien à vous,`,
    `Cabinet du Dr Mehdi Chennoufi`,
    `Chirurgie Esthétique, Plastique et Réparatrice`,
  ].join('\n')
}
