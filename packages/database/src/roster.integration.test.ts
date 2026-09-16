import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, RegistrationStatus, StaffRole } from "@prisma/client";
import {
  assignCamperPlacement,
  campRosterCsv,
  getStaffCamperRoster,
  listCampRoster,
  removeCamperPlacement,
  RosterAuthorizationError,
  RosterValidationError,
} from "./roster.ts";

const prisma = new PrismaClient();

async function linkedUser(id: string, firstName: string, lastName: string) {
  const person = await prisma.person.create({ data: { firstName, lastName, email: `${id}.person@example.test` } });
  const user = await prisma.user.create({ data: { id: `${id}-user`, name: `${firstName} ${lastName}`, email: `${id}.auth@example.test`, personId: person.id, status: "ACTIVE" } });
  return { person, user };
}

async function camper(sessionId: string, householdId: string, formVersionId: string, index: number, shirtSize: string) {
  const person = await prisma.person.create({
    data: {
      firstName: `Camper${index}`,
      lastName: index === 1 ? "Alpha" : index === 2 ? "Bravo" : index === 3 ? "Charlie" : "Delta",
      birthDate: new Date(`202${index}-06-15T00:00:00Z`),
      camperProfile: { create: { grade: String(index + 2), school: "Fictitious School", generalNotes: "SECRET-GENERAL-NOTE" } },
    },
  });
  const registration = await prisma.registration.create({
    data: { sessionId, personId: person.id, householdId, status: RegistrationStatus.APPROVED, submittedAt: new Date() },
  });
  await prisma.formSubmission.create({
    data: {
      registrationId: registration.id,
      formVersionId,
      status: "submitted",
      completedAt: new Date(),
      answers: {
        camperName: `${person.firstName} ${person.lastName}`,
        session: index === 4 ? "chirho" : "jyf",
        grade: String(index + 5),
        shirtSize,
        medicalInsurance: "SECRET-INSURANCE-123",
        allergies: "SECRET-ALLERGY",
        guardianPhone: "SECRET-PHONE",
      },
    },
  });
  return { person, registration };
}

async function setup() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "CamperPlacement", "StaffAssignment", "Cabin", "CampGroup", "PortalInvitation", "AuditEvent", "FormSubmission", "FormVersion", "FormDefinition", "Registration", "CamperProfile", "HouseholdMember", "Household", "Session", "Season", "Organization", "UserRole", "RolePermission", "Permission", "Role", "Account", "AuthSession", "Verification", "User", "Person" CASCADE');
  const organization = await prisma.organization.create({ data: { name: "Roster Camp", slug: "roster-camp" } });
  const season = await prisma.season.create({ data: { organizationId: organization.id, name: "2036", year: 2036, status: "open" } });
  const firstSession = await prisma.session.create({ data: { seasonId: season.id, name: "Junior Camp", startDate: new Date("2036-07-01T14:00:00Z"), endDate: new Date("2036-07-05T17:00:00Z"), capacity: 100, basePrice: "250.00", status: "open" } });
  const secondSession = await prisma.session.create({ data: { seasonId: season.id, name: "Chi Rho Camp", startDate: new Date("2036-07-08T14:00:00Z"), endDate: new Date("2036-07-12T17:00:00Z"), capacity: 100, basePrice: "250.00", status: "open" } });

  const read = await prisma.permission.create({ data: { key: "roster.read", description: "Read safe roster" } });
  const manage = await prisma.permission.create({ data: { key: "roster.manage", description: "Manage placements" } });
  const registrarRole = await prisma.role.create({ data: { key: "registrar", name: "Registrar" } });
  const readOnlyRole = await prisma.role.create({ data: { key: "roster_viewer", name: "Roster viewer" } });
  await prisma.rolePermission.createMany({ data: [
    { roleId: registrarRole.id, permissionId: read.id },
    { roleId: registrarRole.id, permissionId: manage.id },
    { roleId: readOnlyRole.id, permissionId: read.id },
  ] });
  const registrar = await linkedUser("registrar", "Kim", "Registrar");
  const readOnly = await linkedUser("roster-viewer", "Read", "Only");
  const outsider = await linkedUser("outsider", "No", "Access");
  await prisma.userRole.createMany({ data: [
    { userId: registrar.user.id, roleId: registrarRole.id },
    { userId: readOnly.user.id, roleId: readOnlyRole.id },
  ] });

  const counselor = await linkedUser("counselor", "Cabin", "Counselor");
  const groupDirector = await linkedUser("group-director", "Group", "Director");
  const campDirector = await linkedUser("camp-director", "Camp", "Director");

  const group = await prisma.campGroup.create({ data: { sessionId: firstSession.id, name: "Junior Faith", capacity: 2 } });
  const cabinA = await prisma.cabin.create({ data: { sessionId: firstSession.id, groupId: group.id, name: "Cabin A", capacity: 1 } });
  const cabinB = await prisma.cabin.create({ data: { sessionId: firstSession.id, groupId: group.id, name: "Cabin B", capacity: 1 } });
  const secondGroup = await prisma.campGroup.create({ data: { sessionId: secondSession.id, name: "Chi Rho", capacity: 20 } });

  await prisma.staffAssignment.createMany({ data: [
    { sessionId: firstSession.id, personId: counselor.person.id, role: StaffRole.COUNSELOR, groupId: group.id, cabinId: cabinA.id },
    { sessionId: firstSession.id, personId: groupDirector.person.id, role: StaffRole.GROUP_DIRECTOR, groupId: group.id },
    { sessionId: firstSession.id, personId: campDirector.person.id, role: StaffRole.CAMP_DIRECTOR },
  ] });

  const household = await prisma.household.create({ data: { displayName: "Roster Household" } });
  const definition = await prisma.formDefinition.create({ data: { organizationId: organization.id, key: "registration", name: "Registration" } });
  const version = await prisma.formVersion.create({ data: { formDefinitionId: definition.id, version: 1, schema: { id: "roster-test" }, isPublished: true } });
  await prisma.formDefinition.update({ where: { id: definition.id }, data: { activeVersionId: version.id } });

  const first = await camper(firstSession.id, household.id, version.id, 1, "Youth M");
  const second = await camper(firstSession.id, household.id, version.id, 2, "Adult S");
  const third = await camper(firstSession.id, household.id, version.id, 3, "Youth M");
  const fourth = await camper(secondSession.id, household.id, version.id, 4, "Adult M");

  return { organization, firstSession, secondSession, registrar, readOnly, outsider, counselor, groupDirector, campDirector, group, cabinA, cabinB, secondGroup, first, second, third, fourth };
}

