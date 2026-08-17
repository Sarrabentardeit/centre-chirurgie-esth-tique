-- Bouton « Ouvrir le dossier » réservé aux messages automatiques
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "dossier_link" BOOLEAN NOT NULL DEFAULT false;

UPDATE "messages"
SET "dossier_link" = true
WHERE "staff_only" = true
  AND (
    contenu ILIKE '%Dossier classé en abstention%'
    OR contenu ILIKE '%nouveau rapport%'
    OR contenu ILIKE '%Pouvez-vous générer%'
    OR contenu ILIKE '%Le devis v1 reste conservé%'
  );
