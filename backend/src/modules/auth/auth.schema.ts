import { z } from 'zod'

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
