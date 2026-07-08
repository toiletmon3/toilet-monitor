-- A property manager can manage MULTIPLE properties (checkbox assignment).
-- Implicit Prisma M2M join table for relation "ManagedProperties"
-- (A = Property.id, B = User.id — models ordered alphabetically).
CREATE TABLE "_ManagedProperties" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ManagedProperties_A_fkey" FOREIGN KEY ("A") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ManagedProperties_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "_ManagedProperties_AB_unique" ON "_ManagedProperties"("A", "B");
CREATE INDEX "_ManagedProperties_B_index" ON "_ManagedProperties"("B");

-- Seed from the existing single-property assignment
INSERT INTO "_ManagedProperties" ("A", "B")
SELECT "propertyId", "id" FROM "users"
WHERE "propertyId" IS NOT NULL AND "role" = 'PROPERTY_MANAGER';
