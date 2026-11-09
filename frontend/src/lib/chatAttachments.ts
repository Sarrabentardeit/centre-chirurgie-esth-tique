/** Helpers pièces jointes chat (page complète + widget popup). */

import { resolveProtectedUploadUrl } from '@/lib/mediaUrl'

export function isImageUrl(url: string) {
  return /\.(jpe?g|png|webp)(\?|$)/i.test(url)
}

export function isPdfUrl(url: string, name?: string | null) {
  return /\.pdf(\?|$)/i.test(url) || /\.pdf$/i.test(name ?? '')
}

/** Rebase les URLs uploads vers l’API courante + auth (évite localhost / host Docker). */
export function resolveAttachmentUrl(value: string): string {
  return resolveProtectedUploadUrl(value)
}

export async function downloadAttachment(url: string, filename: string) {
  const href = resolveAttachmentUrl(url)
  const safeName = filename.trim() || 'document.pdf'
  try {
    const res = await fetch(href)
    if (!res.ok) throw new Error('download failed')
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = safeName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    const a = document.createElement('a')
    a.href = href
    a.download = safeName
    a.target = '_blank'
    a.rel = 'noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
}
