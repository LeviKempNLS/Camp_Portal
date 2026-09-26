import { Prisma, RegistrationStatus } from "@prisma/client";
import { getPrismaClient } from "./index.ts";

export class MedicalAuthorizationError extends Error {}

export type MedicalFilters = { sessionId?: string; search?: string };

async function requirePermission(userId: string, key: string) {
  const found = await getPrismaClient().userRole.findFirst({
    where: { userId, role: { permissions: { some: { permission: { key } } } } },
    select: { userId: true },
  });
  if (!found) throw new MedicalAuthorizationError(`Permission ${key} is required.`);
}

function answerObject(value: Prisma.JsonValue | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}
function text(answers: Record<string, Prisma.JsonValue>, key: string) {
  const value = answers[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function listMedicalWorkspace(userId: string, filters: MedicalFilters = {}) {
  await requirePermission(userId, "medical.read");
  const prisma = getPrismaClient();
  const organization = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!organization) return { rows: [], sessions: [] };
  const search = filters.search?.trim();
  const statuses: RegistrationStatus[] = [RegistrationStatus.APPROVED, RegistrationStatus.CHECKED_IN, RegistrationStatus.COMPLETED];
  const [registrations, sessions] = await Promise.all([
    prisma.registration.findMany({
      where: {
        session: { season: { organizationId: organization.id } },
        status: { in: statuses },
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
        person: { select: { firstName: true, preferredName: true, lastName: true, birthDate: true } },
        session: { select: { id: true, name: true, season: { select: { name: true } } } },
        placement: { select: { cabin: { select: { name: true } }, group: { select: { name: true } } } },
        formSubmissions: { orderBy: { updatedAt: "desc" }, take: 1, select: { answers: true } },
      },
      orderBy: [{ session: { startDate: "asc" } }, { person: { lastName: "asc" } }, { person: { firstName: "asc" } }],
    }),
    prisma.session.findMany({
      where: { season: { organizationId: organization.id } },
      select: { id: true, name: true, season: { select: { name: true } } },
      orderBy: { startDate: "asc" },
    }),
  ]);
  const rows = registrations.map(registration => {
    const answers = answerObject(registration.formSubmissions[0]?.answers);
    return {
      registrationId: registration.id,
      camperName: `${registration.person.preferredName || registration.person.firstName} ${registration.person.lastName}`.trim(),
      birthDate: registration.person.birthDate,
      sessionId: registration.session.id,
      sessionName: registration.session.name,
      seasonName: registration.session.season.name,
      registrationStatus: registration.status,
      groupName: registration.placement?.group?.name ?? "",
      cabinName: registration.placement?.cabin?.name ?? "",
      guardianName: text(answers, "guardianName"),
      guardianPhone: text(answers, "guardianPhone"),
      emergencyContact: text(answers, "emergencyContact"),
      insurance: text(answers, "insurance"),
      allergies: text(answers, "allergies"),
      dietary: text(answers, "dietary"),
      medications: text(answers, "medications"),
      healthNotes: text(answers, "healthNotes"),
    };
  });
  await prisma.auditEvent.create({
    data: {
      organizationId: organization.id,
      actorUserId: userId,
      action: "medical.workspace_viewed",
      entityType: "MedicalWorkspace",
      entityId: filters.sessionId || "all",
      metadata: { rowCount: rows.length, sessionId: filters.sessionId ?? null },
    },
  });
  return { rows, sessions };
}
