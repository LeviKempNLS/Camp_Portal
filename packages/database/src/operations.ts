import { Prisma, StaffAssignmentStatus, StaffRole } from "@prisma/client";
import { getPrismaClient } from "./index.ts";

export class OperationsAuthorizationError extends Error {}
export class OperationsValidationError extends Error {}

export const STAFF_ROLES = Object.values(StaffRole);

const roleKeys: Record<StaffRole, { key: string; name: string }> = {
  [StaffRole.CAMP_DIRECTOR]: { key: "camp_director", name: "Camp Director" },
  [StaffRole.GROUP_DIRECTOR]: { key: "group_director", name: "Group Director" },
  [StaffRole.COUNSELOR]: { key: "counselor", name: "Counselor" },
  [StaffRole.MEDICAL]: { key: "medical", name: "Medical" },
  [StaffRole.REGISTRAR]: { key: "registrar", name: "Registrar" },
};

async function requirePermission(userId: string, key: string) {
  const found = await getPrismaClient().userRole.findFirst({
    where: { userId, role: { permissions: { some: { permission: { key } } } } },
    select: { userId: true },
  });
  if (!found) throw new OperationsAuthorizationError(`Permission ${key} is required.`);
}

async function defaultOrganizationId() {
  const organization = await getPrismaClient().organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!organization) throw new OperationsValidationError("Camp organization is not configured.");
  return organization.id;
}

async function lockManagedSession(tx: Prisma.TransactionClient, organizationId: string, sessionId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Session" WHERE "id" = ${sessionId} FOR UPDATE`;
  const session = await tx.session.findFirst({
    where: { id: sessionId, season: { organizationId } },
    include: { season: true },
  });
  if (!session) throw new OperationsValidationError("Session not found in this camp organization.");
  return session;
}

function parseRole(value: string) {
  if (!STAFF_ROLES.includes(value as StaffRole)) throw new OperationsValidationError("Staff role is invalid.");
  return value as StaffRole;
}

function validateCapacity(value: number | undefined, label: string, optional = false) {
  if (optional && value === undefined) return;
  if (value === undefined || !Number.isInteger(value) || value < 1) throw new OperationsValidationError(`${label} must be a positive whole number.`);
}

async function audit(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  before?: Prisma.InputJsonValue,
  after?: Prisma.InputJsonValue,
) {
  await tx.auditEvent.create({ data: { organizationId, actorUserId, action, entityType, entityId, before, after, metadata: { demo: true } } });
}

