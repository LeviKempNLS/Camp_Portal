import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, HouseholdRelationship, RegistrationStatus } from "@prisma/client";
import {
  addOwnedHouseholdMember,
  AuthorizationError,
  assertHouseholdAccess,
  getOwnedHouseholdMember,
  getRegistrarRegistration,
  listRegistrarRegistrations,
  loadOwnedDraft,
  saveOwnedDraft,
  submitOwnedRegistration,
  transitionRegistrarRegistration,
} from "./portal.ts";
import { auth } from "@faith-adventures/auth";
import { ensurePortalProfile } from "./portal.ts";

const prisma = new PrismaClient();
async function setup() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditEvent", "FormSubmission", "FormVersion", "FormDefinition", "Registration", "CamperProfile", "HouseholdMember", "Household", "Session", "Season", "Organization", "UserRole", "RolePermission", "Permission", "Role", "Account", "AuthSession", "Verification", "User", "Person" CASCADE');
  const org = await prisma.organization.create({ data: { name: "Test Organization", slug: "test-org" } });
  const season = await prisma.season.create({ data: { organizationId: org.id, name: "Test", year: 2099 } });
  const session = await prisma.session.create({ data: { seasonId: season.id, name: "Test Session", startDate: new Date(), endDate: new Date(), capacity: 10, basePrice: "0", status: "open" } });
  const parentA = await prisma.person.create({ data: { firstName: "Parent", lastName: "A", email: "parent-a@example.test" } });
  const parentB = await prisma.person.create({ data: { firstName: "Parent", lastName: "B", email: "parent-b@example.test" } });
  const camperA = await prisma.person.create({ data: { firstName: "Camper", lastName: "A" } });
  const camperB = await prisma.person.create({ data: { firstName: "Camper", lastName: "B" } });
  const userA = await prisma.user.create({ data: { id: "user-a", name: "Parent A", email: "auth-a@example.test", personId: parentA.id } });
  const userB = await prisma.user.create({ data: { id: "user-b", name: "Parent B", email: "auth-b@example.test", personId: parentB.id } });
  const householdA = await prisma.household.create({ data: { displayName: "Household A" } });
  const householdB = await prisma.household.create({ data: { displayName: "Household B" } });
  await prisma.householdMember.createMany({ data: [
    { householdId: householdA.id, personId: parentA.id, relationship: HouseholdRelationship.GUARDIAN, hasPortalAccess: true },
    { householdId: householdA.id, personId: camperA.id, relationship: HouseholdRelationship.CAMPER },
    { householdId: householdB.id, personId: parentB.id, relationship: HouseholdRelationship.GUARDIAN, hasPortalAccess: true },
    { householdId: householdB.id, personId: camperB.id, relationship: HouseholdRelationship.CAMPER },
  ] });
  return { userA, userB, householdA, householdB, camperA, camperB, session };
}

async function makeRegistrar(userId: string) {
  const role = await prisma.role.upsert({ where: { key: "registrar" }, update: {}, create: { key: "registrar", name: "Registrar" } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId, roleId: role.id } }, update: {}, create: { userId, roleId: role.id } });
}

test("ownership, draft resume, and duplicate autosave are enforced", async () => {
  const x = await setup();
  await assert.rejects(() => assertHouseholdAccess(x.userA.id, x.householdB.id), AuthorizationError);
  await assert.rejects(() => saveOwnedDraft(x.userA.id, { sessionId: x.session.id, camperId: x.camperB.id, answers: {} }), AuthorizationError);
  await saveOwnedDraft(x.userA.id, { sessionId: x.session.id, camperId: x.camperA.id, answers: { shirtSize: "M" } });
  await saveOwnedDraft(x.userA.id, { sessionId: x.session.id, camperId: x.camperA.id, answers: { shirtSize: "L" } });
  const draft = await loadOwnedDraft(x.userA.id, x.session.id, x.camperA.id);
  assert.equal((draft?.answers as { shirtSize: string }).shirtSize, "L");
  assert.equal(await prisma.registration.count(), 1);
  await makeRegistrar(x.userB.id);
  assert.equal((await listRegistrarRegistrations(x.userB.id)).length,1);
});

