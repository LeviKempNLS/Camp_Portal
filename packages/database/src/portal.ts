import { HouseholdRelationship, RegistrationStatus, type Prisma } from "@prisma/client";
import { getPrismaClient } from "@faith-adventures/database";

export class AuthorizationError extends Error {}
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

const editableRegistrationStatuses = new Set<RegistrationStatus>([
  RegistrationStatus.DRAFT,
  RegistrationStatus.NEEDS_INFORMATION,
]);

const registrarTransitions: Partial<Record<RegistrationStatus, RegistrationStatus[]>> = {
  [RegistrationStatus.SUBMITTED]: [RegistrationStatus.APPROVED, RegistrationStatus.NEEDS_INFORMATION, RegistrationStatus.WAITLISTED, RegistrationStatus.CANCELLED],
  [RegistrationStatus.PENDING_REVIEW]: [RegistrationStatus.APPROVED, RegistrationStatus.NEEDS_INFORMATION, RegistrationStatus.WAITLISTED, RegistrationStatus.CANCELLED],
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

export async function ensurePortalProfile(user: { id: string; email: string; name: string }) {
  const prisma = getPrismaClient();
  const existing = await prisma.user.findUnique({ where: { id: user.id }, include: { person: true } });
  if (!existing) throw new AuthorizationError("Authenticated identity is not a portal user.");
  if (existing.person) return existing;
  const name = splitName(user.name);
  return prisma.$transaction(async (tx) => {
    const person = await tx.person.create({ data: { ...name, email: user.email } });
    const household = await tx.household.create({ data: { displayName: `${name.lastName} Household` } });
    await tx.householdMember.create({ data: { householdId: household.id, personId: person.id, relationship: HouseholdRelationship.GUARDIAN, isPrimaryContact: true, hasPortalAccess: true } });
    await tx.user.update({ where: { id: user.id }, data: { personId: person.id, status: "ACTIVE", lastLoginAt: new Date() } });
    const parent = await tx.role.findUnique({ where: { key: "parent" } });
    if (parent) await tx.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: parent.id } }, update: {}, create: { userId: user.id, roleId: parent.id } });
    return tx.user.findUniqueOrThrow({ where: { id: user.id }, include: { person: true } });
  });
}

async function getOwnedHouseholdId(userId: string) {
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { personId: true } });
  if (!user?.personId) throw new AuthorizationError("No portal profile.");
  const membership = await prisma.householdMember.findFirst({
    where: { personId: user.personId, hasPortalAccess: true },
    select: { householdId: true },
  });
  if (!membership) throw new AuthorizationError("No owned household.");
  return membership.householdId;
}

async function assertOwnedCamper(userId: string, camperId: string) {
  const householdId = await getOwnedHouseholdId(userId);
  const camper = await getPrismaClient().householdMember.findFirst({
    where: { householdId, personId: camperId, relationship: HouseholdRelationship.CAMPER },
    select: { personId: true },
  });
  if (!camper) throw new AuthorizationError("Camper access denied.");
  return householdId;
}

async function getRegistrationFormVersion(tx: Prisma.TransactionClient, organizationId: string) {
  let definition = await tx.formDefinition.findUnique({
    where: { organizationId_key: { organizationId, key: "registration" } },
    include: { versions: { where: { isPublished: true }, orderBy: { version: "desc" }, take: 1 } },
  });
  if (!definition) {
    definition = await tx.formDefinition.create({
      data: { organizationId, key: "registration", name: "Registration", versions: { create: { version: 1, schema: { version: 1 }, isPublished: true } } },
      include: { versions: true },
    });
  }
  if (definition.versions[0]) return definition.versions[0];
  const latest = await tx.formVersion.findFirst({ where: { formDefinitionId: definition.id }, orderBy: { version: "desc" } });
  return tx.formVersion.create({ data: { formDefinitionId: definition.id, version: (latest?.version ?? 0) + 1, schema: { version: (latest?.version ?? 0) + 1 }, isPublished: true } });
}

export async function getOwnedHousehold(userId: string) {
  const householdId = await getOwnedHouseholdId(userId);
  return getPrismaClient().household.findUniqueOrThrow({
    where: { id: householdId },
    include: {
      members: {
        orderBy: { createdAt: "asc" },
        include: { person: { include: { camperProfile: true } } },
      },
    },
  });
}

