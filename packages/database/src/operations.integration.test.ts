import test from "node:test";
import assert from "node:assert/strict";
import { HouseholdRelationship, PrismaClient, StaffAssignmentStatus, StaffRole } from "@prisma/client";
import {
  assignStaff,
  createCabin,
  createCampGroup,
  getStaffWorkspace,
  hasStaffAssignment,
  OperationsAuthorizationError,
  OperationsValidationError,
  removeStaffAssignment,
} from "./operations.ts";

const prisma = new PrismaClient();

async function personWithUser(id: string, firstName: string, lastName: string) {
  const person = await prisma.person.create({ data: { firstName, lastName, email: `${id}.person@example.test` } });
  const user = await prisma.user.create({ data: { id: `${id}-user`, name: `${firstName} ${lastName}`, email: `${id}.auth@example.test`, personId: person.id, status: "ACTIVE" } });
  return { person, user };
}

async function setup() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "StaffAssignment", "Cabin", "CampGroup", "PortalInvitation", "AuditEvent", "FormSubmission", "FormVersion", "FormDefinition", "Registration", "CamperProfile", "HouseholdMember", "Household", "Session", "Season", "Organization", "UserRole", "RolePermission", "Permission", "Role", "Account", "AuthSession", "Verification", "User", "Person" CASCADE');
  const organization = await prisma.organization.create({ data: { name: "Operations Camp", slug: "operations-camp" } });
  const season = await prisma.season.create({ data: { organizationId: organization.id, name: "2034 Season", year: 2034, status: "open" } });
  const firstSession = await prisma.session.create({ data: { seasonId: season.id, name: "Junior", startDate: new Date("2034-07-01T14:00:00Z"), endDate: new Date("2034-07-05T17:00:00Z"), capacity: 100, basePrice: "0", status: "open" } });
  const secondSession = await prisma.session.create({ data: { seasonId: season.id, name: "Senior", startDate: new Date("2034-07-08T14:00:00Z"), endDate: new Date("2034-07-12T17:00:00Z"), capacity: 100, basePrice: "0", status: "open" } });

  const permission = await prisma.permission.create({ data: { key: "operations.manage", description: "Manage operations" } });
  const directorRole = await prisma.role.create({ data: { key: "camp_director", name: "Camp Director" } });
  const parentRole = await prisma.role.create({ data: { key: "parent", name: "Parent" } });
  await prisma.rolePermission.create({ data: { roleId: directorRole.id, permissionId: permission.id } });

  const director = await personWithUser("director", "Camp", "Director");
  const multi = await personWithUser("multi", "Guardian", "Counselor");
  await prisma.userRole.createMany({ data: [
    { userId: director.user.id, roleId: directorRole.id },
    { userId: multi.user.id, roleId: parentRole.id },
  ] });
  const household = await prisma.household.create({ data: { displayName: "Multi Role Household" } });
  await prisma.householdMember.create({ data: { householdId: household.id, personId: multi.person.id, relationship: HouseholdRelationship.GUARDIAN, hasPortalAccess: true } });

  const otherCounselor = await prisma.person.create({ data: { firstName: "Other", lastName: "Counselor" } });
  const groupDirector = await prisma.person.create({ data: { firstName: "Group", lastName: "Director" } });
  return { organization, season, firstSession, secondSession, director, multi, otherCounselor, groupDirector };
}

