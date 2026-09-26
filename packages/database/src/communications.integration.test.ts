import test from "node:test";
import assert from "node:assert/strict";
import { HouseholdRelationship, OutboxMessageStatus, PrismaClient, RegistrationStatus, StaffRole } from "@prisma/client";
import { CommunicationsAuthorizationError, listOutbox, markOutboxSimulatedSent, queueOutboxMessage } from "./communications.ts";

const prisma = new PrismaClient();

async function setup() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "OutboxMessage", "CampAttendance", "FinancialEntry", "ScholarshipProgram", "Church", "CamperPlacement", "StaffAssignment", "Cabin", "CampGroup", "PortalInvitation", "AuditEvent", "FormSubmission", "FormVersion", "FormDefinition", "Registration", "CamperProfile", "HouseholdMember", "Household", "Session", "Season", "Organization", "UserRole", "RolePermission", "Permission", "Role", "Account", "AuthSession", "Verification", "User", "Person" CASCADE');
  const organization = await prisma.organization.create({ data: { name: "Comms Camp", slug: "comms-camp" } });
  const season = await prisma.season.create({ data: { organizationId: organization.id, name: "2041", year: 2041, status: "open" } });
  const session = await prisma.session.create({ data: { seasonId: season.id, name: "JYF", startDate: new Date("2041-07-01T14:00:00Z"), endDate: new Date("2041-07-05T17:00:00Z"), capacity: 100, basePrice: "250.00", status: "open" } });

  const household = await prisma.household.create({ data: { displayName: "Comms Household" } });
  const guardian = await prisma.person.create({ data: { firstName: "Demo", lastName: "Guardian", email: "guardian.comms@example.test" } });
  const camper = await prisma.person.create({ data: { firstName: "Demo", lastName: "Camper" } });
  await prisma.householdMember.createMany({ data: [
    { householdId: household.id, personId: guardian.id, relationship: HouseholdRelationship.GUARDIAN, isPrimaryContact: true },
    { householdId: household.id, personId: camper.id, relationship: HouseholdRelationship.CAMPER },
  ] });
  await prisma.registration.create({ data: { sessionId: session.id, personId: camper.id, householdId: household.id, status: RegistrationStatus.APPROVED } });

  const staffPerson = await prisma.person.create({ data: { firstName: "Demo", lastName: "Staff", email: "staff.person@example.test" } });
  const staffUser = await prisma.user.create({ data: { id: "comms-staff-user", name: "Demo Staff", email: "staff.login@example.test", personId: staffPerson.id, status: "ACTIVE" } });
  await prisma.staffAssignment.create({ data: { sessionId: session.id, personId: staffPerson.id, role: StaffRole.COUNSELOR, groupId: null, cabinId: null } });
  void staffUser;

  const read = await prisma.permission.create({ data: { key: "communications.read", description: "read" } });
  const write = await prisma.permission.create({ data: { key: "communications.write", description: "write" } });
  const role = await prisma.role.create({ data: { key: "registrar", name: "Registrar" } });
  await prisma.rolePermission.createMany({ data: [{ roleId: role.id, permissionId: read.id }, { roleId: role.id, permissionId: write.id }] });
  const user = await prisma.user.create({ data: { id: "comms-user", name: "Comms User", email: "comms@example.test", status: "ACTIVE" } });
  const outsider = await prisma.user.create({ data: { id: "comms-outsider", name: "Outsider", email: "comms.outsider@example.test", status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return { user, outsider, session };
}

test("outbox queues audience snapshots without external delivery and supports simulated send", async () => {
  const x = await setup();
  await assert.rejects(() => listOutbox(x.outsider.id), CommunicationsAuthorizationError);
  const all = await queueOutboxMessage(x.user.id, { audienceType: "ALL_HOUSEHOLDS", subject: "Camp update", body: "Fictitious message." });
  assert.equal(all.recipientCount, 1);
  const session = await queueOutboxMessage(x.user.id, { audienceType: "SESSION", audienceRef: x.session.id, subject: "Session update", body: "Fictitious session message." });
  assert.equal(session.recipientCount, 1);
  const status = await queueOutboxMessage(x.user.id, { audienceType: "REGISTRATION_STATUS", audienceRef: "APPROVED", subject: "Approved campers", body: "Fictitious approved message." });
  assert.equal(status.recipientCount, 1);
  const staff = await queueOutboxMessage(x.user.id, { audienceType: "STAFF", subject: "Staff update", body: "Fictitious staff message." });
  assert.equal(staff.recipientCount, 1);

  const sent = await markOutboxSimulatedSent(x.user.id, all.id);
  assert.equal(sent.status, OutboxMessageStatus.SIMULATED_SENT);
  assert.ok(sent.simulatedSentAt);
  const outbox = await listOutbox(x.user.id);
  assert.equal(outbox.messages.length, 4);
  assert.equal(await prisma.auditEvent.count({ where: { action: { startsWith: "communications." } } }), 5);
});

test.after(async () => prisma.$disconnect());
