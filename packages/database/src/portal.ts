import { HouseholdRelationship, RegistrationStatus, type Prisma } from "@prisma/client";
import { getPrismaClient } from "./index.ts";

export class AuthorizationError extends Error {}
export type DraftInput = { sessionId: string; camperId: string; answers: Prisma.InputJsonValue };

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "Parent", lastName: parts.slice(1).join(" ") || "User" };
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

export async function getOwnedHousehold(userId: string) {
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.personId) throw new AuthorizationError("No portal profile.");
  const membership = await prisma.householdMember.findFirst({ where: { personId: user.personId, hasPortalAccess: true }, include: { household: { include: { members: { include: { person: { include: { camperProfile: true } } } } } } } });
  if (!membership) throw new AuthorizationError("No owned household.");
  return membership.household;
}

export async function assertHouseholdAccess(userId: string, householdId: string) {
  const household = await getOwnedHousehold(userId);
  if (household.id !== householdId) throw new AuthorizationError("Household access denied.");
  return household;
}

export async function hasRole(userId: string, roleKey: string) {
  return Boolean(await getPrismaClient().userRole.findFirst({ where: { userId, role: { key: roleKey } } }));
}

export async function listRegistrarRegistrations(userId: string) {
  if (!(await hasRole(userId, "registrar"))) throw new AuthorizationError("Registrar access denied.");
  return getPrismaClient().registration.findMany({ include: { person: true, household: true, session: true }, orderBy: { updatedAt: "desc" }, take: 100 });
}

export async function updateOwnedHousehold(userId: string, input: { displayName: string; primaryAddress?: Prisma.InputJsonValue }) {
  const household = await getOwnedHousehold(userId);
  return getPrismaClient().household.update({ where: { id: household.id }, data: { displayName: input.displayName, primaryAddress: input.primaryAddress } });
}

export async function addOwnedCamper(userId: string, input: { firstName: string; lastName: string; birthDate?: Date; grade?: string }) {
  const household = await getOwnedHousehold(userId);
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    const person = await tx.person.create({ data: { firstName: input.firstName, lastName: input.lastName, birthDate: input.birthDate } });
    await tx.householdMember.create({ data: { householdId: household.id, personId: person.id, relationship: HouseholdRelationship.CAMPER } });
    await tx.camperProfile.create({ data: { personId: person.id, grade: input.grade } });
    return person;
  });
}

export async function saveOwnedDraft(userId: string, input: DraftInput) {
  const prisma = getPrismaClient();
  const household = await getOwnedHousehold(userId);
  const camper = await prisma.householdMember.findFirst({ where: { householdId: household.id, personId: input.camperId, relationship: HouseholdRelationship.CAMPER } });
  if (!camper) throw new AuthorizationError("Camper access denied.");
  const session = await prisma.session.findUnique({ where: { id: input.sessionId }, include: { season: true } });
  if (!session) throw new Error("Session not found.");
  return prisma.$transaction(async (tx) => {
    const registration = await tx.registration.upsert({
      where: { sessionId_personId: { sessionId: session.id, personId: input.camperId } },
      update: { householdId: household.id, status: RegistrationStatus.DRAFT },
      create: { sessionId: session.id, personId: input.camperId, householdId: household.id, status: RegistrationStatus.DRAFT },
    });
    let definition = await tx.formDefinition.findUnique({ where: { organizationId_key: { organizationId: session.season.organizationId, key: "registration" } }, include: { versions: { where: { isPublished: true }, take: 1 } } });
    if (!definition) {
      definition = await tx.formDefinition.create({ data: { organizationId: session.season.organizationId, key: "registration", name: "Registration", versions: { create: { version: 1, schema: { version: 1 }, isPublished: true } } }, include: { versions: true } });
    }
    const version = definition.versions[0] ?? await tx.formVersion.create({ data: { formDefinitionId: definition.id, version: 1, schema: { version: 1 }, isPublished: true } });
    const submission = await tx.formSubmission.upsert({ where: { registrationId_formVersionId: { registrationId: registration.id, formVersionId: version.id } }, update: { answers: input.answers, status: "draft" }, create: { registrationId: registration.id, formVersionId: version.id, answers: input.answers, status: "draft" } });
    await tx.auditEvent.create({ data: { organizationId: session.season.organizationId, actorUserId: userId, action: "registration.draft_saved", entityType: "Registration", entityId: registration.id, metadata: { demo: true } } });
    return { registrationId: registration.id, updatedAt: submission.updatedAt };
  });
}

export async function loadOwnedDraft(userId: string, sessionId: string, camperId: string) {
  const household = await getOwnedHousehold(userId);
  const registration = await getPrismaClient().registration.findFirst({ where: { householdId: household.id, sessionId, personId: camperId }, include: { formSubmissions: { orderBy: { updatedAt: "desc" }, take: 1 } } });
  return registration ? { registrationId: registration.id, answers: registration.formSubmissions[0]?.answers ?? {}, updatedAt: registration.updatedAt } : null;
}