export async function getOwnedHouseholdMember(userId: string, personId: string) {
  const householdId = await getOwnedHouseholdId(userId);
  return getPrismaClient().householdMember.findFirst({
    where: { householdId, personId },
    include: {
      person: {
        include: {
          camperProfile: true,
          registrations: {
            include: { session: { include: { season: true } } },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });
}

export async function assertHouseholdAccess(userId: string, householdId: string) {
  const ownedHouseholdId = await getOwnedHouseholdId(userId);
  if (ownedHouseholdId !== householdId) throw new AuthorizationError("Household access denied.");
  return getPrismaClient().household.findUniqueOrThrow({
    where: { id: ownedHouseholdId },
    include: {
      members: {
        orderBy: { createdAt: "asc" },
        include: { person: { include: { camperProfile: true } } },
      },
    },
  });
}

export async function hasRole(userId: string, roleKey: string) {
  return Boolean(await getPrismaClient().userRole.findFirst({ where: { userId, role: { key: roleKey } } }));
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
    include: {
      person: true,
      household: true,
      session: { include: { season: true } },
      formSubmissions: { orderBy: { updatedAt: "desc" }, take: 1 },
    },
  });
  if (!registration) return null;
  const { formSubmissions, ...summary } = registration;
  const answers = jsonObject(formSubmissions[0]?.answers);
  const reviewAnswers: Record<string, Prisma.JsonValue> = {};
  for (const key of registrarSafeAnswerKeys) if (key in answers) reviewAnswers[key] = answers[key];
  return { ...summary, reviewAnswers, formStatus: formSubmissions[0]?.status ?? null };
}

export async function transitionRegistrarRegistration(userId: string, registrationId: string, nextStatus: RegistrationStatus, reason?: string) {
  if (!(await hasRole(userId, "registrar"))) throw new AuthorizationError("Registrar access denied.");
  const prisma = getPrismaClient();
  const registration = await prisma.registration.findUnique({ where: { id: registrationId }, include: { session: { include: { season: true } } } });
  if (!registration) throw new Error("Registration not found.");
  const allowed = registrarTransitions[registration.status] ?? [];
  if (!allowed.includes(nextStatus)) throw new Error(`Registration cannot move from ${registration.status} to ${nextStatus}.`);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.registration.update({
      where: { id: registration.id },
      data: {
        status: nextStatus,
        ...(nextStatus === RegistrationStatus.APPROVED ? { approvedAt: new Date(), approvedBy: userId } : {}),
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
  const prisma = getPrismaClient();
  const householdId = await assertOwnedCamper(userId, input.camperId);
  const session = await prisma.session.findUnique({ where: { id: input.sessionId }, include: { season: true } });
  if (!session) throw new Error("Session not found.");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.registration.findUnique({ where: { sessionId_personId: { sessionId: session.id, personId: input.camperId } } });
    if (existing && !editableRegistrationStatuses.has(existing.status)) throw new AuthorizationError("Submitted registration is read-only.");
    const registration = existing
      ? await tx.registration.update({ where: { id: existing.id }, data: { householdId } })
      : await tx.registration.create({ data: { sessionId: session.id, personId: input.camperId, householdId, status: RegistrationStatus.DRAFT } });
    const version = await getRegistrationFormVersion(tx, session.season.organizationId);
    const submission = await tx.formSubmission.upsert({
      where: { registrationId_formVersionId: { registrationId: registration.id, formVersionId: version.id } },
      update: { answers: input.answers, status: "draft", completedAt: null },
      create: { registrationId: registration.id, formVersionId: version.id, answers: input.answers, status: "draft" },
    });
    await tx.auditEvent.create({ data: { organizationId: session.season.organizationId, actorUserId: userId, action: "registration.draft_saved", entityType: "Registration", entityId: registration.id, metadata: { demo: true } } });
    return { registrationId: registration.id, status: registration.status, updatedAt: submission.updatedAt };
  });
}

export async function submitOwnedRegistration(userId: string, input: DraftInput) {
  const prisma = getPrismaClient();
  const householdId = await assertOwnedCamper(userId, input.camperId);
  const session = await prisma.session.findUnique({ where: { id: input.sessionId }, include: { season: true } });
  if (!session) throw new Error("Session not found.");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.registration.findUnique({ where: { sessionId_personId: { sessionId: session.id, personId: input.camperId } } });
    if (existing && (existing.status === RegistrationStatus.SUBMITTED || existing.status === RegistrationStatus.PENDING_REVIEW)) {
      return { registrationId: existing.id, status: existing.status, submittedAt: existing.submittedAt };
    }
    if (existing && !editableRegistrationStatuses.has(existing.status)) throw new AuthorizationError("Registration is not editable.");
    const submittedAt = new Date();
    const registration = existing
      ? await tx.registration.update({ where: { id: existing.id }, data: { householdId, status: RegistrationStatus.SUBMITTED, submittedAt } })
      : await tx.registration.create({ data: { sessionId: session.id, personId: input.camperId, householdId, status: RegistrationStatus.SUBMITTED, submittedAt } });
    const version = await getRegistrationFormVersion(tx, session.season.organizationId);
    await tx.formSubmission.upsert({
      where: { registrationId_formVersionId: { registrationId: registration.id, formVersionId: version.id } },
      update: { answers: input.answers, status: "submitted", completedAt: submittedAt },
      create: { registrationId: registration.id, formVersionId: version.id, answers: input.answers, status: "submitted", completedAt: submittedAt },
    });
    await tx.auditEvent.create({
      data: {
        organizationId: session.season.organizationId,
        actorUserId: userId,
        action: "registration.submitted",
        entityType: "Registration",
        entityId: registration.id,
        before: existing ? { status: existing.status } : undefined,
        after: { status: RegistrationStatus.SUBMITTED },
        metadata: { demo: true },
      },
    });
    return { registrationId: registration.id, status: registration.status, submittedAt: registration.submittedAt };
  });
}

export async function loadOwnedDraft(userId: string, sessionId: string, camperId: string) {
  const householdId = await getOwnedHouseholdId(userId);
  const registration = await getPrismaClient().registration.findFirst({ where: { householdId, sessionId, personId: camperId }, include: { formSubmissions: { orderBy: { updatedAt: "desc" }, take: 1 } } });
  return registration ? { registrationId: registration.id, status: registration.status, answers: registration.formSubmissions[0]?.answers ?? {}, updatedAt: registration.updatedAt, submittedAt: registration.submittedAt } : null;
}
