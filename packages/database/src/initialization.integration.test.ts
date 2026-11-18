import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { auth } from "@faith-adventures/auth";
import { ensurePortalProfile } from "./portal.ts";
import { listCampConfiguration, createSeason } from "./admin.ts";
import {
  initializeReferenceData,
  provisionInitialAdministrator,
} from "./initialization.ts";
import {
  InitializationError,
  type InitialAdministratorInput,
} from "./initialization-configuration.ts";

const target = new URL(
  process.env.DATABASE_URL ?? "postgresql://invalid@invalid/invalid",
);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  !/^\/camp_portal_(test|integration|initialization_test)$/.test(
    target.pathname,
  )
) {
  throw new Error(
    "Initialization integration tests require a dedicated local camp_portal_test, camp_portal_integration or camp_portal_initialization_test database.",
  );
}
const prisma = new PrismaClient({ log: [] });
const context = {
  environment: "production" as const,
  organizationSlug: "test-camp",
  operatorReference: "integration-change-19",
};
const reference = {
  ...context,
  organizationName: "Fictitious Initialization Camp",
  timezone: "America/Chicago",
};

async function reset() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Organization", "Role", "Permission", "Household", "User", "Person" CASCADE',
  );
}
async function activeAccount(id: string) {
  const person = await prisma.person.create({
    data: { firstName: "Fictitious", lastName: id },
  });
  return prisma.user.create({
    data: {
      id,
      name: `Fictitious ${id}`,
      email: `${id}@example.test`,
      status: "ACTIVE",
      personId: person.id,
    },
  });
}
function selection(user: {
  id: string;
  email: string;
}): InitialAdministratorInput {
  return { ...context, userId: user.id, email: user.email };
}
async function counts() {
  return {
    organizations: await prisma.organization.count(),
    roles: await prisma.role.count(),
    permissions: await prisma.permission.count(),
    rolePermissions: await prisma.rolePermission.count(),
    userRoles: await prisma.userRole.count(),
    audits: await prisma.auditEvent.count(),
    users: await prisma.user.count(),
    people: await prisma.person.count(),
    households: await prisma.household.count(),
    campers: await prisma.camperProfile.count(),
    seasons: await prisma.season.count(),
    sessions: await prisma.session.count(),
    registrations: await prisma.registration.count(),
    ledger: await prisma.financialEntry.count(),
    churches: await prisma.church.count(),
    scholarships: await prisma.scholarshipProgram.count(),
    forms: await prisma.formDefinition.count(),
    outbox: await prisma.outboxMessage.count(),
  };
}

test("fresh release reference initialization creates no users, fixtures or privileged grants", async () => {
  await reset();
  assert.equal(
    (await initializeReferenceData(prisma, reference)).status,
    "initialized",
  );
  const actual = await counts();
  assert.deepEqual(actual, {
    organizations: 1,
    roles: 7,
    permissions: 16,
    rolePermissions: 35,
    userRoles: 0,
    audits: 1,
    users: 0,
    people: 0,
    households: 0,
    campers: 0,
    seasons: 0,
    sessions: 0,
    registrations: 0,
    ledger: 0,
    churches: 0,
    scholarships: 0,
    forms: 0,
    outbox: 0,
  });
  const organization = await prisma.organization.findFirstOrThrow();
  assert.equal(organization.name, reference.organizationName);
  const audit = await prisma.auditEvent.findFirstOrThrow();
  assert.equal(audit.actorUserId, null);
  assert.equal(audit.action, "system.reference_data_initialized");
});

