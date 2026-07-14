-- Per-building settings blob. Currently holds operating hours (in the org
-- timezone): { operatingHours: { enabled, open: "HH:MM", close: "HH:MM" } }.
-- When enabled, no push notifications are sent for this building's issues
-- outside the window. Absent/disabled = active 24/7.
ALTER TABLE "buildings" ADD COLUMN "settings" JSONB NOT NULL DEFAULT '{}';
