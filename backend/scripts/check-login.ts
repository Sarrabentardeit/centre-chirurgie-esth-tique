import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const email = process.argv[2] ?? 'bentardeit.sarra2000@gmail.com'
const pwd = process.argv[3] ?? '2026Aa2026'

async function main() {
  const normalized = email.toLowerCase().trim()
  const u = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, email: true, role: true, passwordHash: true },
  })
  if (!u) {
    console.log('NOT_FOUND:', normalized)
    const similar = await prisma.user.findMany({
      where: { email: { contains: 'bentardeit', mode: 'insensitive' } },
      select: { email: true, role: true },
    })
    console.log('Similar:', similar)
    return
  }
  console.log('Found:', { email: u.email, role: u.role, hashPrefix: u.passwordHash.slice(0, 7) })
  const ok = await bcrypt.compare(pwd, u.passwordHash)
  console.log('Password match:', ok)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
