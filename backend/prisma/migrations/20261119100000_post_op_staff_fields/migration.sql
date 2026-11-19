-- AlterTable
ALTER TABLE "suivi_post_op" ADD COLUMN IF NOT EXISTS "questions_staff" TEXT;
ALTER TABLE "suivi_post_op" ADD COLUMN IF NOT EXISTS "avis_staff" TEXT;
