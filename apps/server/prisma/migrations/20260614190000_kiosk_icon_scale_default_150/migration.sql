-- Default the kiosk icon/label size to 150%, and bump existing templates that
-- are still on the original 1.0 default. Non-destructive (display preference).
ALTER TABLE "kiosk_templates" ALTER COLUMN "iconScale" SET DEFAULT 1.5;
UPDATE "kiosk_templates" SET "iconScale" = 1.5 WHERE "iconScale" = 1.0;
