import test from "node:test";
import assert from "node:assert/strict";
import { FinancialEntryType, HouseholdRelationship, PrismaClient, RegistrationStatus } from "@prisma/client";
import {
  FinanceAuthorizationError,
  listFinanceDashboard,
  recordChurchCommitment,
  recordChurchPayment,
  recordManualPayment,
  recordProviderPayment,
  recordScholarshipCredit,
  reverseFinancialEntry,
} from "./finance.ts";

const prisma = new PrismaClient();

async function setup() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FinancialEntry", "ScholarshipProgram", "Church", "CamperPlacement", "StaffAssignment", "Cabin", "CampGroup", "PortalInvitation", "AuditEvent", "FormSubmission", "FormVersion", "FormDefinition", "Registration", "CamperProfile", "HouseholdMember", "Household", "Session", "Season", "Organization", "UserRole", "RolePermission", "Permission", "Role", "Account", "AuthSession", "Verification", "User", "Person" CASCADE');

  const organization = await prisma.organization.create({ data: { name: "Finance Camp", slug: "finance-camp" } });
  const season = await prisma.season.create({ data: { organizationId: organization.id, name: "2037", year: 2037, status: "open" } });
  const session = await prisma.session.create({ data: { seasonId: season.id, name: "JYF", startDate: new Date("2037-07-01T14:00:00Z"), endDate: new Date("2037-07-05T17:00:00Z"), capacity: 100, basePrice: "250.00", status: "open" } });

  const household = await prisma.household.create({ data: { displayName: "Finance Household" } });
  const guardian = await prisma.person.create({ data: { firstName: "Demo", lastName: "Guardian", email: "finance.guardian@example.test" } });
  const camper = await prisma.person.create({ data: { firstName: "Demo", lastName: "Camper", birthDate: new Date("2027-06-15T00:00:00Z") } });
  await prisma.householdMember.createMany({ data: [
    { householdId: household.id, personId: guardian.id, relationship: HouseholdRelationship.GUARDIAN, hasPortalAccess: true, isPrimaryContact: true },
    { householdId: household.id, personId: camper.id, relationship: HouseholdRelationship.CAMPER },
  ] });
  const registration = await prisma.registration.create({ data: { sessionId: session.id, personId: camper.id, householdId: household.id, status: RegistrationStatus.SUBMITTED, submittedAt: new Date() } });

  const read = await prisma.permission.create({ data: { key: "finance.read", description: "Read finances" } });
  const record = await prisma.permission.create({ data: { key: "finance.record", description: "Record finances" } });
  const registrarRole = await prisma.role.create({ data: { key: "registrar", name: "Registrar" } });
  const viewerRole = await prisma.role.create({ data: { key: "finance_viewer", name: "Finance Viewer" } });
  await prisma.rolePermission.createMany({ data: [
    { roleId: registrarRole.id, permissionId: read.id },
    { roleId: registrarRole.id, permissionId: record.id },
    { roleId: viewerRole.id, permissionId: read.id },
  ] });

  const registrar = await prisma.user.create({ data: { id: "finance-registrar", name: "Finance Registrar", email: "finance.registrar@example.test", status: "ACTIVE" } });
  const viewer = await prisma.user.create({ data: { id: "finance-viewer", name: "Finance Viewer", email: "finance.viewer@example.test", status: "ACTIVE" } });
  const outsider = await prisma.user.create({ data: { id: "finance-outsider", name: "Finance Outsider", email: "finance.outsider@example.test", status: "ACTIVE" } });
  await prisma.userRole.createMany({ data: [
    { userId: registrar.id, roleId: registrarRole.id },
    { userId: viewer.id, roleId: viewerRole.id },
  ] });

  const scholarshipA = await prisma.scholarshipProgram.create({ data: { organizationId: organization.id, name: "Scholarship A" } });
  const scholarshipB = await prisma.scholarshipProgram.create({ data: { organizationId: organization.id, name: "Scholarship B" } });
  const church = await prisma.church.create({ data: { organizationId: organization.id, name: "Fictitious Community Church" } });
  await prisma.financialEntry.create({ data: { organizationId: organization.id, registrationId: registration.id, type: FinancialEntryType.CHARGE, amount: "250.00", sourceKey: `registration-charge:${registration.id}` } });

  return { organization, session, registration, registrar, viewer, outsider, scholarshipA, scholarshipB, church };
}

