import { HouseholdRelationship, Prisma, RegistrationStatus } from "@prisma/client";
import { CAMP_REGISTRATION_FORM, validateFormAnswers } from "@faith-adventures/domain";
import { getPrismaClient } from "./index.ts";
import { AuthorizationError, ValidationError, hasPermission, type DraftInput } from "./portal.ts";

const editableStatuses = new Set<RegistrationStatus>([RegistrationStatus.DRAFT, RegistrationStatus.NEEDS_INFORMATION]);
const occupiedStatuses: RegistrationStatus[] = [
  RegistrationStatus.SUBMITTED,
  RegistrationStatus.PENDING_REVIEW,
  RegistrationStatus.NEEDS_INFORMATION,
  RegistrationStatus.APPROVED,
  RegistrationStatus.CHECKED_IN,
  RegistrationStatus.COMPLETED,
];
const registrarTransitions: Partial<Record<RegistrationStatus, RegistrationStatus[]>> = {
  [RegistrationStatus.SUBMITTED]: [RegistrationStatus.APPROVED, RegistrationStatus.NEEDS_INFORMATION, RegistrationStatus.WAITLISTED, RegistrationStatus.CANCELLED],
  [RegistrationStatus.PENDING_REVIEW]: [RegistrationStatus.APPROVED, RegistrationStatus.NEEDS_INFORMATION, RegistrationStatus.WAITLISTED, RegistrationStatus.CANCELLED],
  [RegistrationStatus.NEEDS_INFORMATION]: [RegistrationStatus.CANCELLED],
  [RegistrationStatus.WAITLISTED]: [RegistrationStatus.APPROVED, RegistrationStatus.CANCELLED],
  [RegistrationStatus.APPROVED]: [RegistrationStatus.CANCELLED],
};

function isCanonicalRegistrationSchema(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const schema = value as Record<string, Prisma.JsonValue>;
  return schema.id === CAMP_REGISTRATION_FORM.id && Array.isArray(schema.sections);
}

function assertCompleteRegistration(answers: Prisma.InputJsonValue) {
  const errors = validateFormAnswers(CAMP_REGISTRATION_FORM, answers);
  if (errors.length) throw new ValidationError(`Registration is incomplete or invalid: ${errors.join(", ")}.`);
}

function assertRegistrationAvailable(session: {
  status: string;
  registrationOpen: Date | null;
  registrationClose: Date | null;
  season: { status: string; registrationOpen: Date | null; registrationClose: Date | null };
}, allowCorrection = false) {
  if (session.season.status !== "open") throw new ValidationError("Registration is not open for this season.");
  if (session.status !== "open") throw new ValidationError("Registration is not open for this session.");
  if (allowCorrection) return;
  const now = new Date();
  const opens = session.registrationOpen ?? session.season.registrationOpen;
  const closes = session.registrationClose ?? session.season.registrationClose;
  if (opens && now < opens) throw new ValidationError("Registration has not opened yet.");
  if (closes && now > closes) throw new ValidationError("Registration is closed.");
}

async function assertOwnedCamper(userId: string, camperId: string, tx: Prisma.TransactionClient) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { personId: true } });
  if (!user?.personId) throw new AuthorizationError("No portal profile.");
  const owner = await tx.householdMember.findFirst({ where: { personId: user.personId, hasPortalAccess: true }, select: { householdId: true } });
  if (!owner) throw new AuthorizationError("No owned household.");
  const camper = await tx.householdMember.findFirst({
    where: { householdId: owner.householdId, personId: camperId, relationship: HouseholdRelationship.CAMPER },
    select: { personId: true },
  });
  if (!camper) throw new AuthorizationError("Camper access denied.");
  return owner.householdId;
}

async function getRegistrationFormVersion(tx: Prisma.TransactionClient, organizationId: string) {
  let definition = await tx.formDefinition.findUnique({
    where: { organizationId_key: { organizationId, key: "registration" } },
    include: { versions: { orderBy: { version: "desc" } } },
  });
  if (!definition) {
    definition = await tx.formDefinition.create({ data: { organizationId, key: "registration", name: "Registration" }, include: { versions: true } });
  }
  const published = definition.versions.find(version => version.isPublished && isCanonicalRegistrationSchema(version.schema));
  if (published) {
    if (definition.activeVersionId !== published.id) await tx.formDefinition.update({ where: { id: definition.id }, data: { activeVersionId: published.id } });
    return published;
  }
  await tx.formVersion.updateMany({ where: { formDefinitionId: definition.id, isPublished: true }, data: { isPublished: false } });
  const nextVersion = (definition.versions[0]?.version ?? 0) + 1;
  const created = await tx.formVersion.create({
    data: { formDefinitionId: definition.id, version: nextVersion, schema: CAMP_REGISTRATION_FORM as unknown as Prisma.InputJsonValue, isPublished: true },
  });
  await tx.formDefinition.update({ where: { id: definition.id }, data: { activeVersionId: created.id } });
  return created;
}