test("replay preserves customized reference data and never restores revoked permissions", async () => {
  await reset();
  await initializeReferenceData(prisma, reference);
  const administrator = await prisma.role.findUniqueOrThrow({
    where: { key: "system_administrator" },
  });
  const permission = await prisma.permission.findUniqueOrThrow({
    where: { key: "finance.record" },
  });
  await prisma.role.update({
    where: { id: administrator.id },
    data: { name: "Customized administrator" },
  });
  await prisma.rolePermission.delete({
    where: {
      roleId_permissionId: {
        roleId: administrator.id,
        permissionId: permission.id,
      },
    },
  });
  const before = await counts();
  assert.equal(
    (
      await initializeReferenceData(prisma, {
        ...reference,
        organizationName: "Must not overwrite",
      })
    ).status,
    "already_initialized",
  );
  assert.deepEqual(await counts(), before);
  assert.equal(
    (await prisma.role.findUniqueOrThrow({ where: { id: administrator.id } }))
      .name,
    "Customized administrator",
  );
  assert.equal(
    (await prisma.organization.findFirstOrThrow()).name,
    reference.organizationName,
  );
  await assert.rejects(
    () =>
      initializeReferenceData(prisma, { ...reference, environment: "staging" }),
    InitializationError,
  );
  await assert.rejects(
    () =>
      initializeReferenceData(prisma, {
        ...reference,
        organizationSlug: "other-camp",
      }),
    InitializationError,
  );
  assert.deepEqual(await counts(), before);
});

test("existing demo organizations, ambiguous databases and partial reference data cannot be adopted", async () => {
  await reset();
  await prisma.organization.create({
    data: {
      name: "Existing Demo",
      slug: "faith-adventures-demo",
      settings: { demo: true },
    },
  });
  await prisma.household.create({
    data: { displayName: "Existing fictitious household" },
  });
  const before = await counts();
  await assert.rejects(
    () => initializeReferenceData(prisma, reference),
    InitializationError,
  );
  assert.deepEqual(await counts(), before);
  assert.equal(
    (await prisma.household.findFirstOrThrow()).displayName,
    "Existing fictitious household",
  );
  await prisma.organization.create({
    data: { name: "Second Org", slug: "second" },
  });
  const ambiguous = await counts();
  await assert.rejects(
    () => initializeReferenceData(prisma, reference),
    InitializationError,
  );
  assert.deepEqual(await counts(), ambiguous);
  await reset();
  await prisma.role.create({ data: { key: "custom", name: "Existing role" } });
  const partial = await counts();
  await assert.rejects(
    () => initializeReferenceData(prisma, reference),
    InitializationError,
  );
  assert.deepEqual(await counts(), partial);
});

test("concurrent reference initialization produces one complete catalog and one audit event", async () => {
  await reset();
  const results = await Promise.all([
    initializeReferenceData(prisma, reference),
    initializeReferenceData(prisma, reference),
  ]);
  assert.deepEqual(results.map((value) => value.status).sort(), [
    "already_initialized",
    "initialized",
  ]);
  assert.equal(await prisma.organization.count(), 1);
  assert.equal(await prisma.role.count(), 7);
  assert.equal(await prisma.rolePermission.count(), 35);
  assert.equal(await prisma.auditEvent.count(), 1);
});

test("first administrator uses an existing Better Auth identity and retains household and credential state", async () => {
  await reset();
  await initializeReferenceData(prisma, reference);
  const email = `initial.${Date.now()}@example.test`;
  const identity = await auth.api.signUpEmail({
    body: {
      name: "Fictitious Initial Operator",
      email,
      password: randomBytes(24).toString("base64url"),
    },
  });
  const profile = await ensurePortalProfile({
    id: identity.user.id,
    email,
    name: "Fictitious Initial Operator",
  });
  const hash = (value: unknown) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const before = {
    user: await prisma.user.findUniqueOrThrow({ where: { id: profile.id } }),
    accounts: hash(await prisma.account.findMany()),
    households: await prisma.household.findMany(),
    people: await prisma.person.findMany(),
  };
  assert.equal(
    (await provisionInitialAdministrator(prisma, selection(profile))).status,
    "provisioned",
  );
  assert.deepEqual(
    await prisma.user.findUniqueOrThrow({ where: { id: profile.id } }),
    before.user,
  );
  assert.equal(hash(await prisma.account.findMany()), before.accounts);
  assert.deepEqual(await prisma.household.findMany(), before.households);
  assert.deepEqual(await prisma.person.findMany(), before.people);
  const roles = await prisma.userRole.findMany({
    where: { userId: profile.id },
    include: { role: true },
  });
  assert.deepEqual(roles.map((value) => value.role.key).sort(), [
    "parent",
    "system_administrator",
  ]);
  assert(roles.every((value) => !value.managedByStaffAssignments));
  const configured = await listCampConfiguration(profile.id);
  assert.equal(configured.slug, reference.organizationSlug);
  await createSeason(profile.id, {
    name: "Fictitious manually configured season",
    year: 2099,
    status: "draft",
  });
  assert.equal(await prisma.season.count(), 1);
  const receipt = await prisma.auditEvent.findFirstOrThrow({
    where: { action: "system.initial_administrator_provisioned" },
  });
  assert.equal(receipt.entityId, profile.id);
  assert.equal(receipt.actorUserId, null);
});

