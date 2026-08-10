-- AlterTable
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "piece_jointe_url" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "piece_jointe_nom" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "messages_patient_id_date_envoi_idx" ON "messages"("patient_id", "date_envoi");
