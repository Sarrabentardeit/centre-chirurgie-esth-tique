-- AlterTable
ALTER TABLE "patients" ADD COLUMN "pending_rapport_change_note" TEXT;

-- AlterTable
ALTER TABLE "rapports" ADD COLUMN "changement_demande" TEXT;
