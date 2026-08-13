import { z } from 'zod'

export const sendMessageSchema = z
  .object({
    contenu: z.string().trim().max(4000, 'Message trop long.').optional().default(''),
    /** Requis pour médecin / gestionnaire ; ignoré pour le patient (dossier déduit). */
    patientId: z.string().uuid().optional(),
    pieceJointeUrl: z.string().url().optional(),
    pieceJointeNom: z.string().trim().max(255).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.contenu && !data.pieceJointeUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Message vide.',
        path: ['contenu'],
      })
    }
  })

export const markReadSchema = z.object({
  patientId: z.string().uuid().optional(),
})

export const messageIdParamSchema = z.object({
  messageId: z.string().uuid(),
})

export const pinMessageSchema = z.object({
  pinned: z.boolean(),
})

export type SendMessageInput = z.infer<typeof sendMessageSchema>
export type MarkReadInput = z.infer<typeof markReadSchema>
