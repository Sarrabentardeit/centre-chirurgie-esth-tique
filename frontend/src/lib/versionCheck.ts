/**
 * Force l’affichage de la dernière version déployée :
 * - compare le build courant au fichier /version.json (jamais mis en cache)
 * - recharge la page si une nouvelle version est détectée
 * - nettoie Cache API / Service Workers éventuellement présents
 */

const STORAGE_KEY = 'app-build-id'
const CHECK_INTERVAL_MS = 60_000

declare const __APP_BUILD_ID__: string

const CURRENT_BUILD =
  typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev'

let checking = false
let reloading = false

async function clearBrowserCaches() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
  } catch {
    /* ignore */
  }
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    /* ignore */
  }
}

async function fetchRemoteVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: string }
    return data.version ?? null
  } catch {
    return null
  }
}

export async function checkAppVersion() {
  if (checking || reloading) return
  if (import.meta.env.DEV) return

  checking = true
  try {
    const remote = await fetchRemoteVersion()
    if (!remote) return

    // Le JS en mémoire est plus ancien que le dernier déploiement
    if (remote !== CURRENT_BUILD) {
      reloading = true
      localStorage.setItem(STORAGE_KEY, remote)
      await clearBrowserCaches()
      window.location.reload()
      return
    }

    localStorage.setItem(STORAGE_KEY, CURRENT_BUILD)
  } finally {
    checking = false
  }
}

/** Démarre la surveillance (onglet ouvert après un déploiement). */
export function startVersionWatcher() {
  if (import.meta.env.DEV) return

  void clearBrowserCaches()
  void checkAppVersion()

  window.setInterval(() => void checkAppVersion(), CHECK_INTERVAL_MS)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkAppVersion()
  })

  window.addEventListener('focus', () => void checkAppVersion())
}
