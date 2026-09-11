import { HouseholdRelationship, PrismaClient, RegistrationStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function person(email: string, firstName: string, lastName: string, birthDate?: Date) {
  return prisma.person.upsert({
    where: { email },
    update: { firstName, lastName, birthDate },
    create: { email, firstName, lastName, birthDate },
  });
}

async function main() {
  const roles = await Promise.all([
    ["parent", "Parent"], ["registrar", "Registrar"], ["camp_director", "Camp Director"], ["system_administrator", "System Administrator"],
  ].map(([key, name]) => prisma.role.upsert({ where: { key }, update: { name }, create: { key, name } })));
  await Promise.all([
    ["household.read", "Read an owned household"],
    ["household.write", "Update an owned household"],
    ["registration.read.all", "Read registrations across demo households"],
    ["registration.approve", "Review and change registration status"],
  ].map(([key, description]) => prisma.permission.upsert({ where: { key }, update: { description }, create: { key, description } })));
  const registrar = roles.find(role => role.key === "registrar");
  const registrarPermissions = await prisma.permission.findMany({ where: { key: { in: ["registration.read.all", "registration.approve"] } } });
  if (registrar) await Promise.all(registrarPermissions.map(permission => prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: registrar.id, permissionId: permission.id } },
    update: {},
    create: { roleId: registrar.id, permissionId: permission.id },
  })));
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
          seasonId: season.id, name: "Demo Junior Camp", description: "Fictitious development data only.",
          startDate: new Date("2030-07-15T14:00:00.000Z"), endDate: new Date("2030-07-19T17:00:00.000Z"),
          capacity: 130, minimumGrade: "3", maximumGrade: "5", basePrice: "250.00", depositAmount: "50.00", status: "open",
        },
      });
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
  await Promise.all(campers.map((camper, index) => Promise.all([
    prisma.householdMember.upsert({
      where: { householdId_personId: { householdId: household.id, personId: camper.id } },
      update: { relationship: HouseholdRelationship.CAMPER },
      create: { householdId: household.id, personId: camper.id, relationship: HouseholdRelationship.CAMPER },
    }),
    prisma.camperProfile.upsert({
      where: { personId: camper.id },
      update: { grade: index === 0 ? "4" : "5", school: "Demo Elementary" },
      create: { personId: camper.id, grade: index === 0 ? "4" : "5", school: "Demo Elementary" },
    }),
    prisma.registration.upsert({
      where: { sessionId_personId: { sessionId: session.id, personId: camper.id } },
      update: { householdId: household.id, status: RegistrationStatus.DRAFT },
      create: { sessionId: session.id, personId: camper.id, householdId: household.id, status: RegistrationStatus.DRAFT },
    }),
  ])));
  console.log("Seeded fictitious Faith Adventures Camp development data.");
}

main()
  .catch(() => { console.error("Demo seed failed."); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
