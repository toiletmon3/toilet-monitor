-- Per-property alert policy (Option 1 = immediate / Option 2 = batched).
-- Set by the org ("general") manager, one config per property (נכס).
ALTER TABLE "properties" ADD COLUMN "settings" JSONB NOT NULL DEFAULT '{}';

-- Batched-alert mode: the moment the grouped push announcing this incident to
-- cleaners was sent. Response time counts from here instead of reportedAt.
-- Null in immediate mode and until the batched pulse fires.
ALTER TABLE "incidents" ADD COLUMN "notifiedAt" TIMESTAMP(3);
