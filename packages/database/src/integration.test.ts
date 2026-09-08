import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, HouseholdRelationship } from "@prisma/client";
import { AuthorizationError, assertHouseholdAccess, listRegistrarRegistrations, loadOwnedDraft, saveOwnedDraft } from "./portal.ts";

const prisma = new PrismaClient();
async function setup() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditEvent", "FormSubmission", "FormVersion", "FormDefinition", "Registration", "CamperProfile", "HouseholdMember", "Household", "Session", "Season", "Organization", "UserRole", "RolePermission", "Permission", "Role", "Account", "Verification", "User", "Person" CASCADE');
  const org = await prisma.organization.create({ data: { name: "Test Organization", slug: "test-org" } });
  const season = await prisma.season.create({ data: { organizationId: org.id, name: "Test", year: 2099 } });
  const session = await prisma.session.create({ data: { seasonId: season.id, name: "Test Session", startDate: new Date(), endDate: new Date(), capacity: 10, basePrice: "0", status: "open" } });
  const parentA = await prisma.person.create({ data: { firstName: "Parent", lastName: "A", email: "parent-a@example.test" } });
  const parentB = await prisma.person.create({ data: { firstName: "Parent", lastName: "B", email: "parent-b@example.test" } });
  const camperA = await prisma.person.create({ data: { firstName: "Camper", lastName: "A" } }); const camperB = await prisma.person.create({ data: { firstName: "Camper", lastName: "B" } });
  const userA = await prisma.user.create({ data: { id: "user-a", name: "Parent A", email: "auth-a@example.test", personId: parentA.id } }); const userB = await prisma.user.create({ data: { id: "user-b", name: "Parent B", email: "auth-b@example.test", personId: parentB.id } });
  const householdA = await prisma.household.create({ data: { displayName: "Household A" } }); const householdB = await prisma.household.create({ data: { displayName: "Household B" } });
  await prisma.householdMember.createMany({ data: [{ householdId: householdA.id, personId: parentA.id, relationship: HouseholdRelationship.GUARDIAN, hasPortalAccess: true }, { householdId: householdA.id, personId: camperA.id, relationship: HouseholdRelationship.CAMPER }, { householdId: householdB.id, personId: parentB.id, relationship: HouseholdRelationship.GUARDIAN, hasPortalAccess: true }, { householdId: householdB.id, personId: camperB.id, relationship: HouseholdRelationship.CAMPER }] });
  return { userA, userB, householdA, householdB, camperA, camperB, session };
}
test("ownership, draft resume, and duplicate autosave are enforced", async () => { const x = await setup(); await assert.rejects(() => assertHouseholdAccess(x.userA.id, x.householdB.id), AuthorizationError); await assert.rejects(() => saveOwnedDraft(x.userA.id, { sessionId: x.session.id, camperId: x.camperB.id, answers: {} }), AuthorizationError); await saveOwnedDraft(x.userA.id, { sessionId: x.session.id, camperId: x.camperA.id, answers: { shirtSize: "M" } }); await saveOwnedDraft(x.userA.id, { sessionId: x.session.id, camperId: x.camperA.id, answers: { shirtSize: "L" } }); const draft = await loadOwnedDraft(x.userA.id, x.session.id, x.camperA.id); assert.equal((draft?.answers as { shirtSize: string }).shirtSize, "L"); assert.equal(await prisma.registration.count(), 1); const role=await prisma.role.create({data:{key:"registrar",name:"Registrar"}}); await prisma.userRole.create({data:{userId:x.userB.id,roleId:role.id}}); assert.equal((await listRegistrarRegistrations(x.userB.id)).length,1); });
test.after(async () => prisma.$disconnect());
