import { prisma } from './prisma.js'

/**
 * À l’acceptation d’une version : les autres devis encore « accepté »
 * du même patient passent en « remplacé » (un seul accepté actif).
 */
export async function supersedeOtherAcceptedDevis(patientId: string, keepDevisId: string) {
  return prisma.devis.updateMany({
    where: {
      patientId,
      id: { not: keepDevisId },
      statut: 'accepte',
      deletedAt: null,
    },
    data: { statut: 'remplace' },
  })
}
