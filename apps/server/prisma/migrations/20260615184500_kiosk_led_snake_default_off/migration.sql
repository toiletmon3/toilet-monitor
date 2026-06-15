-- LED snake should be OFF by default. Flip the column default and turn off any
-- templates still on the previous (true) default. Non-destructive.
ALTER TABLE "kiosk_templates" ALTER COLUMN "ledSnake" SET DEFAULT false;
UPDATE "kiosk_templates" SET "ledSnake" = false WHERE "ledSnake" = true;
