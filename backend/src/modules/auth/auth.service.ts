import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { prisma } from '../../lib/prisma.js'
import { env } from '../../config/env.js'
import { AppError } from '../../middleware/errorHandler.js'
import type { RegisterInput, LoginInput } from './auth.schema.js'
import type { UserRole, JwtPayload, RefreshPayload } from './auth.types.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateDossierNumber(): string {
  const year = new Date().getFullYear()
  const suffix = Math.floor(100000 + Math.random() * 900000)
  return `DOS-${year}-${suffix}`
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

async function notifyGestionnaires(input: {
  titre: string
  message: string
  type?: 'info' | 'warning' | 'success' | 'error'
  lienAction?: string | null
}) {
  const gestionnaires = await prisma.user.findMany({
    where: { role: 'gestionnaire' },
    select: { id: true },
  })
  if (gestionnaires.length === 0) return

  for (const gestionnaire of gestionnaires) {
    const exists = await prisma.notification.findFirst({
      where: {
        userId: gestionnaire.id,
        titre: input.titre,
        message: input.message,
        lienAction: input.lienAction ?? null,
      },
      select: { id: true },
    })
    if (exists) continue

    await prisma.notification.create({
      data: {
        userId: gestionnaire.id,
        type: input.type ?? 'info',
        titre: input.titre,
        message: input.message,
        lienAction: input.lienAction ?? null,
      },
    })
  }
}

function signAccessToken(user: { id: string; email: string; role: UserRole }): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN } as jwt.SignOptions
  )
}

function signRefreshToken(userId: string): string {
  return jwt.sign(
    { sub: userId, type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions
  )
}

async function createSession(
  userId: string,
  refreshToken: string,
  meta: { userAgent?: string; ip?: string }
): Promise<void> {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: hashToken(refreshToken),
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ip ?? null,
      expiresAt,
    },
  })
}

// ─── Service ─────────────────────────────────────────────────────────────────

export async function register(
  input: RegisterInput,
  meta: { userAgent?: string; ip?: string }
) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  })
  if (existing) {
    throw new AppError(409, 'EMAIL_TAKEN', 'Un compte existe déjà avec cet email.')
  }

  const passwordHash = await bcrypt.hash(input.password, 12)

  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash,
      role: 'patient',
      fullName: input.fullName,
    },
  })

  // Générer numéro dossier unique
  let dossierNumber = generateDossierNumber()
  let patientCreated = false
  while (!patientCreated) {
    try {
      await prisma.patient.create({
        data: {
          userId: user.id,
          dossierNumber,
          phone: input.phone,
          dateNaissance: input.dateNaissance ? new Date(input.dateNaissance) : null,
          nationalite: input.nationalite ?? null,
          ville: input.ville ?? null,
          pays: input.pays ?? null,
          sourceContact: input.sourceContact ?? null,
        },
      })
      patientCreated = true
    } catch (e: unknown) {
      const err = e as { code?: string }
      if (err?.code === 'P2002') {
        dossierNumber = generateDossierNumber()
      } else {
        throw e
      }
    }
  }

  await notifyGestionnaires({
    type: 'info',
    titre: 'Nouveau patient inscrit',
    message: `${user.fullName} (${dossierNumber}) a créé son compte patient.`,
    lienAction: '/gestionnaire/patients',
  })

  const accessToken = signAccessToken({ id: user.id, email: user.email, role: 'patient' })
  const refreshToken = signRefreshToken(user.id)
  await createSession(user.id, refreshToken, meta)

  return {
    user: { id: user.id, email: user.email, role: user.role, name: user.fullName },
    accessToken,
    refreshToken,
    dossierNumber,
  }
}

export async function login(
  input: LoginInput,
  meta: { userAgent?: string; ip?: string }
) {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    include: { patient: { select: { dossierNumber: true } } },
  })

  if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', 'Identifiants invalides.')

  const valid = await bcrypt.compare(input.password, user.passwordHash)
  if (!valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Identifiants invalides.')

  const accessToken = signAccessToken({
    id: user.id,
    email: user.email,
    role: user.role as UserRole,
  })
  const refreshToken = signRefreshToken(user.id)
  await createSession(user.id, refreshToken, meta)

  return {
    user: { id: user.id, email: user.email, role: user.role, name: user.fullName },
    accessToken,
    refreshToken,
    dossierNumber: user.patient?.dossierNumber ?? null,
  }
}

export async function refresh(token: string) {
  let payload: RefreshPayload
  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload
  } catch {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token invalide ou expiré.')
  }

  if (payload.type !== 'refresh') {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Token de mauvais type.')
  }

  const tokenHash = hashToken(token)
  const session = await prisma.session.findFirst({
    where: {
      userId: payload.sub,
      refreshTokenHash: tokenHash,
      expiresAt: { gt: new Date() },
    },
  })
  if (!session) throw new AppError(401, 'SESSION_NOT_FOUND', 'Session introuvable ou expirée.')

  const user = await prisma.user.findUnique({ where: { id: payload.sub } })
  if (!user) throw new AppError(401, 'USER_NOT_FOUND', 'Utilisateur introuvable.')

  // Rotation du refresh token
  const newRefreshToken = signRefreshToken(user.id)
  await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: hashToken(newRefreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  })

  const accessToken = signAccessToken({
    id: user.id,
    email: user.email,
    role: user.role as UserRole,
  })

  return { accessToken, refreshToken: newRefreshToken }
}

export async function logout(userId: string, token: string) {
  const tokenHash = hashToken(token)
  await prisma.session.deleteMany({
    where: { userId, refreshTokenHash: tokenHash },
  })
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      patient: {
        select: {
          id: true,
          dossierNumber: true,
          phone: true,
          dateNaissance: true,
          nationalite: true,
          ville: true,
          pays: true,
          sourceContact: true,
          status: true,
        },
      },
    },
  })
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Utilisateur introuvable.')

  return {
    user: { id: user.id, email: user.email, role: user.role, name: user.fullName, avatar: user.avatar },
    patient: user.patient ?? null,
  }
}
