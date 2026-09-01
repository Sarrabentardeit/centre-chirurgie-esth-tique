import { formatIsoDateFrLong, formatIsoDateTimeFrLong, formatMcReferenceWithVersion, getDevisDisplayNumber } from '@/lib/utils'

export const CONFIRMATION_RESERVATION_FALLBACK = `Chère Madame {prenom},

Au nom du Dr CHENNOUFI, je vous remercie encore de la confiance accordée et vous confirme la disponibilité du chirurgien pour votre séjour médical en Tunisie selon les dates suivantes :

•	Arrivée à l'aéroport Tunis Carthage : {dateArrivee}
•	Intervention chirurgicale ({intervention}) : {dateIntervention}
•	Retour en {paysRetour} : {dateDepart}

Je vous invite par ailleurs à réexaminer et mettre en place dès le {dateDebutPreop} le traitement préventif préopératoire indiqué par votre chirurgien dans votre devis N° {numeroDevis} validé ci-dessus et à nous envoyer vos résultats d'examens médicaux ({examensMedicaux}) d'ici le {dateLimiteExamens} comme mentionné dans ce même devis.

D'ici là, je vous rappelle qu'il vous faudra prévoir des bas de contention pour votre retour en avion et commencer à réserver vos séances de drainage lymphatique au retour.

Pour ma part, je vous rappelle que je reste à votre disposition pour de plus amples renseignements et prépare minutieusement votre arrivée. Votre planning de séjour détaillé vous sera envoyé à J-4 de votre arrivée.

Bien cordialement,
Houda Chennoufi
Conciergerie & coordination patients
Cabinet du Dr Mehdi Chennoufi
Chirurgie Esthétique, Plastique et Réparatrice
SCULPTURE, SMOOTH & SMILE`

export type ConfirmationReservationContext = {
  fullName: string
  dossierNumber?: string | null
  paysRetour?: string | null
  numeroDevis?: string | null
  intervention?: string | null
  examensMedicaux?: string | null
  dateArrivee?: string | null
  dateDepart?: string | null
  dateIntervention?: string | null
}

export type AcceptedDevisConfirmationSource = {
  numeroDevis?: string | null
  version?: number
  dossierNumber?: string | null
  rapport?: {
    interventionsRecommandees?: string[]
    examensDemandes?: string[]
  } | null
}

const EXAMEN_AUTRE_PREFIX = 'Autre:'

function normalizeExamenLabel(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  if (t.startsWith(EXAMEN_AUTRE_PREFIX)) {
    const detail = t.slice(EXAMEN_AUTRE_PREFIX.length).trim()
    return detail || 'Autre'
  }
  return t
}

/** Liste d’examens pour le message (depuis le rapport du devis accepté). */
export function formatExamensMedicauxConfirmation(examens?: string[] | null): string {
  const labels = (examens ?? []).map(normalizeExamenLabel).filter(Boolean)
  if (labels.length === 0) return 'bilan sanguin'
  return labels.join(', ')
}

/** Numéro MC + lettre de version, interventions et examens depuis le devis accepté. */
export function buildAcceptedDevisConfirmationFields(
  accepted: AcceptedDevisConfirmationSource | null | undefined,
): Pick<ConfirmationReservationContext, 'numeroDevis' | 'intervention' | 'examensMedicaux'> {
  if (!accepted) {
    return { numeroDevis: null, intervention: null, examensMedicaux: null }
  }
  const baseNum = getDevisDisplayNumber(
    { numeroDevis: accepted.numeroDevis },
    accepted.dossierNumber,
  )
  const numeroDevis =
    baseNum && accepted.version != null && accepted.version >= 1
      ? formatMcReferenceWithVersion(baseNum, accepted.version)
      : baseNum || null
  const intervention =
    accepted.rapport?.interventionsRecommandees?.filter(Boolean).join(' et ') || null
  const examensMedicaux = formatExamensMedicauxConfirmation(accepted.rapport?.examensDemandes)
  return { numeroDevis, intervention, examensMedicaux }
}

function isoDatePart(iso: string): string {
  return iso.trim().slice(0, 10)
}

function isoAddDays(iso: string, deltaDays: number): string | null {
  const m = isoDatePart(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  d.setDate(d.getDate() + deltaDays)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

export function applyConfirmationReservationVars(
  content: string,
  ctx: ConfirmationReservationContext,
): string {
  const fullName = ctx.fullName.trim()
  const parts = fullName.split(/\s+/)
  const prenom = parts[0] ?? ''
  const nom = parts.slice(1).join(' ')
  const dateDebutPreop = ctx.dateIntervention
    ? formatIsoDateFrLong(isoAddDays(ctx.dateIntervention, -15))
    : '—'
  const dateLimiteExamens = ctx.dateIntervention
    ? formatIsoDateFrLong(isoAddDays(ctx.dateIntervention, 10))
    : '—'
  const intervention = ctx.intervention?.trim() || 'intervention prévue'
  const examensMedicaux = ctx.examensMedicaux?.trim() || 'bilan sanguin'
  const paysRetour = ctx.paysRetour?.trim() || 'France'
  const numeroDevis = ctx.numeroDevis?.trim() || '—'

  const normalized = content
    .replace(/15 jours avant votre intervention/gi, `dès le ${dateDebutPreop}`)
    .replace(/dès le \{dateLimiteExamens\}/g, 'dès le {dateDebutPreop}')
    .replace(/\(bilan sanguin\)/gi, `(${examensMedicaux})`)

  return normalized
    .split('{fullName}').join(fullName)
    .split('{prenom}').join(prenom)
    .split('{nom}').join(nom)
    .split('{dossier}').join(ctx.dossierNumber?.trim() ?? '')
    .split('{dateArrivee}').join(formatIsoDateTimeFrLong(ctx.dateArrivee))
    .split('{dateDepart}').join(formatIsoDateTimeFrLong(ctx.dateDepart))
    .split('{dateIntervention}').join(formatIsoDateTimeFrLong(ctx.dateIntervention))
    .split('{dateDebutPreop}').join(dateDebutPreop)
    .split('{dateLimiteExamens}').join(dateLimiteExamens)
    .split('{intervention}').join(intervention)
    .split('{examensMedicaux}').join(examensMedicaux)
    .split('{paysRetour}').join(paysRetour)
    .split('{numeroDevis}').join(numeroDevis)
}
