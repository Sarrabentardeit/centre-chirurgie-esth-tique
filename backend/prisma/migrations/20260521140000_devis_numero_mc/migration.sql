ALTER TABLE "devis" ADD COLUMN IF NOT EXISTS "numero_devis" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "devis_numero_devis_key" ON "devis"("numero_devis");
