import { queryClient } from './queryClient'

type CachedOpts = {
  /** Ignore le cache et force un nouvel appel réseau. */
  force?: boolean
}

/**
 * Lit depuis le cache React Query si encore frais, sinon appelle l’API.
 * Compatible avec les `load()` existants (pas de changement d’UI).
 */
export async function cachedFetch<T>(
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>,
  opts?: CachedOpts,
): Promise<T> {
  if (opts?.force) {
    await queryClient.invalidateQueries({ queryKey })
  }
  return queryClient.fetchQuery({
    queryKey: [...queryKey],
    queryFn,
  })
}

export function invalidateCache(queryKey: readonly unknown[]) {
  return queryClient.invalidateQueries({ queryKey: [...queryKey] })
}

/** true s’il y a déjà des données en cache (évite un flash « Chargement… »). */
export function hasCachedData(queryKey: readonly unknown[]) {
  return queryClient.getQueryData([...queryKey]) != null
}

/** Met à jour le cache sans refetch (ex. marquer une notif comme lue). */
export function setCachedData<T>(queryKey: readonly unknown[], data: T) {
  queryClient.setQueryData([...queryKey], data)
}
