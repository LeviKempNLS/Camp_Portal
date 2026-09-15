import { Prisma, RegistrationStatus, StaffAssignmentStatus, StaffRole } from "@prisma/client";
import { getPrismaClient } from "./index.ts";

export class RosterAuthorizationError extends Error {}
export class RosterValidationError extends Error {}

export type RosterSort = "name" | "age" | "grade" | "ageGroup" | "group" | "cabin" | "shirtSize" | "status";
export type RosterFilters = {
  sessionId?: string;
  ageGroup?: string;
  groupId?: string;
  cabinId?: string;
  shirtSize?: string;
  status?: string;
  search?: string;
  sort?: RosterSort;
  direction?: "asc" | "desc";
};

const rosterStatuses: RegistrationStatus[] = [
  RegistrationStatus.SUBMITTED,
  RegistrationStatus.PENDING_REVIEW,
  RegistrationStatus.NEEDS_INFORMATION,
  RegistrationStatus.APPROVED,
  RegistrationStatus.CHECKED_IN,
  RegistrationStatus.COMPLETED,
];
const campWideStaffRoles = new Set<StaffRole>([StaffRole.CAMP_DIRECTOR, StaffRole.MEDICAL, StaffRole.REGISTRAR]);

const ageGroupLabels: Record<string, string> = {
  "try-it": "Try-It",
  jyf: "JYF",
  chirho: "Chi Rho",
  cyf: "CYF",
};

function answerObject(value: Prisma.JsonValue | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, Prisma.JsonValue>;
  return value as Record<string, Prisma.JsonValue>;
}

function answerText(answers: Record<string, Prisma.JsonValue>, key: string) {
  const value = answers[key];
  return typeof value === "string" ? value.trim() : "";
}

function ageAt(birthDate: Date | null, onDate: Date) {
  if (!birthDate) return null;
  let age = onDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const month = onDate.getUTCMonth() - birthDate.getUTCMonth();
  if (month < 0 || (month === 0 && onDate.getUTCDate() < birthDate.getUTCDate())) age -= 1;
  return age;
}

async function requirePermission(userId: string, key: string) {
  const found = await getPrismaClient().userRole.findFirst({
    where: { userId, role: { permissions: { some: { permission: { key } } } } },
    select: { userId: true },
  });
  if (!found) throw new RosterAuthorizationError(`Permission ${key} is required.`);
}

async function defaultOrganizationId() {
  const organization = await getPrismaClient().organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!organization) throw new RosterValidationError("Camp organization is not configured.");
  return organization.id;
}

const rosterRegistrationSelect = {
  id: true,
  sessionId: true,
  status: true,
  person: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      birthDate: true,
      camperProfile: { select: { grade: true } },
    },
  },
  session: {
    select: {
      id: true,
      name: true,
      startDate: true,
      season: { select: { name: true } },
    },
  },
  placement: {
    select: {
      id: true,
      groupId: true,
      cabinId: true,
      group: { select: { id: true, name: true } },
      cabin: { select: { id: true, name: true } },
    },
  },
  formSubmissions: {
    orderBy: { updatedAt: "desc" as const },
    take: 1,
    select: { answers: true },
  },
} satisfies Prisma.RegistrationSelect;

type SelectedRegistration = Prisma.RegistrationGetPayload<{ select: typeof rosterRegistrationSelect }>;

export type CampRosterRow = ReturnType<typeof projectRosterRow>;

function projectRosterRow(registration: SelectedRegistration) {
  const answers = answerObject(registration.formSubmissions[0]?.answers);
  const ageGroupKey = answerText(answers, "session");
  const shirtSize = answerText(answers, "shirtSize");
  const displayFirstName = registration.person.preferredName || registration.person.firstName;
  return {
    registrationId: registration.id,
    sessionId: registration.sessionId,
    sessionName: registration.session.name,
    seasonName: registration.session.season.name,
    camperId: registration.person.id,
    camperName: `${displayFirstName} ${registration.person.lastName}`.trim(),
    lastName: registration.person.lastName,
    firstName: displayFirstName,
    age: ageAt(registration.person.birthDate, registration.session.startDate),
    grade: registration.person.camperProfile?.grade ?? "",
    ageGroupKey,
    ageGroup: ageGroupLabels[ageGroupKey] ?? ageGroupKey,
    shirtSize,
    groupId: registration.placement?.groupId ?? null,
    groupName: registration.placement?.group?.name ?? "",
    cabinId: registration.placement?.cabinId ?? null,
    cabinName: registration.placement?.cabin?.name ?? "",
    placementId: registration.placement?.id ?? null,
    status: registration.status,
  };
}

