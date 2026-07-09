-- CreateTable
CREATE TABLE "blocked_device_codes" (
    "deviceCode" TEXT NOT NULL,
    "blockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_device_codes_pkey" PRIMARY KEY ("deviceCode")
);
