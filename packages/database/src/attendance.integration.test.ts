import test from "node:test";
import assert from "node:assert/strict";
import { HouseholdRelationship, PrismaClient, RegistrationStatus } from "@prisma/client";
import { AttendanceAuthorizationError, AttendanceValidationError, checkInCamper, checkOutCamper, listCheckInDashboard } from "./attendance.ts";

const prisma = new PrismaClient();

async function setup() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "OutboxMessage", "CampAttendance", "FinancialEntry", "ScholarshipProgram", "Church", "CamperPlacement", "StaffAssignment", "Cabin", "CampGroup", "PortalInvitation", "AuditEvent", "FormSubmission", "FormVersion", "FormDefinition", "Registration", "CamperProfile", "HouseholdMember", "Household", "Session", "Season", "Organization", "UserRole", "RolePermission", "Permission", "Role", "Account", "AuthSession", "Verification", "User", "Person" CASCADE');
  const organization = await prisma.organization.create({ data: { name: "Attendance Camp", slug: "attendance-camp" } });
  const season = await prisma.season.create({ data: { organizationId: organization.id, name: "2038", year: 2038, status: "open" } });
  const session = await prisma.session.create({ data: { seasonId: season.id, name: "JYF", startDate: new Date("2038-07-01T14:00:00Z"), endDate: new Date("2038-07-05T17:00:00Z"), capacity: 100, basePrice: "250.00", status: "open" } });
  const household = await prisma.household.create({ data: { displayName: "Attendance Household" } });
  const camper = await prisma.person.create({ data: { firstName: "Check", lastName: "In" } });
  await prisma.householdMember.create({ data: { householdId: household.id, personId: camper.id, relationship: HouseholdRelationship.CAMPER } });
  const registration = await prisma.registration.create({ data: { sessionId: session.id, personId: camper.id, householdId: household.id, status: RegistrationStatus.APPROVED, approvedAt: new Date() } });

  const read = await prisma.permission.create({ data: { key: "attendance.read", description: "read" } });
  const manage = await prisma.permission.create({ data: { key: "attendance.manage", description: "manage" } });
  const role = await prisma.role.create({ data: { key: "registrar", name: "Registrar" } });
  await prisma.rolePermission.createMany({ data: [{ roleId: role.id, permissionId: read.id }, { roleId: role.id, permissionId: manage.id }] });
  const manager = await prisma.user.create({ data: { id: "attendance-manager", name: "Manager", email: "attendance.manager@example.test", status: "ACTIVE" } });
  const outsider = await prisma.user.create({ data: { id: "attendance-outsider", name: "Outsider", email: "attendance.outsider@example.test", status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: manager.id, roleId: role.id } });
  return { registration, manager, outsider };
}

test("check-in and checkout update attendance and registration status atomically", async () => {
  const x = await setup();
  await assert.rejects(() => listCheckInDashboard(x.outsider.id), AttendanceAuthorizationError);
  await assert.rejects(() => checkInCamper(x.outsider.id, x.registration.id), AttendanceAuthorizationError);

  const checkedIn = await checkInCamper(x.manager.id, x.registration.id, "Arrived with guardian");
  assert.ok(checkedIn.checkedInAt);
  assert.equal((await prisma.registration.findUniqueOrThrow({ where: { id: x.registration.id } })).status, RegistrationStatus.CHECKED_IN);
  const listed = await listCheckInDashboard(x.manager.id);
  assert.equal(listed.rows[0].attendance?.notes, "Arrived with guardian");

  const replay = await checkInCamper(x.manager.id, x.registration.id);
  assert.equal(replay.id, checkedIn.id);

  const checkedOut = await checkOutCamper(x.manager.id, x.registration.id);
  assert.ok(checkedOut.checkedOutAt);
  assert.equal((await prisma.registration.findUniqueOrThrow({ where: { id: x.registration.id } })).status, RegistrationStatus.COMPLETED);
  assert.equal(await prisma.auditEvent.count({ where: { action: { in: ["attendance.checked_in", "attendance.checked_out"] } } }), 2);
});

test("check-in rejects registrations that are not approved", async () => {
  const x = await setup();
  await prisma.registration.update({ where: { id: x.registration.id }, data: { status: RegistrationStatus.SUBMITTED } });
  await assert.rejects(() => checkInCamper(x.manager.id, x.registration.id), AttendanceValidationError);
});

test.after(async () => prisma.$disconnect());
