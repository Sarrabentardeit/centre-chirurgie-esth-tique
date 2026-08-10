/**
 * Force l’affichage de la dernière version déployée pour tous les utilisateurs :
 * - /version.json jamais mis en cache (nginx)
 * - index.html jamais mis en cache
 * - si une nouvelle version est détectée → purge caches + reload avec bust (?_v=)
 * - surveillance périodique tant que l’onglet reste ouvert
 */

const STORAGE_KEY = 'app-build-id'
const CHECK_INTERVAL_MS = 20_000

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

/** Reload dur : le query ?_v= force le navigateur à re-télécharger index.html */
function hardReload(buildId: string) {
  if (reloading) return
  reloading = true
  localStorage.setItem(STORAGE_KEY, buildId)
  void clearBrowserCaches().finally(() => {
    const url = new URL(window.location.href)
    // Évite une boucle si on a déjà busté pour cette version
    if (url.searchParams.get('_v') === buildId) {
      reloading = false
      return
    }
    url.searchParams.set('_v', buildId)
    window.location.replace(url.toString())
  })
}

/** Nettoie le paramètre _v de l’URL une fois la bonne version chargée. */
function stripBustParamIfCurrent() {
  try {
    const url = new URL(window.location.href)
    const bust = url.searchParams.get('_v')
    if (!bust) return
    if (bust === CURRENT_BUILD) {
      url.searchParams.delete('_v')
      window.history.replaceState({}, '', url.pathname + url.search + url.hash)
    }
  } catch {
    /* ignore */
  }
}

export async function checkAppVersion() {
  if (checking || reloading) return
  if (import.meta.env.DEV) return

  checking = true
  try {
    const remote = await fetchRemoteVersion()
    if (!remote) return

    if (remote !== CURRENT_BUILD) {
      hardReload(remote)
      return
    }

    localStorage.setItem(STORAGE_KEY, CURRENT_BUILD)
    stripBustParamIfCurrent()
  } finally {
    checking = false
  }
}

/** Démarre la surveillance (onglet ouvert après un déploiement). */
export function startVersionWatcher() {
  if (import.meta.env.DEV) return

  stripBustParamIfCurrent()
  void clearBrowserCaches()
  void checkAppVersion()

  window.setInterval(() => void checkAppVersion(), CHECK_INTERVAL_MS)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkAppVersion()
  })

  window.addEventListener('focus', () => void checkAppVersion())
  window.addEventListener('online', () => void checkAppVersion())
}
