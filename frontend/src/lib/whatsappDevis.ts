/** Ouvre un onglet tout de suite (évite le bloqueur de popup après un await). */
export function prepareWhatsAppPopup(): Window | null {
  try {
    return window.open('about:blank', 'whatsapp-devis')
  } catch {
    return null
  }
}

export function finishWhatsAppPopup(popup: Window | null, url: string | null | undefined): boolean {
  if (!url) {
    try {
      popup?.close()
    } catch {
      /* ignore */
    }
    return false
  }
  try {
    if (popup && !popup.closed) {
      popup.location.href = url
      return true
    }
  } catch {
    /* ignore */
  }
  window.open(url, '_blank')
  return true
}
