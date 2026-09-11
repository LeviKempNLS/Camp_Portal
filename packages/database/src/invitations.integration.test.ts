import test from "node:test";
import assert from "node:assert/strict";
import { HouseholdRelationship, PrismaClient } from "@prisma/client";
import { claimPortalInvitation, createHouseholdInvitation, inspectPortalInvitation, InvitationError, revokeHouseholdInvitation } from "./invitations.ts";
import { AuthorizationError, ensurePortalProfile } from "./portal.ts";

const prisma = new PrismaClient();
async function setup() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "PortalInvitation", "AuditEvent", "FormSubmission", "FormVersion", "FormDefinition", "Registration", "CamperProfile", "HouseholdMember", "Household", "Session", "Season", "Organization", "UserRole", "RolePermission", "Permission", "Role", "Account", "AuthSession", "Verification", "User", "Person" CASCADE');
  await prisma.organization.create({ data: { name: "Invite Test Camp", slug: "invite-test" } });
  const parent = await prisma.role.create({ data: { key: "parent", name: "Parent" } });
  const counselor = await prisma.role.create({ data: { key: "counselor", name: "Counselor" } });
  const inviterPerson = await prisma.person.create({ data: { firstName: "Invite", lastName: "Owner", email: "owner@example.test" } });
  const invitedPerson = await prisma.person.create({ data: { firstName: "Second", lastName: "Guardian", email: "second@example.test" } });
  const household = await prisma.household.create({ data: { displayName: "Invite Household" } });
  const inviter = await prisma.user.create({ data: { id: "invite-owner", name: "Invite Owner", email: "owner-auth@example.test", personId: inviterPerson.id, status: "ACTIVE" } });
  const invitee = await prisma.user.create({ data: { id: "invitee", name: "Second Guardian", email: "second@example.test" } });
  const wrong = await prisma.user.create({ data: { id: "wrong-user", name: "Wrong User", email: "wrong@example.test" } });
  await prisma.householdMember.createMany({ data: [
    { householdId: household.id, personId: inviterPerson.id, relationship: HouseholdRelationship.GUARDIAN, hasPortalAccess: true },
    { householdId: household.id, personId: invitedPerson.id, relationship: HouseholdRelationship.GUARDIAN, hasPortalAccess: false },
  ] });
  await prisma.userRole.create({ data: { userId: invitee.id, roleId: counselor.id } });
  await prisma.userRole.create({ data: { userId: inviter.id, roleId: parent.id } });
  return { household, invitedPerson, inviter, invitee, wrong };
}

test("household invitation securely links an existing adult and preserves additive roles", async () => {
  const x = await setup();
  const invite = await createHouseholdInvitation(x.inviter.id, x.invitedPerson.id);
  await assert.rejects(() => claimPortalInvitation(invite.token, { id: x.wrong.id, email: x.wrong.email }), InvitationError);
  const claimed = await claimPortalInvitation(invite.token, { id: x.invitee.id, email: x.invitee.email });
  assert.equal(claimed.personId, x.invitedPerson.id);
  assert.equal(claimed.householdId, x.household.id);
  const linked = await prisma.user.findUniqueOrThrow({ where: { id: x.invitee.id }, include: { roles: { include: { role: true } } } });
  assert.equal(linked.personId, x.invitedPerson.id);
  assert.equal(await prisma.person.count({ where: { email: "second@example.test" } }), 1);
  assert.equal(await prisma.household.count(), 1);
  assert.deepEqual(new Set(linked.roles.map(item => item.role.key)), new Set(["counselor", "parent"]));
  const membership = await prisma.householdMember.findUniqueOrThrow({ where: { householdId_personId: { householdId: x.household.id, personId: x.invitedPerson.id } } });
  assert.equal(membership.hasPortalAccess, true);
  await assert.rejects(() => claimPortalInvitation(invite.token, { id: x.invitee.id, email: x.invitee.email }), InvitationError);
});

