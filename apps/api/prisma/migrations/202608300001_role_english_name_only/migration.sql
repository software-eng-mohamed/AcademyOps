-- Role names are canonical English labels. Preserve the existing English value
-- while removing the unused Arabic column from the role model.
ALTER TABLE "roles" RENAME COLUMN "name_en" TO "name";
ALTER TABLE "roles" DROP COLUMN "name_ar";
