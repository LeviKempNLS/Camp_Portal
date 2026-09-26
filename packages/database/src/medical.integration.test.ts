import test from "node:test";
import assert from "node:assert/strict";
import { HouseholdRelationship, PrismaClient, RegistrationStatus } from "@prisma/client";
import { listMedicalWorkspace, MedicalAuthorizationError } from "./medical.ts";

const prisma = new PrismaClient();

async function setup() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "OutboxMessage", "CampAttendance", "FinancialEntry", "ScholarshipProgram", "Church", "CamperPlacement", "StaffAssignment", "Cabin", "CampGroup", "PortalInvitation", "AuditEvent", "FormSubmission", "FormVersion", "FormDefinition", "Registration", "CamperProfile", "HouseholdMember", "Household", "Session", "Season", "Organization", "UserRole", "RolePermission", "Permission", "Role", "Account", "AuthSession", "Verification", "User", "Person" CASCADE');
  const organization = await prisma.organization.create({ data: { name: "Medical Camp", slug: "medical-camp" } });
  const season = await prisma.season.create({ data: { organizationId: organization.id, name: "2039", year: 2039, status: "open" } });
  const session = await prisma.session.create({ data: { seasonId: season.id, name: "Chi Rho", startDate: new Date("2039-07-01T14:00:00Z"), endDate: new Date("2039-07-05T17:00:00Z"), capacity: 100, basePrice: "250.00", status: "open" } });
  const household = await prisma.household.create({ data: { displayName: "Medical Household" } });
  const camper = await prisma.person.create({ data: { firstName: "Fictitious", lastName: "Camper", birthDate: new Date("2026-05-01T00:00:00Z") } });
  await prisma.householdMember.create({ data: { householdId: household.id, personId: camper.id, relationship: HouseholdRelationship.CAMPER } });
  const registration = await prisma.registration.create({ data: { sessionId: session.id, personId: camper.id, householdId: household.id, status: RegistrationStatus.APPROVED } });
  const definition = await prisma.formDefinition.create({ data: { organizationId: organization.id, key: "registration", name: "Registration" } });
  const version = await prisma.formVersion.create({ data: { formDefinitionId: definition.id, version: 1, schema: { id: "medical-test" }, isPublished: true } });
  await prisma.formSubmission.create({ data: { registrationId: registration.id, formVersionId: version.id, status: "submitted", answers: {
    guardianName: "Demo Guardian", guardianPhone: "555-0100", emergencyContact: "Demo Aunt 555-0199",
    insurance: "DEMO-INSURANCE", allergies: "DEMO-ALLERGY", dietary: "DEMO-DIET", medications: "DEMO-MEDICATION", healthNotes: "DEMO-HEALTH-NOTE",
    guardianEmail: "NON-MEDICAL-CONTACT-SECRET", cabinMate: "NON-MEDICAL-CABIN-SECRET", financeSecret: "MONEY-SECRET",
  } } });

  const permission = await prisma.permission.create({ data: { key: "medical.read", description: "medical" } });
  const medicalRole = await prisma.role.create({ data: { key: "medical", name: "Medical" } });
  const registrarRole = await prisma.role.create({ data: { key: "registrar", name: "Registrar" } });
  await prisma.rolePermission.create({ data: { roleId: medicalRole.id, permissionId: permission.id } });
  const medical = await prisma.user.create({ data: { id: "medical-user", name: "Medical User", email: "medical@example.test", status: "ACTIVE" } });
  const registrar = await prisma.user.create({ data: { id: "medical-registrar", name: "Registrar", email: "registrar-medical@example.test", status: "ACTIVE" } });
  await prisma.userRole.createMany({ data: [{ userId: medical.id, roleId: medicalRole.id }, { userId: registrar.id, roleId: registrarRole.id }] });
  return { medical, registrar };
}

test("medical workspace is permission-isolated and projects only care information", async () => {
  const x = await setup();
  await assert.rejects(() => listMedicalWorkspace(x.registrar.id), MedicalAuthorizationError);
  const result = await listMedicalWorkspace(x.medical.id);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].insurance, "DEMO-INSURANCE");
  assert.equal(result.rows[0].allergies, "DEMO-ALLERGY");
  assert.equal(result.rows[0].medications, "DEMO-MEDICATION");
  assert.equal(result.rows[0].guardianPhone, "555-0100");
  const serialized = JSON.stringify(result);
  for (const secret of ["NON-MEDICAL-CONTACT-SECRET", "NON-MEDICAL-CABIN-SECRET", "MONEY-SECRET", "answers"]) assert.equal(serialized.includes(secret), false);
  assert.ok(await prisma.auditEvent.findFirst({ where: { action: "medical.workspace_viewed", actorUserId: x.medical.id } }));
});

test.after(async () => prisma.$disconnect());