test("disabled users cannot reactivate themselves through an invitation", async () => {
  const x = await setup();
  const invite = await createHouseholdInvitation(x.inviter.id, x.invitedPerson.id);
  await prisma.user.update({ where: { id: x.invitee.id }, data: { status: "DISABLED" } });
  await assert.rejects(() => claimPortalInvitation(invite.token, { id: x.invitee.id, email: x.invitee.email }), InvitationError);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: x.invitee.id } });
  const membership = await prisma.householdMember.findUniqueOrThrow({ where: { householdId_personId: { householdId: x.household.id, personId: x.invitedPerson.id } } });
  assert.equal(user.status, "DISABLED");
  assert.equal(user.personId, null);
  assert.equal(membership.hasPortalAccess, false);
});

test("concurrent invitation creation leaves only one active bearer token", async () => {
  const x = await setup();
  const [first, second] = await Promise.all([
    createHouseholdInvitation(x.inviter.id, x.invitedPerson.id),
    createHouseholdInvitation(x.inviter.id, x.invitedPerson.id),
  ]);
  const active = await prisma.portalInvitation.findMany({ where: { householdId: x.household.id, personId: x.invitedPerson.id, claimedAt: null, revokedAt: null } });
  assert.equal(active.length, 1);
  const inspections = await Promise.all([inspectPortalInvitation(first.token), inspectPortalInvitation(second.token)]);
  assert.equal(inspections.filter(Boolean).length, 1);
});

test("concurrent claims are single-use and return a domain error for the replay", async () => {
  const x = await setup();
  const invite = await createHouseholdInvitation(x.inviter.id, x.invitedPerson.id);
  const results = await Promise.allSettled([
    claimPortalInvitation(invite.token, { id: x.invitee.id, email: x.invitee.email }),
    claimPortalInvitation(invite.token, { id: x.invitee.id, email: x.invitee.email }),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const rejected = results.find(result => result.status === "rejected");
  assert.ok(rejected && rejected.status === "rejected");
  assert.ok(rejected.reason instanceof InvitationError);
});

test("revoked and expired invitations cannot be claimed", async () => {
  const x = await setup();
  const revoked = await createHouseholdInvitation(x.inviter.id, x.invitedPerson.id);
  await revokeHouseholdInvitation(x.inviter.id, revoked.invitationId);
  await assert.rejects(() => claimPortalInvitation(revoked.token, { id: x.invitee.id, email: x.invitee.email }), InvitationError);
  const expired = await createHouseholdInvitation(x.inviter.id, x.invitedPerson.id);
  await prisma.portalInvitation.update({ where: { id: expired.invitationId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await assert.rejects(() => claimPortalInvitation(expired.token, { id: x.invitee.id, email: x.invitee.email }), InvitationError);
});

test("portal profile bootstrap is concurrency safe and never auto-links an existing person by email", async () => {
  await setup();
  const user = await prisma.user.create({ data: { id: "bootstrap-user", name: "Bootstrap Parent", email: "bootstrap@example.test" } });
  const [first, second] = await Promise.all([
    ensurePortalProfile({ id: user.id, email: user.email, name: user.name }),
    ensurePortalProfile({ id: user.id, email: user.email, name: user.name }),
  ]);
  assert.ok(first.personId);
  assert.equal(first.personId, second.personId);
  assert.equal(await prisma.person.count({ where: { email: user.email } }), 1);

  await prisma.person.create({ data: { firstName: "Existing", lastName: "Adult", email: "represented@example.test" } });
  const representedLogin = await prisma.user.create({ data: { id: "represented-login", name: "Existing Adult", email: "represented@example.test" } });
  await assert.rejects(
    () => ensurePortalProfile({ id: representedLogin.id, email: representedLogin.email, name: representedLogin.name }),
    AuthorizationError,
  );
  const stillUnlinked = await prisma.user.findUniqueOrThrow({ where: { id: representedLogin.id } });
  assert.equal(stillUnlinked.personId, null);
});

test.after(async () => prisma.$disconnect());
