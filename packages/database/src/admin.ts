import { getPrismaClient } from "./index.ts";

export class AdminAuthorizationError extends Error {}
export class AdminValidationError extends Error {}

const seasonStatuses = new Set(["draft", "open", "closed", "archived"]);
const sessionStatuses = new Set(["draft", "open", "closed", "archived"]);
const MAX_MONEY = 99_999_999.99;

async function requirePermission(userId: string, permissionKey: string) {
  const allowed = await getPrismaClient().userRole.findFirst({
    where: { userId, role: { permissions: { some: { permission: { key: permissionKey } } } } },
  });
  if (!allowed) throw new AdminAuthorizationError(`Permission ${permissionKey} is required.`);
}

async function demoOrganization() {
  const organization = await getPrismaClient().organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!organization) throw new AdminValidationError("Camp organization is not configured.");
  return organization;
}

function isValidDate(value: Date | null | undefined) {
  return value == null || (value instanceof Date && !Number.isNaN(value.valueOf()));
}

function validateWindow(open: Date | null | undefined, close: Date | null | undefined) {
  if (!isValidDate(open) || !isValidDate(close)) throw new AdminValidationError("Registration window contains an invalid date.");
  if (open && close && close <= open) throw new AdminValidationError("Registration close must be after registration open.");
}

function validateSessionDates(startDate: Date, endDate: Date) {
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate <= startDate) {
    throw new AdminValidationError("Session dates are invalid.");
  }
}

function validateMoney(value: string | null | undefined, label: string, optional = false) {
  if (optional && (value == null || value === "")) return;
  if (!value || !/^\d+(\.\d{1,2})?$/.test(value)) throw new AdminValidationError(`${label} is invalid.`);
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_MONEY) throw new AdminValidationError(`${label} is invalid.`);
}

export async function getCampTimeZone(userId: string) {
  await requirePermission(userId, "camp.configure");
  return (await demoOrganization()).timezone;
}

export async function listCampConfiguration(userId: string) {
  await requirePermission(userId, "camp.configure");
  const organization = await demoOrganization();
  return getPrismaClient().organization.findUniqueOrThrow({
    where: { id: organization.id },
    include: { seasons: { orderBy: { year: "desc" }, include: { sessions: { orderBy: { startDate: "asc" } } } } },
  });
}

export async function createSeason(userId: string, input: { name: string; year: number; status: string; registrationOpen?: Date; registrationClose?: Date }) {
  await requirePermission(userId, "camp.configure");
  if (!input.name.trim()) throw new AdminValidationError("Season name is required.");
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2200) throw new AdminValidationError("Season year is invalid.");
  if (!seasonStatuses.has(input.status)) throw new AdminValidationError("Season status is invalid.");
  validateWindow(input.registrationOpen, input.registrationClose);
  const organization = await demoOrganization();
  return getPrismaClient().season.create({
    data: {
      organizationId: organization.id,
      name: input.name.trim(),
      year: input.year,
      status: input.status,
      registrationOpen: input.registrationOpen,
      registrationClose: input.registrationClose,
    },
  });
}

export async function updateSeason(userId: string, seasonId: string, input: { name: string; status: string; registrationOpen?: Date | null; registrationClose?: Date | null }) {
  await requirePermission(userId, "camp.configure");
  if (!input.name.trim()) throw new AdminValidationError("Season name is required.");
  if (!seasonStatuses.has(input.status)) throw new AdminValidationError("Season status is invalid.");
  validateWindow(input.registrationOpen, input.registrationClose);
  const organization = await demoOrganization();
  const season = await getPrismaClient().season.findFirst({ where: { id: seasonId, organizationId: organization.id } });
  if (!season) throw new AdminValidationError("Season not found.");
  return getPrismaClient().season.update({
    where: { id: season.id },
    data: { name: input.name.trim(), status: input.status, registrationOpen: input.registrationOpen, registrationClose: input.registrationClose },
  });
}

export async function createSession(userId: string, input: {
  seasonId: string; name: string; description?: string; startDate: Date; endDate: Date; capacity: number;
  minimumGrade?: string; maximumGrade?: string; basePrice: string; depositAmount?: string;
  registrationOpen?: Date; registrationClose?: Date; waitlistEnabled: boolean; status: string;
}) {
  await requirePermission(userId, "camp.configure");
  if (!input.name.trim()) throw new AdminValidationError("Session name is required.");
  validateSessionDates(input.startDate, input.endDate);
  if (!Number.isInteger(input.capacity) || input.capacity < 1) throw new AdminValidationError("Capacity must be at least 1.");
  if (!sessionStatuses.has(input.status)) throw new AdminValidationError("Session status is invalid.");
  validateMoney(input.basePrice, "Base price");
  validateMoney(input.depositAmount, "Deposit", true);
  validateWindow(input.registrationOpen, input.registrationClose);
  const organization = await demoOrganization();
  const season = await getPrismaClient().season.findFirst({ where: { id: input.seasonId, organizationId: organization.id } });
  if (!season) throw new AdminValidationError("Season not found.");
  return getPrismaClient().session.create({
    data: {
      seasonId: season.id,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      startDate: input.startDate,
      endDate: input.endDate,
      capacity: input.capacity,
      minimumGrade: input.minimumGrade?.trim() || undefined,
      maximumGrade: input.maximumGrade?.trim() || undefined,
      basePrice: input.basePrice,
      depositAmount: input.depositAmount || undefined,
      registrationOpen: input.registrationOpen,
      registrationClose: input.registrationClose,
      waitlistEnabled: input.waitlistEnabled,
      status: input.status,
    },
  });
}

export async function updateSession(userId: string, sessionId: string, input: {
  name: string; description?: string; startDate: Date; endDate: Date; capacity: number;
  minimumGrade?: string; maximumGrade?: string; basePrice: string; depositAmount?: string | null;
  registrationOpen?: Date | null; registrationClose?: Date | null; waitlistEnabled: boolean; status: string;
}) {
  await requirePermission(userId, "camp.configure");
  if (!input.name.trim()) throw new AdminValidationError("Session name is required.");
  validateSessionDates(input.startDate, input.endDate);
  if (!Number.isInteger(input.capacity) || input.capacity < 1) throw new AdminValidationError("Capacity must be at least 1.");
  if (!sessionStatuses.has(input.status)) throw new AdminValidationError("Session status is invalid.");
  validateMoney(input.basePrice, "Base price");
  validateMoney(input.depositAmount, "Deposit", true);
  validateWindow(input.registrationOpen, input.registrationClose);
  const organization = await demoOrganization();
  const session = await getPrismaClient().session.findFirst({ where: { id: sessionId, season: { organizationId: organization.id } } });
  if (!session) throw new AdminValidationError("Session not found.");
  return getPrismaClient().session.update({
    where: { id: session.id },
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      startDate: input.startDate,
      endDate: input.endDate,
      capacity: input.capacity,
      minimumGrade: input.minimumGrade?.trim() || null,
      maximumGrade: input.maximumGrade?.trim() || null,
      basePrice: input.basePrice,
      depositAmount: input.depositAmount || null,
      registrationOpen: input.registrationOpen,
      registrationClose: input.registrationClose,
      waitlistEnabled: input.waitlistEnabled,
      status: input.status,
    },
  });
}
