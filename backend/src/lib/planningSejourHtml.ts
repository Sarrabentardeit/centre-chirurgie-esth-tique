const SEJOUR_CLINIQUE_NOM = 'SEJOUR_CLINIQUE_NOM:'
const SEJOUR_CLINIQUE_NUITS = 'SEJOUR_CLINIQUE_NUITS:'
const SEJOUR_HOTEL_NOM = 'SEJOUR_HOTEL_NOM:'
const SEJOUR_HOTEL_NUITS = 'SEJOUR_HOTEL_NUITS:'
const META = [SEJOUR_CLINIQUE_NOM, SEJOUR_CLINIQUE_NUITS, SEJOUR_HOTEL_NOM, SEJOUR_HOTEL_NUITS, 'DELAIS_CONVALESCENCE:', 'TYPE_SEJOUR:']

function lineVal(lines: string[], p: string) {
  const l = lines.find((x) => x.startsWith(p))
  return l ? l.slice(p.length).trim() : ''
}

function parseNotesSejour(notes?: string | null) {
  const lines = (notes ?? '').split('\n')
  return {
    cliniqueNom: lineVal(lines, SEJOUR_CLINIQUE_NOM),
    cliniqueNuits: lineVal(lines, SEJOUR_CLINIQUE_NUITS),
    hotelNom: lineVal(lines, SEJOUR_HOTEL_NOM),
    hotelNuits: lineVal(lines, SEJOUR_HOTEL_NUITS),
    libre: lines.filter((l) => !META.some((p) => l.startsWith(p))).join('\n').trim(),
  }
}

const MOIS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'] as const

export function moisLabelFromDate(d?: Date | null): string {
  const date = d ?? new Date()
  const m = MOIS_FR[date.getMonth()] ?? 'Mai'
  const y = String(date.getFullYear()).slice(-2)
  return `${m} ${y}`
}

export type PlanningSejourSource = {
  fullName: string
  dossierNumber: string
  ville: string | null
  pays: string | null
  phone: string | null
  dateNaissance: Date | null
  rapport?: {
    interventionsRecommandees: string[]
    nuitsClinique: number | null
    notes: string | null
  } | null
  devis?: {
    numeroDevis: string | null
    planningMedical: string | null
    notesSejour: string | null
  } | null
  logistique?: {
    dateArrivee: Date | null
    dateDepart: Date | null
    hebergement: string | null
    transport: string | null
    accompagnateur: string | null
    notesClinique: string | null
  } | null
  moisLabel?: string | null
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function row(label: string, value: string): string {
  if (!value || value === '—') return ''
  return `<tr><td style="padding:6px 12px 6px 0;color:#81572d;font-weight:700;vertical-align:top;width:38%">${label}</td><td style="padding:6px 0;color:#282727;vertical-align:top">${value}</td></tr>`
}

function section(title: string, body: string): string {
  if (!body.trim()) return ''
  return `<div style="margin-top:20px">
<h3 style="margin:0 0 10px;padding:8px 12px;background:#fdeada;color:#062a30;font-size:14px;font-weight:700;border-left:4px solid #062a30">${title}</h3>
${body}
</div>`
}

export function buildPlanningSejourHtml(src: PlanningSejourSource): string {
  const sej = parseNotesSejour(src.devis?.notesSejour)
  const mois = src.moisLabel?.trim() || moisLabelFromDate(src.logistique?.dateArrivee)
  const interventions = [
    ...(src.rapport?.interventionsRecommandees ?? []),
  ].filter(Boolean)
  const hebergement =
    src.logistique?.hebergement?.trim() ||
    [sej.hotelNom, sej.hotelNuits && `${sej.hotelNuits} nuit(s)`].filter(Boolean).join(' — ') ||
    '—'

  const infoRows = [
    row('Patiente', src.fullName),
    row('Dossier', src.dossierNumber),
    row('Ville / Pays', [src.ville, src.pays].filter(Boolean).join(', ') || '—'),
    row('Téléphone', src.phone ?? '—'),
    row('Date de naissance', src.dateNaissance ? fmtDate(src.dateNaissance) : '—'),
    row('Période', mois),
  ].join('')

  const sejourRows = [
    row('Arrivée', fmtDate(src.logistique?.dateArrivee ?? null)),
    row('Départ', fmtDate(src.logistique?.dateDepart ?? null)),
    row('Clinique', [sej.cliniqueNom, sej.cliniqueNuits && `${sej.cliniqueNuits} nuit(s)`].filter(Boolean).join(' — ') || '—'),
    row('Hébergement', hebergement),
    row('Transport', src.logistique?.transport ?? '—'),
    row('Accompagnateur', src.logistique?.accompagnateur ?? '—'),
  ].join('')

  const medical =
    interventions.length > 0
      ? `<ul style="margin:0;padding-left:20px;color:#282727">${interventions.map((i) => `<li>${i}</li>`).join('')}</ul>`
      : '<p style="margin:0;color:#929292">—</p>'

  const planningMed = (src.devis?.planningMedical ?? '').trim()
  const notesRapport = (src.rapport?.notes ?? '').trim()
  const notesLibres = [sej.libre, src.logistique?.notesClinique].filter(Boolean).join('\n\n')

  return `<div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;line-height:1.5;color:#282727;max-width:800px">
<p style="text-align:center;margin:0 0 4px;font-size:11px;color:#062a30;letter-spacing:0.08em;text-transform:uppercase">Dr Mehdi Chennoufi — Chirurgie esthétique</p>
<h1 style="text-align:center;margin:0 0 24px;font-size:22px;color:#062a30;font-weight:700">Planning séjour — ${src.fullName} (${mois})</h1>
${section('Informations patiente', `<table style="width:100%;border-collapse:collapse">${infoRows}</table>`)}
${section('Séjour & logistique', `<table style="width:100%;border-collapse:collapse">${sejourRows}</table>`)}
${section('Interventions prévues', medical)}
${planningMed ? section('Planning médical (devis)', `<div style="white-space:pre-wrap;color:#282727">${planningMed.replace(/</g, '&lt;')}</div>`) : ''}
${notesRapport ? section('Notes rapport', `<div style="white-space:pre-wrap;color:#282727">${notesRapport.replace(/</g, '&lt;')}</div>`) : ''}
${notesLibres ? section('Notes & remarques', `<div style="white-space:pre-wrap;color:#282727">${notesLibres.replace(/</g, '&lt;')}</div>`) : ''}
<p style="margin-top:28px;font-size:11px;color:#929292">Document généré automatiquement — à personnaliser avant envoi.</p>
</div>`
}