test("missing, mismatched, inactive and unlinked accounts never receive a bootstrap grant", async () => {
  await reset();
  await initializeReferenceData(prisma, reference);
  const user = await activeAccount("eligible-operator");
  const unlinked = await prisma.user.create({
    data: {
      id: "unlinked",
      email: "unlinked@example.test",
      name: "Unlinked",
      status: "ACTIVE",
    },
  });
  for (const input of [
    { ...selection(user), userId: "missing" },
    { ...selection(user), email: "other@example.test" },
    selection(unlinked),
    { ...selection(user), environment: "staging" as const },
    { ...selection(user), organizationSlug: "other-camp" },
  ]) {
    await assert.rejects(
      () => provisionInitialAdministrator(prisma, input),
      InitializationError,
    );
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { status: "DISABLED" },
  });
  await assert.rejects(
    () => provisionInitialAdministrator(prisma, selection(user)),
    InitializationError,
  );
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status,
    "DISABLED",
  );
  assert.equal(await prisma.userRole.count(), 0);
  assert.equal(
    await prisma.auditEvent.count({
      where: { action: "system.initial_administrator_provisioned" },
    }),
    0,
  );
});

test("initial-admin replay is idempotent and cannot restore a revoked role or provision a second target", async () => {
  await reset();
  await initializeReferenceData(prisma, reference);
  const first = await activeAccount("first-operator"),
    second = await activeAccount("second-operator");
  await provisionInitialAdministrator(prisma, selection(first));
  assert.equal(
    (await provisionInitialAdministrator(prisma, selection(first))).status,
    "already_provisioned",
  );
  await assert.rejects(
    () => provisionInitialAdministrator(prisma, selection(second)),
    InitializationError,
  );
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: "system_administrator" },
  });
  await prisma.userRole.delete({
    where: { userId_roleId: { userId: first.id, roleId: role.id } },
  });
  await assert.rejects(
    () => provisionInitialAdministrator(prisma, selection(first)),
    InitializationError,
  );
  await assert.rejects(
    () => provisionInitialAdministrator(prisma, selection(second)),
    InitializationError,
  );
  assert.equal(await prisma.userRole.count(), 0);
  assert.equal(
    await prisma.auditEvent.count({
      where: { action: "system.initial_administrator_provisioned" },
    }),
    1,
  );
});

test("an existing administrator cannot be silently adopted and concurrent first-admin requests grant only one target", async () => {
  await reset();
  await initializeReferenceData(prisma, reference);
  const first = await activeAccount("existing-operator"),
    second = await activeAccount("new-operator");
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: "system_administrator" },
  });
  await prisma.userRole.create({ data: { userId: first.id, roleId: role.id } });
  const before = await counts();
  await assert.rejects(
    () => provisionInitialAdministrator(prisma, selection(second)),
    InitializationError,
  );
  await assert.rejects(
    () => provisionInitialAdministrator(prisma, selection(first)),
    InitializationError,
  );
  assert.deepEqual(await counts(), before);
  await reset();
  await initializeReferenceData(prisma, reference);
  const a = await activeAccount("concurrent-a"),
    b = await activeAccount("concurrent-b");
  const outcomes = await Promise.allSettled([
    provisionInitialAdministrator(prisma, selection(a)),
    provisionInitialAdministrator(prisma, selection(b)),
  ]);
  assert.equal(
    outcomes.filter((value) => value.status === "fulfilled").length,
    1,
  );
  const grant = await prisma.userRole.findFirstOrThrow();
  const receipt = await prisma.auditEvent.findFirstOrThrow({
    where: { action: "system.initial_administrator_provisioned" },
  });
  assert.equal(grant.userId, receipt.entityId);
  assert.equal(await prisma.userRole.count(), 1);
});

test.after(async () => prisma.$disconnect());
