import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { MOCK_DEVIS, MOCK_LOGISTIQUE, MOCK_MESSAGES, MOCK_NOTIFICATIONS, MOCK_PATIENTS, MOCK_RENDEZVOUS, MOCK_RAPPORTS, MOCK_SUIVI, MOCK_USERS } from '@/mocks/data'
import type {
  Devis,
  DossierStatus,
  FormulaireMedical,
  LogistiqueSejour,
  MessageChat,
  Notification,
  Patient,
  RapportMedical,
  RendezVous,
  SuiviPostOp,
  User,
} from '@/types'
import type { CurrencyUnit } from '@/lib/utils'
import { getPatientDossierNumber } from '@/lib/utils'

type CommunicationTemplateKey = 'formulaireAck' | 'devisSent' | 'refus'
type CommunicationTemplateChannel = 'chat' | 'notification' | 'both'
type CommunicationTemplate = {
  title: string
  content: string
  active: boolean
  channel: CommunicationTemplateChannel
  updatedAt: string
  updatedBy: string
}

type DemoState = {
  patients: Patient[]
  formulaires: FormulaireMedical[]
  rapports: RapportMedical[]
  devis: Devis[]
  currency: CurrencyUnit
  communicationTemplates: Record<CommunicationTemplateKey, CommunicationTemplate>
  notifications: Notification[]
  messages: MessageChat[]
  rdv: RendezVous[]
  suiviPostOp: SuiviPostOp[]
  logistique: LogistiqueSejour[]

  // Helpers
  getPatientByUserId: (userId: string) => Patient | undefined
  getPatientById: (patientId: string) => Patient | undefined
  getUnreadNotificationsForUser: (userId: string) => Notification[]

  // Demo actions (workflow)
  ensurePatientForUser: (user: User, opts?: { sourceContact?: Patient['sourceContact'] }) => Patient
  createLocalPatient: (payload: {
    prenom: string
    nom: string
    email?: string
    phone: string
    ville: string
    pays: string
    dateNaissance?: string
    nationalite?: string
    sourceContact?: Patient['sourceContact']
  }) => Patient
  submitMedicalForm: (
    patientUserId: string,
    form: Omit<FormulaireMedical, 'id' | 'patientId' | 'dateCompletion'> & { dateNaissance?: string }
  ) => void
  doctorFinalizeRapport: (patientId: string, medecinUserId: string, rapport: Omit<RapportMedical, 'id' | 'patientId' | 'medecinId' | 'dateCreation' | 'statut'>) => void
  gestionnaireSendDevis: (patientId: string, gestionnaireUserId: string, devisPayload: Omit<Devis, 'id' | 'patientId' | 'gestionnaireId' | 'dateCreation' | 'version' | 'statut'>) => void
  saveDraftDevis: (patientId: string, gestionnaireUserId: string, devisPayload: Omit<Devis, 'id' | 'patientId' | 'gestionnaireId' | 'dateCreation' | 'version' | 'statut'>) => void
  gestionnaireRefuseDevis: (patientId: string, devisId: string, reason?: string) => void
  patientAcceptDevis: (patientId: string, devisId: string) => void
  patientRequestDevisUpdate: (patientId: string, devisId: string, reason: string) => void
  patientConfirmRdv: (patientId: string, rdvPayload: Pick<RendezVous, 'date' | 'heure' | 'type' | 'notes'>) => void
  gestionnaireCompleteLogistique: (patientId: string) => void

  // Notifications actions
  markNotificationRead: (notificationId: string) => void
  markAllNotificationsReadForUser: (userId: string) => void

  // UI settings
  setCurrency: (currency: CurrencyUnit) => void
  setCommunicationTemplateContent: (
    key: CommunicationTemplateKey,
    value: string,
    updatedBy?: string
  ) => void
  setCommunicationTemplateChannel: (
    key: CommunicationTemplateKey,
    channel: CommunicationTemplateChannel,
    updatedBy?: string
  ) => void
  toggleCommunicationTemplate: (
    key: CommunicationTemplateKey,
    active: boolean,
    updatedBy?: string
  ) => void
  resetCommunicationTemplate: (key: CommunicationTemplateKey, updatedBy?: string) => void
  resetAllCommunicationTemplates: (updatedBy?: string) => void

  // Chat demo actions
  addChatMessage: (
    patientId: string,
    expediteurId: string,
    expediteurRole: MessageChat['expediteurRole'],
    contenu: string
  ) => void

  // Post-op demo actions (compte rendu + questionnaire)
  sendQuestionnaireIfReady: (patientId: string) => void
  submitQuestionnaire: (patientId: string, payload: { note: number; commentaire?: string }) => void
  addPostOpPhoto: (patientId: string, payload: { url: string; note?: string }) => void
}

