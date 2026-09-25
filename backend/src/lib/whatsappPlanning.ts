import { buildWhatsAppClickToChatUrl, toWhatsAppDigits } from './whatsappDevis.js'

function formatDateFr(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Tunis',
  }).format(d)
}

function chauffeurPrenom(transport: string | null | undefined): string {
  const first = transport?.trim().split(/\s+/)[0]
  return first || 'Naceur'
}

function prenomFromFullName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || 'Madame'
}

/** Message d’accompagnement du planning finalisé (chat + WhatsApp). */
export function buildPlanningAccompagnementMessage(input: {
  patientFullName: string
  dateArrivee?: string | null
  transport?: string | null
  pdfUrl?: string | null
}): string {
  const prenom = prenomFromFullName(input.patientFullName)
  const chauffeur = chauffeurPrenom(input.transport)
  const arrivee = formatDateFr(input.dateArrivee)
  const closing = arrivee ? `Bons préparatifs et à ${arrivee}.` : 'Bons préparatifs et à bientôt.'

  const lines = [
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
  ]

  if (input.pdfUrl) {
    lines.push('', 'Consulter votre planning :', input.pdfUrl)
  }

  return lines.join('\n')
}

export function buildPlanningWhatsAppUrl(input: {
  phone: string | null
  patientFullName: string
  dateArrivee?: string | null
  transport?: string | null
  pdfUrl: string
}): string | null {
  const digits = toWhatsAppDigits(input.phone)
  if (!digits) return null
  const message = buildPlanningAccompagnementMessage({
    patientFullName: input.patientFullName,
    dateArrivee: input.dateArrivee,
    transport: input.transport,
    pdfUrl: input.pdfUrl,
  })
  return buildWhatsAppClickToChatUrl(digits, message)
}
