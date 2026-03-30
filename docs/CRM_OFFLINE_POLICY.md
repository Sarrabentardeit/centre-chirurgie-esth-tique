# Politique CRM Offline et Acces

## Objectif
Definir les regles metier pour:
- usage hors connexion du CRM frontend,
- duree de visibilite des donnees,
- droits d'acces par role.

Ce document couvre la phase frontend demo. La version production necessite validation juridique/RGPD locale et implementation backend.

## Perimetre hors connexion (frontend)

### Donnees disponibles offline
- Dossiers patients deja charges dans l'app (cache navigateur).
- Devis deja consultes (lecture).
- Historique des notifications deja recues.
- Agenda deja charge et exports ICS/PDF locaux.

### Actions autorisees offline (mode degrade)
- Consultation des ecrans deja caches.
- Saisie locale de brouillon devis.
- Saisie locale de demande de modification.
- Upload local post-op (stockage local objet URL en demo).

### Synchronisation
- En frontend demo: synchronisation simulee au retour en ligne via store local.
- En production: file d'attente offline avec "pending actions", retry automatique et resolution de conflits cote backend.

## Duree de visibilite et acces (regles metier proposees)

### Dossiers patients
- Acces complet equipe (medecin + gestionnaire): 24 mois apres creation.
- Acces patient portail: 12 mois apres fin de suivi.
- Archivage lecture seule: 36 mois (accessible uniquement administrateur/medical).

### Post-op et questionnaire
- Suivi actif: 6 mois apres intervention.
- Questionnaire satisfaction: ouvert a J+1 apres retour, ferme a J+30.
- Compte rendu telechargeable: disponible au minimum 12 mois.

### Notifications
- Visibles "non lues": jusqu'a lecture.
- Historique visible: 6 mois.
- Purge technique recommandee: 12 mois.

## Regles d'acces par role

### Patient
- Acces a son propre dossier, devis, agenda, chat, post-op.
- Aucune visibilite des autres patients.

### Medecin
- Acces dossiers patients, formulaires, rapport medical, historique.
- Peut finaliser rapport et consulter feedback post-op.

### Gestionnaire
- Acces devis/logistique/notifications.
- Peut creer dossier local, enregistrer brouillon devis, envoyer version finale.

## Regles de securite minimales (a appliquer en production)
- Session expiree apres 30 min d'inactivite.
- JWT/refresh token avec rotation.
- Journal d'audit (qui a lu/modifie quoi, quand).
- Chiffrement en transit (TLS) et au repos.
- Politique de suppression/archivage conforme obligations legales.

## Etat implementation actuelle (frontend)
- Dossier local: implemente.
- Brouillon devis: implemente (store + ecran gestionnaire).
- Demande de modification devis: implemente (patient -> notifications equipe).
- Notifications par etape: implementees en demo.
- Offline complet "production-grade": non finalise (necessite backend + queue sync).

