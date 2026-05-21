-- Agendas Google synchronisés (même liste pour import et export)
ALTER TABLE "google_calendar_sync" ADD COLUMN IF NOT EXISTS "sync_calendar_ids" JSONB;
