import { HouseholdRelationship, RegistrationStatus, UserStatus, type Prisma } from "@prisma/client";
import { CAMP_REGISTRATION_FORM, validateFormAnswers } from "@faith-adventures/domain";
import { getPrismaClient } from "@faith-adventures/database";

export class AuthorizationError extends Error {}
export class ValidationError extends Error {}
export type DraftInput = { sessionId: string; camperId: string; answers: Prisma.InputJsonValue };
export type HouseholdMemberInput = {
  kind: "guardian" | "camper";
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  birthDate?: Date;
  grade?: string;
};

type PortalClient = ReturnType<typeof getPrismaClient>;

const editableRegistrationStatuses = new Set<RegistrationStatus>([
  RegistrationStatus.DRAFT,
  RegistrationStatus.NEEDS_INFORMATION,
]);

const registrarTransitions: Partial<Record<RegistrationStatus, RegistrationStatus[]>> = {
  [RegistrationStatus.SUBMITTED]: [RegistrationStatus.APPROVED, RegistrationStatus.NEEDS_INFORMATION, RegistrationStatus.WAITLISTED, RegistrationStatus.CANCELLED],
  [RegistrationStatus.PENDING_REVIEW]: [RegistrationStatus.APPROVED, RegistrationStatus.NEEDS_INFORMATION, RegistrationStatus.WAITLISTED, RegistrationStatus.CANCELLED],
  [RegistrationStatus.NEEDS_INFORMATION]: [RegistrationStatus.CANCELLED],
  [RegistrationStatus.WAITLISTED]: [RegistrationStatus.APPROVED, RegistrationStatus.CANCELLED],
  [RegistrationStatus.APPROVED]: [RegistrationStatus.CANCELLED],
};

const registrarSafeAnswerKeys = [
  "session", "firstTime", "swims", "shirtSize",
  "camperName", "birthDate", "grade", "camperEmail", "cabinMate",
  "guardianName", "guardianEmail", "guardianPhone", "address", "emergencyContact", "pickupRestrictions",
  "medicalRelease", "transportRelease", "photoRelease", "covenant",
] as const;

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "Parent", lastName: parts.slice(1).join(" ") || "User" };
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

function isCanonicalRegistrationSchema(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const schema = value as Record<string, Prisma.JsonValue>;
  return schema.id === CAMP_REGISTRATION_FORM.id && Array.isArray(schema.sections);
}

function assertDraftShape(answers: Prisma.InputJsonValue) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) throw new ValidationError("Registration answers must be an object.");
}

function assertCompleteRegistration(answers: Prisma.InputJsonValue) {
  const errors = validateFormAnswers(CAMP_REGISTRATION_FORM, answers);
  if (errors.length) throw new ValidationError(`Registration is incomplete or invalid: ${errors.join(", ")}.`);
}

function assertRegistrationAvailable(session: {
  status: string;
  registrationOpen: Date | null;
  registrationClose: Date | null;
  season: { registrationOpen: Date | null; registrationClose: Date | null };
}, allowCorrection = false) {
  if (session.status !== "open") throw new ValidationError("Registration is not open for this session.");
  if (allowCorrection) return;
  const now = new Date();
  const opens = session.registrationOpen ?? session.season.registrationOpen;
  const closes = session.registrationClose ?? session.season.registrationClose;
  if (opens && now < opens) throw new ValidationError("Registration has not opened yet.");
  if (closes && now > closes) throw new ValidationError("Registration is closed.");
}

export async function ensurePortalProfile(user: { id: string; email: string; name: string }) {
  const prisma = getPrismaClient();
  const name = splitName(user.name);
  const normalizedEmail = user.email.trim().toLowerCase();
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
    const existing = await tx.user.findUnique({ where: { id: user.id }, include: { person: true } });
    if (!existing) throw new AuthorizationError("Authenticated identity is not a portal user.");
    if (existing.status === UserStatus.DISABLED) throw new AuthorizationError("This portal account is disabled.");
    if (existing.person) return existing;

    const representedPerson = await tx.person.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
      select: { id: true },
    });
    if (representedPerson) throw new AuthorizationError("This email already belongs to a household member. Use that household member's invitation link to connect this login.");

    const person = await tx.person.create({ data: { ...name, email: normalizedEmail } });
    const household = await tx.household.create({ data: { displayName: `${name.lastName} Household` } });
    await tx.householdMember.create({ data: { householdId: household.id, personId: person.id, relationship: HouseholdRelationship.GUARDIAN, isPrimaryContact: true, hasPortalAccess: true } });
    await tx.user.update({ where: { id: user.id }, data: { personId: person.id, status: UserStatus.ACTIVE, lastLoginAt: new Date() } });
    const parent = await tx.role.findUnique({ where: { key: "parent" } });
    if (parent) await tx.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: parent.id } }, update: {}, create: { userId: user.id, roleId: parent.id } });
    return tx.user.findUniqueOrThrow({ where: { id: user.id }, include: { person: true } });
  });
}

