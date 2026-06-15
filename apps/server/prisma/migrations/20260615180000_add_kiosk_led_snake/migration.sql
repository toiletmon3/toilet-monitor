-- Toggle for the animated LED "snake" light on the kiosk (per template).
ALTER TABLE "kiosk_templates" ADD COLUMN "ledSnake" BOOLEAN NOT NULL DEFAULT true;
