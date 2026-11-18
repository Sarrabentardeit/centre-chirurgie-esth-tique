/**
 * Modèle « Planning Séjour » — aligné sur
 * docs/Planning Séjour Type séjour.docx / .pdf
 *
 * Les valeurs dynamiques sont des « liens » HTML :
 *   <span data-planning-field="prenom">…</span>
 * → mis à jour depuis identité / logistique / devis via refreshPlanningLinkedFields.
 *
 * Incrémenter PLANNING_TEMPLATE_VERSION (branding) pour forcer la régénération
 * automatique des anciens documents (sans clic « Réinitialiser »).
 */
import type { GestionnairePatientDetail } from '@/lib/api'
import { parseSejourMeta } from '@/lib/devisSejourNotes'
import { resolveDrainageNb, resolveInclutIds } from '@/lib/devisOfferInclus'
import { DEFAULT_TND_PER_EUR } from '@/lib/moneyWords'
import { formatMcReferenceWithVersion, getDevisDisplayNumber } from '@/lib/utils'
import {
  consignesBoxHtml,
  footerImageHtml,
  gray,
  headerLogoHtml,
  paraConsignesTitle,
  paraContact,
  paraGold,
  paraGray,
  paraMixed,
  paraRed,
  paraSalmonHi,
  salmon,
  salmonHi,
  salmonHiHtml,
  PLANNING_DOC,
  PLANNING_TEMPLATE_VERSION,
} from '@/lib/planningSejourBranding'

export { PLANNING_TEMPLATE_VERSION }

