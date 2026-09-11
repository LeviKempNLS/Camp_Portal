import { createHash, randomBytes } from "node:crypto";
import { HouseholdRelationship, Prisma, UserStatus } from "@prisma/client";
import { getPrismaClient } from "./index.ts";

export class InvitationError extends Error {}

type PortalClient = ReturnType<typeof getPrismaClient>;
type QueryClient = PortalClient | Prisma.TransactionClient;
const INVITATION_DAYS = 7;

function normalizeEmail(value: string) { return value.trim().toLowerCase(); }
function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }

async function ownedHousehold(userId: string, db: QueryClient) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { personId: true } });
  if (!user?.personId) throw new InvitationError("No portal household is linked to this account.");
  const membership = await db.householdMember.findFirst({ where: { personId: user.personId, hasPortalAccess: true }, include: { household: true } });
  if (!membership) throw new InvitationError("Household access denied.");
  return membership;
}

async function organizationId(db: QueryClient) {
  const organization = await db.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!organization) throw new InvitationError("Camp organization is not configured.");
  return organization.id;
}

async function lockHouseholdMember(tx: Prisma.TransactionClient, householdId: string, personId: string) {
  await tx.$queryRaw`SELECT "personId" FROM "HouseholdMember" WHERE "householdId" = ${householdId} AND "personId" = ${personId} FOR UPDATE`;
}

