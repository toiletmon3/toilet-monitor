-- CreateTable
CREATE TABLE "monthly_stats" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL DEFAULT '_all',
    "restroomId" TEXT NOT NULL DEFAULT '_all',
    "issueTypeId" TEXT NOT NULL DEFAULT '_all',
    "month" TIMESTAMP(3) NOT NULL,
    "totalIncidents" INTEGER NOT NULL DEFAULT 0,
    "resolvedCount" INTEGER NOT NULL DEFAULT 0,
    "avgResolutionMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalArrivals" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monthly_stats_orgId_month_idx" ON "monthly_stats"("orgId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_stats_orgId_buildingId_restroomId_issueTypeId_month_key"
    ON "monthly_stats"("orgId", "buildingId", "restroomId", "issueTypeId", "month");
