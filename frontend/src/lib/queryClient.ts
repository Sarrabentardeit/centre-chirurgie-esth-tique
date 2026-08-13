import { QueryClient } from '@tanstack/react-query'

/**
 * Cache partagé : les listes restent fraîches 5 min.
 * Pas de refetch auto au focus fenêtre (évite d’écraser un formulaire ouvert).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
})