test("household members preserve relationship, access, profile, and ownership boundaries", async () => {
  const x = await setup();
  const guardian = await addOwnedHouseholdMember(x.userA.id, { kind: "guardian", firstName: "Second", lastName: "Guardian", email: "second-guardian@example.test", phone: "555-0100" });
  const camper = await addOwnedHouseholdMember(x.userA.id, { kind: "camper", firstName: "New", lastName: "Camper", birthDate: new Date("2015-06-15T00:00:00.000Z"), grade: "5" });
  const guardianMembership = await prisma.householdMember.findUniqueOrThrow({ where: { householdId_personId: { householdId: x.householdA.id, personId: guardian.id } }, include: { person: { include: { camperProfile: true } } } });
  assert.equal(guardianMembership.relationship, HouseholdRelationship.GUARDIAN);
  assert.equal(guardianMembership.hasPortalAccess, false);
  assert.equal(guardianMembership.person.camperProfile, null);
  const camperMembership = await prisma.householdMember.findUniqueOrThrow({ where: { householdId_personId: { householdId: x.householdA.id, personId: camper.id } }, include: { person: { include: { camperProfile: true } } } });
  assert.equal(camperMembership.relationship, HouseholdRelationship.CAMPER);
  assert.equal(camperMembership.hasPortalAccess, false);
  assert.equal(camperMembership.person.camperProfile?.grade, "5");
  assert.equal((await getOwnedHouseholdMember(x.userA.id, camper.id))?.person.id, camper.id);
  assert.equal(await getOwnedHouseholdMember(x.userB.id, camper.id), null);
});

test("registration submission is idempotent, read-only after submit, and registrar reviewed", async () => {
  const x = await setup();
  const answers = { camperName: "Camper A", guardianName: "Parent A", insurance: "restricted-health-answer" };
  await saveOwnedDraft(x.userA.id, { sessionId: x.session.id, camperId: x.camperA.id, answers });
  const firstSubmit = await submitOwnedRegistration(x.userA.id, { sessionId: x.session.id, camperId: x.camperA.id, answers });
  assert.equal(firstSubmit.status, RegistrationStatus.SUBMITTED);
  const secondSubmit = await submitOwnedRegistration(x.userA.id, { sessionId: x.session.id, camperId: x.camperA.id, answers });
  assert.equal(secondSubmit.registrationId, firstSubmit.registrationId);
  assert.equal(await prisma.registration.count(), 1);
  assert.equal((await prisma.formSubmission.findFirstOrThrow({ where: { registrationId: firstSubmit.registrationId } })).status, "submitted");
  await assert.rejects(() => saveOwnedDraft(x.userA.id, { sessionId: x.session.id, camperId: x.camperA.id, answers: { camperName: "Changed" } }), AuthorizationError);
  await assert.rejects(() => submitOwnedRegistration(x.userA.id, { sessionId: x.session.id, camperId: x.camperB.id, answers }), AuthorizationError);
  await assert.rejects(() => transitionRegistrarRegistration(x.userA.id, firstSubmit.registrationId, RegistrationStatus.APPROVED), AuthorizationError);

  await makeRegistrar(x.userB.id);
  const review = await getRegistrarRegistration(x.userB.id, firstSubmit.registrationId);
  assert.equal(review?.reviewAnswers.camperName, "Camper A");
  assert.equal("insurance" in (review?.reviewAnswers ?? {}), false);
  await transitionRegistrarRegistration(x.userB.id, firstSubmit.registrationId, RegistrationStatus.NEEDS_INFORMATION, "Need a clarification");
  assert.equal((await loadOwnedDraft(x.userA.id, x.session.id, x.camperA.id))?.status, RegistrationStatus.NEEDS_INFORMATION);
  await saveOwnedDraft(x.userA.id, { sessionId: x.session.id, camperId: x.camperA.id, answers: { ...answers, guardianPhone: "555-0101" } });
  await submitOwnedRegistration(x.userA.id, { sessionId: x.session.id, camperId: x.camperA.id, answers: { ...answers, guardianPhone: "555-0101" } });
  await transitionRegistrarRegistration(x.userB.id, firstSubmit.registrationId, RegistrationStatus.APPROVED);
  const approved = await prisma.registration.findUniqueOrThrow({ where: { id: firstSubmit.registrationId } });
  assert.equal(approved.status, RegistrationStatus.APPROVED);
  assert.equal(approved.approvedBy, x.userB.id);
  assert.ok(approved.approvedAt);
});

test("Better Auth signs up, signs in, creates an auth session, and bootstraps a household", async () => {
  await setup();
  const email="auth-parent@example.test";
  const password="Fictitious-password-123";
  const signUp=await auth.api.signUpEmail({ body:{name:"Auth Parent",email,password} });
  assert.equal(signUp.user.email,email);
  assert.equal(await prisma.user.count({where:{email}}),1);
  assert.equal(await prisma.account.count({where:{userId:signUp.user.id,providerId:"credential"}}),1);
  const signIn=await auth.api.signInEmail({body:{email,password}});
  assert.ok(signIn.token);
  const persistedSession=await prisma.authSession.findUnique({where:{token:signIn.token}});
  assert.ok(persistedSession);
  assert.equal(persistedSession.userId,signUp.user.id);
  const user=await ensurePortalProfile({id:signUp.user.id,email,name:"Auth Parent"});
  assert.ok(user.personId);
});

test.after(async () => prisma.$disconnect());
