import { Prisma, RegistrationStatus } from "@prisma/client";
import { getPrismaClient } from "./index.ts";

export class AttendanceAuthorizationError extends Error {}
export class AttendanceValidationError extends Error {}

export type AttendanceFilters = { sessionId?: string; search?: string };

async function requirePermission(userId: string, key: string) {
  const found = await getPrismaClient().userRole.findFirst({
    where: { userId, role: { permissions: { some: { permission: { key } } } } },
    select: { userId: true },
  });
  if (!found) throw new AttendanceAuthorizationError(`Permission ${key} is required.`);
}

async function defaultOrganizationId() {
  const organization = await getPrismaClient().organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!organization) throw new AttendanceValidationError("Camp organization is not configured.");
  return organization.id;
}

const attendanceStatuses: RegistrationStatus[] = [RegistrationStatus.APPROVED, RegistrationStatus.CHECKED_IN, RegistrationStatus.COMPLETED];

export async function listCheckInDashboard(userId: string, filters: AttendanceFilters = {}) {
  await requirePermission(userId, "attendance.read");
  const organizationId = await defaultOrganizationId();
  const prisma = getPrismaClient();
  const search = filters.search?.trim();
  const [registrations, sessions] = await Promise.all([
    prisma.registration.findMany({
      where: {
        session: { season: { organizationId } },
        status: { in: attendanceStatuses },
        ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
        ...(search ? { person: { OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { preferredName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
        ] } } : {}),
      },
      select: {
        id: true,
        status: true,
        person: { select: { firstName: true, preferredName: true, lastName: true } },
        session: { select: { id: true, name: true, season: { select: { name: true } } } },
        placement: { select: { group: { select: { name: true } }, cabin: { select: { name: true } } } },
        attendance: { select: { id: true, checkedInAt: true, checkedOutAt: true, notes: true } },
      },
      orderBy: [{ session: { startDate: "asc" } }, { person: { lastName: "asc" } }, { person: { firstName: "asc" } }],
    }),
    prisma.session.findMany({
      where: { season: { organizationId } },
      select: { id: true, name: true, season: { select: { name: true } } },
      orderBy: { startDate: "asc" },
    }),
  ]);
  return {
    sessions,
    rows: registrations.map(registration => ({
      registrationId: registration.id,
      camperName: `${registration.person.preferredName || registration.person.firstName} ${registration.person.lastName}`.trim(),
      sessionId: registration.session.id,
      sessionName: registration.session.name,
      seasonName: registration.session.season.name,
      registrationStatus: registration.status,
      groupName: registration.placement?.group?.name ?? "",
      cabinName: registration.placement?.cabin?.name ?? "",
      attendance: registration.attendance,
    })),
  };
}

async function loadManagedRegistration(tx: Prisma.TransactionClient, organizationId: string, registrationId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Registration" WHERE "id" = ${registrationId} FOR UPDATE`;
  const registration = await tx.registration.findFirst({
    where: { id: registrationId, session: { season: { organizationId } } },
    include: { attendance: true, session: { include: { season: true } } },
  });
  if (!registration) throw new AttendanceValidationError("Registration not found in this camp organization.");
  return registration;
}

export async function checkInCamper(userId: string, registrationId: string, notes?: string) {
  await requirePermission(userId, "attendance.manage");
  const organizationId = await defaultOrganizationId();
  const prisma = getPrismaClient();
  return prisma.$transaction(async tx => {
    const registration = await loadManagedRegistration(tx, organizationId, registrationId);
    if (registration.status === RegistrationStatus.CHECKED_IN && registration.attendance) return registration.attendance;
    if (registration.status !== RegistrationStatus.APPROVED) throw new AttendanceValidationError("Only approved campers can be checked in.");
    const checkedInAt = new Date();
    const attendance = await tx.campAttendance.upsert({
      where: { registrationId: registration.id },
      update: { sessionId: registration.sessionId, checkedInAt, checkedInByUserId: userId, checkedOutAt: null, checkedOutByUserId: null, notes: notes?.trim() || null },
      create: { registrationId: registration.id, sessionId: registration.sessionId, checkedInAt, checkedInByUserId: userId, notes: notes?.trim() || null },
    });
    await tx.registration.update({ where: { id: registration.id }, data: { status: RegistrationStatus.CHECKED_IN } });
    await tx.auditEvent.create({
      data: { organizationId, actorUserId: userId, action: "attendance.checked_in", entityType: "Registration", entityId: registration.id, after: { checkedInAt, sessionId: registration.sessionId } },
    });
    return attendance;
  });
}

export async function checkOutCamper(userId: string, registrationId: string) {
  await requirePermission(userId, "attendance.manage");
  const organizationId = await defaultOrganizationId();
  const prisma = getPrismaClient();
  return prisma.$transaction(async tx => {
    const registration = await loadManagedRegistration(tx, organizationId, registrationId);
    if (registration.status === RegistrationStatus.COMPLETED && registration.attendance?.checkedOutAt) return registration.attendance;
    if (registration.status !== RegistrationStatus.CHECKED_IN || !registration.attendance) throw new AttendanceValidationError("Only checked-in campers can be checked out.");
    const checkedOutAt = new Date();
    const attendance = await tx.campAttendance.update({
      where: { registrationId: registration.id },
      data: { checkedOutAt, checkedOutByUserId: userId },
    });
    await tx.registration.update({ where: { id: registration.id }, data: { status: RegistrationStatus.COMPLETED } });
    await tx.auditEvent.create({
      data: { organizationId, actorUserId: userId, action: "attendance.checked_out", entityType: "Registration", entityId: registration.id, before: { status: RegistrationStatus.CHECKED_IN }, after: { status: RegistrationStatus.COMPLETED, checkedOutAt } },
    });
    return attendance;
  });
}
