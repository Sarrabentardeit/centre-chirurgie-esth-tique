-- AlterTable
ALTER TABLE "rapports"
ADD COLUMN "examens_demandes" TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL;
