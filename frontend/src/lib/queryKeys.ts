/** Clés React Query partagées (Navbar + pages listes). */
export const queryKeys = {
  patients: (role: 'medecin' | 'gestionnaire', search = '', status?: string) =>
    ['patients', role, search, status ?? ''] as const,

  medecinPatientsAll: () => ['patients', 'medecin', '', ''] as const,

  medecinDevis: () => ['devis', 'medecin'] as const,

  gestionnairePatients: () => ['patients', 'gestionnaire', '', ''] as const,

  notifications: (role: 'patient' | 'medecin' | 'gestionnaire') =>
    ['notifications', role] as const,

  logistique: () => ['logistique'] as const,

  planningSejour: () => ['planning-sejour'] as const,

  audit: (entity = '') => ['audit', entity] as const,

  postOpPatients: () => ['post-op', 'medecin'] as const,

  users: (search: string, role: string, page: number) =>
    ['users', search, role, page] as const,
}