test("finance access is isolated and registration can remain unpaid", async () => {
  const x = await setup();
  await assert.rejects(() => listFinanceDashboard(x.outsider.id), FinanceAuthorizationError);
  const dashboard = await listFinanceDashboard(x.viewer.id);
  assert.equal(dashboard.rows.length, 1);
  assert.equal(dashboard.rows[0].charges, 250);
  assert.equal(dashboard.rows[0].balance, 250);
  assert.equal(dashboard.rows[0].paymentStatus, "unpaid");
  await assert.rejects(() => recordManualPayment(x.viewer.id, { registrationId: x.registration.id, amount: 50, method: "CHECK" }), FinanceAuthorizationError);
});

test("offline payments, scholarships, and church sponsorships reconcile independently", async () => {
  const x = await setup();
  await recordManualPayment(x.registrar.id, { registrationId: x.registration.id, amount: 50, method: "CHECK", reference: "CHECK-100" });
  await recordScholarshipCredit(x.registrar.id, { registrationId: x.registration.id, scholarshipProgramId: x.scholarshipA.id, amount: 75 });
  await recordChurchCommitment(x.registrar.id, { registrationId: x.registration.id, churchId: x.church.id, amount: 125 });
  await recordChurchPayment(x.registrar.id, { registrationId: x.registration.id, churchId: x.church.id, amount: 125, method: "CHECK", reference: "CHURCH-55" });

  const dashboard = await listFinanceDashboard(x.registrar.id);
  assert.equal(dashboard.rows[0].householdPaid, 50);
  assert.equal(dashboard.rows[0].scholarships, 75);
  assert.equal(dashboard.rows[0].churchCommitted, 125);
  assert.equal(dashboard.rows[0].churchPaid, 125);
  assert.equal(dashboard.rows[0].balance, 0);
  assert.equal(dashboard.rows[0].paymentStatus, "paid");
  assert.equal(dashboard.churchSummaries[0].committed, 125);
  assert.equal(dashboard.churchSummaries[0].paid, 125);
  assert.equal(dashboard.churchSummaries[0].owed, 0);
  assert.equal(dashboard.scholarshipSummaries.find(program => program.id === x.scholarshipA.id)?.awarded, 75);
  assert.equal(dashboard.scholarshipSummaries.find(program => program.id === x.scholarshipB.id)?.awarded, 0);

  const partial = await listFinanceDashboard(x.registrar.id, { paymentStatus: "paid", churchId: x.church.id, scholarshipProgramId: x.scholarshipA.id });
  assert.equal(partial.rows.length, 1);
});

test("reversals preserve history and append-only enforcement prevents mutation", async () => {
  const x = await setup();
  await recordChurchCommitment(x.registrar.id, { registrationId: x.registration.id, churchId: x.church.id, amount: 125 });
  const payment = await recordChurchPayment(x.registrar.id, { registrationId: x.registration.id, churchId: x.church.id, amount: 125, method: "CHECK" });
  const reversal = await reverseFinancialEntry(x.registrar.id, payment.id, "Fictitious returned check");

  assert.equal((await prisma.financialEntry.findUnique({ where: { id: payment.id } }))?.id, payment.id);
  assert.equal(reversal.reversesEntryId, payment.id);
  const dashboard = await listFinanceDashboard(x.registrar.id);
  assert.equal(dashboard.churchSummaries[0].paid, 0);
  assert.equal(dashboard.churchSummaries[0].owed, 125);
  assert.equal(dashboard.rows[0].balance, 250);
  assert.ok(await prisma.auditEvent.findFirst({ where: { action: "financial.entry_reversed", entityId: payment.id } }));

  await assert.rejects(() => prisma.financialEntry.update({ where: { id: payment.id }, data: { note: "mutation should fail" } }));
  await assert.rejects(() => prisma.financialEntry.delete({ where: { id: payment.id } }));
});

test("provider payment ingestion is idempotent and uses the same internal ledger", async () => {
  const x = await setup();
  const first = await recordProviderPayment(x.registrar.id, { registrationId: x.registration.id, provider: "DemoPay", externalTransactionId: "txn-123", amount: 100 });
  const replay = await recordProviderPayment(x.registrar.id, { registrationId: x.registration.id, provider: "DemoPay", externalTransactionId: "txn-123", amount: 100 });
  assert.equal(first.id, replay.id);
  assert.equal(await prisma.financialEntry.count({ where: { sourceKey: "provider:demopay:txn-123" } }), 1);
  const dashboard = await listFinanceDashboard(x.registrar.id);
  assert.equal(dashboard.rows[0].householdPaid, 100);
  assert.equal(dashboard.rows[0].balance, 150);
});

test.after(async () => prisma.$disconnect());
