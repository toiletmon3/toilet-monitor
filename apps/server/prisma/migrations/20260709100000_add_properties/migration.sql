-- Property (נכס) layer: groups buildings under an organization, and the scope
-- a PROPERTY_MANAGER is confined to.

-- New role between MANAGER and SHIFT_SUPERVISOR (safe on PG12+ inside a
-- transaction as long as the value isn't used in this same migration)
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PROPERTY_MANAGER';

CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "properties" ADD CONSTRAINT "properties_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "buildings" ADD COLUMN "propertyId" TEXT;
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "users" ADD COLUMN "propertyId" TEXT;
ALTER TABLE "users" ADD CONSTRAINT "users_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