async function getOwnedHouseholdId(userId: string, prisma: PortalClient = getPrismaClient()) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { personId: true } });
  if (!user?.personId) throw new AuthorizationError("No portal profile.");
  const membership = await prisma.householdMember.findFirst({
    where: { personId: user.personId, hasPortalAccess: true },
    select: { householdId: true },
  });
  if (!membership) throw new AuthorizationError("No owned household.");
  return membership.householdId;
}

async function assertOwnedCamper(userId: string, camperId: string, prisma: PortalClient) {
  const householdId = await getOwnedHouseholdId(userId, prisma);
  const camper = await prisma.householdMember.findFirst({
    where: { householdId, personId: camperId, relationship: HouseholdRelationship.CAMPER },
    select: { personId: true },
  });
  if (!camper) throw new AuthorizationError("Camper access denied.");
  return householdId;
}

async function getRegistrationFormVersion(tx: Prisma.TransactionClient, organizationId: string) {
  let definition = await tx.formDefinition.findUnique({
    where: { organizationId_key: { organizationId, key: "registration" } },
    include: { versions: { orderBy: { version: "desc" } } },
  });
  if (!definition) {
    definition = await tx.formDefinition.create({
      data: { organizationId, key: "registration", name: "Registration" },
      include: { versions: true },
    });
  }
  const published = definition.versions.find(version => version.isPublished && isCanonicalRegistrationSchema(version.schema));
  if (published) {
    if (definition.activeVersionId !== published.id) await tx.formDefinition.update({ where: { id: definition.id }, data: { activeVersionId: published.id } });
    return published;
  }
  await tx.formVersion.updateMany({ where: { formDefinitionId: definition.id, isPublished: true }, data: { isPublished: false } });
  const nextVersion = (definition.versions[0]?.version ?? 0) + 1;
  const created = await tx.formVersion.create({
    data: {
      formDefinitionId: definition.id,
      version: nextVersion,
      schema: CAMP_REGISTRATION_FORM as unknown as Prisma.InputJsonValue,
      isPublished: true,
    },
  });
  await tx.formDefinition.update({ where: { id: definition.id }, data: { activeVersionId: created.id } });
  return created;
}

export async function getOwnedHousehold(userId: string) {
  const householdId = await getOwnedHouseholdId(userId);
  return getPrismaClient().household.findUniqueOrThrow({
    where: { id: householdId },
    include: { members: { orderBy: { createdAt: "asc" }, include: { person: { include: { camperProfile: true } } } } },
  });
}

export async function getOwnedHouseholdMember(userId: string, personId: string) {
  const householdId = await getOwnedHouseholdId(userId);
  return getPrismaClient().householdMember.findFirst({
    where: { householdId, personId },
    include: { person: { include: { camperProfile: true, registrations: { include: { session: { include: { season: true } } }, orderBy: { createdAt: "desc" } } } } },
  });
}

export async function assertHouseholdAccess(userId: string, householdId: string) {
  const ownedHouseholdId = await getOwnedHouseholdId(userId);
  if (ownedHouseholdId !== householdId) throw new AuthorizationError("Household access denied.");
  return getPrismaClient().household.findUniqueOrThrow({
    where: { id: ownedHouseholdId },
    include: { members: { orderBy: { createdAt: "asc" }, include: { person: { include: { camperProfile: true } } } } },
  });
}

export async function hasRole(userId: string, roleKey: string) {
  return Boolean(await getPrismaClient().userRole.findFirst({ where: { userId, role: { key: roleKey } } }));
}

