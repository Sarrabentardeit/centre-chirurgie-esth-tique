/**
 * Prod Docker : node scripts/encrypt-existing-db-fields.mjs
 * (importe le code compilé dans dist/)
 */
import { PrismaClient } from '@prisma/client'
import {
  blindIndex,
  decryptField,
  encryptField,
  encryptJsonValue,
  isEncryptedField,
  normalizeEmail,
} from '../dist/lib/fieldCrypto.js'

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany()
  for (const u of users) {
    const emailPlain = isEncryptedField(u.email)
      ? (decryptField(u.email) ?? '')
      : normalizeEmail(u.email)
    const data = {
      emailBlind: blindIndex(emailPlain),
    }
    if (!isEncryptedField(u.email)) data.email = encryptField(normalizeEmail(u.email))
    if (!isEncryptedField(u.fullName)) data.fullName = encryptField(u.fullName)
    await prisma.user.update({ where: { id: u.id }, data })
    console.log('user', u.id)
  }

  const patients = await prisma.patient.findMany()
  for (const p of patients) {
    const data = {}
    for (const key of ['phone', 'nationalite', 'ville', 'pays', 'sourceContact', 'pendingRapportChangeNote']) {
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
    const payload = f.payload
    if (payload && typeof payload === 'object' && !('__enc' in payload)) {
      await prisma.formulaire.update({
        where: { id: f.id },
        data: { payload: encryptJsonValue(payload) },
      })
      console.log('formulaire', f.id)
    }
  }

  const messages = await prisma.message.findMany()
  for (const m of messages) {
    if (m.contenu && !isEncryptedField(m.contenu)) {
      await prisma.message.update({
        where: { id: m.id },
        data: { contenu: encryptField(m.contenu) },
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
