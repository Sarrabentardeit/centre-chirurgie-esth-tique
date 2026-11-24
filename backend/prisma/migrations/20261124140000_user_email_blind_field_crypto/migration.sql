-- Index aveugle email (chiffrement at-rest des PII)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_blind" TEXT;

-- Remplir temporairement pour les lignes existantes (valeur provisoire = email en clair hashé côté SQL basique)
-- Le script scripts/encrypt-existing-db-fields.ts recalcule le vrai HMAC + chiffre les champs.
UPDATE "users"
SET "email_blind" = md5(lower(trim("email")) || '-pending-field-crypto')
WHERE "email_blind" IS NULL OR "email_blind" = '';

ALTER TABLE "users" ALTER COLUMN "email_blind" SET NOT NULL;

DROP INDEX IF EXISTS "users_email_key";
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_blind_key" ON "users"("email_blind");