export async function submitOwnedRegistrationWithCapacity(userId: string, input: DraftInput) {
  assertCompleteRegistration(input.answers);
  const prisma = getPrismaClient();
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Session" WHERE "id" = ${input.sessionId} FOR UPDATE`;
    const session = await tx.session.findUnique({ where: { id: input.sessionId }, include: { season: true } });
    if (!session) throw new ValidationError("Session not found.");
    const householdId = await assertOwnedCamper(userId, input.camperId, tx);
    const registration = await tx.registration.upsert({
      where: { sessionId_personId: { sessionId: session.id, personId: input.camperId } },
      update: { householdId },
      create: { sessionId: session.id, personId: input.camperId, householdId, status: RegistrationStatus.DRAFT },
    });
    await tx.$queryRaw`SELECT "id" FROM "Registration" WHERE "id" = ${registration.id} FOR UPDATE`;
    const locked = await tx.registration.findUniqueOrThrow({ where: { id: registration.id } });
    if ([RegistrationStatus.SUBMITTED, RegistrationStatus.PENDING_REVIEW, RegistrationStatus.WAITLISTED].includes(locked.status)) {
      return { registrationId: locked.id, status: locked.status, submittedAt: locked.submittedAt };
    }
    if (!editableStatuses.has(locked.status)) throw new AuthorizationError("Registration is not editable.");
    assertRegistrationAvailable(session, locked.status === RegistrationStatus.NEEDS_INFORMATION);

    const occupied = await tx.registration.count({
      where: { sessionId: session.id, id: { not: locked.id }, status: { in: occupiedStatuses } },
    });
    let nextStatus = RegistrationStatus.SUBMITTED;
    let waitlistPosition: number | null = null;
    if (occupied >= session.capacity) {
      if (!session.waitlistEnabled) throw new ValidationError("This session is full.");
      nextStatus = RegistrationStatus.WAITLISTED;
      waitlistPosition = (await tx.registration.count({ where: { sessionId: session.id, status: RegistrationStatus.WAITLISTED } })) + 1;
    }

    const submittedAt = new Date();
    const updated = await tx.registration.update({
      where: { id: locked.id },
      data: { householdId, status: nextStatus, submittedAt, approvedAt: null, approvedBy: null, waitlistPosition },
    });
    const version = await getRegistrationFormVersion(tx, session.season.organizationId);
    await tx.formSubmission.upsert({
      where: { registrationId_formVersionId: { registrationId: updated.id, formVersionId: version.id } },
      update: { answers: input.answers, status: "submitted", completedAt: submittedAt },
      create: { registrationId: updated.id, formVersionId: version.id, answers: input.answers, status: "submitted", completedAt: submittedAt },
    });
    await tx.auditEvent.create({
      data: {
        organizationId: session.season.organizationId, actorUserId: userId, action: "registration.submitted",
        entityType: "Registration", entityId: updated.id,
        before: { status: locked.status }, after: { status: nextStatus }, metadata: { demo: true, waitlisted: nextStatus === RegistrationStatus.WAITLISTED },
      },
    });
    return { registrationId: updated.id, status: updated.status, submittedAt: updated.submittedAt };
  });
}

export async function transitionRegistrarRegistrationWithCapacity(userId: string, registrationId: string, nextStatus: RegistrationStatus, reason?: string) {
  if (!(await hasPermission(userId, "registration.approve"))) throw new AuthorizationError("Registration review permission denied.");
  const prisma = getPrismaClient();
  const pointer = await prisma.registration.findUnique({ where: { id: registrationId }, select: { sessionId: true } });
  if (!pointer) throw new ValidationError("Registration not found.");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Session" WHERE "id" = ${pointer.sessionId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Registration" WHERE "id" = ${registrationId} FOR UPDATE`;
    const registration = await tx.registration.findUnique({ where: { id: registrationId }, include: { session: { include: { season: true } } } });
    if (!registration) throw new ValidationError("Registration not found.");
    const allowed = registrarTransitions[registration.status] ?? [];
    if (!allowed.includes(nextStatus)) throw new ValidationError(`Registration cannot move from ${registration.status} to ${nextStatus}.`);

    if (registration.status === RegistrationStatus.WAITLISTED && nextStatus === RegistrationStatus.APPROVED) {
      const occupied = await tx.registration.count({
        where: { sessionId: registration.sessionId, id: { not: registration.id }, status: { in: occupiedStatuses } },
      });
      if (occupied >= registration.session.capacity) throw new ValidationError("This session is full; free a space before approving a waitlisted camper.");
    }

    const updated = await tx.registration.update({
      where: { id: registration.id },
      data: {
        status: nextStatus,
        approvedAt: nextStatus === RegistrationStatus.APPROVED ? new Date() : null,
        approvedBy: nextStatus === RegistrationStatus.APPROVED ? userId : null,
        waitlistPosition: nextStatus === RegistrationStatus.WAITLISTED ? registration.waitlistPosition : null,
      },
    });
    await tx.auditEvent.create({
      data: {
        organizationId: registration.session.season.organizationId, actorUserId: userId, action: "registration.status_changed",
        entityType: "Registration", entityId: registration.id,
        before: { status: registration.status }, after: { status: nextStatus }, metadata: reason ? { reason } : undefined,
      },
    });
    return updated;
  });
}
