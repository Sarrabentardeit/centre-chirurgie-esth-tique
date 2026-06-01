/**
 * Modèle « Planning Séjour » — design fidèle au Word
 * docs/Planning Séjour SEGONNE Laurine (Mai 26).docx
 */
import type { GestionnairePatientDetail } from '@/lib/api'
import { parseSejourMeta } from '@/lib/devisSejourNotes'
import { DEFAULT_TND_PER_EUR } from '@/lib/moneyWords'
import { getDevisDisplayNumber } from '@/lib/utils'
import {
  footerImageHtml,
  gray,
  headerLogoHtml,
  paraContact,
  paraDay,
  paraGold,
  paraGray,
  paraMixed,
  paraName,
  paraSalmonHi,
  paraTitle,
  salmon,
  salmonHi,
} from '@/lib/planningSejourBranding'

export interface PlanningLogistiqueHint {
  dateArrivee?: string | null
  dateDepart?: string | null
  hebergement?: string | null
  transport?: string | null
  accompagnateur?: string | null
}

export interface BuildPlanningSejourOptions {
  tndPerEur?: number
}

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
] as const

const CONTACTS = {
  conseillere: 'Houda +216 94 760 917',
  chauffeurTel: '+216 55 73 60 90',
  kine: 'Rabeb +216 29 999 821',
  infirmiere: 'Safia +216 22 897 156',
  cabinet: '+216 27 626 300',
} as const

function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String).filter(Boolean) : []
}

function pickDevis(p: GestionnairePatientDetail) {
  return (
    p.devis?.find((d) => d.statut === 'accepte')
    ?? p.devis?.find((d) => d.statut === 'envoye')
    ?? p.devis?.find((d) => d.statut === 'brouillon')
    ?? null
  )
}

function devisTotalDt(p: GestionnairePatientDetail): number {
  const dv = pickDevis(p)
  if (!dv) return 0
  if (dv.total > 0) return dv.total
  return (dv.lignes ?? []).reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)
}