export async function hasPermission(userId: string, permissionKey: string) {
  return Boolean(await getPrismaClient().userRole.findFirst({
    where: { userId, role: { permissions: { some: { permission: { key: permissionKey } } } } },
  }));
}

export async function listRegistrarRegistrations(userId: string) {
  if (!(await hasRole(userId, "registrar"))) throw new AuthorizationError("Registrar access denied.");
  return getPrismaClient().registration.findMany({
    include: { person: true, household: true, session: { include: { season: true } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

export async function getRegistrarRegistration(userId: string, registrationId: string) {
  if (!(await hasRole(userId, "registrar"))) throw new AuthorizationError("Registrar access denied.");
  const registration = await getPrismaClient().registration.findUnique({
    where: { id: registrationId },
    include: { person: true, household: true, session: { include: { season: true } }, formSubmissions: { orderBy: { updatedAt: "desc" }, take: 1 } },
  });
  if (!registration) return null;
  const { formSubmissions, ...summary } = registration;
  const answers = jsonObject(formSubmissions[0]?.answers);
  const reviewAnswers: Record<string, Prisma.JsonValue> = {};
  for (const key of registrarSafeAnswerKeys) if (key in answers) reviewAnswers[key] = answers[key];
  return { ...summary, reviewAnswers, formStatus: formSubmissions[0]?.status ?? null };
}

export async function transitionRegistrarRegistration(userId: string, registrationId: string, nextStatus: RegistrationStatus, reason?: string) {
  if (!(await hasPermission(userId, "registration.approve"))) throw new AuthorizationError("Registration review permission denied.");
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Registration" WHERE "id" = ${registrationId} FOR UPDATE`;
    const registration = await tx.registration.findUnique({ where: { id: registrationId }, include: { session: { include: { season: true } } } });
    if (!registration) throw new Error("Registration not found.");
    const allowed = registrarTransitions[registration.status] ?? [];
    if (!allowed.includes(nextStatus)) throw new ValidationError(`Registration cannot move from ${registration.status} to ${nextStatus}.`);
    const updated = await tx.registration.update({
      where: { id: registration.id },
      data: {
        status: nextStatus,
        approvedAt: nextStatus === RegistrationStatus.APPROVED ? new Date() : null,
        approvedBy: nextStatus === RegistrationStatus.APPROVED ? userId : null,
      },
    });
    await tx.auditEvent.create({
      data: {
        organizationId: registration.session.season.organizationId,
        actorUserId: userId,
        action: "registration.status_changed",
        entityType: "Registration",
        entityId: registration.id,
        before: { status: registration.status },
        after: { status: nextStatus },
        metadata: reason ? { reason } : undefined,
      },
    });
    return updated;
  });
}

export async function updateOwnedHousehold(userId: string, input: { displayName: string; primaryAddress?: Prisma.InputJsonValue }) {
  const householdId = await getOwnedHouseholdId(userId);
  return getPrismaClient().household.update({ where: { id: householdId }, data: { displayName: input.displayName, primaryAddress: input.primaryAddress } });
}

export async function addOwnedHouseholdMember(userId: string, input: HouseholdMemberInput) {
  const householdId = await getOwnedHouseholdId(userId);
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    const person = await tx.person.create({ data: { firstName: input.firstName, lastName: input.lastName, email: input.email || undefined, phone: input.phone || undefined, birthDate: input.birthDate } });
    const relationship = input.kind === "camper" ? HouseholdRelationship.CAMPER : HouseholdRelationship.GUARDIAN;
    await tx.householdMember.create({ data: { householdId, personId: person.id, relationship, hasPortalAccess: false } });
    if (input.kind === "camper") await tx.camperProfile.create({ data: { personId: person.id, grade: input.grade } });
    return person;
  });
}

export async function addOwnedCamper(userId: string, input: { firstName: string; lastName: string; birthDate?: Date; grade?: string }) {
  return addOwnedHouseholdMember(userId, { kind: "camper", ...input });
}

export async function saveOwnedDraft(userId: string, input: DraftInput) {
  assertDraftShape(input.answers);
  const prisma = getPrismaClient();
  const householdId = await assertOwnedCamper(userId, input.camperId, prisma);
  return prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({ where: { id: input.sessionId }, include: { season: true } });
    if (!session) throw new ValidationError("Session not found.");
    const registration = await tx.registration.upsert({
      where: { sessionId_personId: { sessionId: session.id, personId: input.camperId } },
      update: { householdId },
      create: { sessionId: session.id, personId: input.camperId, householdId, status: RegistrationStatus.DRAFT },
    });
    await tx.$queryRaw`SELECT "id" FROM "Registration" WHERE "id" = ${registration.id} FOR UPDATE`;
    const locked = await tx.registration.findUniqueOrThrow({ where: { id: registration.id } });
    if (!editableRegistrationStatuses.has(locked.status)) throw new AuthorizationError("Submitted registration is read-only.");
    assertRegistrationAvailable(session, locked.status === RegistrationStatus.NEEDS_INFORMATION);
    const version = await getRegistrationFormVersion(tx, session.season.organizationId);
    const submission = await tx.formSubmission.upsert({
      where: { registrationId_formVersionId: { registrationId: registration.id, formVersionId: version.id } },
      update: { answers: input.answers, status: "draft", completedAt: null },
      create: { registrationId: registration.id, formVersionId: version.id, answers: input.answers, status: "draft" },
    });
    await tx.auditEvent.create({ data: { organizationId: session.season.organizationId, actorUserId: userId, action: "registration.draft_saved", entityType: "Registration", entityId: registration.id, metadata: { demo: true } } });
    return { registrationId: registration.id, status: locked.status, updatedAt: submission.updatedAt };
  });
}

