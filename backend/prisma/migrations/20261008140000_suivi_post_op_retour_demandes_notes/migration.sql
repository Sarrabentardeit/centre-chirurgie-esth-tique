-- AlterTable
ALTER TABLE "suivi_post_op" ADD COLUMN "retour_message_at" TIMESTAMP(3);
ALTER TABLE "suivi_post_op" ADD COLUMN "compte_rendu_demande_at" TIMESTAMP(3);
ALTER TABLE "suivi_post_op" ADD COLUMN "demandes" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "suivi_post_op" ADD COLUMN "notes_internes" JSONB NOT NULL DEFAULT '[]';
