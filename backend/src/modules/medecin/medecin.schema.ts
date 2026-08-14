import { z } from 'zod'

export const rapportSchema = z.object({
  diagnostic:               z.string().optional(),
  examensDemandes:          z.array(z.string()).optional(),
  interventionsRecommandees: z.array(z.string()).optional(),
  valeurMedicale:           z.string().optional(),
  forfaitPropose:           z.number({ error: 'Le forfait médical est obligatoire.' }).positive('Le forfait doit être supérieur à 0.'),
  nuitsPreoperatoires:      z.number({ error: 'Le nombre de nuits préopératoires est obligatoire.' }).int().min(0).max(30),
  nuitsClinique:            z.number({ error: 'Le nombre de nuits postopératoires est obligatoire.' }).int().min(0).max(60),
  nuitsHotel:               z.number({ error: 'Le nombre de nuits hôtel est obligatoire.' }).int().min(0).max(60),
  vetementContention:       z.boolean({ error: 'Veuillez indiquer si un vêtement de contention est prescrit.' }),
  anesthesieGenerale:       z.boolean().optional(),
  drainage:                 z.boolean().optional(),
  nbSeancesDrainage:        z.number().int().min(1).max(60).optional().nullable(),
  dureeSejourTunisie:       z.number().int().min(0).max(90).optional(),
  nbAdultesSejour:          z.number().int().min(0).max(20).optional(),
  nbEnfantsSejour:          z.number().int().min(0).max(20).optional(),
  notes:                    z.string().optional(),
  /** true = crée un nouveau rapport (ne modifie pas les précédents). */
  nouveauRapport:           z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.drainage === true && (data.nbSeancesDrainage == null || data.nbSeancesDrainage < 1)) {
    ctx.addIssue({
      code: 'custom',
      path: ['nbSeancesDrainage'],
      message: 'Indiquez le nombre de séances de drainage.',
    })
  }
})
export type RapportInput = z.infer<typeof rapportSchema>

export const createAgendaEventSchema = z.object({
  type:       z.enum(['rdv', 'blocage', 'vacances']),
  title:      z.string().max(200).optional(),
  motif:      z.string().max(200).optional(),
  dateDebut:  z.string().datetime({ local: true }),
  dateFin:    z.string().datetime({ local: true }),
  allDay:     z.boolean().optional(),
  patientId:  z.string().uuid().optional(),
  statut:     z.enum(['planifie', 'confirme', 'annule']).optional(),
  notes:      z.string().max(500).optional(),
})
export type CreateAgendaEventInput = z.infer<typeof createAgendaEventSchema>

export const updateAgendaEventSchema = createAgendaEventSchema.partial()
export type UpdateAgendaEventInput = z.infer<typeof updateAgendaEventSchema>

export const updatePatientStatusSchema = z.object({
  status: z.enum([
    'nouveau', 'formulaire_en_cours', 'formulaire_complete', 'en_analyse',
    'rapport_genere', 'rapport_modifie', 'devis_preparation', 'devis_envoye', 'devis_accepte',
    'date_reservee', 'logistique', 'intervention', 'post_op', 'suivi_termine',
    'abstention',
  ]),
})
export type UpdatePatientStatusInput = z.infer<typeof updatePatientStatusSchema>

export const createPreDossierSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email().optional(),
  phone: z.string().min(6).max(30).optional(),
  ville: z.string().min(1).max(100).optional(),
  pays: z.string().min(1).max(100).optional(),
  nationalite: z.string().min(2).max(60).optional(),
  sourceContact: z.string().min(2).max(80).optional(),
  noteMedicale: z.string().max(500).optional(),
})
export type CreatePreDossierInput = z.infer<typeof createPreDossierSchema>
