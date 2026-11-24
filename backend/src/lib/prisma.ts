import { PrismaClient } from '@prisma/client'
import { logger } from './logger.js'
import {
  blindIndex,
  decryptDeep,
  encryptArgsForModel,
  normalizeEmail,
} from './fieldCrypto.js'

const WRITE_OPS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
])

const READ_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'create',
  'update',
  'upsert',
])

function encryptNestedUserPatient(data: Record<string, unknown>) {
  if (data.user && typeof data.user === 'object') {
    encryptArgsForModel('User', data.user as Record<string, unknown>)
    const u = data.user as Record<string, unknown>
    if (u.create && typeof u.create === 'object') encryptArgsForModel('User', { data: u.create })
    if (u.update && typeof u.update === 'object') encryptArgsForModel('User', { data: u.update })
  }
  if (data.patient && typeof data.patient === 'object') {
    const p = data.patient as Record<string, unknown>
    if (p.create && typeof p.create === 'object') encryptArgsForModel('Patient', { data: p.create })
    if (p.update && typeof p.update === 'object') encryptArgsForModel('Patient', { data: p.update })
  }
}

function rewriteEmailWhere(where: Record<string, unknown>) {
  if (typeof where.email === 'string') {
    where.emailBlind = blindIndex(normalizeEmail(where.email))
    delete where.email
  }
  if (where.OR && Array.isArray(where.OR)) {
    for (const clause of where.OR) {
      if (clause && typeof clause === 'object') rewriteEmailWhere(clause as Record<string, unknown>)
    }
  }
  if (where.AND && Array.isArray(where.AND)) {
    for (const clause of where.AND) {
      if (clause && typeof clause === 'object') rewriteEmailWhere(clause as Record<string, unknown>)
    }
  }
  if (where.NOT && typeof where.NOT === 'object') {
    rewriteEmailWhere(where.NOT as Record<string, unknown>)
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createPrisma(): PrismaClient {
  const base = new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? [{ emit: 'stdout', level: 'error' }, { emit: 'stdout', level: 'warn' }]
        : [],
  })

  const extended = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const argsRec = args as Record<string, unknown>

          if (WRITE_OPS.has(operation) && model) {
            encryptArgsForModel(model, argsRec)
            if (argsRec.data && typeof argsRec.data === 'object' && !Array.isArray(argsRec.data)) {
              encryptNestedUserPatient(argsRec.data as Record<string, unknown>)
            }
          }

          if (model === 'User' && argsRec.where && typeof argsRec.where === 'object') {
            rewriteEmailWhere(argsRec.where as Record<string, unknown>)
          }

          const result = await query(args)
          if (READ_OPS.has(operation)) {
            return decryptDeep(result) as typeof result
          }
          return result
        },
      },
    },
  })

  // Cast : l’extension reste active au runtime ; les helpers attendent PrismaClient.
  return extended as unknown as PrismaClient
}

export const prisma = globalForPrisma.prisma ?? createPrisma()

prisma.$connect().catch((e: unknown) => logger.error({ err: e }, 'Prisma connect error'))

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma
}

export { blindIndex, normalizeEmail }
