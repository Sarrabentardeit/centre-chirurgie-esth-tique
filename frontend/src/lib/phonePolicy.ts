/** Politique téléphone patient (plateforme réservée à l’étranger). */

export const TUNISIA_PHONE_BLOCK_MESSAGE =
  "La plateforme ne gère que les demandes des patients provenant de l'étranger. Pour un diagnostic depuis la Tunisie, prière prendre RDV pour une consultation au cabinet au 216 27 626 300."

/** Détecte un numéro tunisien (+216, 00216, ou 8 chiffres locaux typiques si préfixe TN). */
export function isTunisianPhone(phone: string | null | undefined): boolean {
  if (!phone) return false
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('216')) return true
  if (phone.trim().startsWith('+216') || phone.trim().startsWith('00216')) return true
  return false
}
