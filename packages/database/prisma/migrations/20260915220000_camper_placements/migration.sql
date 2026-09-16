CREATE UNIQUE INDEX "Registration_id_sessionId_key" ON "Registration"("id", "sessionId");

CREATE TABLE "CamperPlacement" (
  "id" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "groupId" TEXT,
  "cabinId" TEXT,
  "assignedByUserId" TEXT,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CamperPlacement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CamperPlacement_registrationId_sessionId_key" ON "CamperPlacement"("registrationId", "sessionId");
CREATE INDEX "CamperPlacement_sessionId_idx" ON "CamperPlacement"("sessionId");
CREATE INDEX "CamperPlacement_groupId_idx" ON "CamperPlacement"("groupId");
CREATE INDEX "CamperPlacement_cabinId_idx" ON "CamperPlacement"("cabinId");

ALTER TABLE "CamperPlacement" ADD CONSTRAINT "CamperPlacement_registrationId_sessionId_fkey" FOREIGN KEY ("registrationId", "sessionId") REFERENCES "Registration"("id", "sessionId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CamperPlacement" ADD CONSTRAINT "CamperPlacement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CamperPlacement" ADD CONSTRAINT "CamperPlacement_groupId_sessionId_fkey" FOREIGN KEY ("groupId", "sessionId") REFERENCES "CampGroup"("id", "sessionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CamperPlacement" ADD CONSTRAINT "CamperPlacement_cabinId_sessionId_fkey" FOREIGN KEY ("cabinId", "sessionId") REFERENCES "Cabin"("id", "sessionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CamperPlacement" ADD CONSTRAINT "CamperPlacement_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
