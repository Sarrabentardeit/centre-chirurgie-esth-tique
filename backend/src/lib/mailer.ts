import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
})

export type EmailAudience = 'medecin' | 'gestionnaire'

/** Charte app — teal / bronze / rose / crème. */
const BRAND = {
  teal: '#062a30',
  bronze: '#81572d',
  rose: '#e4c8bd',
  cream: '#fdeada',
  charcoal: '#282727',
  gray: '#929292',
  white: '#ffffff',
  softBg: '#f7f1eb',
} as const

const PROD_APP_URL = 'https://chennoufi.nav.ovh'

function parseEmails(raw?: string): string[] {
  if (!raw) return []
  return raw.split(',').map((e) => e.trim()).filter(Boolean)
}

const MEDECIN_RECIPIENTS = parseEmails(env.NOTIFICATION_EMAILS_MEDECIN)
const GESTIONNAIRE_RECIPIENTS = (() => {
  const dedicated = parseEmails(env.NOTIFICATION_EMAILS_GESTIONNAIRE)
  if (dedicated.length > 0) return dedicated
  return parseEmails(env.NOTIFICATION_EMAILS)
})()

function recipientsFor(audience: EmailAudience): string[] {
  return audience === 'medecin' ? MEDECIN_RECIPIENTS : GESTIONNAIRE_RECIPIENTS
}

function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '0.0.0.0'
  } catch {
    return true
  }
}

/**
 * URL utilisée dans les emails (toujours publique / prod).
 * Priorité : PUBLIC_APP_URL → FRONTEND_URL si non-local → prod.
 */
function publicAppUrl(): string {
  const candidates = [env.PUBLIC_APP_URL, env.FRONTEND_URL, PROD_APP_URL]
  for (const raw of candidates) {
    if (!raw?.trim()) continue
    const base = raw.trim().replace(/\/$/, '')
    if (!isLocalUrl(base)) return base
  }
  return PROD_APP_URL
}

function absoluteAppLink(lienAction?: string | null): string {
  const base = publicAppUrl()
  if (!lienAction?.trim()) return base
  const path = lienAction.startsWith('/') ? lienAction : `/${lienAction}`
  return `${base}${path}`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function smtpReady(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS)
}

/** Log SMTP readiness at boot (no secrets). */
export function logMailerStatus(): void {
  const smtpOk = smtpReady()
  console.log('[mailer] Config', {
    medecinRecipients: MEDECIN_RECIPIENTS.length,
    gestionnaireRecipients: GESTIONNAIRE_RECIPIENTS.length,
    smtpConfigured: smtpOk,
    publicAppUrl: publicAppUrl(),
    host: env.SMTP_HOST || null,
    port: env.SMTP_PORT,
  })
  if (MEDECIN_RECIPIENTS.length === 0) {
    console.warn('[mailer] ATTENTION : NOTIFICATION_EMAILS_MEDECIN vide — pas d’email formulaire au médecin')
  }
  if (GESTIONNAIRE_RECIPIENTS.length === 0) {
    console.warn('[mailer] ATTENTION : NOTIFICATION_EMAILS_GESTIONNAIRE / NOTIFICATION_EMAILS vide')
  }
  if (!smtpOk) {
    console.warn('[mailer] ATTENTION : SMTP incomplet — aucun email ne sera envoyé')
  }
}

/** Template email simple — charte Centre Est. */
function buildSimpleEmailHtml(input: {
  titre: string
  greetingHtml: string
  bodyHtml: string
  ctaLabel: string
  ctaHref: string
}): string {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(input.titre)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.softBg};font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${BRAND.softBg};padding:28px 12px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:560px;background:${BRAND.white};border-radius:12px;overflow:hidden;border:1px solid ${BRAND.rose};">
          <tr>
            <td style="background:${BRAND.teal};padding:22px 28px;">
              <p style="margin:0;color:${BRAND.white};font-size:17px;font-weight:700;">
                Cabinet Dr Mehdi Chennoufi
              </p>
              <p style="margin:6px 0 0;color:${BRAND.rose};font-size:12px;">
                Centre Est — Chirurgie Esthétique
              </p>
            </td>
          </tr>
          <tr>
            <td style="height:3px;background:${BRAND.bronze};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 14px;font-size:15px;color:${BRAND.charcoal};line-height:1.5;">
                ${input.greetingHtml}
              </p>
              <p style="margin:0 0 12px;font-size:20px;font-weight:700;color:${BRAND.teal};">
                ${escapeHtml(input.titre)}
              </p>
              <div style="margin:0 0 22px;font-size:14px;color:${BRAND.charcoal};line-height:1.65;">
                ${input.bodyHtml}
              </div>
              <a href="${input.ctaHref}"
                 style="display:inline-block;background:${BRAND.bronze};color:${BRAND.white};text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:700;">
                ${escapeHtml(input.ctaLabel)}
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

