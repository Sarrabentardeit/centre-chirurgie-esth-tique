import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'
import { env } from '../config/env.js'

const PREFIX = 'enc:v1:'
const IV_LEN = 12
const TAG_LEN = 16

function fieldKey(): Buffer {
  const raw = env.FIELD_ENCRYPTION_KEY?.trim() || env.UPLOAD_ENCRYPTION_KEY?.trim()
  if (raw && /^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  return createHash('sha256').update(`field-at-rest:${env.JWT_ACCESS_SECRET}`).digest()
}

export function isEncryptedField(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

export function encryptField(plain: string | null | undefined): string | null {
  if (plain == null) return null
  if (plain === '' || isEncryptedField(plain)) return plain
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', fieldKey(), iv)
  const ct = Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64url')
}

export function decryptField(stored: string | null | undefined): string | null {
  if (stored == null) return null
  if (!isEncryptedField(stored)) return stored
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64url')
  if (raw.length < IV_LEN + TAG_LEN + 1) return stored
  const iv = raw.subarray(0, IV_LEN)
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const data = raw.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv('aes-256-gcm', fieldKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

/** Index aveugle pour recherche / unicité email (pas réversible). */
export function blindIndex(value: string): string {
  return createHmac('sha256', fieldKey())
    .update(value.trim().toLowerCase())
    .digest('hex')
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

const ENC_JSON_KEY = '__enc'

export function encryptJsonValue(value: unknown): unknown {
  if (value == null) return value
  if (typeof value === 'object' && !Array.isArray(value) && ENC_JSON_KEY in (value as object)) {
    return value
  }
  const plain = JSON.stringify(value)
  return { [ENC_JSON_KEY]: encryptField(plain) }
}

export function decryptJsonValue(value: unknown): unknown {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return value
  const rec = value as Record<string, unknown>
  if (typeof rec[ENC_JSON_KEY] !== 'string') return value
  const plain = decryptField(rec[ENC_JSON_KEY] as string)
  if (plain == null) return value
  try {
    return JSON.parse(plain) as unknown
  } catch {
    return value
  }
}

/** Champs string chiffrés par modèle Prisma. */
export const ENCRYPTED_STRING_FIELDS: Record<string, string[]> = {
  User: ['email', 'fullName'],
  Patient: ['phone', 'nationalite', 'ville', 'pays', 'sourceContact', 'pendingRapportChangeNote'],
  Message: ['contenu'],
  Rapport: ['diagnostic', 'notes'],
  Devis: ['notesSejour', 'planningMedical'],
  Logistique: ['notesClinique', 'notesLogistiques', 'hebergement', 'transport', 'accompagnateur'],
  SuiviPostOp: [], // photos JSON handled separately if needed
}

export const ENCRYPTED_JSON_FIELDS: Record<string, string[]> = {
  Formulaire: ['payload'],
  SuiviPostOp: ['notesInternes'],
}

function encryptDataObject(model: string, data: Record<string, unknown>): void {
  for (const key of ENCRYPTED_STRING_FIELDS[model] ?? []) {
    if (typeof data[key] === 'string') {
      data[key] = encryptField(data[key] as string)
    }
  }
  for (const key of ENCRYPTED_JSON_FIELDS[model] ?? []) {
    if (key in data && data[key] !== undefined) {
      data[key] = encryptJsonValue(data[key])
    }
  }
  if (model === 'User' && typeof data.email === 'string') {
    const emailPlain = isEncryptedField(data.email)
      ? decryptField(data.email)
      : normalizeEmail(data.email)
    if (emailPlain) {
      data.emailBlind = blindIndex(emailPlain)
      if (!isEncryptedField(data.email as string)) {
        data.email = encryptField(normalizeEmail(data.email as string))
      }
    }
  }
}

function walkEncryptInput(model: string, value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => walkEncryptInput(model, v))

  const obj = value as Record<string, unknown>
  // Prisma nested: { create: {...} } | { update: {...} } | { connect: ... }
  for (const op of ['create', 'update', 'upsert', 'createMany', 'updateMany', 'connectOrCreate'] as const) {
    if (obj[op] != null && typeof obj[op] === 'object') {
      if (op === 'upsert' && obj[op] && typeof obj[op] === 'object') {
        const up = obj[op] as Record<string, unknown>
        if (up.create && typeof up.create === 'object') encryptDataObject(model, up.create as Record<string, unknown>)
        if (up.update && typeof up.update === 'object') encryptDataObject(model, up.update as Record<string, unknown>)
      } else if (op === 'connectOrCreate' && obj[op] && typeof obj[op] === 'object') {
        const coc = obj[op] as Record<string, unknown>
        if (coc.create && typeof coc.create === 'object') encryptDataObject(model, coc.create as Record<string, unknown>)
      } else if (op === 'createMany' && obj[op] && typeof obj[op] === 'object') {
        const cm = obj[op] as { data?: unknown }
        if (Array.isArray(cm.data)) {
          for (const row of cm.data) {
            if (row && typeof row === 'object') encryptDataObject(model, row as Record<string, unknown>)
          }
        } else if (cm.data && typeof cm.data === 'object') {
          encryptDataObject(model, cm.data as Record<string, unknown>)
        }
      } else if (Array.isArray(obj[op])) {
        for (const row of obj[op] as unknown[]) {
          if (row && typeof row === 'object') encryptDataObject(model, row as Record<string, unknown>)
        }
      } else {
        encryptDataObject(model, obj[op] as Record<string, unknown>)
      }
    }
  }

  // Direct data payload
  if ('email' in obj || 'fullName' in obj || 'phone' in obj || 'contenu' in obj || 'payload' in obj) {
    encryptDataObject(model, obj)
  }
  return obj
}

export function encryptArgsForModel(model: string, args: Record<string, unknown>): void {
  if (args.data && typeof args.data === 'object') {
    if (Array.isArray(args.data)) {
      for (const row of args.data) {
        if (row && typeof row === 'object') encryptDataObject(model, row as Record<string, unknown>)
      }
    } else {
      encryptDataObject(model, args.data as Record<string, unknown>)
      encryptNestedRelations(args.data as Record<string, unknown>)
    }
  }
  if (args.create && typeof args.create === 'object') {
    encryptDataObject(model, args.create as Record<string, unknown>)
    encryptNestedRelations(args.create as Record<string, unknown>)
  }
  if (args.update && typeof args.update === 'object') {
    encryptDataObject(model, args.update as Record<string, unknown>)
    encryptNestedRelations(args.update as Record<string, unknown>)
  }
  void walkEncryptInput
}

function encryptNestedRelations(data: Record<string, unknown>) {
  const nested: Array<[string, string]> = [
    ['user', 'User'],
    ['patient', 'Patient'],
    ['formulaires', 'Formulaire'],
    ['messages', 'Message'],
    ['rapports', 'Rapport'],
    ['devis', 'Devis'],
    ['logistique', 'Logistique'],
    ['suiviPostOp', 'SuiviPostOp'],
  ]
  for (const [key, model] of nested) {
    const rel = data[key]
    if (!rel || typeof rel !== 'object') continue
    walkEncryptInput(model, rel)
    const r = rel as Record<string, unknown>
    if (r.create && typeof r.create === 'object') {
      if (Array.isArray(r.create)) {
        for (const row of r.create) {
          if (row && typeof row === 'object') encryptDataObject(model, row as Record<string, unknown>)
        }
      } else {
        encryptDataObject(model, r.create as Record<string, unknown>)
      }
    }
    if (r.update && typeof r.update === 'object') {
      encryptDataObject(model, r.update as Record<string, unknown>)
    }
  }
}

export function decryptModelRecord(model: string, row: Record<string, unknown>): void {
  for (const key of ENCRYPTED_STRING_FIELDS[model] ?? []) {
    if (typeof row[key] === 'string') {
      row[key] = decryptField(row[key] as string)
    }
  }
  for (const key of ENCRYPTED_JSON_FIELDS[model] ?? []) {
    if (key in row) {
      row[key] = decryptJsonValue(row[key])
    }
  }
}

const MODEL_NAME_BY_KEY: Record<string, string> = {
  user: 'User',
  patient: 'Patient',
  formulaires: 'Formulaire',
  formulaire: 'Formulaire',
  messages: 'Message',
  message: 'Message',
  rapports: 'Rapport',
  rapport: 'Rapport',
  devis: 'Devis',
  logistique: 'Logistique',
  suiviPostOp: 'SuiviPostOp',
  expediteur: 'User',
}

export function decryptDeep(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value
  if (value instanceof Date) return value
  if (Array.isArray(value)) return value.map(decryptDeep)

  const obj = value as Record<string, unknown>
  // Heuristic: if it looks like a User / Patient row
  if ('passwordHash' in obj || ('email' in obj && 'fullName' in obj && 'role' in obj)) {
    decryptModelRecord('User', obj)
  } else if ('dossierNumber' in obj && ('phone' in obj || 'userId' in obj)) {
    decryptModelRecord('Patient', obj)
  } else if ('payload' in obj && 'patientId' in obj && 'status' in obj) {
    decryptModelRecord('Formulaire', obj)
  } else if ('contenu' in obj && 'expediteurId' in obj) {
    decryptModelRecord('Message', obj)
  } else if ('diagnostic' in obj || ('notes' in obj && 'medecinId' in obj)) {
    decryptModelRecord('Rapport', obj)
  } else if ('notesSejour' in obj || 'planningMedical' in obj) {
    decryptModelRecord('Devis', obj)
  } else if ('notesClinique' in obj || 'dateIntervention' in obj && 'hebergement' in obj) {
    decryptModelRecord('Logistique', obj)
  } else if ('notesInternes' in obj && 'photos' in obj) {
    decryptModelRecord('SuiviPostOp', obj)
  }

  for (const [k, v] of Object.entries(obj)) {
    if (v != null && typeof v === 'object') {
      const nestedModel = MODEL_NAME_BY_KEY[k]
      if (nestedModel && !Array.isArray(v) && !(v instanceof Date)) {
        decryptModelRecord(nestedModel, v as Record<string, unknown>)
      }
      obj[k] = decryptDeep(v)
    }
  }
  return obj
}
