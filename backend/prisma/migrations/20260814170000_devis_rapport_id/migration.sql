-- Link each devis version to the medical report it was built from
ALTER TABLE "devis" ADD COLUMN IF NOT EXISTS "rapport_id" TEXT;
CREATE INDEX IF NOT EXISTS "devis_rapport_id_idx" ON "devis"("rapport_id");
