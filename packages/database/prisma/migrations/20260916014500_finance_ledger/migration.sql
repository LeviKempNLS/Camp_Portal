CREATE TYPE "FinancialEntryType" AS ENUM ('CHARGE', 'PAYMENT', 'SCHOLARSHIP_CREDIT', 'CHURCH_COMMITMENT', 'CHURCH_PAYMENT', 'ADJUSTMENT', 'REFUND', 'REVERSAL');
CREATE TYPE "PaymentMethod" AS ENUM ('CHECK', 'CASH', 'OTHER', 'ONLINE');

CREATE TABLE "Church" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contactName" TEXT,
  "contactEmail" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Church_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScholarshipProgram" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScholarshipProgram_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialEntry" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "type" "FinancialEntryType" NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "method" "PaymentMethod",
  "churchId" TEXT,
  "scholarshipProgramId" TEXT,
  "reference" TEXT,
  "note" TEXT,
  "sourceKey" TEXT,
  "createdByUserId" TEXT,
  "reversesEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Church_organizationId_name_key" ON "Church"("organizationId", "name");
CREATE UNIQUE INDEX "ScholarshipProgram_organizationId_name_key" ON "ScholarshipProgram"("organizationId", "name");
CREATE UNIQUE INDEX "FinancialEntry_sourceKey_key" ON "FinancialEntry"("sourceKey");
CREATE UNIQUE INDEX "FinancialEntry_reversesEntryId_key" ON "FinancialEntry"("reversesEntryId");
CREATE INDEX "FinancialEntry_organizationId_createdAt_idx" ON "FinancialEntry"("organizationId", "createdAt");
CREATE INDEX "FinancialEntry_registrationId_createdAt_idx" ON "FinancialEntry"("registrationId", "createdAt");
CREATE INDEX "FinancialEntry_churchId_createdAt_idx" ON "FinancialEntry"("churchId", "createdAt");
CREATE INDEX "FinancialEntry_scholarshipProgramId_createdAt_idx" ON "FinancialEntry"("scholarshipProgramId", "createdAt");

ALTER TABLE "Church" ADD CONSTRAINT "Church_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScholarshipProgram" ADD CONSTRAINT "ScholarshipProgram_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_scholarshipProgramId_fkey" FOREIGN KEY ("scholarshipProgramId") REFERENCES "ScholarshipProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_reversesEntryId_fkey" FOREIGN KEY ("reversesEntryId") REFERENCES "FinancialEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "FinancialEntry" ("id", "organizationId", "registrationId", "type", "amount", "sourceKey", "createdAt")
SELECT 'base-charge-' || r."id", se."organizationId", r."id", 'CHARGE'::"FinancialEntryType", s."basePrice", 'registration-charge:' || r."id", CURRENT_TIMESTAMP
FROM "Registration" r
JOIN "Session" s ON s."id" = r."sessionId"
JOIN "Season" se ON se."id" = s."seasonId"
WHERE r."status" NOT IN ('DRAFT', 'CANCELLED');

CREATE OR REPLACE FUNCTION prevent_financial_entry_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'FinancialEntry is append-only; record a reversal or adjustment instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FinancialEntry_append_only"
BEFORE UPDATE OR DELETE ON "FinancialEntry"
FOR EACH ROW EXECUTE FUNCTION prevent_financial_entry_mutation();
