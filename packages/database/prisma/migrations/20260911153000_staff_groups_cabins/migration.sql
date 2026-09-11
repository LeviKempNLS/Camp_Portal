CREATE TYPE "StaffRole" AS ENUM ('CAMP_DIRECTOR', 'GROUP_DIRECTOR', 'COUNSELOR', 'MEDICAL', 'REGISTRAR');
CREATE TYPE "StaffAssignmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

ALTER TABLE "CamperProfile" ADD COLUMN "gender" TEXT;

CREATE TABLE "CampGroup" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "capacity" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Cabin" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "groupId" TEXT,
  "name" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Cabin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffAssignment" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "role" "StaffRole" NOT NULL,
  "groupId" TEXT,
  "cabinId" TEXT,
  "status" "StaffAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampGroup_sessionId_name_key" ON "CampGroup"("sessionId", "name");
CREATE UNIQUE INDEX "Cabin_sessionId_name_key" ON "Cabin"("sessionId", "name");
CREATE INDEX "Cabin_groupId_idx" ON "Cabin"("groupId");
CREATE INDEX "StaffAssignment_sessionId_personId_idx" ON "StaffAssignment"("sessionId", "personId");
CREATE INDEX "StaffAssignment_groupId_idx" ON "StaffAssignment"("groupId");
CREATE INDEX "StaffAssignment_cabinId_idx" ON "StaffAssignment"("cabinId");

ALTER TABLE "CampGroup" ADD CONSTRAINT "CampGroup_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Cabin" ADD CONSTRAINT "Cabin_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Cabin" ADD CONSTRAINT "Cabin_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CampGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CampGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_cabinId_fkey" FOREIGN KEY ("cabinId") REFERENCES "Cabin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
