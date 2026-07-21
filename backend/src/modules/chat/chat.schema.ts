import { z } from 'zod'

export const sendMessageSchema = z.object({
  contenu: z.string().trim().min(1, 'Message vide.').max(4000, 'Message trop long.'),
  /** Requis pour médecin / gestionnaire ; ignoré pour le patient (dossier déduit). */
  patientId: z.string().uuid().optional(),
})

export const markReadSchema = z.object({
  patientId: z.string().uuid().optional(),
})

export type SendMessageInput = z.infer<typeof sendMessageSchema>
export type MarkReadInput = z.infer<typeof markReadSchema>