function fmtPlanningAmount(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function parseIsoDate(s?: string | null): Date | null {
  if (!s?.trim()) return null
  const d = new Date(s.includes('T') ? s : `${s}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function formatPlanningDay(d: Date | null, fallback = 'À confirmer'): string {
  if (!d) return fallback
  return `${d.getDate()} ${MOIS_FR[d.getMonth()] ?? ''} ${d.getFullYear()}`
}

export function moisLabelFromDate(d?: Date | null): string {
  const date = d ?? new Date()
  const m = MOIS_FR[date.getMonth()]?.slice(0, 4) ?? 'Mai'
  return `${m} ${String(date.getFullYear()).slice(-2)}`
}

function civiliteNom(fullName: string): string {
  const n = fullName.trim()
  if (!n) return 'Patiente'
  if (/^(m\.|mme|mlle|madame|monsieur)\s/i.test(n)) return n
  return `Mme ${n}`
}

function interventionLabel(p: GestionnairePatientDetail): string {
  const rap = p.rapports?.[0]
  const fromRap = (rap?.interventionsRecommandees ?? []).filter(Boolean).join(' + ')
  if (fromRap) return fromRap
  const dv = pickDevis(p)
  const ligne = dv?.lignes?.find((l) => l.description?.trim())?.description?.trim()
  if (ligne) return ligne
  const pay = (p.formulaires?.[0]?.payload ?? {}) as Record<string, unknown>
  return arr(pay.interventionsSouhaitees).join(' + ') || arr(pay.typeIntervention).join(', ') || '—'
}

const HOTEL_A_PRECISER = '(hôtel à préciser dans le devis)'
const CLINIQUE_A_PRECISER = '(à préciser dans le devis)'

function hotelLabel(p: GestionnairePatientDetail, log?: PlanningLogistiqueHint | null): string {
  if (log?.hebergement?.trim()) return log.hebergement.trim()
  const sej = parseSejourMeta(pickDevis(p)?.notesSejour)
  return sej.hotelNom.trim() || HOTEL_A_PRECISER
}

function cliniqueLabel(p: GestionnairePatientDetail): string {
  const sej = parseSejourMeta(pickDevis(p)?.notesSejour)
  const raw = sej.cliniqueNom.trim()
  if (!raw) return CLINIQUE_A_PRECISER
  return raw.replace(/^clinique\s+/i, '').trim()
}

function splitClinique(full: string): { nom: string; reste: string } {
  const parts = full.split(/\s+/)
  return { nom: parts[0] ?? full, reste: parts.slice(1).join(' ') }
}

function chauffeurPrenom(log?: PlanningLogistiqueHint | null): string {
  const t = log?.transport?.trim()
  if (!t) return 'Abdelaziz'
  return t.split(/\s+/)[0] || 'Abdelaziz'
}

function wifiClinique(clinique: string): string {
  if (/didon/i.test(clinique)) return 'Didon@@//2026.'
  if (/amen/i.test(clinique)) return 'Amen@@//2026.'
  return '…'
}

export function buildPlanningSejourHtml(
  patient: GestionnairePatientDetail,
  log?: PlanningLogistiqueHint | null,
  opts?: BuildPlanningSejourOptions,
): string {
  const dv = pickDevis(patient)
  const dossierRef = getDevisDisplayNumber(dv, patient.dossierNumber) || patient.dossierNumber
  const intervention = interventionLabel(patient)
  const suffix = log?.accompagnateur?.trim() || 'Double'
  const nomLine = `${civiliteNom(patient.user.fullName)} (${suffix})`

  const d0 = parseIsoDate(log?.dateArrivee)
  const d1 = d0 ? addDays(d0, 1) : null
  const d2 = d0 ? addDays(d0, 2) : null
  const d3 = d0 ? addDays(d0, 3) : null
  const d4 = d0 ? addDays(d0, 4) : null
  const d5 = d0 ? addDays(d0, 5) : null
  const d6 = d0 ? addDays(d0, 6) : null
  const dDepart = parseIsoDate(log?.dateDepart) ?? (d0 ? addDays(d0, 7) : null)

  const cliniqueFull = cliniqueLabel(patient)
  const cliniquePlaceholder = cliniqueFull.startsWith('(')
  const { nom: cliniqueNom, reste: cliniqueReste } = splitClinique(cliniqueFull)
  const hotel = hotelLabel(patient, log)
  const chauffeur = chauffeurPrenom(log)

  const tndPerEur = opts?.tndPerEur && opts.tndPerEur > 0 ? opts.tndPerEur : DEFAULT_TND_PER_EUR
  const totalDt = devisTotalDt(patient)
  const totalEur = totalDt > 0 ? totalDt / tndPerEur : 0
  const dtTxt = totalDt > 0 ? `${fmtPlanningAmount(totalDt)}dt` : '…dt'
  const eurTxt = totalEur > 0 ? `${fmtPlanningAmount(totalEur)}€` : '…€'

  const f = (d: Date | null) => formatPlanningDay(d)

  const chunks: string[] = [
    headerLogoHtml(),

    paraTitle('Planning de votre séjour médical en Tunisie'),
    paraName(nomLine),
    paraTitle(intervention),
    paraTitle(`(${dossierRef})`),

    paraDay(`Jour d’arrivée : ${f(d0)}`),
    paraMixed(
      gray(`Arrivée à l’aéroport Tunis Carthage 11h35 `),
      salmonHi(`(RDV avec votre chauffeur ${chauffeur}* devant les stands agences à la sortie de douane à droite)`),
    ),
    paraSalmonHi(`Change avec votre chauffeur pour ${dtTxt} soit à peu près l’équivalent de ${eurTxt} puis encaissement de la totalité de la somme.`),
    paraSalmonHi('Poches de sang à payer en sus en fonction du besoin postopératoire.'),
    cliniquePlaceholder
      ? paraMixed(
          gray(`Transfert à la clinique ${cliniqueFull} Check in clinique et admission `),
          salmonHi('(prévoyez vos bilans sanguins et échographie mammaire en version papier pour le dossier de la clinique)'),
        )
      : paraMixed(
          gray('Transfert à la '),
          salmon(`clinique ${cliniqueNom}`),
          gray(`${cliniqueReste ? ` ${cliniqueReste}` : ''} Check in clinique et admission `),
          salmonHi('(prévoyez vos bilans sanguins et échographie mammaire en version papier pour le dossier de la clinique)'),
        ),
    paraGray('Examen avec l’anesthésiste 14h00-16h00'),

    paraDay(`Jour d’intervention : ${f(d1)}`),
    paraGray('Visite chirurgien : Consultation préopératoire 07h30'),
    paraGray('Passage au bloc vers 08h30'),
    paraGray('Réveil 13h00 -16h00'),
    paraGray('Soins infirmier et remise ordonnance et vêtement de contention'),

    paraDay(`Jour de convalescence : ${f(d2)}`),
    paraGray('Visite du personnel médical et soins infirmiers'),

    paraDay(`Jour de transfert à l’hôtel : ${f(d3)}`),
    paraGold('Séance 1 Drainage à 10h00'),
    paraGray('Visite du chirurgien et autorisation de sortie'),
    paraGray('Check out clinique 12h00'),
    paraMixed(gray('Transfert à l’'), salmon(`hôtel ${hotel}`)),

    paraDay(`Jour 2 à l’hôtel : ${f(d4)}`),
    paraGray('Passage infirmière pour soins médicaux'),

    paraDay(`Jour 3 à l’hôtel : ${f(d5)}`),
    paraGray('Passage infirmière pour soins médicaux'),
    paraGold('Séance 2 drainage (horaire à confirmer)'),
    paraGray('Examen de contrôle au cabinet du chirurgien ou clinique (horaire et lieu à confirmer)'),

    paraDay(`Jour 4 à l’hôtel : ${f(d6)}`),
    paraGold('Séance 3 drainage (horaire à confirmer)'),
    paraGray('Passage infirmière pour soins médicaux'),

    paraDay(`Jour de Départ : ${f(dDepart)}`),
    paraSalmonHi('N’oubliez pas de mettre vos bas de contention pour toute la durée du vol'),
    paraGray('Check out Hôtel 04h15'),
    paraGray('Transfert à l’aéroport à 04h30'),
    paraGray('Départ 06h45'),

    paraContact(`Wifi Clinique : ${wifiClinique(cliniqueFull)}`),
    paraContact('Liste des contacts utiles pour votre séjour :'),
    paraContact(`Votre conseillère médicale : ${CONTACTS.conseillere}`),
    paraContact(`Votre Chauffeur : ${chauffeur} ${CONTACTS.chauffeurTel}`),
    paraContact(`Votre Kinésithérapeute : ${CONTACTS.kine}`),
    paraContact(`Votre infirmière : ${CONTACTS.infirmiere}`),
    paraContact(`Cabinet : ${CONTACTS.cabinet}`),

    footerImageHtml(),
  ]

  return `<div class="planning-doc">\n${chunks.join('\n')}\n</div>`
}
