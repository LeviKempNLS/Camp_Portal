-- Initial relational foundation for Faith Adventures Camp Portal.
-- This migration contains no real camp, medical, financial, or staff data.

CREATE TYPE "RegistrationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING_REVIEW', 'NEEDS_INFORMATION', 'APPROVED', 'WAITLISTED', 'CANCELLED', 'CHECKED_IN', 'COMPLETED');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');
CREATE TYPE "HouseholdRelationship" AS ENUM ('GUARDIAN', 'CAMPER', 'SIBLING', 'OTHER');

CREATE TABLE "Organization" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "slug" TEXT NOT NULL, "timezone" TEXT NOT NULL DEFAULT 'America/Chicago', "settings" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Organization_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Person" ("id" TEXT NOT NULL, "firstName" TEXT NOT NULL, "middleName" TEXT, "lastName" TEXT NOT NULL, "preferredName" TEXT, "birthDate" TIMESTAMP(3), "email" TEXT, "phone" TEXT, "address" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Person_pkey" PRIMARY KEY ("id"));
CREATE TABLE "User" ("id" TEXT NOT NULL, "email" TEXT NOT NULL, "identityRef" TEXT, "status" "UserStatus" NOT NULL DEFAULT 'INVITED', "personId" TEXT, "lastLoginAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "User_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Household" ("id" TEXT NOT NULL, "displayName" TEXT NOT NULL, "primaryAddress" JSONB, "status" TEXT NOT NULL DEFAULT 'active', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Household_pkey" PRIMARY KEY ("id"));
CREATE TABLE "HouseholdMember" ("householdId" TEXT NOT NULL, "personId" TEXT NOT NULL, "relationship" "HouseholdRelationship" NOT NULL, "isPrimaryContact" BOOLEAN NOT NULL DEFAULT false, "hasPortalAccess" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("householdId", "personId"));
CREATE TABLE "CamperProfile" ("personId" TEXT NOT NULL, "school" TEXT, "grade" TEXT, "generalNotes" TEXT, "status" TEXT NOT NULL DEFAULT 'active', CONSTRAINT "CamperProfile_pkey" PRIMARY KEY ("personId"));
CREATE TABLE "Season" ("id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "name" TEXT NOT NULL, "year" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'draft', "registrationOpen" TIMESTAMP(3), "registrationClose" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Season_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Session" ("id" TEXT NOT NULL, "seasonId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "startDate" TIMESTAMP(3) NOT NULL, "endDate" TIMESTAMP(3) NOT NULL, "capacity" INTEGER NOT NULL, "minimumAge" INTEGER, "maximumAge" INTEGER, "minimumGrade" TEXT, "maximumGrade" TEXT, "basePrice" DECIMAL(10,2) NOT NULL, "depositAmount" DECIMAL(10,2), "registrationOpen" TIMESTAMP(3), "registrationClose" TIMESTAMP(3), "waitlistEnabled" BOOLEAN NOT NULL DEFAULT false, "status" TEXT NOT NULL DEFAULT 'draft', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Session_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Registration" ("id" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "personId" TEXT NOT NULL, "householdId" TEXT NOT NULL, "status" "RegistrationStatus" NOT NULL DEFAULT 'DRAFT', "submittedAt" TIMESTAMP(3), "approvedAt" TIMESTAMP(3), "approvedBy" TEXT, "waitlistPosition" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Registration_pkey" PRIMARY KEY ("id"));
CREATE TABLE "FormDefinition" ("id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL, "activeVersionId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "FormDefinition_pkey" PRIMARY KEY ("id"));
CREATE TABLE "FormVersion" ("id" TEXT NOT NULL, "formDefinitionId" TEXT NOT NULL, "version" INTEGER NOT NULL, "schema" JSONB NOT NULL, "isPublished" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "FormVersion_pkey" PRIMARY KEY ("id"));
CREATE TABLE "FormSubmission" ("id" TEXT NOT NULL, "registrationId" TEXT NOT NULL, "formVersionId" TEXT NOT NULL, "answers" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'draft', "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id"));
CREATE TABLE "EmergencyContact" ("id" TEXT NOT NULL, "personId" TEXT NOT NULL, "name" TEXT NOT NULL, "relationship" TEXT NOT NULL, "phone" TEXT NOT NULL, "priority" INTEGER NOT NULL DEFAULT 1, "authorizedPickup" BOOLEAN NOT NULL DEFAULT false, "restrictions" TEXT, CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id"));
CREATE TABLE "AuditEvent" ("id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "actorUserId" TEXT, "action" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL, "before" JSONB, "after" JSONB, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id"));

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX "Person_email_key" ON "Person"("email");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_identityRef_key" ON "User"("identityRef");
CREATE UNIQUE INDEX "User_personId_key" ON "User"("personId");
CREATE UNIQUE INDEX "Season_organizationId_year_key" ON "Season"("organizationId", "year");
CREATE UNIQUE INDEX "Registration_sessionId_personId_key" ON "Registration"("sessionId", "personId");
CREATE INDEX "Registration_householdId_status_idx" ON "Registration"("householdId", "status");
CREATE UNIQUE INDEX "FormDefinition_organizationId_key_key" ON "FormDefinition"("organizationId", "key");
CREATE UNIQUE INDEX "FormVersion_formDefinitionId_version_key" ON "FormVersion"("formDefinitionId", "version");
CREATE UNIQUE INDEX "FormSubmission_registrationId_formVersionId_key" ON "FormSubmission"("registrationId", "formVersionId");
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

ALTER TABLE "User" ADD CONSTRAINT "User_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CamperProfile" ADD CONSTRAINT "CamperProfile_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Season" ADD CONSTRAINT "Season_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormDefinition" ADD CONSTRAINT "FormDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormVersion" ADD CONSTRAINT "FormVersion_formDefinitionId_fkey" FOREIGN KEY ("formDefinitionId") REFERENCES "FormDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_formVersionId_fkey" FOREIGN KEY ("formVersionId") REFERENCES "FormVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
