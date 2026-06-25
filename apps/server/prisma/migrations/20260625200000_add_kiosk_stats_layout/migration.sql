-- Per-template overlay positions for the neon-image kiosk stats (nullable; defaults applied in app)
ALTER TABLE "kiosk_templates" ADD COLUMN "statsLayout" JSONB;
