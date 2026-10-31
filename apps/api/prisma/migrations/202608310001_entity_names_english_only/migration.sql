-- Entity names are canonical English labels. Preserve every existing English
-- value in a single `name` column and remove the obsolete Arabic columns.
ALTER TABLE "organizations" RENAME COLUMN "name_en" TO "name";
ALTER TABLE "organizations" DROP COLUMN "name_ar";

ALTER TABLE "branches" RENAME COLUMN "name_en" TO "name";
ALTER TABLE "branches" DROP COLUMN "name_ar";

ALTER TABLE "rooms" RENAME COLUMN "name_en" TO "name";
ALTER TABLE "rooms" DROP COLUMN "name_ar";

DROP INDEX IF EXISTS "persons_organization_id_name_ar_idx";
ALTER TABLE "persons" RENAME COLUMN "name_en" TO "name";
ALTER TABLE "persons" DROP COLUMN "name_ar";
ALTER INDEX IF EXISTS "persons_organization_id_name_en_idx"
  RENAME TO "persons_organization_id_name_idx";

ALTER TABLE "programs" RENAME COLUMN "name_en" TO "name";
ALTER TABLE "programs" DROP COLUMN "name_ar";

ALTER TABLE "modules" RENAME COLUMN "name_en" TO "name";
ALTER TABLE "modules" DROP COLUMN "name_ar";

ALTER TABLE "lead_stages" RENAME COLUMN "name_en" TO "name";
ALTER TABLE "lead_stages" DROP COLUMN "name_ar";

ALTER TABLE "payment_methods" RENAME COLUMN "name_en" TO "name";
ALTER TABLE "payment_methods" DROP COLUMN "name_ar";