async function sendHtmlEmail(input: {
  to: string | string[]
  subject: string
  html: string
  logLabel: string
}): Promise<void> {
  if (!smtpReady()) {
    console.warn(`[mailer] ${input.logLabel} ignoré : SMTP incomplet`)
    return
  }
  const toList = Array.isArray(input.to) ? input.to : [input.to]
  const to = toList.map((e) => e.trim()).filter(Boolean)
  if (to.length === 0) {
    console.warn(`[mailer] ${input.logLabel} ignoré : aucun destinataire`)
    return
  }

  try {
    const info = await transporter.sendMail({
      from: `"Centre Est — Dr Mehdi Chennoufi" <${env.SMTP_USER}>`,
      to: to.join(', '),
      subject: input.subject,
      html: input.html,
    })
    console.log('[mailer] Email envoyé', {
      label: input.logLabel,
      to,
      messageId: info.messageId,
    })
  } catch (err) {
    console.error(`[mailer] Échec ${input.logLabel} :`, err)
  }
}

/**
 * Envoie un email de notification selon l’audience.
 * - medecin : uniquement les cas « formulaire »
 * - gestionnaire : rapport généré + autres alertes métier
 */
export async function sendNotificationEmail(input: {
  titre: string
  message: string
  lienAction?: string | null
  audience: EmailAudience
}): Promise<void> {
  const recipients = recipientsFor(input.audience)
  if (recipients.length === 0) {
    console.warn(`[mailer] Envoi ignoré : aucun destinataire pour audience=${input.audience}`)
    return
  }

  const lien = absoluteAppLink(input.lienAction)
  const html = buildSimpleEmailHtml({
    titre: input.titre,
    greetingHtml: 'Bonjour,',
    bodyHtml: `<p style="margin:0;">${escapeHtml(input.message)}</p>`,
    ctaLabel: 'Ouvrir Centre Est →',
    ctaHref: lien,
  })

  await sendHtmlEmail({
    to: recipients,
    subject: `[Centre Est] ${input.titre}`,
    html,
    logLabel: `notification ${input.audience}`,
  })
}

/**
 * Email patient générique (template simple).
 */
export async function sendPatientEmail(input: {
  to: string
  patientName?: string | null
  titre: string
  message: string
  lienAction?: string | null
  ctaLabel?: string
}): Promise<void> {
  const to = input.to.trim()
  if (!to) {
    console.warn('[mailer] Envoi patient ignoré : email vide')
    return
  }

  const fullName = (input.patientName ?? '').trim()
  const prenom = fullName.split(/\s+/)[0] || 'Madame'
  const lien = absoluteAppLink(input.lienAction)

  const html = buildSimpleEmailHtml({
    titre: input.titre,
    greetingHtml: `Bonjour <strong style="color:${BRAND.teal};">${escapeHtml(prenom)}</strong>,`,
    bodyHtml: `<p style="margin:0;">${escapeHtml(input.message).replace(/\n/g, '<br/>')}</p>`,
    ctaLabel: input.ctaLabel ?? 'Consulter mon espace →',
    ctaHref: lien,
  })

  await sendHtmlEmail({
    to,
    subject: `${input.titre} — Centre Est`,
    html,
    logLabel: 'email patient',
  })
}

/** Email « devis prêt » — simple + lien prod vers /patient/devis. */
export async function sendDevisReadyEmail(input: {
  to: string
  patientFullName: string
}): Promise<void> {
  await sendPatientEmail({
    to: input.to,
    patientName: input.patientFullName,
    titre: 'Votre devis est prêt',
    message:
      'Votre devis est prêt. Merci de consulter votre espace patient pour le visualiser.',
    lienAction: '/patient/devis',
    ctaLabel: 'Consulter mon devis →',
  })
}

/** Email patient — nouveau message chat (ex. décision / abstention). */
export async function sendPatientChatMessageEmail(input: {
  to: string
  patientFullName: string
  /** Si true : formulation « décision » (dossier en abstention). */
  aboutDecision?: boolean
}): Promise<void> {
  const message = input.aboutDecision
    ? 'Vous avez reçu un message du cabinet concernant une décision relative à votre dossier. Merci de consulter votre espace patient pour en prendre connaissance.'
    : 'Vous avez reçu un nouveau message du cabinet. Merci de consulter votre espace patient pour en prendre connaissance.'

  await sendPatientEmail({
    to: input.to,
    patientName: input.patientFullName,
    titre: input.aboutDecision ? 'Message concernant votre dossier' : 'Nouveau message du cabinet',
    message,
    lienAction: '/patient/chat',
    ctaLabel: 'Ouvrir le chat →',
  })
}