export function getPlanningTemplateVersion(html: string): number {
  const m = /data-planning-template=["']?(\d+)/i.exec(html)
  if (m) return Number.parseInt(m[1], 10) || 0
  return 0
}

export function needsPlanningTemplateUpgrade(html: string): boolean {
  return getPlanningTemplateVersion(html) < PLANNING_TEMPLATE_VERSION
}

export function stampPlanningTemplateVersion(html: string): string {
  const body = html.trim()
  if (!body) return body
  if (/class=["'][^"']*\bplanning-doc\b/i.test(body)) {
    if (/data-planning-template=/i.test(body)) {
      return body.replace(
        /data-planning-template=(["']?)\d+\1/i,
        `data-planning-template="${PLANNING_TEMPLATE_VERSION}"`,
      )
    }
    return body.replace(
      /(<div\b[^>]*\bclass=["'][^"']*\bplanning-doc\b[^"']*["'][^>]*)(>)/i,
      `$1 data-planning-template="${PLANNING_TEMPLATE_VERSION}"$2`,
    )
  }
  return `<div class="planning-doc" data-planning-template="${PLANNING_TEMPLATE_VERSION}">\n${body}\n</div>`
}

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

/** Clés des champs liés dans le HTML planning. */
export type PlanningFieldKey =
  | 'civilite'
  | 'prenom'
  | 'nom'
  | 'nom_complet'
  | 'chambre'
  | 'dossier'
  | 'date_arrivee'
  | 'heure_arrivee'
  | 'date_depart'
  | 'heure_depart'
  | 'montant_dt'
  | 'montant_eur'
  | 'duree_sejour'
  | 'intervention'
  | 'chauffeur'

const C = PLANNING_DOC

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
] as const

const CONTACTS = {
  conseillere: 'Houda +216 54 776 796 / +216 94 760 917',
  chauffeurTel: '+216 99 219 022',
  kine: 'Rabeb +216 29 999 821',
  infirmiere: 'Safia +216 22 897 156',
  cabinet: '+216 27 626 300',
} as const

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Lien / champ dynamique (valeur remplie depuis le dossier). */
export function planningField(key: PlanningFieldKey, value: string): string {
  return `<span data-planning-field="${escAttr(key)}">${escText(value)}</span>`
}

/** Titre rose souligné centré 12pt. */
function pTitleHtml(innerHtml: string): string {
  return `<p style="text-align:center;font-size:${C.titleSize};line-height:${C.lineHeight};margin:0 0 ${C.paraAfter}"><strong><u><span style="color:${C.pink}">${innerHtml}</span></u></strong></p>`
}

/** Nom patient rose + surlignage. */
function pNameHtml(innerHtml: string): string {
  return `<p style="text-align:center;font-size:${C.titleSize};line-height:${C.lineHeight};margin:0 0 ${C.paraAfter}"><strong><u><mark data-color="${C.hiLight}" style="background-color:${C.hiLight}"><span style="color:${C.pink}">${innerHtml}</span></mark></u></strong></p>`
}

/** Intervention / dossier — saumon gras centré, interligne simple. */
function pSalmonCenterHtml(innerHtml: string): string {
  return `<p style="text-align:center;line-height:1;margin:0"><strong><span style="color:${C.salmon}">${innerHtml}</span></strong></p>`
}

function pDayHtml(innerHtml: string): string {
  return `<p style="line-height:${C.lineHeight};margin:0 0 ${C.paraAfter}"><strong><u><span style="color:${C.gray}">${innerHtml}</span></u></strong></p>`
}

/** Bandeau contacts (HTML dynamique). */
function pContactHtml(innerHtml: string): string {
  return `<p style="text-align:center;font-size:${C.titleSize};line-height:${C.lineHeight};margin:0 0 ${C.paraAfter}"><mark data-color="${C.hiDark}" style="background-color:${C.hiDark}"><span style="color:${C.contactText}">${innerHtml}</span></mark></p>`
}

function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String).filter(Boolean) : []
}

function pickDevis(p: GestionnairePatientDetail) {
  const list = p.devis ?? []
  return (
    list.find((d) => d.statut === 'accepte')
    ?? list.find((d) => d.statut === 'envoye')
    ?? list.find((d) => d.statut === 'brouillon')
    ?? null
  )
}

/** Numéro affiché : devis accepté, avec sa lettre de version (ex. MC-09-004B-2026). */
export function acceptedDevisPlanningRef(patient: GestionnairePatientDetail): string {
  const dv = pickDevis(patient)
  const base = getDevisDisplayNumber(dv, patient.dossierNumber) || patient.dossierNumber
  const version =
    dv?.version != null && Number.isFinite(dv.version) && dv.version >= 1
      ? Math.floor(dv.version)
      : 1
  return formatMcReferenceWithVersion(base, version) || base
}

/** Remplace la référence (MC-…) déjà figée dans un planning enregistré. */
export function refreshPlanningDevisRef(html: string, ref: string): string {
  if (!html.trim() || !ref.trim()) return html
  return html.replace(/\(MC-\d{2}-\d{3}[A-Z]?-\d{4}\)/g, `(${ref})`)
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
  const dayNum = d.getDate()
  const dayLabel = dayNum === 1 ? '1er' : String(dayNum)
  return `${dayLabel} ${MOIS_FR[d.getMonth()] ?? ''} ${d.getFullYear()}`
}

export function moisLabelFromDate(d?: Date | null): string {
  const date = d ?? new Date()
  const m = MOIS_FR[date.getMonth()]?.slice(0, 4) ?? 'Mai'
  return `${m} ${String(date.getFullYear()).slice(-2)}`
}

function formatHmFr(d: Date | null, fallback: string): string {
  if (!d) return fallback
  const h = d.getHours()
  const m = d.getMinutes()
  if (h === 0 && m === 0) return fallback
  return `${h}h${String(m).padStart(2, '0')}`
}

/** Découpe « Prénom … Nom » (dernier mot = nom). */
export function splitPatientName(fullName: string): { prenom: string; nom: string } {
  const parts = fullName
    .trim()
    .replace(/^(mme|mlle|m\.|madame|monsieur)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return { prenom: '', nom: '' }
  if (parts.length === 1) return { prenom: parts[0], nom: '' }
  return { prenom: parts.slice(0, -1).join(' '), nom: parts[parts.length - 1] }
}

/** Single / Double depuis logistique.accompagnateur (ou défaut Double). */
export function resolveChambreType(accompagnateur?: string | null): string {
  const raw = (accompagnateur ?? '').trim()
  if (/single/i.test(raw)) return 'Single'
  if (/double/i.test(raw)) return 'Double'
  return 'Double'
}

function sejourDureeLabel(arrivee: Date | null, depart: Date | null): string {
  if (!arrivee || !depart) return 'À confirmer'
  const ms = depart.getTime() - arrivee.getTime()
  const days = Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)))
  const nights = Math.max(0, days - 1)
  if (nights <= 0) return `${days} jour${days > 1 ? 's' : ''}`
  return `${days} jours / ${nights} nuit${nights > 1 ? 's' : ''}`
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
  if (!t) return 'Naceur'
  return t.split(/\s+/)[0] || 'Naceur'
}

function wifiClinique(clinique: string): string {
  if (/didon/i.test(clinique)) return 'Didon@@//2026.'
  if (/amen/i.test(clinique)) return 'Amen@@//2026.'
  return '…'
}

function planningOffer(p: GestionnairePatientDetail): {
  includeHotel: boolean
  drainageNb: number
  includeNurseHotel: boolean
} {
  const dv = pickDevis(p)
  const notes = dv?.notesSejour ?? ''
  const sej = parseSejourMeta(notes)
  const ids = resolveInclutIds(notes)
  const hotelNom = sej.hotelNom.trim()
  const namedAucun = /^aucun$/i.test(hotelNom) || /sans\s*h[oô]tel/i.test(hotelNom)
  const nuits = Number.parseInt(sej.hotelNuits, 10)
  const includeHotel = ids.includes('convalescence_hotel') && !namedAucun && nuits !== 0
  const drainageNb = ids.includes('drainage')
    ? resolveDrainageNb(notes, p.rapports?.[0] ?? null)
    : 0
  return {
    includeHotel,
    drainageNb,
    includeNurseHotel: includeHotel && ids.includes('soins_infirmiers_hotel'),
  }
}

export type PlanningFieldValues = Record<PlanningFieldKey, string>

export function collectPlanningFieldValues(
  patient: GestionnairePatientDetail,
  log?: PlanningLogistiqueHint | null,
  opts?: BuildPlanningSejourOptions,
): PlanningFieldValues {
  const { prenom, nom } = splitPatientName(patient.user.fullName)
  const chambre = resolveChambreType(log?.accompagnateur)
  const d0 = parseIsoDate(log?.dateArrivee)
  const dDepart = parseIsoDate(log?.dateDepart) ?? (d0 ? addDays(d0, 7) : null)
  const tndPerEur = opts?.tndPerEur && opts.tndPerEur > 0 ? opts.tndPerEur : DEFAULT_TND_PER_EUR
  const totalDt = devisTotalDt(patient)
  const totalEur = totalDt > 0 ? totalDt / tndPerEur : 0

  return {
    civilite: 'Mme',
    prenom: prenom || '—',
    nom: nom || '—',
    nom_complet: [prenom, nom].filter(Boolean).join(' ') || patient.user.fullName.trim() || 'Patiente',
    chambre,
    dossier: acceptedDevisPlanningRef(patient),
    date_arrivee: formatPlanningDay(d0),
    heure_arrivee: formatHmFr(d0, '17h20'),
    date_depart: formatPlanningDay(dDepart),
    heure_depart: formatHmFr(dDepart, '11h45'),
    montant_dt: totalDt > 0 ? `${fmtPlanningAmount(totalDt)}dt` : '…dt',
    montant_eur: totalEur > 0 ? `${fmtPlanningAmount(totalEur)}€` : '…€',
    duree_sejour: sejourDureeLabel(d0, dDepart),
    intervention: interventionLabel(patient),
    chauffeur: chauffeurPrenom(log),
  }
}

/**
 * Met à jour les spans data-planning-field dans un HTML déjà enregistré
 * (sans écraser le reste du texte personnalisé).
 */
export function refreshPlanningLinkedFields(html: string, values: PlanningFieldValues): string {
  if (!html.trim()) return html
  let out = html
  for (const [key, value] of Object.entries(values) as Array<[PlanningFieldKey, string]>) {
    const re = new RegExp(
      `(<span\\b[^>]*\\bdata-planning-field="${key}"[^>]*>)([\\s\\S]*?)(</span>)`,
      'gi',
    )
    out = out.replace(re, (_m, open: string, _old: string, close: string) => `${open}${escText(value)}${close}`)
  }
  out = refreshPlanningDevisRef(out, values.dossier)
  return out
}

export function buildPlanningSejourHtml(
  patient: GestionnairePatientDetail,
  log?: PlanningLogistiqueHint | null,
  opts?: BuildPlanningSejourOptions,
): string {
  const v = collectPlanningFieldValues(patient, log, opts)
  const f = planningField

  const d0 = parseIsoDate(log?.dateArrivee)
  const d1 = d0 ? addDays(d0, 1) : null
  const d2 = d0 ? addDays(d0, 2) : null
  const d3 = d0 ? addDays(d0, 3) : null
  const d4 = d0 ? addDays(d0, 4) : null
  const d5 = d0 ? addDays(d0, 5) : null
  const d6 = d0 ? addDays(d0, 6) : null
  const dDepart = parseIsoDate(log?.dateDepart) ?? (d0 ? addDays(d0, 7) : null)
  const day = (d: Date | null) => formatPlanningDay(d)

  const cliniqueFull = cliniqueLabel(patient)
  const cliniquePlaceholder = cliniqueFull.startsWith('(')
  const { nom: cliniqueNom, reste: cliniqueReste } = splitClinique(cliniqueFull)
  const hotel = hotelLabel(patient, log)
  const offer = planningOffer(patient)

  const nomLine =
    `${f('civilite', v.civilite)} ${f('prenom', v.prenom)} ${f('nom', v.nom)} (${f('chambre', v.chambre)})`

  // Structure + styles = « Planning Séjour Type séjour.pdf » (copier-coller).
  const chunks: string[] = [
    headerLogoHtml(),
    pTitleHtml('Planning de votre séjour médical en Tunisie'),
    pNameHtml(nomLine),
    pSalmonCenterHtml(f('intervention', v.intervention)),
    pSalmonCenterHtml(`Dossier N° Dr ${f('dossier', v.dossier)}`),

    pDayHtml(`Jour d’arrivée : ${f('date_arrivee', day(d0))}`),
    paraRed('Procédure de déclaration d’argent à faire à la douane avant sortie !!!'),
    paraMixed(
      gray('Arrivée à l’aéroport Tunis Carthage '),
      `<span style="color:${C.gray}">${f('heure_arrivee', v.heure_arrivee)}</span>`,
      salmonHi(' (RDV avec votre chauffeur '),
      salmonHiHtml(f('chauffeur', v.chauffeur)),
      salmonHi('* devant le bureau du tourisme à la sortie de douane à droite)'),
    ),
    paraMixed(
      salmonHi('Change avec votre chauffeur pour '),
      `<strong><mark data-color="${C.hiLight}" style="background-color:${C.hiLight}"><span style="color:${C.salmon}">${f('montant_dt', v.montant_dt)}</span></mark></strong>`,
      salmonHi(' soit à peu près l’équivalent de '),
      `<strong><mark data-color="${C.hiLight}" style="background-color:${C.hiLight}"><span style="color:${C.salmon}">${f('montant_eur', v.montant_eur)}</span></mark></strong>`,
      salmonHi(
        ' (selon le cours du jour) puis encaissement de la totalité de la somme par votre chauffeur (une fois en clinique) *.',
      ),
    ),
    paraSalmonHi('*Poches de sang et de fer à payer en sus en fonction du besoin postopératoire.'),
    cliniquePlaceholder
      ? paraMixed(
          gray(`Transfert à la clinique ${cliniqueFull} Check in clinique et admission `),
          salmonHi(
            '(prévoyez vos bilans sanguins et votre échographie mammaire en version papier pour le dossier de la clinique)',
          ),
        )
      : paraMixed(
          gray('Transfert à la '),
          salmon(`clinique ${cliniqueNom}`),
          gray(`${cliniqueReste ? ` ${cliniqueReste}` : ''} Check in clinique et admission `),
          salmonHi(
            '(prévoyez vos bilans sanguins et votre échographie mammaire en version papier pour le dossier de la clinique)',
          ),
        ),
    paraGray('Remise ordonnance et médicaments avec les vêtements de contention'),
    paraGray('Examen avec l’anesthésiste 19h00-21h00'),
    paraGray('Douche au Cytéal et à jeun à partir de 0h00'),

    pDayHtml(`Jour d’intervention : ${day(d1)}`),
    paraGray('Douche au Cytéal'),
    paraGray('Visite chirurgien : Consultation préopératoire 07h30 + traçage'),
    paraGray('Passage au bloc vers 08h30'),
    paraGray('Réveil 14h00 -17h00'),
    paraGray('Soins infirmiers'),

    pDayHtml(`Jour de convalescence : ${day(d2)}`),
    paraGray('Visite du personnel médical et soins infirmiers'),
  ]

  if (offer.includeHotel) {
    // Ordre PDF : transfert hôtel → J2 infirmière → J3 infirmière + séance 2 → J4 séance 3 + infirmière + examen
    chunks.push(
      pDayHtml(`Jour de transfert à l’hôtel : ${day(d3)}`),
      paraGold('Séance 1 Drainage à 10h00'),
      paraGray('Visite du chirurgien et autorisation de sortie'),
      paraGray('Check out clinique 12h00'),
      paraMixed(gray('Transfert à l’'), salmon(`hôtel ${hotel}`)),
      pDayHtml(`Jour 2 à l’hôtel : ${day(d4)}`),
      paraGray('Passage infirmière pour soins médicaux'),
      pDayHtml(`Jour 3 à l’hôtel : ${day(d5)}`),
      paraGray('Passage infirmière pour soins médicaux'),
      paraGold('Séance 2 drainage (horaire à confirmer)'),
      pDayHtml(`Jour 4 à l’hôtel : ${day(d6)}`),
      paraGold('Séance 3 drainage (horaire à confirmer)'),
      paraGray('Passage infirmière pour soins médicaux'),
      paraGray('Examen de contrôle au cabinet du chirurgien ou clinique (horaire et lieu à confirmer)'),
    )
  } else {
    chunks.push(
      pDayHtml(`Jour de sortie de clinique : ${day(d3)}`),
      paraGray('Visite du chirurgien et autorisation de sortie'),
      paraGray('Check out clinique 12h00'),
    )
  }

  chunks.push(
    pDayHtml(`Jour de Départ : ${f('date_depart', day(dDepart))}`),
    paraSalmonHi('N’oubliez pas de mettre vos bas de contention pour toute la durée du vol'),
  )
  if (offer.includeHotel) chunks.push(paraGray('Check out Hôtel 09h00'))
  chunks.push(
    paraGray('Transfert à l’aéroport à 09h15'),
    paraMixed(
      gray('Départ '),
      `<span style="color:${C.gray}">${f('heure_depart', v.heure_depart)}</span>`,
    ),
    paraContact(`Wifi Clinique : ${wifiClinique(cliniqueFull)}`),
    paraContact('Liste des contacts utiles pour votre séjour :'),
    paraContact(`Votre conseillère médicale : ${CONTACTS.conseillere}`),
    pContactHtml(`Votre Chauffeur : ${f('chauffeur', v.chauffeur)} ${CONTACTS.chauffeurTel}`),
    paraContact(`Votre Kinésithérapeute : ${CONTACTS.kine}`),
    paraContact(`Votre infirmière : ${CONTACTS.infirmiere}`),
    paraContact(`Cabinet : ${CONTACTS.cabinet}`),
    consignesBoxHtml(
      paraConsignesTitle('CONSIGNES POSTOPÉRATOIRES'),
      paraGray('Port des bas de contention pendant les 15 premiers jours et pendant le vol'),
      paraGray('Port des vêtements de contention pendant 6 semaines'),
      paraGray('Continuer le drainage lymphatique 2/3 séances par semaine pendant 6 semaines'),
      paraGray(
        'Douche et soins tous les jours mais sans immersion dans l’eau (bain ou baignade) pendant 6 semaines',
      ),
      paraGray('Reprise progressive de l’activité sportive à partir de 8 semaines'),
    ),
    footerImageHtml(),
  )

  return `<div class="planning-doc" data-planning-template="${PLANNING_TEMPLATE_VERSION}">\n${chunks.filter(Boolean).join('\n')}\n</div>`
}