export async function createHouseholdInvitation(userId: string, personId: string) {
  const prisma = getPrismaClient();
  const owner = await ownedHousehold(userId, prisma);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
  const invitation = await prisma.$transaction(async (tx) => {
    await lockHouseholdMember(tx, owner.householdId, personId);
    const member = await tx.householdMember.findUnique({
      where: { householdId_personId: { householdId: owner.householdId, personId } },
      include: { person: { include: { user: true } } },
    });
    if (!member || member.relationship !== HouseholdRelationship.GUARDIAN) throw new InvitationError("Only an adult household member can be invited.");
    if (member.hasPortalAccess || member.person.user) throw new InvitationError("This household member already has portal access.");
    if (!member.person.email) throw new InvitationError("Add an email address before inviting this household member.");

    await tx.portalInvitation.updateMany({
      where: { householdId: owner.householdId, personId, claimedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    const created = await tx.portalInvitation.create({
      data: { householdId: owner.householdId, personId, email: normalizeEmail(member.person.email), tokenHash, expiresAt, invitedByUserId: userId },
    });
    await tx.auditEvent.create({
      data: {
        organizationId: await organizationId(tx), actorUserId: userId, action: "household.invitation_created",
        entityType: "PortalInvitation", entityId: created.id,
        metadata: { householdId: owner.householdId, personId, expiresAt: expiresAt.toISOString() },
      },
    });
    return created;
  });
  return { invitationId: invitation.id, token, expiresAt, email: invitation.email };
}

export async function inspectPortalInvitation(token: string) {
  if (!token) return null;
  const invitation = await getPrismaClient().portalInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { person: true, household: true },
  });
  if (!invitation || invitation.revokedAt || invitation.claimedAt || invitation.expiresAt <= new Date()) return null;
  return {
    id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt,
    person: { firstName: invitation.person.firstName, lastName: invitation.person.lastName },
    household: { displayName: invitation.household.displayName },
  };
}

export async function getHouseholdInvitationStatus(userId: string, personId: string) {
  const prisma = getPrismaClient();
  const owner = await ownedHousehold(userId, prisma);
  const member = await prisma.householdMember.findUnique({ where: { householdId_personId: { householdId: owner.householdId, personId } } });
  if (!member) throw new InvitationError("Household member not found.");
  const invitation = await prisma.portalInvitation.findFirst({
    where: { householdId: owner.householdId, personId, claimedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  return invitation ? { id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt } : null;
}

export async function revokeHouseholdInvitation(userId: string, invitationId: string) {
  const prisma = getPrismaClient();
  const owner = await ownedHousehold(userId, prisma);
  const revokedAt = new Date();
  return prisma.$transaction(async (tx) => {
    const snapshot = await tx.portalInvitation.findFirst({ where: { id: invitationId, householdId: owner.householdId }, select: { personId: true } });
    if (!snapshot) throw new InvitationError("Active invitation not found.");
    await lockHouseholdMember(tx, owner.householdId, snapshot.personId);
    await tx.$queryRaw`SELECT "id" FROM "PortalInvitation" WHERE "id" = ${invitationId} FOR UPDATE`;
    const invitation = await tx.portalInvitation.findFirst({
      where: { id: invitationId, householdId: owner.householdId, claimedAt: null, revokedAt: null, expiresAt: { gt: revokedAt } },
    });
    if (!invitation) throw new InvitationError("Active invitation not found.");
    const updated = await tx.portalInvitation.update({ where: { id: invitation.id }, data: { revokedAt } });
    await tx.auditEvent.create({ data: { organizationId: await organizationId(tx), actorUserId: userId, action: "household.invitation_revoked", entityType: "PortalInvitation", entityId: invitation.id, metadata: { personId: invitation.personId } } });
    return updated;
  });
}

export async function claimPortalInvitation(token: string, authenticatedUser: { id: string; email: string }) {
  if (!token) throw new InvitationError("Invitation token is required.");
  const prisma = getPrismaClient();
  const tokenHash = hashToken(token);
  return prisma.$transaction(async (tx) => {
    const snapshot = await tx.portalInvitation.findUnique({ where: { tokenHash }, select: { id: true, householdId: true, personId: true } });
    if (!snapshot) throw new InvitationError("Invitation is invalid or expired.");
    await lockHouseholdMember(tx, snapshot.householdId, snapshot.personId);
    await tx.$queryRaw`SELECT "id" FROM "PortalInvitation" WHERE "id" = ${snapshot.id} FOR UPDATE`;
    const invitation = await tx.portalInvitation.findUnique({
      where: { id: snapshot.id },
      include: { person: { include: { user: true } }, household: true },
    });
    const now = new Date();
    if (!invitation || invitation.revokedAt || invitation.claimedAt || invitation.expiresAt <= now) throw new InvitationError("Invitation is invalid or expired.");
    if (normalizeEmail(authenticatedUser.email) !== normalizeEmail(invitation.email)) throw new InvitationError("Sign in with the email address that was invited.");
    const portalUser = await tx.user.findUnique({ where: { id: authenticatedUser.id } });
    if (!portalUser) throw new InvitationError("Authenticated portal user not found.");
    if (portalUser.status === UserStatus.DISABLED) throw new InvitationError("This account is disabled and cannot claim an invitation.");
    if (portalUser.personId && portalUser.personId !== invitation.personId) throw new InvitationError("This login is already linked to another person.");
    if (invitation.person.user && invitation.person.user.id !== portalUser.id) throw new InvitationError("This person is already linked to another login.");
    const membership = await tx.householdMember.findUnique({ where: { householdId_personId: { householdId: invitation.householdId, personId: invitation.personId } } });
    if (!membership || membership.relationship !== HouseholdRelationship.GUARDIAN) throw new InvitationError("Invitation no longer matches an adult household member.");

    await tx.user.update({ where: { id: portalUser.id }, data: { personId: invitation.personId, status: UserStatus.ACTIVE, lastLoginAt: now } });
    await tx.householdMember.update({ where: { householdId_personId: { householdId: invitation.householdId, personId: invitation.personId } }, data: { hasPortalAccess: true } });
    const parent = await tx.role.upsert({ where: { key: "parent" }, update: { name: "Parent" }, create: { key: "parent", name: "Parent" } });
    await tx.userRole.upsert({ where: { userId_roleId: { userId: portalUser.id, roleId: parent.id } }, update: {}, create: { userId: portalUser.id, roleId: parent.id } });
    await tx.portalInvitation.update({ where: { id: invitation.id }, data: { claimedAt: now, claimedByUserId: portalUser.id } });
    await tx.portalInvitation.updateMany({ where: { householdId: invitation.householdId, personId: invitation.personId, id: { not: invitation.id }, claimedAt: null, revokedAt: null }, data: { revokedAt: now } });
    await tx.auditEvent.create({ data: { organizationId: await organizationId(tx), actorUserId: portalUser.id, action: "household.invitation_claimed", entityType: "PortalInvitation", entityId: invitation.id, metadata: { householdId: invitation.householdId, personId: invitation.personId } } });
    return { householdId: invitation.householdId, personId: invitation.personId };
  });
}
