import test from "node:test";
import assert from "node:assert/strict";
import { HouseholdRelationship, PrismaClient, RegistrationStatus } from "@prisma/client";
import { listRegistrarReports, registrarReportCsv, ReportsAuthorizationError } from "./reports.ts";

const prisma = new PrismaClient();

async function setup() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "OutboxMessage", "CampAttendance", "FinancialEntry", "ScholarshipProgram", "Church", "CamperPlacement", "StaffAssignment", "Cabin", "CampGroup", "PortalInvitation", "AuditEvent", "FormSubmission", "FormVersion", "FormDefinition", "Registration", "CamperProfile", "HouseholdMember", "Household", "Session", "Season", "Organization", "UserRole", "RolePermission", "Permission", "Role", "Account", "AuthSession", "Verification", "User", "Person" CASCADE');
  const organization = await prisma.organization.create({ data: { name: "Reports Camp", slug: "reports-camp" } });
  const season = await prisma.season.create({ data: { organizationId: organization.id, name: "2040", year: 2040, status: "open" } });
  const session = await prisma.session.create({ data: { seasonId: season.id, name: "CYF", startDate: new Date("2040-07-01T14:00:00Z"), endDate: new Date("2040-07-05T17:00:00Z"), capacity: 100, basePrice: "300.00", status: "open" } });
  const household = await prisma.household.create({ data: { displayName: "Report Household" } });
  const camper = await prisma.person.create({ data: { firstName: "=Fictitious", lastName: "Camper" } });
  await prisma.householdMember.create({ data: { householdId: household.id, personId: camper.id, relationship: HouseholdRelationship.CAMPER } });
  const registration = await prisma.registration.create({ data: { sessionId: session.id, personId: camper.id, householdId: household.id, status: RegistrationStatus.APPROVED } });
  const definition = await prisma.formDefinition.create({ data: { organizationId: organization.id, key: "registration", name: "Registration" } });
  const version = await prisma.formVersion.create({ data: { formDefinitionId: definition.id, version: 1, schema: { id: "report-test" }, isPublished: true } });
  await prisma.formSubmission.create({ data: { registrationId: registration.id, formVersionId: version.id, status: "submitted", answers: {
    grade: "9", shirtSize: "Adult M", guardianName: "Demo Guardian", guardianEmail: "@demo.invalid", guardianPhone: "555-0142", address: "123 Example Street",
    insurance: "SECRET-INSURANCE", allergies: "SECRET-ALLERGY", medications: "SECRET-MEDICATION",
  } } });
  const permission = await prisma.permission.create({ data: { key: "reports.read", description: "reports" } });
  const role = await prisma.role.create({ data: { key: "registrar", name: "Registrar" } });
  await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  const user = await prisma.user.create({ data: { id: "reports-user", name: "Reports User", email: "reports@example.test", status: "ACTIVE" } });
  const outsider = await prisma.user.create({ data: { id: "reports-outsider", name: "Outsider", email: "reports.outsider@example.test", status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return { user, outsider, session };
}

test("registrar reports expose contact operations data but exclude medical answers", async () => {
  const x = await setup();
  await assert.rejects(() => listRegistrarReports(x.outsider.id), ReportsAuthorizationError);
  const result = await listRegistrarReports(x.user.id, { sessionId: x.session.id });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].guardianPhone, "555-0142");
  const serialized = JSON.stringify(result);
  for (const secret of ["SECRET-INSURANCE", "SECRET-ALLERGY", "SECRET-MEDICATION", "insurance", "allergies", "medications", "answers"]) assert.equal(serialized.includes(secret), false);
  const csv = registrarReportCsv(result.rows);
  assert.match(csv, /Guardian email/);
  assert.match(csv, /'=Fictitious Camper/);
  assert.match(csv, /'@demo.invalid/);
  assert.equal(csv.includes("SECRET-"), false);
});

test.after(async () => prisma.$disconnect());
