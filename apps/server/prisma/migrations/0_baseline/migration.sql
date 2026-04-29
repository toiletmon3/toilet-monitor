-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'UNISEX');
CREATE TYPE "RestroomStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');
CREATE TYPE "DeviceType" AS ENUM ('KIOSK', 'SENSOR');
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'SHIFT_SUPERVISOR', 'CLEANER');
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');
CREATE TYPE "ActionType" AS ENUM ('REPORTED', 'ACKNOWLEDGED', 'RESOLVED', 'ESCALATED');

-- CreateTable: organizations
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{"defaultLanguage":"he","rateLimit":300,"autoResolveAfterHours":24}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: kiosk_templates
CREATE TABLE "kiosk_templates" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "theme" TEXT NOT NULL DEFAULT 'default',
    "buttons" JSONB NOT NULL,
    CONSTRAINT "kiosk_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: buildings
CREATE TABLE "buildings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "kioskTemplateId" TEXT,
    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: floors
CREATE TABLE "floors" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "floorNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable: restrooms
CREATE TABLE "restrooms" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL DEFAULT 'UNISEX',
    "status" "RestroomStatus" NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT "restrooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable: devices
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "restroomId" TEXT NOT NULL,
    "deviceCode" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL DEFAULT 'KIOSK',
    "kioskTemplateId" TEXT,
    "lastHeartbeat" TIMESTAMP(3),
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable: cleaner_arrivals
CREATE TABLE "cleaner_arrivals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "restroomId" TEXT,
    "buildingId" TEXT,
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "note" TEXT,
    CONSTRAINT "cleaner_arrivals_pkey" PRIMARY KEY ("id")
);

-- CreateTable: users
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "buildingId" TEXT,
    "idNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CLEANER',
    "passwordHash" TEXT,
    "preferredLang" TEXT NOT NULL DEFAULT 'he',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable: push_subscriptions
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: issue_types
CREATE TABLE "issue_types" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "code" TEXT NOT NULL,
    "nameI18n" JSONB NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '📋',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "issue_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable: incidents
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "restroomId" TEXT NOT NULL,
    "issueTypeId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "assignedCleanerId" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "reportedAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable: incident_actions
CREATE TABLE "incident_actions" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "incidentId" TEXT NOT NULL,
    "userId" TEXT,
    "actionType" "ActionType" NOT NULL,
    "notes" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "incident_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE UNIQUE INDEX "floors_buildingId_floorNumber_key" ON "floors"("buildingId", "floorNumber");
CREATE UNIQUE INDEX "devices_deviceCode_key" ON "devices"("deviceCode");
CREATE UNIQUE INDEX "users_orgId_idNumber_key" ON "users"("orgId", "idNumber");
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE UNIQUE INDEX "issue_types_orgId_code_key" ON "issue_types"("orgId", "code");
CREATE UNIQUE INDEX "incidents_clientId_key" ON "incidents"("clientId");
CREATE INDEX "incidents_restroomId_status_idx" ON "incidents"("restroomId", "status");
CREATE INDEX "incidents_reportedAt_idx" ON "incidents"("reportedAt");
CREATE INDEX "incidents_status_reportedAt_idx" ON "incidents"("status", "reportedAt");
CREATE UNIQUE INDEX "incident_actions_clientId_key" ON "incident_actions"("clientId");

-- AddForeignKey
ALTER TABLE "kiosk_templates" ADD CONSTRAINT "kiosk_templates_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_kioskTemplateId_fkey" FOREIGN KEY ("kioskTemplateId") REFERENCES "kiosk_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "floors" ADD CONSTRAINT "floors_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restrooms" ADD CONSTRAINT "restrooms_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "devices" ADD CONSTRAINT "devices_restroomId_fkey" FOREIGN KEY ("restroomId") REFERENCES "restrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "devices" ADD CONSTRAINT "devices_kioskTemplateId_fkey" FOREIGN KEY ("kioskTemplateId") REFERENCES "kiosk_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cleaner_arrivals" ADD CONSTRAINT "cleaner_arrivals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issue_types" ADD CONSTRAINT "issue_types_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_restroomId_fkey" FOREIGN KEY ("restroomId") REFERENCES "restrooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_issueTypeId_fkey" FOREIGN KEY ("issueTypeId") REFERENCES "issue_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assignedCleanerId_fkey" FOREIGN KEY ("assignedCleanerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incident_actions" ADD CONSTRAINT "incident_actions_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incident_actions" ADD CONSTRAINT "incident_actions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
