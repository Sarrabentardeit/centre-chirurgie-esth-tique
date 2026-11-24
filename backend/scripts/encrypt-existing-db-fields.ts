/**
 * Chiffre les champs PII déjà en base (idempotent).
 * Prérequis : migration email_blind appliquée.
 *
 * Usage : npx tsx scripts/encrypt-existing-db-fields.ts
 */
import { PrismaClient } from '@prisma/client'
import {
  blindIndex,
  decryptField,
  encryptField,
  encryptJsonValue,
  isEncryptedField,
  normalizeEmail,
} from '../src/lib/fieldCrypto.js'

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany()
  for (const u of users) {
    const emailPlain = isEncryptedField(u.email)
      ? (decryptField(u.email) ?? '')
      : normalizeEmail(u.email)
    const data: { email?: string; fullName?: string; emailBlind: string } = {
      emailBlind: blindIndex(emailPlain),
    }
    if (!isEncryptedField(u.email)) data.email = encryptField(normalizeEmail(u.email)) ?? undefined
    if (!isEncryptedField(u.fullName)) data.fullName = encryptField(u.fullName) ?? undefined
    await prisma.user.update({ where: { id: u.id }, data })
    console.log('user', u.id)
  }

  const patients = await prisma.patient.findMany()
  for (const p of patients) {
    const data: Record<string, string | null> = {}
    for (const key of ['phone', 'nationalite', 'ville', 'pays', 'sourceContact', 'pendingRapportChangeNote'] as const) {
      const v = p[key]
      if (typeof v === 'string' && v && !isEncryptedField(v)) data[key] = encryptField(v)
    }
    if (Object.keys(data).length) {
      await prisma.patient.update({ where: { id: p.id }, data })
      console.log('patient', p.id)
    }
  }

  const formulaires = await prisma.formulaire.findMany()
  for (const f of formulaires) {
    const payload = f.payload as unknown
    if (payload && typeof payload === 'object' && !('__enc' in (payload as object))) {
      await prisma.formulaire.update({
        where: { id: f.id },
        data: { payload: encryptJsonValue(payload) as object },
      })
      console.log('formulaire', f.id)
    }
  }

  const messages = await prisma.message.findMany()
  for (const m of messages) {
    if (m.contenu && !isEncryptedField(m.contenu)) {
      await prisma.message.update({
        where: { id: m.id },
        data: { contenu: encryptField(m.contenu) ?? m.contenu },
      })
      console.log('message', m.id)
    }
  }

  console.log('Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
