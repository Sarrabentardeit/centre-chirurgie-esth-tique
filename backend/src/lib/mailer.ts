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

const NOTIFICATION_RECIPIENTS = env.NOTIFICATION_EMAILS
  ? env.NOTIFICATION_EMAILS.split(',').map((e) => e.trim()).filter(Boolean)
  : []

/**
 * Envoie un email de notification aux destinataires configurés.
 * Ne bloque pas si l'envoi échoue (erreur loguée uniquement).
 */
export async function sendNotificationEmail(input: {
  titre: string
  message: string
  lienAction?: string | null
}): Promise<void> {
  if (NOTIFICATION_RECIPIENTS.length === 0) return
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return

  const appUrl = env.FRONTEND_URL ?? 'https://chennoufi.nav.ovh'
  const lien = input.lienAction ? `${appUrl}${input.lienAction}` : appUrl

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#1e293b;padding:24px 32px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;">
                Cabinet Dr Mehdi Chennoufi
              </p>
              <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">
                Chirurgie Esthétique, Plastique et Réparatrice
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;font-size:15px;font-weight:bold;color:#1e293b;">
                ${input.titre}
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
                ${input.message}
              </p>
              <a href="${lien}"
                 style="display:inline-block;background:#e11d48;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:bold;">
                Voir dans Centre Est →
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                Cet email est envoyé automatiquement par l'application Centre Est.<br/>
                Ne pas répondre à cet email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  try {
    await transporter.sendMail({
      from: `"Centre Est" <${env.SMTP_USER}>`,
      to: NOTIFICATION_RECIPIENTS.join(', '),
      subject: `[Centre Est] ${input.titre}`,
      html,
    })
  } catch (err) {
    console.error('[mailer] Échec envoi email :', err)
  }
}
