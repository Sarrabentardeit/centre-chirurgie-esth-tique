import { z } from 'zod'

const ligneDevisSchema = z.object({
  description: z.string().min(1),
  quantite: z.number().int().positive(),
  prixUnitaire: z.number().nonnegative(),
  total: z.number().nonnegative(),
})

export const upsertDevisDraftSchema = z.object({
  dateValidite: z.string().optional().nullable(),
  lignes: z.array(ligneDevisSchema).min(1),
  total: z.number().nonnegative(),
  planningMedical: z.string().optional().nullable(),
  notesSejour: z.string().optional().nullable(),
  currency: z.string().length(3).optional().default('EUR'),
})

export type UpsertDevisDraftInput = z.infer<typeof upsertDevisDraftSchema>

export const refuseDevisSchema = z.preprocess(
  (v) => (v === undefined || v === null || v === '' ? {} : v),
  z.object({ reason: z.string().optional() })
)

export type RefuseDevisInput = z.infer<typeof refuseDevisSchema>

export const logistiqueSchema = z.object({
  passport: z.boolean(),
  billet: z.boolean(),
  hebergementConfirme: z.boolean(),
  transfertAeroport: z.boolean(),
  notes: z.string().optional().default(''),
  dateArrivee: z.string().optional().nullable(),
  dateDepart: z.string().optional().nullable(),
  hebergement: z.string().optional().nullable(),
  transport: z.string().optional().nullable(),
  accompagnateur: z.string().optional().nullable(),
})

export type LogistiqueInput = z.infer<typeof logistiqueSchema>

const templateKeySchema = z.enum(['formulaireAck', 'devisSent', 'refus'])

export const updateTemplateSchema = z.object({
  key: templateKeySchema.optional(),
  content: z.string().min(5),
  channel: z.enum(['chat', 'notification', 'both']),
  active: z.boolean(),
})

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>

export const resetTemplateSchema = z.object({
  key: templateKeySchema,
})

const chirurgieRowSchema = z.object({
  intervention: z.string(),
  date: z.string(),
})

const formulairePayloadSchema = z.object({
  // Step 1 - Données personnelles
  poids: z.string().optional(),
  taille: z.string().optional(),
  periodeSouhaitee: z.string().optional(),
  // Step 2 - Données médicales
  antecedents: z.array(z.string()).optional(),
  traitementEnCours: z.boolean().optional(),
  traitementDetails: z.string().optional(),
  fumeur: z.boolean().optional(),
  detailsTabac: z.string().optional(),
  alcool: z.boolean().optional(),
  detailsAlcool: z.string().optional(),
  drogue: z.boolean().optional(),
  detailsDrogue: z.string().optional(),
  autresMaladiesChroniques: z.string().optional(),
  chirurgiesAnterieures: z.boolean().optional(),
  chirurgiesRows: z.array(chirurgieRowSchema).optional(),
  allergies: z.string().optional(),
  groupeSanguin: z.string().optional(),
  // Step 3 - Demande
  interventionsSouhaitees: z.array(z.string()).optional(),
  descriptionDemande: z.string().optional(),
  dateSouhaitee: z.string().optional(),
}).optional()

export const createUserByGestionnaireSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['patient', 'medecin', 'gestionnaire']),
  phone: z.string().optional(),
  dateNaissance: z.string().optional(),
  nationalite: z.string().optional(),
  ville: z.string().optional(),
  pays: z.string().optional(),
  sourceContact: z.string().optional(),
  formulairePayload: formulairePayloadSchema,
})

export type CreateUserByGestionnaireInput = z.infer<typeof createUserByGestionnaireSchema>
