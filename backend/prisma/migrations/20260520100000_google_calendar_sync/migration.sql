-- AlterTable
ALTER TABLE "agenda_events" ADD COLUMN "google_event_id" TEXT,
ADD COLUMN "last_synced_from" TEXT;

-- CreateTable
CREATE TABLE "google_calendar_sync" (
    "id" TEXT NOT NULL,
    "medecin_id" TEXT NOT NULL,
    "google_calendar_id" TEXT NOT NULL DEFAULT 'primary',
    "refresh_token" TEXT NOT NULL,
    "access_token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_sync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agenda_events_google_event_id_key" ON "agenda_events"("google_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_sync_medecin_id_key" ON "google_calendar_sync"("medecin_id");

-- AddForeignKey
ALTER TABLE "google_calendar_sync" ADD CONSTRAINT "google_calendar_sync_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
