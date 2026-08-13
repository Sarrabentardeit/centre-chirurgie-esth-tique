-- AlterTable
ALTER TABLE "messages" ADD COLUMN "deleted_for_all" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN "deleted_for_all_at" TIMESTAMP(3);
ALTER TABLE "messages" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN "pinned_at" TIMESTAMP(3);
ALTER TABLE "messages" ADD COLUMN "pinned_by_id" TEXT;

-- CreateTable
CREATE TABLE "message_hidden" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_hidden_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messages_patient_id_pinned_idx" ON "messages"("patient_id", "pinned");

-- CreateIndex
CREATE INDEX "message_hidden_user_id_idx" ON "message_hidden"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_hidden_message_id_user_id_key" ON "message_hidden"("message_id", "user_id");

-- AddForeignKey
ALTER TABLE "message_hidden" ADD CONSTRAINT "message_hidden_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_hidden" ADD CONSTRAINT "message_hidden_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