function compareNullable(left: string | number | null, right: string | number | null) {
  const leftMissing = left === null || left === "";
  const rightMissing = right === null || right === "";
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

function sortRows(rows: CampRosterRow[], sort: RosterSort, direction: "asc" | "desc") {
  const sign = direction === "desc" ? -1 : 1;
  const selector = (row: CampRosterRow): string | number | null => {
    switch (sort) {
      case "age": return row.age;
      case "grade": return row.grade;
      case "ageGroup": return row.ageGroup;
      case "group": return row.groupName;
      case "cabin": return row.cabinName;
      case "shirtSize": return row.shirtSize;
      case "status": return row.status;
      default: return `${row.lastName}, ${row.firstName}`;
    }
  };
  return [...rows].sort((left, right) => {
    const primary = compareNullable(selector(left), selector(right));
    if (primary !== 0) return primary * sign;
    return `${left.lastName}, ${left.firstName}`.localeCompare(`${right.lastName}, ${right.firstName}`, undefined, { sensitivity: "base" });
  });
}

function applyFilters(rows: CampRosterRow[], filters: RosterFilters) {
  const search = filters.search?.trim().toLowerCase();
  return rows.filter(row => {
    if (filters.sessionId && row.sessionId !== filters.sessionId) return false;
    if (filters.ageGroup && row.ageGroupKey !== filters.ageGroup) return false;
    if (filters.groupId && row.groupId !== filters.groupId) return false;
    if (filters.cabinId && row.cabinId !== filters.cabinId) return false;
    if (filters.shirtSize && row.shirtSize !== filters.shirtSize) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (search && !row.camperName.toLowerCase().includes(search)) return false;
    return true;
  });
}

export async function listCampRoster(userId: string, filters: RosterFilters = {}) {
  await requirePermission(userId, "roster.read");
  const organizationId = await defaultOrganizationId();
  const prisma = getPrismaClient();
  const [registrations, sessions] = await Promise.all([
    prisma.registration.findMany({
      where: { session: { season: { organizationId } }, status: { in: rosterStatuses } },
      select: rosterRegistrationSelect,
    }),
    prisma.session.findMany({
      where: { season: { organizationId } },
      select: {
        id: true,
        name: true,
        season: { select: { name: true } },
        groups: { select: { id: true, name: true, capacity: true }, orderBy: { name: "asc" } },
        cabins: { select: { id: true, name: true, capacity: true, groupId: true }, orderBy: { name: "asc" } },
      },
      orderBy: { startDate: "asc" },
    }),
  ]);
  const projected = registrations.map(projectRosterRow);
  const filtered = applyFilters(projected, filters);
  const rows = sortRows(filtered, filters.sort ?? "name", filters.direction ?? "asc");
  return {
    rows,
    sessions,
    ageGroups: Object.entries(ageGroupLabels).map(([key, label]) => ({ key, label })),
    shirtSizes: [...new Set(projected.map(row => row.shirtSize).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    statuses: rosterStatuses,
  };
}

async function loadManagedRegistration(tx: Prisma.TransactionClient, organizationId: string, registrationId: string) {
  const pointer = await tx.registration.findUnique({ where: { id: registrationId }, select: { sessionId: true } });
  if (!pointer) throw new RosterValidationError("Registration not found.");
  await tx.$queryRaw`SELECT "id" FROM "Session" WHERE "id" = ${pointer.sessionId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "Registration" WHERE "id" = ${registrationId} FOR UPDATE`;
  const registration = await tx.registration.findFirst({
    where: { id: registrationId, session: { season: { organizationId } } },
    include: { session: { include: { season: true } } },
  });
  if (!registration) throw new RosterValidationError("Registration not found in this camp organization.");
  if (!rosterStatuses.includes(registration.status)) throw new RosterValidationError("Only active camp registrations can be assigned to groups or cabins.");
  return registration;
}

export async function assignCamperPlacement(userId: string, input: { registrationId: string; groupId?: string; cabinId?: string }) {
  await requirePermission(userId, "roster.manage");
  const organizationId = await defaultOrganizationId();
  const prisma = getPrismaClient();
  return prisma.$transaction(async tx => {
    const registration = await loadManagedRegistration(tx, organizationId, input.registrationId);
    let groupId = input.groupId || null;
    const cabinId = input.cabinId || null;
    if (!groupId && !cabinId) throw new RosterValidationError("Choose a group or cabin for this camper.");

    if (groupId) {
      const group = await tx.campGroup.findFirst({ where: { id: groupId, sessionId: registration.sessionId }, select: { id: true } });
      if (!group) throw new RosterValidationError("The selected group is not part of this camper's session.");
    }
    if (cabinId) {
      const cabin = await tx.cabin.findFirst({ where: { id: cabinId, sessionId: registration.sessionId }, select: { id: true, groupId: true, capacity: true } });
      if (!cabin) throw new RosterValidationError("The selected cabin is not part of this camper's session.");
      if (groupId && cabin.groupId && groupId !== cabin.groupId) throw new RosterValidationError("The selected cabin does not belong to the selected group.");
      if (!groupId && cabin.groupId) groupId = cabin.groupId;
      const cabinOccupancy = await tx.camperPlacement.count({
        where: { cabinId, registrationId: { not: registration.id }, registration: { status: { in: rosterStatuses } } },
      });
      if (cabinOccupancy >= cabin.capacity) throw new RosterValidationError("The selected cabin is full.");
    }
    if (groupId) {
      const group = await tx.campGroup.findFirst({ where: { id: groupId, sessionId: registration.sessionId }, select: { capacity: true } });
      if (!group) throw new RosterValidationError("The selected group is not part of this camper's session.");
      if (group.capacity) {
        const groupOccupancy = await tx.camperPlacement.count({
          where: { groupId, registrationId: { not: registration.id }, registration: { status: { in: rosterStatuses } } },
        });
        if (groupOccupancy >= group.capacity) throw new RosterValidationError("The selected group is full.");
      }
    }

    const existing = await tx.camperPlacement.findUnique({ where: { registrationId: registration.id } });
    const assignedAt = new Date();
    const placement = await tx.camperPlacement.upsert({
      where: { registrationId: registration.id },
      update: { sessionId: registration.sessionId, groupId, cabinId, assignedByUserId: userId, assignedAt },
      create: { registrationId: registration.id, sessionId: registration.sessionId, groupId, cabinId, assignedByUserId: userId, assignedAt },
    });
    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId: userId,
        action: existing ? "roster.camper_reassigned" : "roster.camper_assigned",
        entityType: "CamperPlacement",
        entityId: placement.id,
        before: existing ? { groupId: existing.groupId, cabinId: existing.cabinId } : undefined,
        after: { registrationId: registration.id, groupId, cabinId },
        metadata: { sessionId: registration.sessionId },
      },
    });
    return placement;
  });
}