export async function submitOwnedRegistration(userId: string, input: DraftInput) {
  assertCompleteRegistration(input.answers);
  const prisma = getPrismaClient();
  const householdId = await assertOwnedCamper(userId, input.camperId, prisma);
  return prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({ where: { id: input.sessionId }, include: { season: true } });
    if (!session) throw new ValidationError("Session not found.");
    const registration = await tx.registration.upsert({
      where: { sessionId_personId: { sessionId: session.id, personId: input.camperId } },
      update: { householdId },
      create: { sessionId: session.id, personId: input.camperId, householdId, status: RegistrationStatus.DRAFT },
    });
    await tx.$queryRaw`SELECT "id" FROM "Registration" WHERE "id" = ${registration.id} FOR UPDATE`;
    const locked = await tx.registration.findUniqueOrThrow({ where: { id: registration.id } });
    if (locked.status === RegistrationStatus.SUBMITTED || locked.status === RegistrationStatus.PENDING_REVIEW) {
      return { registrationId: locked.id, status: locked.status, submittedAt: locked.submittedAt };
    }
    if (!editableRegistrationStatuses.has(locked.status)) throw new AuthorizationError("Registration is not editable.");
    assertRegistrationAvailable(session, locked.status === RegistrationStatus.NEEDS_INFORMATION);
    const submittedAt = new Date();
    const updated = await tx.registration.update({ where: { id: locked.id }, data: { householdId, status: RegistrationStatus.SUBMITTED, submittedAt, approvedAt: null, approvedBy: null } });
    const version = await getRegistrationFormVersion(tx, session.season.organizationId);
    await tx.formSubmission.upsert({
      where: { registrationId_formVersionId: { registrationId: updated.id, formVersionId: version.id } },
      update: { answers: input.answers, status: "submitted", completedAt: submittedAt },
      create: { registrationId: updated.id, formVersionId: version.id, answers: input.answers, status: "submitted", completedAt: submittedAt },
    });
    await tx.auditEvent.create({
      data: {
        organizationId: session.season.organizationId,
        actorUserId: userId,
        action: "registration.submitted",
        entityType: "Registration",
        entityId: updated.id,
        before: { status: locked.status },
        after: { status: RegistrationStatus.SUBMITTED },
        metadata: { demo: true },
      },
    });
    return { registrationId: updated.id, status: updated.status, submittedAt: updated.submittedAt };
  });
}

export async function loadOwnedDraft(userId: string, sessionId: string, camperId: string) {
  const householdId = await getOwnedHouseholdId(userId);
  const registration = await getPrismaClient().registration.findFirst({ where: { householdId, sessionId, personId: camperId }, include: { formSubmissions: { orderBy: { updatedAt: "desc" }, take: 1 } } });
  return registration ? { registrationId: registration.id, status: registration.status, answers: registration.formSubmissions[0]?.answers ?? {}, updatedAt: registration.updatedAt, submittedAt: registration.submittedAt } : null;
}