function initialsFromName(name: string) {
  return name
    .split(' ')
    .map((s) => s.trim()[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function nowIso() {
  return new Date().toISOString()
}

function nextId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function applyTemplate(template: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce((acc, [k, v]) => {
    return acc.split(`{${k}}`).join(v)
  }, template)
}

const DEFAULT_COMMUNICATION_TEMPLATES: Record<CommunicationTemplateKey, CommunicationTemplate> = {
  formulaireAck: {
    title: 'Accusé de réception formulaire',
    content:
      'Rebonjour {prenom}, nous accusons réception de votre demande. Votre devis est en cours de traitement et vous sera remis sous 72h (sauf exception).',
    active: true,
    channel: 'both',
    updatedAt: new Date().toISOString(),
    updatedBy: 'Système',
  },
  devisSent: {
    title: 'Message accompagnant le devis',
    content:
      'Bonjour {prenom}, après examen de vos photos et de votre dossier médical, nous vous transmettons notre meilleure offre pour l organisation de votre séjour médical.',
    active: true,
    channel: 'both',
    updatedAt: new Date().toISOString(),
    updatedBy: 'Système',
  },
  refus: {
    title: 'Message de refus / abstention',
    content:
      'Chère {prenom}, après examen attentif de votre dossier, le Dr. Chennoufi a pris la décision de ne pas intervenir dans votre cas. {reason} Cette décision relève d une démarche éthique et professionnelle.',
    active: true,
    channel: 'both',
    updatedAt: new Date().toISOString(),
    updatedBy: 'Système',
  },
}

export const useDemoStore = create<DemoState>()(persist((set, get) => ({
  patients: [...MOCK_PATIENTS],
  formulaires: [],
  rapports: [...MOCK_RAPPORTS],
  devis: [...MOCK_DEVIS],
  currency: 'TND',
  communicationTemplates: {
    formulaireAck: { ...DEFAULT_COMMUNICATION_TEMPLATES.formulaireAck },
    devisSent: { ...DEFAULT_COMMUNICATION_TEMPLATES.devisSent },
    refus: { ...DEFAULT_COMMUNICATION_TEMPLATES.refus },
  },
  notifications: [...MOCK_NOTIFICATIONS],
  messages: [...MOCK_MESSAGES],
  rdv: [...MOCK_RENDEZVOUS],
  suiviPostOp: [...MOCK_SUIVI],
  logistique: [...MOCK_LOGISTIQUE],

  getPatientByUserId: (userId) => get().patients.find((p) => p.userId === userId),
  getPatientById: (patientId) => get().patients.find((p) => p.id === patientId),
  getUnreadNotificationsForUser: (userId) => get().notifications.filter((n) => n.userId === userId && !n.lu),

  ensurePatientForUser: (user, opts) => {
    const existing = get().patients.find((p) => p.userId === user.id)
    if (existing) return existing

    const [prenomMaybe, nomMaybe] = user.name.split(' ')
    const patient: Patient = {
      id: nextId('p'),
      userId: user.id,
      numeroDossier: '',
      prenom: prenomMaybe ?? 'Patient',
      nom: nomMaybe ?? '',
      email: user.email,
      phone: user.phone ?? '',
      dateNaissance: '1990-01-01',
      nationalite: 'Non précisé',
      ville: 'Alger',
      pays: 'Algérie',
      sourceContact: opts?.sourceContact ?? 'direct',
      status: 'nouveau' as DossierStatus,
      dateCreation: nowIso().slice(0, 10),
      derniereActivite: nowIso().slice(0, 10),
      avatar: user.avatar ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${initialsFromName(user.name)}`,
    }
    patient.numeroDossier = getPatientDossierNumber(patient)

    set((s) => ({ patients: [...s.patients, patient] }))

    // Seed chatbot for the new patient (CDC: chatbot available right after account creation)
    set((s) => {
      const alreadyHasChat = s.messages.some((m) => m.dossierPatientId === patient.id)
      if (alreadyHasChat) return s

      const botMessage: MessageChat = {
        id: nextId('m'),
        dossierPatientId: patient.id,
        expediteurId: 'bot',
        expediteurRole: 'bot',
        contenu: `Bonjour ${patient.prenom} ! Je suis l'assistant virtuel du Dr. Mehdi Chennoufi. Comment puis-je vous aider ?`,
        dateEnvoi: nowIso(),
        lu: false,
      }

      return { messages: [botMessage, ...s.messages] }
    })
    return patient
  },

  createLocalPatient: (payload) => {
    const patient: Patient = {
      id: nextId('p'),
      userId: nextId('u_local'),
      numeroDossier: '',
      prenom: payload.prenom.trim(),
      nom: payload.nom.trim(),
      email: payload.email?.trim() || `local.${Date.now()}@no-email.local`,
      phone: payload.phone.trim(),
      dateNaissance: payload.dateNaissance || '1990-01-01',
      nationalite: payload.nationalite || 'Non précisé',
      ville: payload.ville.trim(),
      pays: payload.pays.trim(),
      sourceContact: payload.sourceContact ?? 'direct',
      status: 'nouveau' as DossierStatus,
      dateCreation: nowIso().slice(0, 10),
      derniereActivite: nowIso().slice(0, 10),
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${initialsFromName(`${payload.prenom} ${payload.nom}`)}`,
    }
    patient.numeroDossier = getPatientDossierNumber(patient)

    set((s) => ({
      patients: [patient, ...s.patients],
    }))

    const medecin = MOCK_USERS.find((u) => u.role === 'medecin')
    const gestionnaire = MOCK_USERS.find((u) => u.role === 'gestionnaire')

    const message = `Nouveau dossier local créé: ${patient.prenom} ${patient.nom}.`
    const notifications: Notification[] = [
      medecin
        ? {
            id: nextId('n'),
            userId: medecin.id,
            titre: 'Nouveau dossier local',
            message,
            type: 'info',
            lu: false,
            dateCreation: nowIso(),
            lienAction: `/medecin/patients/${patient.id}`,
          }
        : null,
      gestionnaire
        ? {
            id: nextId('n'),
            userId: gestionnaire.id,
            titre: 'Nouveau dossier local',
            message,
            type: 'info',
            lu: false,
            dateCreation: nowIso(),
            lienAction: `/gestionnaire/devis`,
          }
        : null,
    ].filter(Boolean) as Notification[]

    if (notifications.length > 0) {
      set((s) => ({ notifications: [...notifications, ...s.notifications] }))
    }

    return patient
  },

  submitMedicalForm: (patientUserId, form) => {
    const patient = get().getPatientByUserId(patientUserId)
    if (!patient) return
    const { dateNaissance, ...medicalForm } = form

    set((s) => {
      const patients = s.patients.map((p) =>
        p.id === patient.id
          ? {
              ...p,
              dateNaissance: dateNaissance ?? p.dateNaissance,
              status: 'formulaire_complete' as DossierStatus,
              derniereActivite: nowIso().slice(0, 10),
            }
          : p
      )

      const medecin = MOCK_USERS.find((u) => u.role === 'medecin')
      const notification: Notification = {
        id: nextId('n'),
        userId: medecin?.id ?? 'u2',
        titre: `Nouveau dossier à analyser`,
        message: `${patient.prenom} ${patient.nom} a soumis son formulaire médical.`,
        type: 'info',
        lu: false,
        dateCreation: nowIso(),
        lienAction: `/medecin/patients/${patient.id}`,
      }

      const patientNotification: Notification = {
        id: nextId('n'),
        userId: patient.userId,
        titre: `Accusé de réception`,
        message: applyTemplate(s.communicationTemplates.formulaireAck.content, {
          prenom: patient.prenom,
          nom: patient.nom,
        }),
        type: 'info',
        lu: false,
        dateCreation: nowIso(),
        lienAction: `/patient/chat`,
      }

      const existingForm = s.formulaires.find((f) => f.patientId === patient.id)
      const newFormulaire: FormulaireMedical = existingForm
        ? {
            ...existingForm,
            ...medicalForm,
            patientId: patient.id,
            dateCompletion: nowIso().slice(0, 10),
          }
        : {
            id: nextId('f'),
            patientId: patient.id,
            ...medicalForm,
            dateCompletion: nowIso().slice(0, 10),
          }

      const formulaires = existingForm
        ? s.formulaires.map((f) => (f.id === existingForm.id ? newFormulaire : f))
        : [newFormulaire, ...s.formulaires]

      const ackMessage: MessageChat = {
        id: nextId('m'),
        dossierPatientId: patient.id,
        expediteurId: 'bot',
        expediteurRole: 'bot',
        contenu: applyTemplate(s.communicationTemplates.formulaireAck.content, {
          prenom: patient.prenom,
          nom: patient.nom,
        }),
        dateEnvoi: nowIso(),
        lu: false,
      }

      const ackMode = s.communicationTemplates.formulaireAck.channel
      const sendNotif = s.communicationTemplates.formulaireAck.active && (ackMode === 'both' || ackMode === 'notification')
      const sendChat = s.communicationTemplates.formulaireAck.active && (ackMode === 'both' || ackMode === 'chat')

      return {
        patients,
        formulaires,
        notifications: [notification, ...(sendNotif ? [patientNotification] : []), ...s.notifications],
        messages: sendChat ? [ackMessage, ...s.messages] : s.messages,
      }
    })
  },

  doctorFinalizeRapport: (patientId, medecinUserId, rapport) => {
    set((s) => {
      const patients = s.patients.map((p) =>
        p.id === patientId
          ? { ...p, status: 'rapport_genere' as DossierStatus, derniereActivite: nowIso().slice(0, 10) }
          : p
      )

      const existing = s.rapports.find((r) => r.patientId === patientId)
      const newRapport: RapportMedical = existing
        ? {
            ...existing,
            ...rapport,
            medecinId: medecinUserId,
            patientId,
            dateCreation: existing.dateCreation,
            statut: 'finalise',
          }
        : {
            id: nextId('r'),
            patientId,
            medecinId: medecinUserId,
            dateCreation: nowIso().slice(0, 10),
            statut: 'finalise',
            ...rapport,
          }

      const rapports = existing
        ? s.rapports.map((r) => (r.id === existing.id ? newRapport : r))
        : [newRapport, ...s.rapports]

      const gestionnaire = MOCK_USERS.find((u) => u.role === 'gestionnaire')
      const notification: Notification = {
        id: nextId('n'),
        userId: gestionnaire?.id ?? 'u3',
        titre: `Devis à préparer`,
        message: `Le rapport médical de ${s.patients.find((p) => p.id === patientId)?.prenom ?? 'patient'} est finalisé.`,
        type: 'info',
        lu: false,
        dateCreation: nowIso(),
        lienAction: `/gestionnaire/devis/${patientId}`,
      }

      return { patients, rapports, notifications: [notification, ...s.notifications] }
    })
  },

  gestionnaireSendDevis: (patientId, gestionnaireUserId, devisPayload) => {
    set((s) => {
      const patients = s.patients.map((p) =>
        p.id === patientId
          ? { ...p, status: 'devis_envoye' as DossierStatus, derniereActivite: nowIso().slice(0, 10) }
          : p
      )

      const existing = s.devis.find((d) => d.patientId === patientId)
      const version = existing ? existing.version + 1 : 1
      const newDevis: Devis = {
        id: existing?.id ?? nextId('d'),
        patientId,
        gestionnaireId: gestionnaireUserId,
        dateCreation: nowIso().slice(0, 10),
        dateValidite: devisPayload.dateValidite,
        lignes: devisPayload.lignes,
        total: devisPayload.total,
        planningMedical: devisPayload.planningMedical,
        notesSejour: devisPayload.notesSejour,
        statut: 'envoye' as Devis['statut'],
        version,
      }

      const devis = existing
        ? s.devis.map((d) => (d.id === existing.id ? newDevis : d))
        : [newDevis, ...s.devis]

      const patient = s.patients.find((p) => p.id === patientId)
      const notification: Notification = {
        id: nextId('n'),
        userId: patient?.userId ?? 'u1',
        titre: `Votre devis est disponible`,
        message: patient
          ? applyTemplate(s.communicationTemplates.devisSent.content, {
              prenom: patient.prenom,
              nom: patient.nom,
            })
          : `Votre devis est prêt et disponible.`,
        type: 'success',
        lu: false,
        dateCreation: nowIso(),
        lienAction: `/patient/devis`,
      }

      const devisMessage: MessageChat | null = patient
        ? {
            id: nextId('m'),
            dossierPatientId: patient.id,
            expediteurId: 'bot',
            expediteurRole: 'bot',
            contenu: applyTemplate(s.communicationTemplates.devisSent.content, {
              prenom: patient.prenom,
              nom: patient.nom,
            }),
            dateEnvoi: nowIso(),
            lu: false,
          }
        : null

      const sentMode = s.communicationTemplates.devisSent.channel
      const sendNotif = s.communicationTemplates.devisSent.active && (sentMode === 'both' || sentMode === 'notification')
      const sendChat = s.communicationTemplates.devisSent.active && (sentMode === 'both' || sentMode === 'chat')

      return {
        patients,
        devis,
        notifications: [...(sendNotif ? [notification] : []), ...s.notifications],
        messages: sendChat && devisMessage ? [devisMessage, ...s.messages] : s.messages,
      }
    })
  },

  saveDraftDevis: (patientId, gestionnaireUserId, devisPayload) => {
    set((s) => {
      const patients = s.patients.map((p) =>
        p.id === patientId
          ? { ...p, status: 'devis_preparation' as DossierStatus, derniereActivite: nowIso().slice(0, 10) }
          : p
      )

      const existing = s.devis.find((d) => d.patientId === patientId)
      const version = existing ? existing.version + 1 : 1
      const draft: Devis = {
        id: existing?.id ?? nextId('d'),
        patientId,
        gestionnaireId: gestionnaireUserId,
        dateCreation: nowIso().slice(0, 10),
        dateValidite: devisPayload.dateValidite,
        lignes: devisPayload.lignes,
        total: devisPayload.total,
        planningMedical: devisPayload.planningMedical,
        notesSejour: devisPayload.notesSejour,
        statut: 'brouillon',
        version,
      }

      const devis = existing
        ? s.devis.map((d) => (d.id === existing.id ? draft : d))
        : [draft, ...s.devis]

      return { patients, devis }
    })
  },

  gestionnaireRefuseDevis: (patientId, devisId, reason) => {
    set((s) => {
      const devis = s.devis.map((d) => {
        if (d.id !== devisId) return d
        return { ...d, statut: 'refuse' as Devis['statut'] }
      })

      const patient = s.patients.find((p) => p.id === patientId)
      if (!patient) return { devis }

      const notification: Notification = {
        id: nextId('n'),
        userId: patient.userId,
        titre: 'Décision du dossier',
        message: applyTemplate(s.communicationTemplates.refus.content, {
          prenom: patient.prenom,
          nom: patient.nom,
          reason: reason ? `Motif transmis: ${reason}.` : '',
        }),
        type: 'warning',
        lu: false,
        dateCreation: nowIso(),
        lienAction: '/patient/chat',
      }

      const refusalMessage: MessageChat = {
        id: nextId('m'),
        dossierPatientId: patient.id,
        expediteurId: 'bot',
        expediteurRole: 'bot',
        contenu: applyTemplate(s.communicationTemplates.refus.content, {
          prenom: patient.prenom,
          nom: patient.nom,
          reason: reason ? `Motif transmis: ${reason}.` : '',
        }),
        dateEnvoi: nowIso(),
        lu: false,
      }

      const refusMode = s.communicationTemplates.refus.channel
      const sendNotif = s.communicationTemplates.refus.active && (refusMode === 'both' || refusMode === 'notification')
      const sendChat = s.communicationTemplates.refus.active && (refusMode === 'both' || refusMode === 'chat')

      return {
        devis,
        notifications: [...(sendNotif ? [notification] : []), ...s.notifications],
        messages: sendChat ? [refusalMessage, ...s.messages] : s.messages,
      }
    })
  },

  patientAcceptDevis: (patientId, devisId) => {
    set((s) => {
      const devis = s.devis.map((d) => {
        if (d.id !== devisId) return d
        return { ...d, statut: 'accepte' as Devis['statut'] }
      })

      const patients = s.patients.map((p) =>
        p.id === patientId
          ? { ...p, status: 'devis_accepte' as DossierStatus, derniereActivite: nowIso().slice(0, 10) }
          : p
      )

      const gestionnaire = MOCK_USERS.find((u) => u.role === 'gestionnaire')
      const notification: Notification = {
        id: nextId('n'),
        userId: gestionnaire?.id ?? 'u3',
        titre: `Date à planifier`,
        message: `Le patient a accepté le devis. Il reste à confirmer la date d'intervention.`,
        type: 'info',
        lu: false,
        dateCreation: nowIso(),
        lienAction: `/gestionnaire/logistique`,
      }

      return { patients, devis, notifications: [notification, ...s.notifications] }
    })
  },

  patientRequestDevisUpdate: (patientId, devisId, reason) => {
    set((s) => {
      const devis = s.devis.map((d) => {
        if (d.id !== devisId) return d
        return { ...d, statut: 'brouillon' as Devis['statut'] }
      })

      const patients = s.patients.map((p) =>
        p.id === patientId
          ? { ...p, status: 'devis_preparation' as DossierStatus, derniereActivite: nowIso().slice(0, 10) }
          : p
      )

      const patient = s.patients.find((p) => p.id === patientId)
      const gestionnaire = MOCK_USERS.find((u) => u.role === 'gestionnaire')
      const medecin = MOCK_USERS.find((u) => u.role === 'medecin')

      const teamMsg = `Demande de modification devis de ${patient?.prenom ?? 'patient'}: ${reason}`

      const teamNotifs: Notification[] = [
        gestionnaire
          ? {
              id: nextId('n'),
              userId: gestionnaire.id,
              titre: 'Demande de modification devis',
              message: teamMsg,
              type: 'warning',
              lu: false,
              dateCreation: nowIso(),
              lienAction: '/gestionnaire/devis',
            }
          : null,
        medecin
          ? {
              id: nextId('n'),
              userId: medecin.id,
              titre: 'Demande de modification devis',
              message: teamMsg,
              type: 'info',
              lu: false,
              dateCreation: nowIso(),
              lienAction: `/medecin/patients/${patientId}`,
            }
          : null,
      ].filter(Boolean) as Notification[]

      const patientNotif: Notification | null = patient
        ? {
            id: nextId('n'),
            userId: patient.userId,
            titre: 'Demande envoyée',
            message: 'Votre demande de modification a été transmise à l’équipe.',
            type: 'success',
            lu: false,
            dateCreation: nowIso(),
            lienAction: '/patient/devis',
          }
        : null

      return {
        patients,
        devis,
        notifications: [...(patientNotif ? [patientNotif] : []), ...teamNotifs, ...s.notifications],
      }
    })
  },

  patientConfirmRdv: (patientId, rdvPayload) => {
    set((s) => {
      const patient = s.patients.find((p) => p.id === patientId)
      const medecin = MOCK_USERS.find((u) => u.role === 'medecin')
      if (!patient || !medecin) return s

      const rdv: RendezVous = {
        id: nextId('rv'),
        patientId,
        medecinId: medecin.id,
        date: rdvPayload.date,
        heure: rdvPayload.heure,
        type: rdvPayload.type,
        statut: 'confirme',
        notes: rdvPayload.notes,
      }

      const patients = s.patients.map((p) =>
        p.id === patientId
          ? { ...p, status: 'date_reservee' as DossierStatus, derniereActivite: nowIso().slice(0, 10) }
          : p
      )

      const gestionnaire = MOCK_USERS.find((u) => u.role === 'gestionnaire')
      const notification: Notification = {
        id: nextId('n'),
        userId: gestionnaire?.id ?? 'u3',
        titre: `Préparer la logistique`,
        message: `La date d'intervention de ${patient.prenom} est confirmée. Préparez le séjour.`,
        type: 'warning',
        lu: false,
        dateCreation: nowIso(),
        lienAction: `/gestionnaire/logistique`,
      }

      const patientNotif: Notification = {
        id: nextId('n'),
        userId: patient.userId,
        titre: `Date confirmée`,
        message: `Votre date d'intervention est confirmée. La logistique est en cours de préparation.`,
        type: 'success',
        lu: false,
        dateCreation: nowIso(),
        lienAction: `/patient/post-op`,
      }

      return { patients, rdv: [rdv, ...s.rdv], notifications: [notification, patientNotif, ...s.notifications] }
    })
  },

  gestionnaireCompleteLogistique: (patientId) => {
    set((s) => {
      const patient = s.patients.find((p) => p.id === patientId)
      if (!patient) return s

      const appointment = s.rdv.find((r) => r.patientId === patientId && r.type === 'intervention' && r.statut === 'confirme')
      const dateIntervention = appointment?.date ?? nowIso().slice(0, 10)
      const dateRetour = appointment
        ? (() => {
            // Démo: J+7 retour
            const dt = new Date(`${appointment.date}T00:00:00`)
            dt.setDate(dt.getDate() + 7)
            return dt.toISOString().slice(0, 10)
          })()
        : nowIso().slice(0, 10)

      const dateRetourPlus1 = (() => {
        const dt = new Date(`${dateRetour}T00:00:00`)
        dt.setDate(dt.getDate() + 1)
        return dt.toISOString().slice(0, 10)
      })()

      const rapport = s.rapports.find((r) => r.patientId === patientId)
      const devis = s.devis.find((d) => d.patientId === patientId)
      const interventionsText =
        rapport?.interventionsRecommandees?.length
          ? rapport.interventionsRecommandees.join(', ')
          : devis?.lignes?.length
            ? devis.lignes.map((l) => l.description).join(', ')
            : '—'

      const compteRenduTemplate = `Compte rendu opératoire (démo)
Patient : ${patient.prenom} ${patient.nom}
Date intervention : ${dateIntervention}
Date retour : ${dateRetour}

Interventions :
${interventionsText}

Résumé clinique :
${rapport?.notes ?? 'Le compte rendu sera disponible après l’intervention.'}

Signé (démo) : Dr. Mehdi Chennoufi
`

      const log: LogistiqueSejour = {
        id: nextId('l'),
        patientId,
        passport: true,
        billet: true,
        hebergement: true,
        transfertAeroport: true,
        dateArrivee: dateIntervention,
        dateDepart: dateRetour,
        notes: 'Logistique complète (démo).',
      }

      const suivi: SuiviPostOp = {
        id: nextId('s'),
        patientId,
        dateIntervention,
        dateRetour,
        photos: [],
        compteRendu: compteRenduTemplate,
        alerteSuiviEnvoye: false,
        questionnaireSatisfaction: {
          dateEnvoi: dateRetourPlus1,
          repondu: false,
        },
        questionnaireDisponibiliteEnvoyee: false,
      }

      const patients = s.patients.map((p) =>
        p.id === patientId
          ? { ...p, status: 'post_op' as DossierStatus, derniereActivite: nowIso().slice(0, 10) }
          : p
      )

      const notification: Notification = {
        id: nextId('n'),
        userId: patient.userId,
        titre: `Suivi post-op activé`,
        message: `Votre suivi post-opératoire est prêt. Vous recevrez le questionnaire après votre retour.`,
        type: 'info',
        lu: false,
        dateCreation: nowIso(),
        lienAction: `/patient/post-op`,
      }

      return {
        patients,
        logistique: [log, ...s.logistique],
        suiviPostOp: [suivi, ...s.suiviPostOp],
        notifications: [notification, ...s.notifications],
      }
    })
  },

  addChatMessage: (patientId, expediteurId, expediteurRole, contenu) => {
    set((s) => {
      const msg: MessageChat = {
        id: nextId('m'),
        dossierPatientId: patientId,
        expediteurId,
        expediteurRole,
        contenu,
        dateEnvoi: nowIso(),
        lu: false,
      }
      return { messages: [msg, ...s.messages] }
    })
  },

  markNotificationRead: (notificationId) => {
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === notificationId ? { ...n, lu: true } : n)),
    }))
  },

  markAllNotificationsReadForUser: (userId) => {
    set((s) => ({
      notifications: s.notifications.map((n) => (n.userId === userId ? { ...n, lu: true } : n)),
    }))
  },

  setCurrency: (currency) => {
    set({ currency })
  },

  setCommunicationTemplateContent: (key, value, updatedBy) => {
    set((s) => ({
      communicationTemplates: {
        ...s.communicationTemplates,
        [key]: {
          ...s.communicationTemplates[key],
          content: value,
          updatedAt: nowIso(),
          updatedBy: updatedBy ?? 'Gestionnaire',
        },
      },
    }))
  },

  setCommunicationTemplateChannel: (key, channel, updatedBy) => {
    set((s) => ({
      communicationTemplates: {
        ...s.communicationTemplates,
        [key]: {
          ...s.communicationTemplates[key],
          channel,
          updatedAt: nowIso(),
          updatedBy: updatedBy ?? 'Gestionnaire',
        },
      },
    }))
  },

  toggleCommunicationTemplate: (key, active, updatedBy) => {
    set((s) => ({
      communicationTemplates: {
        ...s.communicationTemplates,
        [key]: {
          ...s.communicationTemplates[key],
          active,
          updatedAt: nowIso(),
          updatedBy: updatedBy ?? 'Gestionnaire',
        },
      },
    }))
  },

  resetCommunicationTemplate: (key, updatedBy) => {
    set((s) => ({
      communicationTemplates: {
        ...s.communicationTemplates,
        [key]: {
          ...DEFAULT_COMMUNICATION_TEMPLATES[key],
          updatedAt: nowIso(),
          updatedBy: updatedBy ?? 'Gestionnaire',
        },
      },
    }))
  },

  resetAllCommunicationTemplates: (updatedBy) => {
    set(() => ({
      communicationTemplates: {
        formulaireAck: {
          ...DEFAULT_COMMUNICATION_TEMPLATES.formulaireAck,
          updatedAt: nowIso(),
          updatedBy: updatedBy ?? 'Gestionnaire',
        },
        devisSent: {
          ...DEFAULT_COMMUNICATION_TEMPLATES.devisSent,
          updatedAt: nowIso(),
          updatedBy: updatedBy ?? 'Gestionnaire',
        },
        refus: {
          ...DEFAULT_COMMUNICATION_TEMPLATES.refus,
          updatedAt: nowIso(),
          updatedBy: updatedBy ?? 'Gestionnaire',
        },
      },
    }))
  },

  sendQuestionnaireIfReady: (patientId) => {
    set((s) => {
      const suivi = s.suiviPostOp.find((x) => x.patientId === patientId)
      if (!suivi) return s
      if (!suivi.questionnaireSatisfaction) return s
      if (suivi.questionnaireSatisfaction.repondu) return s
      if (suivi.questionnaireDisponibiliteEnvoyee) return s

      const now = new Date()
      const readyAt = new Date(`${suivi.questionnaireSatisfaction.dateEnvoi}T00:00:00`)
      if (now.getTime() < readyAt.getTime()) return s

      const patient = s.patients.find((p) => p.id === patientId)
      const medecin = MOCK_USERS.find((u) => u.role === 'medecin')
      const gestionnaire = MOCK_USERS.find((u) => u.role === 'gestionnaire')
      if (!patient) return s

      const notificationPatient: Notification = {
        id: nextId('n'),
        userId: patient.userId,
        titre: `Questionnaire satisfaction disponible`,
        message: `Votre retour est enregistré. Merci de remplir le questionnaire (prend ~2 minutes).`,
        type: 'info',
        lu: false,
        dateCreation: nowIso(),
        lienAction: `/patient/post-op`,
      }

      const notificationsTeam: Notification[] = [
        medecin
          ? {
              id: nextId('n'),
              userId: medecin.id,
              titre: `Nouveau feedback patient (post-op)`,
              message: `${patient.prenom} ${patient.nom} peut désormais répondre au questionnaire de satisfaction (J+1 après retour).`,
              type: 'info',
              lu: false,
              dateCreation: nowIso(),
              lienAction: `/medecin/patients/${patientId}`,
            }
          : null,
        gestionnaire
          ? {
              id: nextId('n'),
              userId: gestionnaire.id,
              titre: `Nouveau feedback patient (post-op)`,
              message: `${patient.prenom} ${patient.nom} peut désormais répondre au questionnaire de satisfaction (J+1 après retour).`,
              type: 'info',
              lu: false,
              dateCreation: nowIso(),
              lienAction: `/gestionnaire/devis/${patientId}`,
            }
          : null,
      ].filter(Boolean) as Notification[]

      const botMessage: MessageChat = {
        id: nextId('m'),
        dossierPatientId: patientId,
        expediteurId: 'bot',
        expediteurRole: 'bot',
        contenu:
          `Bonjour ${patient.prenom} ! Votre questionnaire de satisfaction est maintenant disponible. ` +
          `Merci de partager votre avis (cela nous aide à améliorer le suivi).`,
        dateEnvoi: nowIso(),
        lu: false,
      }

      const suiviPostOp = s.suiviPostOp.map((x) =>
        x.patientId === patientId
          ? {
              ...x,
              questionnaireDisponibiliteEnvoyee: true,
            }
          : x
      )

      return {
        suiviPostOp,
        notifications: [notificationPatient, ...notificationsTeam, ...s.notifications],
        messages: [botMessage, ...s.messages],
      }
    })
  },

  submitQuestionnaire: (patientId, payload) => {
    set((s) => {
      const suivi = s.suiviPostOp.find((x) => x.patientId === patientId)
      if (!suivi || !suivi.questionnaireSatisfaction) return s
      if (suivi.questionnaireSatisfaction.repondu) return s

      const patient = s.patients.find((p) => p.id === patientId)
      if (!patient) return s
      const medecin = MOCK_USERS.find((u) => u.role === 'medecin')
      const gestionnaire = MOCK_USERS.find((u) => u.role === 'gestionnaire')

      const suiviPostOp = s.suiviPostOp.map((x) =>
        x.patientId === patientId
          ? (() => {
              if (!x.questionnaireSatisfaction) return x
              return {
                ...x,
                questionnaireSatisfaction: {
                  ...x.questionnaireSatisfaction,
                  repondu: true,
                  note: payload.note,
                  commentaire: payload.commentaire,
                },
              }
            })()
          : x
      )

      const notifPatient: Notification = {
        id: nextId('n'),
        userId: patient.userId,
        titre: `Merci pour votre retour`,
        message: `Votre questionnaire a bien été envoyé. Merci ${patient.prenom} !`,
        type: 'success',
        lu: false,
        dateCreation: nowIso(),
        lienAction: `/patient/post-op`,
      }

      const notifMed: Notification | null = medecin
        ? {
            id: nextId('n'),
            userId: medecin.id,
            titre: `Feedback reçu`,
            message: `Le patient ${patient.prenom} ${patient.nom} a répondu au questionnaire (note: ${payload.note}/5).`,
            type: 'success',
            lu: false,
            dateCreation: nowIso(),
            lienAction: `/medecin/patients/${patientId}`,
          }
        : null

      const notifGest: Notification | null = gestionnaire
        ? {
            id: nextId('n'),
            userId: gestionnaire.id,
            titre: `Feedback reçu`,
            message: `Le patient ${patient.prenom} ${patient.nom} a répondu au questionnaire (note: ${payload.note}/5).`,
            type: 'success',
            lu: false,
            dateCreation: nowIso(),
            lienAction: `/gestionnaire/devis/${patientId}`,
          }
        : null

      const botMessage: MessageChat = {
        id: nextId('m'),
        dossierPatientId: patientId,
        expediteurId: 'bot',
        expediteurRole: 'bot',
        contenu: `Merci ${patient.prenom} ! Votre feedback a bien été enregistré. Nous vous souhaitons une excellente récupération.`,
        dateEnvoi: nowIso(),
        lu: false,
      }

      return {
        suiviPostOp,
        notifications: [notifPatient, ...(notifMed ? [notifMed] : []), ...(notifGest ? [notifGest] : []), ...s.notifications],
        messages: [botMessage, ...s.messages],
      }
    })
  },

  addPostOpPhoto: (patientId, payload) => {
    set((s) => {
      const suivi = s.suiviPostOp.find((x) => x.patientId === patientId)
      if (!suivi) return s

      const newPhoto = {
        url: payload.url,
        date: nowIso().slice(0, 10),
        note: payload.note,
      }

      const suiviPostOp = s.suiviPostOp.map((x) =>
        x.patientId === patientId
          ? {
              ...x,
              photos: [newPhoto, ...x.photos],
            }
          : x
      )

      return { suiviPostOp }
    })
  },
}), {
  name: 'demo-store',
  partialize: (s) => ({
    patients: s.patients,
    formulaires: s.formulaires,
    rapports: s.rapports,
    devis: s.devis,
    currency: s.currency,
    communicationTemplates: s.communicationTemplates,
    notifications: s.notifications,
    messages: s.messages,
    rdv: s.rdv,
    suiviPostOp: s.suiviPostOp,
    logistique: s.logistique,
  }),
}))

