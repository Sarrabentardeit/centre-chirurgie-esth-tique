import { PrismaClient } from '@prisma/client'
import { logger } from './logger.js'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? [{ emit: 'stdout', level: 'error' }, { emit: 'stdout', level: 'warn' }]
        : [],
  })

prisma.$connect().catch((e: unknown) => logger.error({ err: e }, 'Prisma connect error'))

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma
}
