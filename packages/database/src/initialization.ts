import type { Prisma, PrismaClient } from "@prisma/client";
import {
  REFERENCE_ROLES,
  REFERENCE_PERMISSIONS,
  ROLE_PERMISSION_KEYS,
} from "./reference-data.ts";
import {
  InitializationError,
  validateReferenceInput,
  validateInitialAdministratorInput,
  type ReferenceInitializationInput,
  type InitialAdministratorInput,
  type InitializationContext,
} from "./initialization-configuration.ts";

// Shared by reference initialization and first-admin provisioning to serialize bootstrap.
async function lockBootstrap(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(198522, 1)`;
}
function record(value: Prisma.JsonValue): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
function assertMarker(
  organization: { slug: string; settings: Prisma.JsonValue },
  input: InitializationContext,
) {
  const settings = record(organization.settings);
  const marker = record(settings.referenceDataInitialization ?? null);
  if (
    organization.slug !== input.organizationSlug ||
    settings.demo === true ||
    marker.version !== 1 ||
    marker.environment !== input.environment
  ) {
    throw new InitializationError(
      "Database organization does not match the initialized release environment; no changes were made.",
    );
  }
}
async function initializedOrganization(
  tx: Prisma.TransactionClient,
  input: InitializationContext,
) {
  const organizations = await tx.organization.findMany({
    select: { id: true, slug: true, settings: true },
  });
  if (organizations.length !== 1)
    throw new InitializationError(
      "Exactly one initialized release organization is required.",
    );
  assertMarker(organizations[0], input);
  return organizations[0];
}

/** Private operator command only; never imported by an HTTP route or normal startup. */
export async function initializeReferenceData(
  prisma: PrismaClient,
  input: ReferenceInitializationInput,
) {
  validateReferenceInput(input);
  return prisma.$transaction(
    async (tx) => {
      await lockBootstrap(tx);
      const organizations = await tx.organization.findMany({
        select: { id: true, slug: true, settings: true },
      });
      if (organizations.length) {
        if (organizations.length !== 1)
          throw new InitializationError(
            "Multiple organizations exist; explicit operator review is required.",
          );
        assertMarker(organizations[0], input);
        return { status: "already_initialized" as const };
      }
      const [roles, permissions, assignments] = await Promise.all([
        tx.role.count(),
        tx.permission.count(),
        tx.userRole.count(),
      ]);
      if (roles || permissions || assignments)
        throw new InitializationError(
          "Existing reference data or role grants require operator review; no changes were made.",
        );
      const organization = await tx.organization.create({
        data: {
          slug: input.organizationSlug,
          name: input.organizationName,
          timezone: input.timezone,
          settings: {
            referenceDataInitialization: {
              version: 1,
              environment: input.environment,
            },
          },
        },
      });
      const roleIds = new Map<string, string>(),
        permissionIds = new Map<string, string>();
      for (const [key, name] of REFERENCE_ROLES)
        roleIds.set(key, (await tx.role.create({ data: { key, name } })).id);
      for (const [key, description] of REFERENCE_PERMISSIONS)
        permissionIds.set(
          key,
          (await tx.permission.create({ data: { key, description } })).id,
        );
      for (const [roleKey, keys] of Object.entries(ROLE_PERMISSION_KEYS)) {
        for (const permissionKey of keys)
          await tx.rolePermission.create({
            data: {
              roleId: roleIds.get(roleKey)!,
              permissionId: permissionIds.get(permissionKey)!,
            },
          });
      }
      await tx.auditEvent.create({
        data: {
          organizationId: organization.id,
          actorUserId: null,
          action: "system.reference_data_initialized",
          entityType: "Organization",
          entityId: organization.id,
          metadata: {
            version: 1,
            environment: input.environment,
            operatorReference: input.operatorReference,
            method: "private_command",
          },
        },
      });
      return { status: "initialized" as const };
    },
    { timeout: 15000 },
  );
}

/** One-time first-admin grant, with a durable audit receipt that prevents re-grant after revocation. */
export async function provisionInitialAdministrator(
  prisma: PrismaClient,
  input: InitialAdministratorInput,
) {
  validateInitialAdministratorInput(input);
  return prisma.$transaction(
    async (tx) => {
      await lockBootstrap(tx);
      const organization = await initializedOrganization(tx, input);
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { id: true, email: true, personId: true, status: true },
      });
      if (
        !user ||
        user.status !== "ACTIVE" ||
        !user.personId ||
        user.email.trim().toLowerCase() !== input.email.trim().toLowerCase()
      ) {
        throw new InitializationError(
          "The selected account must be active, linked to a person, and match both the supplied user ID and email.",
        );
      }
      const role = await tx.role.findUnique({
        where: { key: "system_administrator" },
        select: { id: true },
      });
      if (!role)
        throw new InitializationError(
          "System administrator reference role is missing; explicit operator review is required.",
        );
      const receipt = await tx.auditEvent.findFirst({
        where: {
          organizationId: organization.id,
          action: "system.initial_administrator_provisioned",
        },
      });
      const grant = await tx.userRole.findUnique({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
      });
      if (receipt) {
        if (
          receipt.entityId === user.id &&
          grant &&
          !grant.managedByStaffAssignments
        )
          return { status: "already_provisioned" as const };
        throw new InitializationError(
          "Initial administrator provisioning has already been used; use a separately audited recovery or access-management procedure.",
        );
      }
      if (await tx.userRole.count({ where: { roleId: role.id } })) {
        throw new InitializationError(
          "An administrator grant already exists; initial provisioning cannot add another administrator.",
        );
      }
      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
          managedByStaffAssignments: false,
        },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: organization.id,
          actorUserId: null,
          action: "system.initial_administrator_provisioned",
          entityType: "User",
          entityId: user.id,
          metadata: {
            environment: input.environment,
            operatorReference: input.operatorReference,
            method: "private_command",
          },
        },
      });
      return { status: "provisioned" as const };
    },
    { timeout: 15000 },
  );
}
