-- DropForeignKey
ALTER TABLE "agenda_events" DROP CONSTRAINT "agenda_events_patient_id_fkey";

-- AddForeignKey
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
