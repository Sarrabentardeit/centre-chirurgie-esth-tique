-- AlterTable
ALTER TABLE "suivi_post_op" ADD COLUMN "cloture_at" TIMESTAMP(3);
ALTER TABLE "suivi_post_op" ADD COLUMN "cloture_remarques" TEXT;
ALTER TABLE "suivi_post_op" ADD COLUMN "cloture_par" TEXT;
