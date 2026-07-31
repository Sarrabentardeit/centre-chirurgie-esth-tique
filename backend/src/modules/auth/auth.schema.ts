import { z } from 'zod'
import { isTunisianPhone, TUNISIA_PHONE_BLOCK_MESSAGE } from '../../lib/phonePolicy.js'

export const registerSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Mot de passe : 8 caractères minimum'),
  fullName: z.string().min(2, 'Nom complet requis'),
  phone: z.string().min(6, 'Téléphone requis'),
  dateNaissance: z.string().optional(),
  nationalite: z.string().optional(),
  ville: z.string().optional(),
  pays: z.string().optional(),
  sourceContact: z.string().optional(),
}).superRefine((data, ctx) => {
  if (isTunisianPhone(data.phone)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['phone'],
      message: TUNISIA_PHONE_BLOCK_MESSAGE,
    })
  }
  if (data.pays && /tunisie/i.test(data.pays.trim())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pays'],
      message: TUNISIA_PHONE_BLOCK_MESSAGE,
    })
  }
})

export const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
