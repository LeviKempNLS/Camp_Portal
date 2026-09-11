import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  AdminAuthorizationError,
  AdminValidationError,
  createSeason,
  createSession,
  listCampConfiguration,
  updateSeason,
  updateSession,
} from "./admin.ts";

const prisma = new PrismaClient();

async function setup() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "PortalInvitation", "AuditEvent", "FormSubmission", "FormVersion", "FormDefinition", "Registration", "CamperProfile", "HouseholdMember", "Household", "Session", "Season", "Organization", "UserRole", "RolePermission", "Permission", "Role", "Account", "AuthSession", "Verification", "User", "Person" CASCADE');
  await prisma.organization.create({ data: { name: "Config Camp", slug: "config-camp", timezone: "America/Chicago" } });
  const permission = await prisma.permission.create({ data: { key: "camp.configure", description: "Configure camp" } });
  const role = await prisma.role.create({ data: { key: "camp_director", name: "Camp Director" } });
  await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  const allowed = await prisma.user.create({ data: { id: "director", name: "Director", email: "director@example.test" } });
  const denied = await prisma.user.create({ data: { id: "parent", name: "Parent", email: "parent@example.test" } });
  await prisma.userRole.create({ data: { userId: allowed.id, roleId: role.id } });
  return { allowed, denied };
}

function sessionInput(seasonId: string) {
  return {
    seasonId,
    name: "JYF",
    startDate: new Date("2032-07-01T14:00:00Z"),
    endDate: new Date("2032-07-05T17:00:00Z"),
    capacity: 120,
    minimumGrade: "3",
    maximumGrade: "5",
    basePrice: "275.00",
    depositAmount: "50.00",
    waitlistEnabled: true,
    status: "open",
  };
}

test("every camp configuration read and mutation is permissioned", async () => {
  const x = await setup();
  await assert.rejects(() => listCampConfiguration(x.denied.id), AdminAuthorizationError);
  await assert.rejects(() => createSeason(x.denied.id, { name: "Denied", year: 2031, status: "open" }), AdminAuthorizationError);

  const season = await createSeason(x.allowed.id, { name: "2032 Season", year: 2032, status: "open" });
  await assert.rejects(() => updateSeason(x.denied.id, season.id, { name: "Denied", status: "open" }), AdminAuthorizationError);
  await assert.rejects(() => createSession(x.denied.id, sessionInput(season.id)), AdminAuthorizationError);

  const session = await createSession(x.allowed.id, sessionInput(season.id));
  await assert.rejects(() => updateSession(x.denied.id, session.id, {
    name: session.name,
    startDate: session.startDate,
    endDate: session.endDate,
    capacity: session.capacity,
    basePrice: session.basePrice.toString(),
    depositAmount: session.depositAmount?.toString(),
    waitlistEnabled: session.waitlistEnabled,
    status: session.status,
  }), AdminAuthorizationError);
});

test("camp configuration persists validated season and session settings", async () => {
  const x = await setup();
  const season = await createSeason(x.allowed.id, {
    name: "2032 Season", year: 2032, status: "open",
    registrationOpen: new Date("2032-01-01T06:00:00Z"), registrationClose: new Date("2032-06-01T05:00:00Z"),
  });
  const session = await createSession(x.allowed.id, sessionInput(season.id));
  await updateSession(x.allowed.id, session.id, {
    name: "JYF Camp", startDate: session.startDate, endDate: session.endDate, capacity: 125,
    minimumGrade: "3", maximumGrade: "5", basePrice: "280.00", depositAmount: "50.00",
    waitlistEnabled: true, status: "open",
  });
  const config = await listCampConfiguration(x.allowed.id);
  assert.equal(config.timezone, "America/Chicago");
  assert.equal(config.seasons[0].sessions[0].name, "JYF Camp");
  assert.equal(config.seasons[0].sessions[0].capacity, 125);
  assert.equal(config.seasons[0].sessions[0].basePrice.toString(), "280");
});

test("invalid dates, registration windows, and database-sized money values are rejected before persistence", async () => {
  const x = await setup();
  await assert.rejects(() => createSeason(x.allowed.id, {
    name: "Bad window", year: 2032, status: "open",
    registrationOpen: new Date("invalid"), registrationClose: new Date("2032-06-01T00:00:00Z"),
  }), AdminValidationError);

  const season = await createSeason(x.allowed.id, { name: "2033 Season", year: 2033, status: "open" });
  const good = sessionInput(season.id);
  await assert.rejects(() => createSession(x.allowed.id, { ...good, startDate: new Date("invalid") }), AdminValidationError);
  await assert.rejects(() => createSession(x.allowed.id, { ...good, basePrice: "100000000.00" }), AdminValidationError);

  const session = await createSession(x.allowed.id, good);
  await assert.rejects(() => updateSession(x.allowed.id, session.id, {
    name: session.name, startDate: new Date("invalid"), endDate: session.endDate, capacity: session.capacity,
    basePrice: "275.00", depositAmount: "50.00", waitlistEnabled: true, status: "open",
  }), AdminValidationError);
  await assert.rejects(() => updateSession(x.allowed.id, session.id, {
    name: session.name, startDate: session.startDate, endDate: session.endDate, capacity: session.capacity,
    basePrice: "999999999.99", depositAmount: "50.00", waitlistEnabled: true, status: "open",
  }), AdminValidationError);
});

test.after(async () => prisma.$disconnect());
