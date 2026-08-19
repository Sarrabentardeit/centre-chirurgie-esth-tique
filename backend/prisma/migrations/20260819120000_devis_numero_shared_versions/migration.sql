-- Plusieurs versions d’un même patient partagent le n° MC (lettres -B, -C en affichage).
DROP INDEX IF EXISTS "devis_numero_devis_key";
CREATE INDEX IF NOT EXISTS "devis_numero_devis_idx" ON "devis"("numero_devis");
