-- Per-domain last-heartbeat timestamps, so simultaneous connections through
-- both domains are all visible (lastHost only keeps the most recent one)
ALTER TABLE "devices" ADD COLUMN "hostsSeen" JSONB;