test("registrar roster authorization and projection keep confidential data out", async () => {
  const x = await setup();
  await assert.rejects(() => listCampRoster(x.outsider.user.id), RosterAuthorizationError);
  await assert.rejects(() => assignCamperPlacement(x.outsider.user.id, { registrationId: x.first.registration.id, groupId: x.group.id }), RosterAuthorizationError);

  await assignCamperPlacement(x.registrar.user.id, { registrationId: x.first.registration.id, cabinId: x.cabinA.id });
  const result = await listCampRoster(x.registrar.user.id, { groupId: x.group.id, shirtSize: "Youth M" });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].camperName, "Camper1 Alpha");
  assert.equal(result.rows[0].ageGroup, "JYF");
  assert.equal(result.rows[0].grade, "6", "submitted registration grade should win over the stale profile grade");
  assert.equal(result.rows[0].shirtSize, "Youth M");
  assert.equal(result.rows[0].groupName, "Junior Faith");
  assert.equal(result.rows[0].cabinName, "Cabin A");
  const serialized = JSON.stringify(result);
  for (const secret of ["SECRET-INSURANCE-123", "SECRET-ALLERGY", "SECRET-PHONE", "SECRET-GENERAL-NOTE", "medicalInsurance", "allergies", "guardianPhone", "answers"]) {
    assert.equal(serialized.includes(secret), false, `roster projection must exclude ${secret}`);
  }
  const csv = campRosterCsv(result.rows);
  assert.match(csv, /T-shirt size/);
  assert.match(csv, /Youth M/);
  assert.equal(csv.includes("SECRET-"), false);
});

test("read-only roster access cannot mutate placements", async () => {
  const x = await setup();
  const result = await listCampRoster(x.readOnly.user.id);
  assert.equal(result.rows.length, 4);
  await assert.rejects(
    () => assignCamperPlacement(x.readOnly.user.id, { registrationId: x.first.registration.id, groupId: x.group.id }),
    RosterAuthorizationError,
  );
});