export async function listOperationsSetup(userId: string) {
  await requirePermission(userId, "operations.manage");
  const organizationId = await defaultOrganizationId();
  const prisma = getPrismaClient();
  const [sessions, people] = await Promise.all([
    prisma.session.findMany({
      where: { season: { organizationId } },
      include: {
        season: true,
        groups: { orderBy: { name: "asc" } },
        cabins: { orderBy: { name: "asc" }, include: { group: true } },
        staffAssignments: {
          where: { status: StaffAssignmentStatus.ACTIVE },
          select: {
            id: true,
            role: true,
            groupId: true,
            cabinId: true,
            createdAt: true,
            person: { select: { id: true, firstName: true, lastName: true, user: { select: { id: true } } } },
            group: { select: { id: true, name: true } },
            cabin: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.person.findMany({
      select: { id: true, firstName: true, lastName: true, user: { select: { id: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);
  return { sessions, people };
}

export async function createCampGroup(userId: string, input: { sessionId: string; name: string; capacity?: number }) {
  await requirePermission(userId, "operations.manage");
  const organizationId = await defaultOrganizationId();
  const name = input.name.trim();
  if (!name) throw new OperationsValidationError("Group name is required.");
  validateCapacity(input.capacity, "Group capacity", true);
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async tx => {
      await lockManagedSession(tx, organizationId, input.sessionId);
      const group = await tx.campGroup.create({ data: { sessionId: input.sessionId, name, capacity: input.capacity } });
      await audit(tx, organizationId, userId, "operations.group_created", "CampGroup", group.id, undefined, { sessionId: input.sessionId, name, capacity: input.capacity ?? null });
      return group;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new OperationsValidationError("A group with this name already exists in the session.");
    throw error;
  }
}

export async function createCabin(userId: string, input: { sessionId: string; groupId?: string; name: string; capacity: number }) {
  await requirePermission(userId, "operations.manage");
  const organizationId = await defaultOrganizationId();
  const name = input.name.trim();
  if (!name) throw new OperationsValidationError("Cabin name is required.");
  validateCapacity(input.capacity, "Cabin capacity");
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async tx => {
      await lockManagedSession(tx, organizationId, input.sessionId);
      if (input.groupId) {
        const group = await tx.campGroup.findFirst({ where: { id: input.groupId, sessionId: input.sessionId }, select: { id: true } });
        if (!group) throw new OperationsValidationError("Cabin group must belong to the selected session.");
      }
      const cabin = await tx.cabin.create({ data: { sessionId: input.sessionId, groupId: input.groupId || null, name, capacity: input.capacity } });
      await audit(tx, organizationId, userId, "operations.cabin_created", "Cabin", cabin.id, undefined, { sessionId: input.sessionId, groupId: input.groupId ?? null, name, capacity: input.capacity });
      return cabin;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new OperationsValidationError("A cabin with this name already exists in the session.");
    throw error;
  }
}

export async function assignStaff(userId: string, input: { sessionId: string; personId: string; role: string; groupId?: string; cabinId?: string }) {
  await requirePermission(userId, "operations.manage");
  const organizationId = await defaultOrganizationId();
  const role = parseRole(input.role);
  const prisma = getPrismaClient();
  return prisma.$transaction(async tx => {
    await lockManagedSession(tx, organizationId, input.sessionId);
    const person = await tx.person.findUnique({ where: { id: input.personId }, select: { id: true, user: { select: { id: true } } } });
    if (!person) throw new OperationsValidationError("Staff person was not found.");

    let groupId = input.groupId || null;
    if (groupId) {
      const group = await tx.campGroup.findFirst({ where: { id: groupId, sessionId: input.sessionId }, select: { id: true } });
      if (!group) throw new OperationsValidationError("Staff group is not part of this session.");
    }

    let cabinId = input.cabinId || null;
    if (cabinId) {
      const cabin = await tx.cabin.findFirst({ where: { id: cabinId, sessionId: input.sessionId }, select: { id: true, groupId: true } });
      if (!cabin) throw new OperationsValidationError("Staff cabin is not part of this session.");
      if (groupId && cabin.groupId !== groupId) throw new OperationsValidationError("Cabin does not belong to the selected group.");
      if (!groupId && cabin.groupId) groupId = cabin.groupId;
    }

    const existing = await tx.staffAssignment.findFirst({
      where: { sessionId: input.sessionId, personId: input.personId, role, status: StaffAssignmentStatus.ACTIVE },
    });
    const before = existing ? { role: existing.role, groupId: existing.groupId, cabinId: existing.cabinId, status: existing.status } : undefined;
    const assignment = existing
      ? await tx.staffAssignment.update({ where: { id: existing.id }, data: { groupId, cabinId } })
      : await tx.staffAssignment.create({ data: { sessionId: input.sessionId, personId: input.personId, role, groupId, cabinId } });

    if (person.user) {
      const mapped = roleKeys[role];
      const portalRole = await tx.role.upsert({ where: { key: mapped.key }, update: { name: mapped.name }, create: { key: mapped.key, name: mapped.name } });
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: person.user.id, roleId: portalRole.id } },
        update: {},
        create: { userId: person.user.id, roleId: portalRole.id },
      });
    }

    await audit(tx, organizationId, userId, existing ? "operations.staff_reassigned" : "operations.staff_assigned", "StaffAssignment", assignment.id, before, { role, groupId, cabinId, status: assignment.status });
    return assignment;
  });
}

export async function removeStaffAssignment(userId: string, assignmentId: string) {
  await requirePermission(userId, "operations.manage");
  const organizationId = await defaultOrganizationId();
  const prisma = getPrismaClient();
  return prisma.$transaction(async tx => {
    const pointer = await tx.staffAssignment.findUnique({ where: { id: assignmentId }, select: { sessionId: true } });
    if (!pointer) throw new OperationsValidationError("Staff assignment not found.");
    await lockManagedSession(tx, organizationId, pointer.sessionId);
    const assignment = await tx.staffAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
    if (assignment.status === StaffAssignmentStatus.INACTIVE) return assignment;
    const updated = await tx.staffAssignment.update({ where: { id: assignmentId }, data: { status: StaffAssignmentStatus.INACTIVE } });
    await audit(tx, organizationId, userId, "operations.staff_removed", "StaffAssignment", assignment.id, { role: assignment.role, groupId: assignment.groupId, cabinId: assignment.cabinId, status: assignment.status }, { status: updated.status });
    return updated;
  });
}

export async function hasStaffAssignment(userId: string) {
  const user = await getPrismaClient().user.findUnique({ where: { id: userId }, select: { personId: true } });
  if (!user?.personId) return false;
  return Boolean(await getPrismaClient().staffAssignment.findFirst({ where: { personId: user.personId, status: StaffAssignmentStatus.ACTIVE }, select: { id: true } }));
}

function teamScope(assignment: { role: StaffRole; groupId: string | null; cabinId: string | null }): Prisma.StaffAssignmentWhereInput | undefined {
  if ([StaffRole.CAMP_DIRECTOR, StaffRole.MEDICAL, StaffRole.REGISTRAR].includes(assignment.role)) return undefined;
  if (assignment.role === StaffRole.GROUP_DIRECTOR) {
    if (!assignment.groupId) return undefined;
    return { OR: [{ groupId: assignment.groupId }, { role: StaffRole.CAMP_DIRECTOR }] };
  }
  if (assignment.cabinId) {
    const scope: Prisma.StaffAssignmentWhereInput[] = [{ cabinId: assignment.cabinId }, { role: StaffRole.CAMP_DIRECTOR }];
    if (assignment.groupId) scope.push({ role: StaffRole.GROUP_DIRECTOR, groupId: assignment.groupId });
    return { OR: scope };
  }
  if (assignment.groupId) return { OR: [{ groupId: assignment.groupId }, { role: StaffRole.CAMP_DIRECTOR }] };
  return undefined;
}

export async function getStaffWorkspace(userId: string) {
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { personId: true } });
  if (!user?.personId) throw new OperationsAuthorizationError("No staff identity is linked.");
  const assignments = await prisma.staffAssignment.findMany({
    where: { personId: user.personId, status: StaffAssignmentStatus.ACTIVE },
    include: { session: { include: { season: true } }, group: true, cabin: true },
    orderBy: { session: { startDate: "asc" } },
  });
  if (!assignments.length) throw new OperationsAuthorizationError("No active staff assignment.");

  return Promise.all(assignments.map(async assignment => {
    const scope = teamScope(assignment);
    const team = await prisma.staffAssignment.findMany({
      where: {
        sessionId: assignment.sessionId,
        status: StaffAssignmentStatus.ACTIVE,
        personId: { not: user.personId },
        ...(scope ?? {}),
      },
      select: {
        id: true,
        role: true,
        groupId: true,
        cabinId: true,
        person: { select: { id: true, firstName: true, lastName: true } },
        group: { select: { id: true, name: true } },
        cabin: { select: { id: true, name: true } },
      },
      orderBy: { person: { lastName: "asc" } },
    });
    return { ...assignment, team };
  }));
}
