import { z } from 'zod'

export const formulaireSubmitSchema = z.object({
  status: z.enum(['draft', 'submitted']),
  payload: z.record(z.string(), z.unknown()),
})
export type FormulaireSubmitInput = z.infer<typeof formulaireSubmitSchema>

export const updateProfilSchema = z.object({
  phone:      z.string().min(6).max(30).optional(),
  nationalite: z.string().min(2).max(60).optional(),
  ville:      z.string().min(1).max(100).optional(),
  pays:       z.string().min(1).max(100).optional(),
})
export type UpdateProfilInput = z.infer<typeof updateProfilSchema>

export const repondreDevisSchema = z.object({
  reponse:     z.enum(['accepte', 'refuse']),
  commentaire: z.string().max(500).optional(),
})
export type RepondreDevisInput = z.infer<typeof repondreDevisSchema>

export const repondreRendezVousSchema = z.object({
  decision: z.enum(['accepter', 'autre_date']),
  message: z.string().max(500).optional(),
})
export type RepondreRendezVousInput = z.infer<typeof repondreRendezVousSchema>
