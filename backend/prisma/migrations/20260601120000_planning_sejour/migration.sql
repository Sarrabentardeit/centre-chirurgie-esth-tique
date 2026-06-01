CREATE TABLE IF NOT EXISTS "planning_sejour" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "content" TEXT,
    "mois_label" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'brouillon',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_sejour_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "planning_sejour_patient_id_key" ON "planning_sejour"("patient_id");

ALTER TABLE "planning_sejour" ADD CONSTRAINT "planning_sejour_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
