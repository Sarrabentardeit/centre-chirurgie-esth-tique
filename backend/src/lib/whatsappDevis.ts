import { env } from '../config/env.js'
import { formatMcReferenceWithVersion } from './devisNumber.js'

const PROD_APP_URL = 'https://chennoufi.nav.ovh'

function isLocalUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '0.0.0.0'
  } catch {
    return true
  }
}

export function publicAppBaseUrl(): string {
  // En local : toujours le backend local, sinon le lien WhatsApp ouvre le site en ligne (route absente).
  if (env.NODE_ENV !== 'production') {
    return `http://localhost:${env.PORT}`
  }
  const candidates = [env.PUBLIC_APP_URL, env.FRONTEND_URL, PROD_APP_URL]
  for (const raw of candidates) {
    if (!raw?.trim()) continue
    const base = raw.trim().replace(/\/$/, '')
    if (!isLocalUrl(base)) return base
  }
  return PROD_APP_URL
}

/** Transforme une URL d’upload interne en lien public cliquable (WhatsApp / mobile). */
export function toPublicUploadUrl(storedUrl: string | null | undefined): string | null {
  if (!storedUrl?.trim()) return null
  const match = storedUrl.trim().match(/\/uploads\/([^/?#]+)/i)
  const filename = match?.[1]
  if (!filename) return null
  return `${publicAppBaseUrl()}/uploads/${filename}`
}

export function toWhatsAppDigits(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length < 8 || digits.length > 15) return null
  return digits
}

function splitFullName(fullName: string): { prenom: string; nom: string } {
  const parts = fullName.trim().split(/\s+/)
  const prenom = parts[0] || 'Madame'
  const nom = parts.slice(1).join(' ')
  return { prenom, nom }
}

export function buildDevisWhatsAppMessage(input: {
  patientFullName: string
  numeroDevis: string | null | undefined
  dossierNumber: string
  version: number
  pdfUrl: string | null
}): string {
  const { prenom, nom } = splitFullName(input.patientFullName)
  const salutation = nom ? `${prenom} ${nom}` : prenom

  const lines = [
    `Bonjour ${salutation},`,
    '',
    `Nous vous remercions chaleureusement pour l'intérêt et la confiance que vous accordez au cabinet du Dr CHENNOUFI.`,
    '',
    `Après étude attentive de vos photographies ainsi que de votre dossier médical, nous avons le plaisir de vous transmettre, en pièce jointe, notre meilleure offre pour l'organisation de votre séjour médical.`,
  ]

  if (input.pdfUrl) {
    lines.push('', 'Consulter votre devis :', input.pdfUrl)
  }

  lines.push(
    '',
    `Je vous en souhaite bonne réception et reste bien entendu à votre entière disposition pour toute question, précision complémentaire ou pour vous accompagner dans l'organisation de votre prise en charge médicale.`,
    '',
    `Merci de bien vouloir nous contacter durant les horaires de travail : Mardi, Mercredi & Jeudi de 09 à 15h (heure locale)`,
    '',
    `Je vous souhaite une excellente journée.`,
    '',
    `Bien cordialement,`,
    `Houda CHENNOUFI`,
    `Conciergerie & Coordination Patients`,
    `Cabinet du Dr Mehdi Chennoufi`,
    `Chirurgie Esthétique, Plastique et Réparatrice`,
    `SCULPTURE, SMOOTH & SMILE`,
  )

  return lines.join('\n')
}

export function buildWhatsAppClickToChatUrl(digits: string, text: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export type DevisWhatsAppPayload = {
  hasPhone: boolean
  phone: string | null
  pdfUrl: string | null
  whatsappUrl: string | null
  patientName: string
  numeroDevis: string
}

export function buildDevisWhatsAppPayload(input: {
  phone: string | null
  patientFullName: string
  numeroDevis: string | null | undefined
  dossierNumber: string
  version: number
  storedPdfUrl: string | null
  /** Lien public /api/public/... (WhatsApp). Prioritaire sur l’URL /uploads. */
  publicPdfUrl?: string | null
}): DevisWhatsAppPayload {
  const pdfUrl = input.publicPdfUrl || toPublicUploadUrl(input.storedPdfUrl)
  const numeroDevis = formatMcReferenceWithVersion(
    input.numeroDevis?.trim() || input.dossierNumber,
    input.version,
  )
  const digits = toWhatsAppDigits(input.phone)
  const message = buildDevisWhatsAppMessage({
    patientFullName: input.patientFullName,
    numeroDevis: input.numeroDevis,
    dossierNumber: input.dossierNumber,
    version: input.version,
    pdfUrl,
  })
  return {
    hasPhone: Boolean(digits),
    phone: input.phone,
    pdfUrl,
    whatsappUrl: digits ? buildWhatsAppClickToChatUrl(digits, message) : null,
    patientName: input.patientFullName,
    numeroDevis,
  }
}
