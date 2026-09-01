-- Logistique : date + heure (arrivée, départ, intervention)
ALTER TABLE "logistique" ALTER COLUMN "date_arrivee" TYPE TIMESTAMP(3) USING "date_arrivee"::timestamp;
ALTER TABLE "logistique" ALTER COLUMN "date_depart" TYPE TIMESTAMP(3) USING "date_depart"::timestamp;
ALTER TABLE "logistique" ALTER COLUMN "date_intervention" TYPE TIMESTAMP(3) USING "date_intervention"::timestamp;
