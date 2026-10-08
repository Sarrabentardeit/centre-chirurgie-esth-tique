-- Rappel email gestionnaire à J-7 de l'arrivée (envoi du planning)
ALTER TABLE "logistique" ADD COLUMN IF NOT EXISTS "rappel_planning_j7_at" TIMESTAMP(3);
