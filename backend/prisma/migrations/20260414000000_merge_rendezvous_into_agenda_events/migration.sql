-- Migration: merge rendezvous -> agenda_events, then drop rendezvous table
-- Also adds FK from agenda_events.patient_id -> patients.id

-- 1. Copier les RendezVous existants dans AgendaEvent
INSERT INTO agenda_events (
  id,
  medecin_id,
  type,
  title,
  motif,
  date_debut,
  date_fin,
  all_day,
  patient_id,
  statut,
  notes,
  created_at,
  updated_at
)
SELECT
  id,
  medecin_id,
  'rdv'::"AgendaEventType",
  type AS title,
  motif,
  (date + heure::TIME) AS date_debut,
  (date + heure::TIME + INTERVAL '1 hour') AS date_fin,
  false AS all_day,
  patient_id,
  statut::"RdvStatut",
  notes,
  created_at,
  updated_at
FROM rendezvous
ON CONFLICT (id) DO NOTHING;

-- 2. Ajouter la contrainte FK patient_id -> patients.id sur agenda_events
ALTER TABLE "agenda_events"
  ADD CONSTRAINT "agenda_events_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL;

-- 3. Supprimer la table rendezvous
DROP TABLE IF EXISTS "rendezvous";
