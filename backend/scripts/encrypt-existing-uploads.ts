/**
 * Chiffre les fichiers déjà présents dans uploads/ (idempotent).
 * Usage : npx tsx scripts/encrypt-existing-uploads.ts
 */
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  isEncryptedUploadBuffer,
  persistUploadBytes,
  readDecryptedUpload,
} from '../src/lib/uploadCrypto.js'
import { readFile } from 'node:fs/promises'

const uploadsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../uploads')

async function main() {
  const files = await readdir(uploadsDir)
  let converted = 0
  let skipped = 0
  for (const name of files) {
    if (name.startsWith('.')) continue
    const fp = path.join(uploadsDir, name)
    const raw = await readFile(fp)
    if (isEncryptedUploadBuffer(raw)) {
      skipped += 1
      continue
    }
    const plain = await readDecryptedUpload(fp)
    await persistUploadBytes(fp, plain)
    converted += 1
    console.log('encrypted:', name)
  }
  console.log(`Done. converted=${converted} already_encrypted=${skipped}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