test("roster supports session sorting, keeps missing values last, and neutralizes spreadsheet formulas", async () => {
  const x = await setup();
  const sorted = await listCampRoster(x.registrar.user.id, { sort: "session", direction: "asc" });
  assert.equal(sorted.rows[0].sessionName, "Chi Rho Camp");
  assert.equal(sorted.rows.at(-1)?.sessionName, "Junior Camp");

  await assignCamperPlacement(x.registrar.user.id, { registrationId: x.first.registration.id, cabinId: x.cabinA.id });
  const byCabinDescending = await listCampRoster(x.registrar.user.id, { sessionId: x.firstSession.id, sort: "cabin", direction: "desc" });
  assert.equal(byCabinDescending.rows[0].cabinName, "Cabin A");
  assert.equal(byCabinDescending.rows.at(-1)?.cabinName, "");

  const dangerous = {
    ...sorted.rows[0],
    camperName: "=1+1",
    grade: "+SUM(A1:A2)",
    groupName: "@malicious",
    cabinName: "-2+3",
    sessionName: "=CMD()",
  };
  const csv = campRosterCsv([dangerous]);
  for (const neutralized of ["'=1+1", "'+SUM(A1:A2)", "'@malicious", "'-2+3", "'=CMD()"] ) {
    assert.ok(csv.includes(neutralized), `CSV should neutralize ${neutralized}`);
  }
});

test("placement enforces session integrity and cabin/group capacity", async () => {
  const x = await setup();
  await assignCamperPlacement(x.registrar.user.id, { registrationId: x.first.registration.id, cabinId: x.cabinA.id });
  await assert.rejects(() => assignCamperPlacement(x.registrar.user.id, { registrationId: x.second.registration.id, cabinId: x.cabinA.id }), RosterValidationError);
  await assignCamperPlacement(x.registrar.user.id, { registrationId: x.second.registration.id, cabinId: x.cabinB.id });
  await assert.rejects(() => assignCamperPlacement(x.registrar.user.id, { registrationId: x.third.registration.id, groupId: x.group.id }), RosterValidationError);
  await assert.rejects(() => assignCamperPlacement(x.registrar.user.id, { registrationId: x.first.registration.id, groupId: x.secondGroup.id }), RosterValidationError);

  await assert.rejects(() => prisma.camperPlacement.create({
    data: { registrationId: x.third.registration.id, sessionId: x.firstSession.id, groupId: x.secondGroup.id },
  }));
  assert.ok(await prisma.auditEvent.count({ where: { action: { startsWith: "roster." } } }) >= 2);
});

test("unassignment deletes the placement and records an explicit audit event", async () => {
  const x = await setup();
  const placement = await assignCamperPlacement(x.registrar.user.id, { registrationId: x.first.registration.id, cabinId: x.cabinA.id });
  const removed = await removeCamperPlacement(x.registrar.user.id, x.first.registration.id);
  assert.equal(removed?.id, placement.id);
  assert.equal(await prisma.camperPlacement.findUnique({ where: { registrationId: x.first.registration.id } }), null);
  const audit = await prisma.auditEvent.findFirst({ where: { action: "roster.camper_unassigned", entityId: placement.id } });
  assert.ok(audit);
});

test("staff camper rosters follow cabin, group, and camp-wide assignment scope", async () => {
  const x = await setup();
  await assignCamperPlacement(x.registrar.user.id, { registrationId: x.first.registration.id, cabinId: x.cabinA.id });
  await assignCamperPlacement(x.registrar.user.id, { registrationId: x.second.registration.id, cabinId: x.cabinB.id });

  const counselorRoster = await getStaffCamperRoster(x.counselor.user.id);
  assert.deepEqual(counselorRoster[0].rows.map(row => row.camperName), ["Camper1 Alpha"]);

  const groupRoster = await getStaffCamperRoster(x.groupDirector.user.id);
  assert.deepEqual(groupRoster[0].rows.map(row => row.camperName), ["Camper1 Alpha", "Camper2 Bravo"]);

  const directorRoster = await getStaffCamperRoster(x.campDirector.user.id);
  assert.deepEqual(directorRoster[0].rows.map(row => row.camperName), ["Camper1 Alpha", "Camper2 Bravo", "Camper3 Charlie"]);
  const serialized = JSON.stringify([counselorRoster, groupRoster, directorRoster]);
  assert.equal(serialized.includes("SECRET-"), false);
  assert.equal(serialized.includes("answers"), false);
});

test.after(async () => prisma.$disconnect());
