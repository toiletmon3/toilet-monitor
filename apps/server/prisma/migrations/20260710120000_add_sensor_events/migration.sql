-- CreateTable
CREATE TABLE "sensor_events" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "restroomId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "durationSec" INTEGER,
    "targets" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensor_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sensor_events_restroomId_createdAt_idx" ON "sensor_events"("restroomId", "createdAt");

-- AddForeignKey
ALTER TABLE "sensor_events" ADD CONSTRAINT "sensor_events_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensor_events" ADD CONSTRAINT "sensor_events_restroomId_fkey" FOREIGN KEY ("restroomId") REFERENCES "restrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
