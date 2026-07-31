/**
 * One-shot : renvoie les emails « Rapport médical généré » pour les dossiers
 * qui ont déjà un rapport mais pas encore de devis (cas SMTP cassé).
 *
 * Usage (VPS) :
 *   docker compose --env-file .env.prod -f docker-compose.prod.yml exec backend \
 *     node scripts/resend-rapport-emails.mjs
 *
 * Simulation (sans envoi) :
 *   ... node scripts/resend-rapport-emails.mjs --dry-run
 */
import { PrismaClient } from '@prisma/client'
import nodemailer from 'nodemailer'

const dryRun = process.argv.includes('--dry-run')
const prisma = new PrismaClient()

const recipients = (process.env.NOTIFICATION_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean)

const appUrl = process.env.FRONTEND_URL ?? 'https://chennoufi.nav.ovh'

function buildHtml(titre, message, lien) {
  return `
<!DOCTYPE html>
<html lang="fr"><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;">
        <tr><td style="background:#1e293b;padding:24px 32px;">
          <p style="margin:0;color:#fff;font-size:18px;font-weight:bold;">Cabinet Dr Mehdi Chennoufi</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:15px;font-weight:bold;color:#1e293b;">${titre}</p>
          <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">${message}</p>
          <a href="${lien}" style="display:inline-block;background:#e11d48;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:bold;">
            Voir dans Centre Est →
          </a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim()
}

async function main() {
  console.log('SMTP_USER:', process.env.SMTP_USER || '(vide)')
  console.log('Destinataires:', recipients.length ? recipients.join(', ') : '(VIDE)')
  console.log('Mode:', dryRun ? 'DRY-RUN (pas d’envoi)' : 'ENVOI RÉEL')

  if (!recipients.length) {
    throw new Error('NOTIFICATION_EMAILS vide — chargez .env.prod (--env-file)')
  }
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP_USER / SMTP_PASS manquants dans le conteneur')
  }

  const patients = await prisma.patient.findMany({
    where: {
      rapports: { some: {} },
      devis: { none: {} },
    },
    select: {
      id: true,
      dossierNumber: true,
      status: true,
      user: { select: { fullName: true, email: true } },
      rapports: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, createdAt: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  console.log(`\nTrouvé ${patients.length} patient(s) avec rapport et sans devis.\n`)

  if (patients.length === 0) {
    console.log('Rien à renvoyer.')
    return
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'ssl0.ovh.net',
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })

  if (!dryRun) {
    await transporter.verify()
    console.log('SMTP OK\n')
  }

  let ok = 0
  let fail = 0

  for (const p of patients) {
    const titre = 'Rapport médical généré'
    const message = `Le rapport médical de ${p.user.fullName} (${p.dossierNumber}) est prêt. Devis à préparer.`
    const lien = `${appUrl}/gestionnaire/devis/${p.id}`

    console.log(`→ ${p.user.fullName} | ${p.dossierNumber} | ${p.user.email} | statut=${p.status}`)

    if (dryRun) {
      ok += 1
      continue
    }

    try {
      const info = await transporter.sendMail({
        from: `"Centre Est" <${process.env.SMTP_USER}>`,
        to: recipients.join(', '),
        subject: `[Centre Est] ${titre}`,
        html: buildHtml(titre, message, lien),
      })
      console.log(`  OK ${info.messageId}`)
      ok += 1
    } catch (err) {
      console.error(`  FAIL`, err instanceof Error ? err.message : err)
      fail += 1
    }
  }

  console.log(`\nTerminé : ${ok} ok, ${fail} échec(s).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
