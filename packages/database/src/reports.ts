import { Prisma, RegistrationStatus } from "@prisma/client";
import { getPrismaClient } from "./index.ts";

export class ReportsAuthorizationError extends Error {}
export type ReportFilters = { sessionId?: string; status?: RegistrationStatus; search?: string };

async function requirePermission(userId: string, key: string) {
  const found = await getPrismaClient().userRole.findFirst({
    where: { userId, role: { permissions: { some: { permission: { key } } } } },
    select: { userId: true },
  });
  if (!found) throw new ReportsAuthorizationError(`Permission ${key} is required.`);
}

function answerObject(value: Prisma.JsonValue | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}
function text(answers: Record<string, Prisma.JsonValue>, key: string) {
  const value = answers[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function listRegistrarReports(userId: string, filters: ReportFilters = {}) {
  await requirePermission(userId, "reports.read");
  const prisma = getPrismaClient();
  const organization = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!organization) return { rows: [], sessions: [], statusCounts: [], shirtCounts: [] };
  const search = filters.search?.trim();
  const registrations = await prisma.registration.findMany({
    where: {
      session: { season: { organizationId: organization.id } },
      status: filters.status ? filters.status : { not: RegistrationStatus.DRAFT },
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
      household: { select: { displayName: true } },
      session: { select: { id: true, name: true, season: { select: { name: true } } } },
      placement: { select: { group: { select: { name: true } }, cabin: { select: { name: true } } } },
      attendance: { select: { checkedInAt: true, checkedOutAt: true } },
      formSubmissions: { orderBy: { updatedAt: "desc" }, take: 1, select: { answers: true } },
    },
    orderBy: [{ session: { startDate: "asc" } }, { person: { lastName: "asc" } }, { person: { firstName: "asc" } }],
  });
  const rows = registrations.map(registration => {
    const answers = answerObject(registration.formSubmissions[0]?.answers);
    return {
      registrationId: registration.id,
      camperName: `${registration.person.preferredName || registration.person.firstName} ${registration.person.lastName}`.trim(),
      householdName: registration.household.displayName,
      sessionId: registration.session.id,
      sessionName: registration.session.name,
      seasonName: registration.session.season.name,
      status: registration.status,
      grade: text(answers, "grade"),
      shirtSize: text(answers, "shirtSize"),
      guardianName: text(answers, "guardianName"),
      guardianEmail: text(answers, "guardianEmail"),
      guardianPhone: text(answers, "guardianPhone"),
      address: text(answers, "address"),
      groupName: registration.placement?.group?.name ?? "",
      cabinName: registration.placement?.cabin?.name ?? "",
      checkedInAt: registration.attendance?.checkedInAt ?? null,
      checkedOutAt: registration.attendance?.checkedOutAt ?? null,
    };
  });
  const sessions = await prisma.session.findMany({
    where: { season: { organizationId: organization.id } },
    select: { id: true, name: true, season: { select: { name: true } } },
    orderBy: { startDate: "asc" },
  });
  const statusMap = new Map<string, number>();
  const shirtMap = new Map<string, number>();
  for (const row of rows) {
    statusMap.set(row.status, (statusMap.get(row.status) ?? 0) + 1);
    const size = row.shirtSize || "Not provided";
    shirtMap.set(size, (shirtMap.get(size) ?? 0) + 1);
  }
  return {
    rows,
    sessions,
    statusCounts: [...statusMap.entries()].sort(([a], [b]) => a.localeCompare(b)),
    shirtCounts: [...shirtMap.entries()].sort(([a], [b]) => a.localeCompare(b)),
  };
}

function csvCell(value: string | number | null) {
  const raw = value === null ? "" : String(value);
  const safe = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function registrarReportCsv(rows: Awaited<ReturnType<typeof listRegistrarReports>>["rows"]) {
  const headers = ["Camper", "Household", "Season", "Session", "Registration status", "Grade", "T-shirt size", "Group", "Cabin", "Guardian", "Guardian email", "Guardian phone", "Mailing address", "Checked in", "Checked out"];
  const body = rows.map(row => [
    row.camperName, row.householdName, row.seasonName, row.sessionName, row.status, row.grade, row.shirtSize,
    row.groupName, row.cabinName, row.guardianName, row.guardianEmail, row.guardianPhone, row.address,
    row.checkedInAt?.toISOString() ?? "", row.checkedOutAt?.toISOString() ?? "",
  ].map(csvCell).join(","));
  return [headers.join(","), ...body].join("\n");
}
