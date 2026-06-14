-- AlterTable: add icon/label size multiplier to kiosk templates (additive, safe)
ALTER TABLE "kiosk_templates" ADD COLUMN "iconScale" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
