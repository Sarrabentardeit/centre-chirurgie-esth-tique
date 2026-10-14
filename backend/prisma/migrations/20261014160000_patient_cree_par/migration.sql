-- Origine du compte : inscription patiente, pré-dossier médecin ou gestionnaire.
CREATE TYPE "CompteCreePar" AS ENUM ('patiente', 'medecin', 'gestionnaire');

ALTER TABLE "patients" ADD COLUMN "cree_par" "CompteCreePar" NOT NULL DEFAULT 'patiente';

UPDATE "patients" p
SET "cree_par" = 'medecin'
WHERE EXISTS (
  SELECT 1 FROM "notifications" n
  WHERE n.titre = 'Pré-dossier patient créé par le médecin'
    AND n.message LIKE '%' || p.dossier_number || '%'
);

UPDATE "patients" p
SET "cree_par" = 'gestionnaire'
WHERE p.cree_par = 'patiente'
  AND EXISTS (
    SELECT 1 FROM "notifications" n
    WHERE n.titre = 'Pré-dossier patient créé par la gestionnaire'
      AND n.message LIKE '%' || p.dossier_number || '%'
  );

UPDATE "patients"
SET "cree_par" = 'medecin'
WHERE "cree_par" = 'patiente' AND "source_contact" = 'medecin';

UPDATE "patients"
SET "cree_par" = 'gestionnaire'
WHERE "cree_par" = 'patiente' AND "source_contact" = 'gestionnaire';
