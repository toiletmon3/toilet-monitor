-- AlterTable
ALTER TABLE "users" ADD COLUMN "hiddenFromPm" BOOLEAN NOT NULL DEFAULT false;

-- Internal/company staff accounts must not be visible to property managers,
-- even when they hold worker accounts assigned to a property (used for
-- testing kiosks on site). Best-effort auto-flag of the known internal
-- people; org admins can toggle the flag per user from the admin UI.
UPDATE "users" SET "hiddenFromPm" = true
WHERE lower("name") LIKE '%aharoni%'
   OR "name" LIKE '%אהרוני%'
   OR lower("name") LIKE '%ben nadav%'
   OR "name" LIKE '%בן נדב%'
   OR lower("name") LIKE '%blumenfeld%'
   OR "name" LIKE '%בלומנפלד%';
