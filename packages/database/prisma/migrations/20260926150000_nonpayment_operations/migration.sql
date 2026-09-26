CREATE TYPE "OutboxAudienceType" AS ENUM ('ALL_HOUSEHOLDS', 'SESSION', 'REGISTRATION_STATUS', 'STAFF');
CREATE TYPE "OutboxMessageStatus" AS ENUM ('QUEUED', 'SIMULATED_SENT', 'CANCELLED');

CREATE TABLE "CampAttendance" (
  "id" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "checkedInAt" TIMESTAMP(3) NOT NULL,
  "checkedInByUserId" TEXT,
  "checkedOutAt" TIMESTAMP(3),
  "checkedOutByUserId" TEXT,
  "notes" TEXT,
  CONSTRAINT "CampAttendance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutboxMessage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "audienceType" "OutboxAudienceType" NOT NULL,
  "audienceRef" TEXT,
  "recipients" JSONB NOT NULL DEFAULT '[]',
  "recipientCount" INTEGER NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "OutboxMessageStatus" NOT NULL DEFAULT 'QUEUED',
  "simulatedSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampAttendance_registrationId_key" ON "CampAttendance"("registrationId");
CREATE UNIQUE INDEX "CampAttendance_registrationId_sessionId_key" ON "CampAttendance"("registrationId", "sessionId");
CREATE INDEX "CampAttendance_sessionId_checkedInAt_idx" ON "CampAttendance"("sessionId", "checkedInAt");
CREATE INDEX "OutboxMessage_organizationId_createdAt_idx" ON "OutboxMessage"("organizationId", "createdAt");
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

ALTER TABLE "CampAttendance" ADD CONSTRAINT "CampAttendance_registrationId_sessionId_fkey" FOREIGN KEY ("registrationId", "sessionId") REFERENCES "Registration"("id", "sessionId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampAttendance" ADD CONSTRAINT "CampAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampAttendance" ADD CONSTRAINT "CampAttendance_checkedInByUserId_fkey" FOREIGN KEY ("checkedInByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampAttendance" ADD CONSTRAINT "CampAttendance_checkedOutByUserId_fkey" FOREIGN KEY ("checkedOutByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutboxMessage" ADD CONSTRAINT "OutboxMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboxMessage" ADD CONSTRAINT "OutboxMessage_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
