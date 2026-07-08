-- Track which domain each tablet last sent a heartbeat through
ALTER TABLE "devices" ADD COLUMN "lastHost" TEXT;
