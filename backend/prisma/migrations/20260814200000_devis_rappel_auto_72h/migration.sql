-- Suivi envoi devis + rappel automatique 72 h
ALTER TABLE "devis" ADD COLUMN IF NOT EXISTS "envoye_at" TIMESTAMP(3);
ALTER TABLE "devis" ADD COLUMN IF NOT EXISTS "rappel_auto_envoye_at" TIMESTAMP(3);

-- Backfill : devis déjà envoyés (base pour le délai 72 h)
UPDATE "devis"
SET "envoye_at" = COALESCE("updated_at", "date_creation")
WHERE "statut" IN ('envoye', 'accepte')
  AND "envoye_at" IS NULL
  AND "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "devis_envoye_at_idx" ON "devis"("envoye_at");