test("operations management is permission-gated and counselor assignment preserves guardian access", async () => {
  const x = await setup();
  await assert.rejects(() => createCampGroup(x.multi.user.id, { sessionId: x.firstSession.id, name: "JYF" }), OperationsAuthorizationError);

  const group = await createCampGroup(x.director.user.id, { sessionId: x.firstSession.id, name: "JYF", capacity: 40 });
  const cabin = await createCabin(x.director.user.id, { sessionId: x.firstSession.id, groupId: group.id, name: "Cabin A", capacity: 10 });
  const assignment = await assignStaff(x.director.user.id, { sessionId: x.firstSession.id, personId: x.multi.person.id, role: StaffRole.COUNSELOR, cabinId: cabin.id });

  assert.equal(assignment.groupId, group.id, "selecting a grouped cabin should infer the matching group");
  const roles = await prisma.userRole.findMany({ where: { userId: x.multi.user.id }, include: { role: true } });
  assert.deepEqual(new Set(roles.map(row => row.role.key)), new Set(["parent", "counselor"]));
  const membership = await prisma.householdMember.findUniqueOrThrow({ where: { householdId_personId: { householdId: (await prisma.household.findFirstOrThrow()).id, personId: x.multi.person.id } } });
  assert.equal(membership.hasPortalAccess, true);

  const workspace = await getStaffWorkspace(x.multi.user.id);
  assert.equal(workspace[0].group?.name, "JYF");
  assert.equal(workspace[0].cabin?.name, "Cabin A");
  assert.equal(await hasStaffAssignment(x.multi.user.id), true);
  assert.equal(JSON.stringify(workspace).includes("answers"), false);
  assert.equal(JSON.stringify(workspace).includes("generalNotes"), false);
});

test("staff scope rejects cross-session group and cabin combinations", async () => {
  const x = await setup();
  const firstGroup = await createCampGroup(x.director.user.id, { sessionId: x.firstSession.id, name: "First Group" });
  const secondGroup = await createCampGroup(x.director.user.id, { sessionId: x.secondSession.id, name: "Second Group" });
  const secondCabin = await createCabin(x.director.user.id, { sessionId: x.secondSession.id, groupId: secondGroup.id, name: "Second Cabin", capacity: 10 });

  await assert.rejects(() => createCabin(x.director.user.id, { sessionId: x.firstSession.id, groupId: secondGroup.id, name: "Bad Cabin", capacity: 10 }), OperationsValidationError);
  await assert.rejects(() => assignStaff(x.director.user.id, { sessionId: x.firstSession.id, personId: x.multi.person.id, role: StaffRole.COUNSELOR, groupId: firstGroup.id, cabinId: secondCabin.id }), OperationsValidationError);
});

test("counselor workspace is assignment-scoped and removal immediately revokes staff workspace access", async () => {
  const x = await setup();
  const group = await createCampGroup(x.director.user.id, { sessionId: x.firstSession.id, name: "JYF" });
  const cabinA = await createCabin(x.director.user.id, { sessionId: x.firstSession.id, groupId: group.id, name: "Cabin A", capacity: 10 });
  const cabinB = await createCabin(x.director.user.id, { sessionId: x.firstSession.id, groupId: group.id, name: "Cabin B", capacity: 10 });

  const counselor = await assignStaff(x.director.user.id, { sessionId: x.firstSession.id, personId: x.multi.person.id, role: StaffRole.COUNSELOR, cabinId: cabinA.id });
  await assignStaff(x.director.user.id, { sessionId: x.firstSession.id, personId: x.otherCounselor.id, role: StaffRole.COUNSELOR, cabinId: cabinB.id });
  await assignStaff(x.director.user.id, { sessionId: x.firstSession.id, personId: x.groupDirector.id, role: StaffRole.GROUP_DIRECTOR, groupId: group.id });
  await assignStaff(x.director.user.id, { sessionId: x.firstSession.id, personId: x.director.person.id, role: StaffRole.CAMP_DIRECTOR });

  const workspace = await getStaffWorkspace(x.multi.user.id);
  const visibleNames = new Set(workspace[0].team.map(row => `${row.person.firstName} ${row.person.lastName}`));
  assert.equal(visibleNames.has("Other Counselor"), false, "counselors should not see unrelated cabin staff");
  assert.equal(visibleNames.has("Group Director"), true);
  assert.equal(visibleNames.has("Camp Director"), true);

  const removed = await removeStaffAssignment(x.director.user.id, counselor.id);
  assert.equal(removed.status, StaffAssignmentStatus.INACTIVE);
  assert.equal(await hasStaffAssignment(x.multi.user.id), false);
  await assert.rejects(() => getStaffWorkspace(x.multi.user.id), OperationsAuthorizationError);
  assert.ok(await prisma.auditEvent.count({ where: { action: { startsWith: "operations." } } }) >= 7);
});

test.after(async () => prisma.$disconnect());
