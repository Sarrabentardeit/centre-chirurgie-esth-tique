-- Soft-delete devis (liste « Supprimés »)
ALTER TABLE "devis" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "devis_deleted_at_idx" ON "devis"("deleted_at");
