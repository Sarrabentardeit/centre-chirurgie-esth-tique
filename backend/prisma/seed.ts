import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma.js'
import { blindIndex, normalizeEmail } from '../src/lib/fieldCrypto.js'

async function ensureUser(input: {
  email: string
  fullName: string
  role: 'medecin' | 'gestionnaire' | 'patient'
  passwordHash: string
}) {
  const email = normalizeEmail(input.email)
  const existing = await prisma.user.findUnique({
    where: { emailBlind: blindIndex(email) },
  })
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        fullName: input.fullName,
        passwordHash: input.passwordHash,
      },
    })
  }
  return prisma.user.create({
    data: {
      email,
      emailBlind: blindIndex(email),
      fullName: input.fullName,
      role: input.role,
      passwordHash: input.passwordHash,
    },
  })
}

async function main() {
  const password = await bcrypt.hash('demo1234', 12)

  const medecin = await ensureUser({
    email: 'medecin@demo.com',
    fullName: 'Dr. Mehdi Chennoufi',
    role: 'medecin',
    passwordHash: password,
  })
  console.log(`✅ Médecin : ${medecin.email}`)

  const gestionnaire = await ensureUser({
    email: 'gestionnaire@demo.com',
    fullName: 'Sarah Gestionnaire',
    role: 'gestionnaire',
    passwordHash: password,
  })
  console.log(`✅ Gestionnaire : ${gestionnaire.email}`)

  const patientUser = await ensureUser({
    email: 'patient@demo.com',
    fullName: 'Yasmine Ben Ali',
    role: 'patient',
    passwordHash: password,
  })

  const patient = await prisma.patient.findUnique({ where: { userId: patientUser.id } })
  if (!patient) {
    await prisma.patient.create({
      data: {
        userId: patientUser.id,
        dossierNumber: 'DOS-2026-000001',
        phone: '+21698765432',
        ville: 'Tunis',
        pays: 'Tunisie',
        sourceContact: 'instagram',
        status: 'formulaire_complete',
      },
    })
  }
  console.log(`✅ Patient démo : ${patientUser.email}`)

  console.log('\n🎉 Seed terminé — mot de passe démo : demo1234')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
