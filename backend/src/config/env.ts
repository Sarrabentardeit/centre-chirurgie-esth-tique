import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL est requis'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET doit faire au moins 32 caractères'),
  /** Access token : 24h par défaut. Renouvelé via refresh. */
  JWT_ACCESS_EXPIRES_IN: z.string().default('24h'),

  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET doit faire au moins 32 caractères'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('90d'),

  UPLOAD_DIR: z.string().default('uploads'),
  UPLOAD_MAX_FILE_SIZE_MB: z.coerce.number().default(10),
  CORS_ORIGINS: z.string().optional(),

  /** Synchro Google Calendar */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined))
    .pipe(z.string().url().optional()),
  FRONTEND_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined))
    .pipe(z.string().url().optional()),

  /**
   * URL publique de l’app (liens dans les emails patients).
   * En prod : https://chennoufi.nav.ovh
   * Ne pas mettre localhost ici.
   */
  PUBLIC_APP_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined))
    .pipe(z.string().url().optional()),

  /** ExchangeRate-API (v6) — conversion indicative TND → EUR (gestionnaire). */
  EXCHANGE_RATE_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined)),

  /** SMTP — notifications email automatiques. */
  SMTP_HOST: z.string().optional().default('ssl0.ovh.net'),
  SMTP_PORT: z.coerce.number().optional().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  /**
   * Destinataires email (séparés par des virgules).
   * - MEDECIN : formulaires patients (sinon fallback NOTIFICATION_EMAILS)
   * - GESTIONNAIRE : rapport médical généré (sinon fallback NOTIFICATION_EMAILS)
   * - NOTIFICATION_EMAILS : liste partagée (médecin + gestionnaire si dédiées vides)
   */
  NOTIFICATION_EMAILS: z.string().optional(),
  NOTIFICATION_EMAILS_MEDECIN: z.string().optional(),
  NOTIFICATION_EMAILS_GESTIONNAIRE: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌  Variables d\'environnement invalides :')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
