-- Messages internes équipe (gestionnaire → médecin) : invisibles pour la patiente
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "staff_only" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "messages_patient_id_staff_only_idx" ON "messages"("patient_id", "staff_only");
