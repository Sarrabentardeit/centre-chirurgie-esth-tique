export type UserRole = 'patient' | 'medecin' | 'gestionnaire'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  avatar?: string
  phone?: string
}

export type DossierStatus =
  | 'nouveau'
  | 'formulaire_en_cours'
  | 'formulaire_complete'
  | 'en_analyse'
  | 'rapport_genere'
  | 'devis_preparation'
  | 'devis_envoye'
  | 'devis_accepte'
  | 'date_reservee'
  | 'logistique'
  | 'intervention'
  | 'post_op'
  | 'suivi_termine'

export interface Patient {
  id: string
  userId: string
  numeroDossier?: string
  nom: string
  prenom: string
  email: string
  phone: string
  dateNaissance: string
  nationalite: string
  ville: string
  pays: string
  sourceContact: 'whatsapp' | 'instagram' | 'google' | 'direct'
  status: DossierStatus
  dateCreation: string
  derniereActivite: string
  avatar?: string
}

export interface FormulaireMedical {
  id: string
  patientId: string
  // Etape 1 - Infos personnelles
  poids: number
  taille: number
  groupeSanguin: string
  periodeSouhaitee?: string
  // Etape 2 - Antécédents médicaux
  antecedentsMedicaux: string[]
  traitementEnCours: boolean
  traitementDetails?: string
  allergies: string[]
  fumeur: boolean
  detailsTabac?: string
  alcool: boolean
  detailsAlcool?: string
  drogue: boolean
  detailsDrogue?: string
  tensionArterielle?: string
  diabete: boolean
  maladieCardiaque: boolean
  autresMaladiesChroniques?: string
  chirurgiesAnterieures: boolean
  chirurgiesDetails?: string
  // Etape 3 - Demande
  typeIntervention: string[]
  descriptionDemande: string
  zonesConcernees: string[]
  attentes: string
  // Etape 4 - Documents
  photos: string[]
  documentsPDF: string[]
  dateCompletion?: string
}

export interface RapportMedical {
  id: string
  patientId: string
  medecinId: string
  dateCreation: string
  diagnostic: string
  interventionsRecommandees: string[]
  notes: string
  valeurMedicale: string
  forfaitPropose?: number
  statut: 'brouillon' | 'finalise'
}

export interface LigneDevis {
  description: string
  quantite: number
  prixUnitaire: number
  total: number
}

export interface Devis {
  id: string
  patientId: string
  gestionnaireId: string
  dateCreation: string
  dateValidite: string
  lignes: LigneDevis[]
  total: number
  statut: 'brouillon' | 'envoye' | 'accepte' | 'refuse'
  planningMedical?: string
  notesSejour?: string
  version: number
}

export interface Notification {
  id: string
  userId: string
  titre: string
  message: string
  type: 'info' | 'success' | 'warning' | 'urgent'
  lu: boolean
  dateCreation: string
  lienAction?: string
}

export interface MessageChat {
  id: string
  dossierPatientId: string
  expediteurId: string
  expediteurRole: UserRole | 'bot'
  contenu: string
  dateEnvoi: string
  lu: boolean
}

export interface RendezVous {
  id: string
  patientId: string
  medecinId: string
  date: string
  heure: string
  type: 'consultation' | 'intervention' | 'suivi'
  statut: 'planifie' | 'confirme' | 'annule'
  notes?: string
}

export interface SuiviPostOp {
  id: string
  patientId: string
  dateIntervention: string
  dateRetour?: string
  photos: Array<{ url: string; date: string; note?: string }>
  compteRendu?: string
  alerteSuiviEnvoye: boolean
  questionnaireSatisfaction?: {
    dateEnvoi: string
    repondu: boolean
    note?: number
    commentaire?: string
  }
  // Démo: évite d'envoyer plusieurs fois la notification du questionnaire
  questionnaireDisponibiliteEnvoyee: boolean
}

export interface LogistiqueSejour {
  id: string
  patientId: string
  passport: boolean
  billet: boolean
  hebergement: boolean
  transfertAeroport: boolean
  dateArrivee?: string
  dateDepart?: string
  notes: string
}
