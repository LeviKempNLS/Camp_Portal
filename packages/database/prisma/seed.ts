import { FinancialEntryType, HouseholdRelationship, PaymentMethod, PrismaClient, RegistrationStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function person(email: string, firstName: string, lastName: string, birthDate?: Date) {
  return prisma.person.upsert({
    where: { email },
    update: { firstName, lastName, birthDate },
    create: { email, firstName, lastName, birthDate },
  });
}

async function syncRolePermissions(role: { id: string }, keys: string[]) {
  const permissions = await prisma.permission.findMany({ where: { key: { in: keys } } });
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await Promise.all(permissions.map(permission => prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } })));
}

async function createFinancialEntryOnce(sourceKey: string, data: Parameters<typeof prisma.financialEntry.create>[0]["data"]) {
  const existing = await prisma.financialEntry.findUnique({ where: { sourceKey } });
  if (existing) return existing;
  return prisma.financialEntry.create({ data: { ...data, sourceKey } });
}

async function main() {
  const roles = await Promise.all([
    ["parent", "Parent"],
    ["registrar", "Registrar"],
    ["counselor", "Counselor"],
    ["group_director", "Group Director"],
    ["medical", "Medical"],
    ["camp_director", "Camp Director"],
    ["system_administrator", "System Administrator"],
  ].map(([key, name]) => prisma.role.upsert({ where: { key }, update: { name }, create: { key, name } })));

  await Promise.all([
    ["household.read", "Read an owned household"],
    ["household.write", "Update an owned household"],
    ["registration.read.all", "Read registrations across demo households"],
    ["registration.approve", "Review and change registration status"],
    ["camp.configure", "Configure camp seasons and sessions"],
    ["operations.manage", "Manage camp groups, cabins and staff assignments"],
    ["roster.read", "Read the non-sensitive operational camper roster"],
    ["roster.manage", "Assign active campers to camp groups and cabins"],
    ["finance.read", "Read restricted registration finance records"],
    ["finance.record", "Record and reverse restricted registration finance entries"],
  ].map(([key, description]) => prisma.permission.upsert({ where: { key }, update: { description }, create: { key, description } })));

  const registrar = roles.find(role => role.key === "registrar");
  const director = roles.find(role => role.key === "camp_director");
  const administrator = roles.find(role => role.key === "system_administrator");
  if (registrar) await syncRolePermissions(registrar, ["registration.read.all", "registration.approve", "camp.configure", "roster.read", "roster.manage", "finance.read", "finance.record"]);
  if (director) await syncRolePermissions(director, ["camp.configure", "operations.manage", "roster.read", "roster.manage"]);
  if (administrator) await syncRolePermissions(administrator, ["household.read", "household.write", "registration.read.all", "registration.approve", "camp.configure", "operations.manage", "roster.read", "roster.manage", "finance.read", "finance.record"]);

  const organization = await prisma.organization.upsert({
    where: { slug: "faith-adventures-demo" },
    update: { name: "Faith Adventures Camp (Demo)", timezone: "America/Chicago" },
    create: { name: "Faith Adventures Camp (Demo)", slug: "faith-adventures-demo", timezone: "America/Chicago", settings: { demo: true } },
  });
  const season = await prisma.season.upsert({
    where: { organizationId_year: { organizationId: organization.id, year: 2030 } },
    update: { name: "2030 Demonstration Season", status: "open" },
    create: { organizationId: organization.id, name: "2030 Demonstration Season", year: 2030, status: "open" },
  });
  const foundSession = await prisma.session.findFirst({ where: { seasonId: season.id, name: "Demo Junior Camp" } });
  const session = foundSession
    ? await prisma.session.update({ where: { id: foundSession.id }, data: { status: "open", capacity: 130 } })
    : await prisma.session.create({
        data: {
          seasonId: season.id,
          name: "Demo Junior Camp",
          description: "Fictitious development data only.",
          startDate: new Date("2030-07-15T14:00:00.000Z"),
          endDate: new Date("2030-07-19T17:00:00.000Z"),
          capacity: 130,
          minimumGrade: "3",
          maximumGrade: "5",
          basePrice: "250.00",
          depositAmount: "50.00",
          status: "open",
        },
      });

  const juniorGroup = await prisma.campGroup.upsert({
    where: { sessionId_name: { sessionId: session.id, name: "Junior Group" } },
    update: { capacity: 60 },
    create: { sessionId: session.id, name: "Junior Group", capacity: 60 },
  });
  const [cabinA, cabinB] = await Promise.all([
    prisma.cabin.upsert({
      where: { sessionId_name: { sessionId: session.id, name: "Cabin A" } },
      update: { groupId: juniorGroup.id, capacity: 10 },
      create: { sessionId: session.id, groupId: juniorGroup.id, name: "Cabin A", capacity: 10 },
    }),
    prisma.cabin.upsert({
      where: { sessionId_name: { sessionId: session.id, name: "Cabin B" } },
      update: { groupId: juniorGroup.id, capacity: 10 },
      create: { sessionId: session.id, groupId: juniorGroup.id, name: "Cabin B", capacity: 10 },
    }),
  ]);

  const [scholarshipA, scholarshipB] = await Promise.all([
    prisma.scholarshipProgram.upsert({
      where: { organizationId_name: { organizationId: organization.id, name: "Camp Scholarship A" } },
      update: { active: true },
      create: { organizationId: organization.id, name: "Camp Scholarship A" },
    }),
    prisma.scholarshipProgram.upsert({
      where: { organizationId_name: { organizationId: organization.id, name: "Camp Scholarship B" } },
      update: { active: true },
      create: { organizationId: organization.id, name: "Camp Scholarship B" },
    }),
  ]);
  const demoChurch = await prisma.church.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: "Demo Community Church" } },
    update: { active: true, contactName: "Fictitious Church Treasurer", contactEmail: "treasurer.demo@example.test" },
    create: { organizationId: organization.id, name: "Demo Community Church", contactName: "Fictitious Church Treasurer", contactEmail: "treasurer.demo@example.test" },
  });

  const demoForm = await prisma.formDefinition.upsert({
    where: { organizationId_key: { organizationId: organization.id, key: "demo-roster-seed" } },
    update: { name: "Demo Roster Seed" },
    create: { organizationId: organization.id, key: "demo-roster-seed", name: "Demo Roster Seed" },
  });
  const demoFormVersion = await prisma.formVersion.upsert({
    where: { formDefinitionId_version: { formDefinitionId: demoForm.id, version: 1 } },
    update: { schema: { id: "demo-roster-seed", sections: [] }, isPublished: true },
    create: { formDefinitionId: demoForm.id, version: 1, schema: { id: "demo-roster-seed", sections: [] }, isPublished: true },
  });
  await prisma.formDefinition.update({ where: { id: demoForm.id }, data: { activeVersionId: demoFormVersion.id } });

  const guardian = await person("demo.guardian@example.test", "Casey", "Demo");
  const campers = await Promise.all([
    person("avery.demo@example.test", "Avery", "Demo", new Date("2020-05-12T00:00:00.000Z")),
    person("blake.demo@example.test", "Blake", "Demo", new Date("2019-08-03T00:00:00.000Z")),
  ]);
  const foundHousehold = await prisma.household.findFirst({ where: { displayName: "Demo Household - Delete or Reset" } });
  const household = foundHousehold
    ? await prisma.household.update({ where: { id: foundHousehold.id }, data: { status: "demo" } })
    : await prisma.household.create({ data: { displayName: "Demo Household - Delete or Reset", status: "demo", primaryAddress: { city: "Exampleville", state: "MO", postalCode: "00000" } } });

  await prisma.householdMember.upsert({
    where: { householdId_personId: { householdId: household.id, personId: guardian.id } },
    update: { relationship: HouseholdRelationship.GUARDIAN, isPrimaryContact: true, hasPortalAccess: false },
    create: { householdId: household.id, personId: guardian.id, relationship: HouseholdRelationship.GUARDIAN, isPrimaryContact: true },
  });

  for (const [index, camper] of campers.entries()) {
    await prisma.householdMember.upsert({
      where: { householdId_personId: { householdId: household.id, personId: camper.id } },
      update: { relationship: HouseholdRelationship.CAMPER },
      create: { householdId: household.id, personId: camper.id, relationship: HouseholdRelationship.CAMPER },
    });
    const grade = index === 0 ? "4" : "5";
    await prisma.camperProfile.upsert({
      where: { personId: camper.id },
      update: { grade, school: "Demo Elementary" },
      create: { personId: camper.id, grade, school: "Demo Elementary" },
    });
    const registration = await prisma.registration.upsert({
      where: { sessionId_personId: { sessionId: session.id, personId: camper.id } },
      update: {
        householdId: household.id,
        status: RegistrationStatus.SUBMITTED,
        submittedAt: new Date("2030-03-01T15:00:00.000Z"),
        approvedAt: null,
        approvedBy: null,
        waitlistPosition: null,
      },
      create: { sessionId: session.id, personId: camper.id, householdId: household.id, status: RegistrationStatus.SUBMITTED, submittedAt: new Date("2030-03-01T15:00:00.000Z") },
    });
    await prisma.formSubmission.upsert({
      where: { registrationId_formVersionId: { registrationId: registration.id, formVersionId: demoFormVersion.id } },
      update: { answers: { session: "jyf", grade, shirtSize: index === 0 ? "Youth M" : "Adult S" }, status: "submitted", completedAt: new Date("2030-03-01T15:00:00.000Z") },
      create: { registrationId: registration.id, formVersionId: demoFormVersion.id, answers: { session: "jyf", grade, shirtSize: index === 0 ? "Youth M" : "Adult S" }, status: "submitted", completedAt: new Date("2030-03-01T15:00:00.000Z") },
    });
    const cabin = index === 0 ? cabinA : cabinB;
    await prisma.camperPlacement.upsert({
      where: { registrationId: registration.id },
      update: { sessionId: session.id, groupId: juniorGroup.id, cabinId: cabin.id },
      create: { registrationId: registration.id, sessionId: session.id, groupId: juniorGroup.id, cabinId: cabin.id },
    });

    await createFinancialEntryOnce(`registration-charge:${registration.id}`, {
      organizationId: organization.id,
      registrationId: registration.id,
      type: FinancialEntryType.CHARGE,
      amount: session.basePrice,
    });
    if (index === 0) {
      await createFinancialEntryOnce(`demo-scholarship:${registration.id}`, {
        organizationId: organization.id,
        registrationId: registration.id,
        type: FinancialEntryType.SCHOLARSHIP_CREDIT,
        amount: "50.00",
        scholarshipProgramId: scholarshipA.id,
        note: "Fictitious scholarship example for registrar testing.",
      });
    } else {
      await createFinancialEntryOnce(`demo-church-commitment:${registration.id}`, {
        organizationId: organization.id,
        registrationId: registration.id,
        type: FinancialEntryType.CHURCH_COMMITMENT,
        amount: "125.00",
        churchId: demoChurch.id,
        note: "Fictitious church sponsorship commitment.",
      });
      await createFinancialEntryOnce(`demo-church-payment:${registration.id}`, {
        organizationId: organization.id,
        registrationId: registration.id,
        type: FinancialEntryType.CHURCH_PAYMENT,
        amount: "75.00",
        method: PaymentMethod.CHECK,
        churchId: demoChurch.id,
        reference: "DEMO-CHECK-1001",
        note: "Fictitious partial church payment.",
      });
    }
  }
  void scholarshipB;
  console.log("Seeded fictitious Faith Adventures Camp development data.");
}

main()
  .catch(error => { console.error("Demo seed failed.", error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
