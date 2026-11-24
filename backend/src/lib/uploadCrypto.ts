import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { existsSync, unlink } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Request } from 'express'
import type { StorageEngine } from 'multer'
import { env } from '../config/env.js'

/** En-tête des fichiers chiffrés at-rest (AES-256-GCM). */
const MAGIC = Buffer.from('CEENC1')
const IV_LEN = 12
const TAG_LEN = 16

function encryptionKey(): Buffer {
  const raw = env.UPLOAD_ENCRYPTION_KEY?.trim()
  if (raw && /^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  // Repli stable : dérivé du secret JWT (toujours 32 octets).
  return createHash('sha256').update(`upload-at-rest:${env.JWT_ACCESS_SECRET}`).digest()
}

export function isEncryptedUploadBuffer(buf: Buffer): boolean {
  return buf.length >= MAGIC.length + IV_LEN + TAG_LEN && buf.subarray(0, MAGIC.length).equals(MAGIC)
}

export function encryptUploadBuffer(plain: Buffer): Buffer {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([MAGIC, iv, tag, ciphertext])
}

/** Déchiffre si format CEENC1, sinon renvoie le buffer tel quel (fichiers historiques). */
export function decryptUploadBuffer(stored: Buffer): Buffer {
  if (!isEncryptedUploadBuffer(stored)) return stored
  const iv = stored.subarray(MAGIC.length, MAGIC.length + IV_LEN)
  const tag = stored.subarray(MAGIC.length + IV_LEN, MAGIC.length + IV_LEN + TAG_LEN)
  const data = stored.subarray(MAGIC.length + IV_LEN + TAG_LEN)
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

export async function writeEncryptedUpload(filePath: string, plain: Buffer): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, encryptUploadBuffer(plain))
}

export async function readDecryptedUpload(filePath: string): Promise<Buffer> {
  const stored = await readFile(filePath)
  return decryptUploadBuffer(stored)
}

export function guessContentType(filePath: string): string | undefined {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  return undefined
}

type FileNameFn = (
  req: Request,
  file: Express.Multer.File,
) => string

/** Multer storage : écrit le fichier chiffré sur disque (nom logique inchangé). */
export function createEncryptedDiskStorage(
  uploadsDir: string,
  filename: FileNameFn,
): StorageEngine {
  return {
    _handleFile(req, file, cb) {
      const name = filename(req, file as Express.Multer.File)
      const outPath = path.join(uploadsDir, name)
      const chunks: Buffer[] = []
      file.stream.on('data', (chunk: Buffer) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      file.stream.on('error', (err) => cb(err))
      file.stream.on('end', () => {
        void (async () => {
          try {
            await mkdir(uploadsDir, { recursive: true })
            const plain = Buffer.concat(chunks)
            await writeEncryptedUpload(outPath, plain)
            cb(null, {
              destination: uploadsDir,
              filename: name,
              path: outPath,
              size: plain.length,
            })
          } catch (err) {
            cb(err as Error)
          }
        })()
      })
    },
    _removeFile(_req, file, cb) {
      const p = (file as Express.Multer.File).path
      if (!p || !existsSync(p)) {
        cb(null)
        return
      }
      unlink(p, (err) => cb(err ?? null))
    },
  }
}

/** Écrit un buffer PDF/image déjà en mémoire (hors multer). */
export async function persistUploadBytes(filePath: string, plain: Buffer): Promise<void> {
  await writeEncryptedUpload(filePath, plain)
}