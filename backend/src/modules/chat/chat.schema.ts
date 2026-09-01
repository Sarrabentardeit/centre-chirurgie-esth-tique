import { z } from 'zod'

export const sendMessageSchema = z
  .object({
    contenu: z.string().trim().max(8000, 'Message trop long.').optional().default(''),
    /** Requis pour médecin / gestionnaire ; ignoré pour le patient (dossier déduit). */
    patientId: z.string().uuid().optional(),
    pieceJointeUrl: z.string().url().optional(),
    pieceJointeNom: z.string().trim().max(255).optional(),
    /** Message interne équipe (invisible patiente). Réservé staff. */
    staffOnly: z.boolean().optional().default(false),
    /** Message cité (réponse un à un). */
    replyToId: z.string().uuid().optional(),
    /** Email patient : copie du message de confirmation séjour (contenu intégral). */
    patientEmailKind: z.enum(['confirmation_reservation']).optional(),
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
  patientId: z.union([z.string().uuid(), z.literal('equipe')]).optional(),
  /** Limite le marquage lu au canal ouvert (évite de vider Demandes en lisant Patients). */
  channel: z.enum(['patient', 'equipe', 'all']).optional().default('all'),
})

export const messageIdParamSchema = z.object({
  messageId: z.string().uuid(),
})

export const pinMessageSchema = z.object({
  pinned: z.boolean(),
})

export type SendMessageInput = z.infer<typeof sendMessageSchema>
export type MarkReadInput = z.infer<typeof markReadSchema>
