-- AlterEnum
ALTER TYPE "DossierStatus" ADD VALUE 'abstention';

-- AlterTable
ALTER TABLE "patients" ADD COLUMN "status_before_abstention" "DossierStatus";
