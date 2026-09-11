import test from "node:test";
import assert from "node:assert/strict";
import { HouseholdRelationship, PrismaClient, RegistrationStatus } from "@prisma/client";
import { ValidationError } from "./portal.ts";
import { submitOwnedRegistrationWithCapacity, transitionRegistrarRegistrationWithCapacity } from "./registration-operations.ts";

const prisma = new PrismaClient();

const answers = (camperName: string, guardianEmail: string) => ({
  session: "jyf",
  shirtSize: "Youth M",
  camperName,
  birthDate: "2017-06-15",
  grade: "3",
  guardianName: "Demo Guardian",
  guardianEmail,
  guardianPhone: "555-0101",
  address: "123 Example Lane",
  emergencyContact: "Example Contact 555-0102",
  insurance: "Fictitious Carrier TEST-123",
  allergies: "No known allergies",
  medicalRelease: true,
  transportRelease: true,
  photoRelease: true,
  covenant: true,
});

async function householdWithCamper(id: string) {
  const guardian = await prisma.person.create({ data: { firstName: id, lastName: "Guardian", email: `${id}.guardian@example.test` } });
  const camper = await prisma.person.create({ data: { firstName: id, lastName: "Camper", birthDate: new Date("2017-06-15T00:00:00Z") } });
  const household = await prisma.household.create({ data: { displayName: `${id} Household` } });
  await prisma.householdMember.createMany({ data: [
    { householdId: household.id, personId: guardian.id, relationship: HouseholdRelationship.GUARDIAN, hasPortalAccess: true, isPrimaryContact: true },
    { householdId: household.id, personId: camper.id, relationship: HouseholdRelationship.CAMPER, hasPortalAccess: false },
  ] });
  const user = await prisma.user.create({ data: { id: `${id}-user`, name: `${id} Guardian`, email: `${id}.auth@example.test`, personId: guardian.id, status: "ACTIVE" } });
  return { user, camper };
}

async function setup() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "PortalInvitation", "AuditEvent", "FormSubmission", "FormVersion", "FormDefinition", "Registration", "CamperProfile", "HouseholdMember", "Household", "Session", "Season", "Organization", "UserRole", "RolePermission", "Permission", "Role", "Account", "AuthSession", "Verification", "User", "Person" CASCADE');
  const organization = await prisma.organization.create({ data: { name: "Capacity Camp", slug: "capacity-camp" } });
  const season = await prisma.season.create({ data: { organizationId: organization.id, name: "2033 Season", year: 2033, status: "open" } });
  const session = await prisma.session.create({ data: {
    seasonId: season.id, name: "JYF", startDate: new Date("2033-07-01T14:00:00Z"), endDate: new Date("2033-07-05T17:00:00Z"),
    capacity: 1, basePrice: "250.00", waitlistEnabled: true, status: "open",
  } });
  const first = await householdWithCamper("first");
  const second = await householdWithCamper("second");
  const permission = await prisma.permission.create({ data: { key: "registration.approve", description: "Approve registration" } });
  const role = await prisma.role.create({ data: { key: "registrar", name: "Registrar" } });
  await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  const registrar = await prisma.user.create({ data: { id: "capacity-registrar", name: "Registrar", email: "capacity.registrar@example.test", status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: registrar.id, roleId: role.id } });
  return { season, session, first, second, registrar };
}

test("concurrent submissions reserve one seat and waitlist the other atomically", async () => {
  const x = await setup();
  const results = await Promise.all([
    submitOwnedRegistrationWithCapacity(x.first.user.id, { sessionId: x.session.id, camperId: x.first.camper.id, answers: answers("First Camper", x.first.user.email) }),
    submitOwnedRegistrationWithCapacity(x.second.user.id, { sessionId: x.session.id, camperId: x.second.camper.id, answers: answers("Second Camper", x.second.user.email) }),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [RegistrationStatus.SUBMITTED, RegistrationStatus.WAITLISTED].sort());
  const waitlisted = await prisma.registration.findFirstOrThrow({ where: { sessionId: x.session.id, status: RegistrationStatus.WAITLISTED } });
  assert.equal(waitlisted.waitlistPosition, 1);
  await assert.rejects(() => transitionRegistrarRegistrationWithCapacity(x.registrar.id, waitlisted.id, RegistrationStatus.APPROVED), ValidationError);

  await prisma.registration.updateMany({ where: { sessionId: x.session.id, status: RegistrationStatus.SUBMITTED }, data: { status: RegistrationStatus.CANCELLED } });
  const approved = await transitionRegistrarRegistrationWithCapacity(x.registrar.id, waitlisted.id, RegistrationStatus.APPROVED);
  assert.equal(approved.status, RegistrationStatus.APPROVED);
  assert.equal(approved.waitlistPosition, null);
});

test("closed seasons and full sessions without waitlists reject submission", async () => {
  const x = await setup();
  await prisma.season.update({ where: { id: x.season.id }, data: { status: "closed" } });
  await assert.rejects(() => submitOwnedRegistrationWithCapacity(x.first.user.id, {
    sessionId: x.session.id, camperId: x.first.camper.id, answers: answers("First Camper", x.first.user.email),
  }), ValidationError);

  await prisma.season.update({ where: { id: x.season.id }, data: { status: "open" } });
  await prisma.session.update({ where: { id: x.session.id }, data: { waitlistEnabled: false } });
  await submitOwnedRegistrationWithCapacity(x.first.user.id, {
    sessionId: x.session.id, camperId: x.first.camper.id, answers: answers("First Camper", x.first.user.email),
  });
  await assert.rejects(() => submitOwnedRegistrationWithCapacity(x.second.user.id, {
    sessionId: x.session.id, camperId: x.second.camper.id, answers: answers("Second Camper", x.second.user.email),
  }), ValidationError);
});

test.after(async () => prisma.$disconnect());