export async function removeCamperPlacement(userId: string, registrationId: string) {
  await requirePermission(userId, "roster.manage");
  const organizationId = await defaultOrganizationId();
  const prisma = getPrismaClient();
  return prisma.$transaction(async tx => {
    const pointer = await tx.registration.findUnique({ where: { id: registrationId }, select: { sessionId: true } });
    if (!pointer) throw new RosterValidationError("Registration not found.");
    await tx.$queryRaw`SELECT "id" FROM "Session" WHERE "id" = ${pointer.sessionId} FOR UPDATE`;
    const registration = await tx.registration.findFirst({ where: { id: registrationId, session: { season: { organizationId } } }, select: { id: true, sessionId: true } });
    if (!registration) throw new RosterValidationError("Registration not found in this camp organization.");
    const placement = await tx.camperPlacement.findUnique({ where: { registrationId: registration.id } });
    if (!placement) return null;
    await tx.camperPlacement.delete({ where: { id: placement.id } });
    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId: userId,
        action: "roster.camper_unassigned",
        entityType: "CamperPlacement",
        entityId: placement.id,
        before: { registrationId: registration.id, groupId: placement.groupId, cabinId: placement.cabinId },
        metadata: { sessionId: registration.sessionId },
      },
    });
    return placement;
  });
}

function staffRegistrationWhere(assignment: { role: StaffRole; groupId: string | null; cabinId: string | null }): Prisma.RegistrationWhereInput {
  if (campWideStaffRoles.has(assignment.role)) return {};
  if (assignment.role === StaffRole.GROUP_DIRECTOR) {
    if (!assignment.groupId) return { id: "__no_scope__" };
    return { placement: { is: { groupId: assignment.groupId } } };
  }
  if (assignment.cabinId) return { placement: { is: { cabinId: assignment.cabinId } } };
  if (assignment.groupId) return { placement: { is: { groupId: assignment.groupId } } };
  return { id: "__no_scope__" };
}

export async function getStaffCamperRoster(userId: string) {
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { personId: true } });
  if (!user?.personId) throw new RosterAuthorizationError("No staff identity is linked.");
  const assignments = await prisma.staffAssignment.findMany({
    where: { personId: user.personId, status: StaffAssignmentStatus.ACTIVE },
    select: {
      id: true,
      role: true,
      sessionId: true,
      groupId: true,
      cabinId: true,
      session: { select: { name: true, season: { select: { name: true } } } },
      group: { select: { name: true } },
      cabin: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!assignments.length) throw new RosterAuthorizationError("No active staff assignment.");

  return Promise.all(assignments.map(async assignment => {
    const registrations = await prisma.registration.findMany({
      where: {
        sessionId: assignment.sessionId,
        status: { in: rosterStatuses },
        ...staffRegistrationWhere(assignment),
      },
      select: rosterRegistrationSelect,
    });
    return {
      assignmentId: assignment.id,
      role: assignment.role,
      sessionId: assignment.sessionId,
      sessionName: assignment.session.name,
      seasonName: assignment.session.season.name,
      groupName: assignment.group?.name ?? null,
      cabinName: assignment.cabin?.name ?? null,
      rows: sortRows(registrations.map(projectRosterRow), "name", "asc"),
    };
  }));
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function campRosterCsv(rows: CampRosterRow[]) {
  const headers = ["Camper", "Age", "Grade", "Age group", "Group", "Cabin", "T-shirt size", "Registration status", "Session"];
  const body = rows.map(row => [
    row.camperName,
    row.age,
    row.grade,
    row.ageGroup,
    row.groupName,
    row.cabinName,
    row.shirtSize,
    row.status,
    row.sessionName,
  ].map(csvCell).join(","));
  return [headers.join(","), ...body].join("\n");
}
