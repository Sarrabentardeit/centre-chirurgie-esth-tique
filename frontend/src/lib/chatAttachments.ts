/** Helpers pièces jointes chat (page complète + widget popup). */

export function isImageUrl(url: string) {
  return /\.(jpe?g|png|webp)(\?|$)/i.test(url)
}

export function isPdfUrl(url: string, name?: string | null) {
  return /\.pdf(\?|$)/i.test(url) || /\.pdf$/i.test(name ?? '')
}

/** Rebase les URLs uploads vers l’API courante (évite localhost / host Docker). */
export function resolveAttachmentUrl(value: string): string {
  if (!value?.trim()) return value
  if (value.startsWith('blob:')) return value

  const viteApi = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000/api').replace(
    /\/$/,
    '',
  )
  const apiBase = viteApi.replace(/\/api\/?$/, '') || ''

  const normalizeUploadPath = (pathname: string): string => {
    if (pathname.startsWith('/api/uploads/')) return `/uploads/${pathname.slice('/api/uploads/'.length)}`
    return pathname
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const pathname = normalizeUploadPath(new URL(value).pathname)
      if (pathname.startsWith('/uploads/')) return `${apiBase}${pathname}`
    } catch {
      return value
    }
    return value
  }

  const pathPart = normalizeUploadPath(value.trim())
  if (pathPart.startsWith('/uploads/')) return `${apiBase}${pathPart}`
  if (pathPart.startsWith('/')) return `${apiBase}${pathPart}`
  if (pathPart.startsWith('uploads/')) return `${apiBase}/${pathPart}`
  return `${apiBase}/uploads/${pathPart}`
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
