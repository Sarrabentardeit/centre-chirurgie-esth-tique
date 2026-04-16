import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const password = await bcrypt.hash('demo1234', 12)

  // Médecin
  const medecin = await prisma.user.upsert({
    where: { email: 'medecin@demo.com' },
    update: {},
    create: {
      email: 'medecin@demo.com',
      passwordHash: password,
      role: 'medecin',
      fullName: 'Dr. Mehdi Chennoufi',
    },
  })
  console.log(`✅ Médecin : ${medecin.email}`)

  // Gestionnaire
  const gestionnaire = await prisma.user.upsert({
    where: { email: 'gestionnaire@demo.com' },
    update: {},
    create: {
      email: 'gestionnaire@demo.com',
      passwordHash: password,
      role: 'gestionnaire',
      fullName: 'Sarah Gestionnaire',
    },
  })
  console.log(`✅ Gestionnaire : ${gestionnaire.email}`)

  // Patient démo
  const patientUser = await prisma.user.upsert({
    where: { email: 'patient@demo.com' },
    update: {},
    create: {
      email: 'patient@demo.com',
      passwordHash: password,
      role: 'patient',
      fullName: 'Yasmine Ben Ali',
    },
  })

  await prisma.patient.upsert({
    where: { userId: patientUser.id },
    update: {},
    create: {
      userId: patientUser.id,
      dossierNumber: 'DOS-2026-000001',
      phone: '+21698765432',
      ville: 'Tunis',
      pays: 'Tunisie',
      sourceContact: 'instagram',
      status: 'formulaire_complete',
    },
  })
  console.log(`✅ Patient démo : ${patientUser.email}`)

  console.log('\n🎉 Seed terminé — mot de passe démo : demo1234')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
