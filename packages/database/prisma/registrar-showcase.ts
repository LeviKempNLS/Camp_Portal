import {
  FinancialEntryType, HouseholdRelationship, OutboxAudienceType, OutboxMessageStatus,
  PaymentMethod, PrismaClient, RegistrationStatus, StaffRole, StaffAssignmentStatus
} from "@prisma/client";

/**
 * Explicit fictitious demo dataset for registrar evaluation.
 * All identifiers live under @example.test; repeated startup is non-destructive.
 * Does NOT create authenticatable users or reset any existing registration/ledger.
 */
export async function seedRegistrarShowcase(prisma: PrismaClient, organizationId: string, seasonId: string) {
  const groups = [
    { name: "Primary Camp (grades 1–3)", code: "primary", grade: 2, price: "175.00", start: "2030-06-10", shirt: ["Youth S", "Youth M"] },
    { name: "Junior Camp (grades 4–6)", code: "junior", grade: 5, price: "225.00", start: "2030-06-24", shirt: ["Youth M", "Youth L", "Adult S"] },
    { name: "Teen Camp (grades 7–9)", code: "teen", grade: 8, price: "275.00", start: "2030-07-08", shirt: ["Adult S", "Adult M", "Adult L"] },
    { name: "Senior High Camp (grades 10–12)", code: "senior", grade: 11, price: "300.00", start: "2030-07-22", shirt: ["Adult M", "Adult L", "Adult XL"] },
  ] as const;
  const sessionData = [];
  for (const spec of groups) {
    let session = await prisma.session.findFirst({ where: { seasonId, name: spec.name } });
    if (!session) {
      session = await prisma.session.create({ data: {
        seasonId, name: spec.name, description: "Fictitious registrar evaluation camp",
        startDate: new Date(spec.start + "T14:00:00Z"),
        endDate: new Date(new Date(spec.start + "T14:00:00Z").getTime() + 4 * 86400000),
        capacity: 80, basePrice: spec.price, waitlistEnabled: true, status: "open"
      } });
    }
    const group = await prisma.campGroup.upsert({
      where: { sessionId_name: { sessionId: session.id, name: spec.name } },
      update: {}, create: { sessionId: session.id, name: spec.name, capacity: 75 }
    });
    const cabins = [];
    for (const label of ["Pine", "Oak", "Cedar"]) {
      const name = spec.code.toUpperCase() + " " + label;
      cabins.push(await prisma.cabin.upsert({
        where: { sessionId_name: { sessionId: session.id, name } },
        update: {}, create: { sessionId: session.id, name, groupId: group.id, capacity: 16 }
      }));
    }
    sessionData.push({ ...spec, session, group, cabins });
  }

  const churchNames = ["Sample First Christian Church", "Example Community Chapel", "Fictitious Northside Church"];
  const churches = [];
  for (const name of churchNames) churches.push(await prisma.church.upsert({
    where: { organizationId_name: { organizationId, name } }, update: {},
    create: { organizationId, name, contactName: "Demo treasurer", contactEmail: "treasurer." + churches.length + "@example.test" }
  }));
  const scholarships = [];
  for (const name of ["Camp Scholarship A", "Camp Scholarship B"]) scholarships.push(await prisma.scholarshipProgram.upsert({
    where: { organizationId_name: { organizationId, name } }, update: {}, create: { organizationId, name }
  }));

  const form = await prisma.formDefinition.upsert({
    where: { organizationId_key: { organizationId, key: "registrar-showcase-fixtures" } },
    update: {}, create: { organizationId, key: "registrar-showcase-fixtures", name: "Registrar showcase demo responses" }
  });
  const version = await prisma.formVersion.upsert({
    where: { formDefinitionId_version: { formDefinitionId: form.id, version: 1 } },
    update: {}, create: { formDefinitionId: form.id, version: 1, schema: { id: "registrar-showcase-fixtures", sections: [] }, isPublished: true }
  });

  const families = [
    { family: "Anderson", guardian: "Morgan", kids: [["Avery", 0], ["Jordan", 1], ["Taylor", 2]] },
    { family: "Bennett", guardian: "Riley", kids: [["Casey", 0]] },
    { family: "Carter", guardian: "Alex", kids: [["Parker", 1], ["Quinn", 3]] },
    { family: "Davis", guardian: "Sam", kids: [["Rowan", 0], ["Emerson", 1], ["Hayden", 2], ["Finley", 3]] },
    { family: "Ellis", guardian: "Jamie", kids: [["Reese", 2], ["Skyler", 3]] },
    { family: "Foster", guardian: "Drew", kids: [["Charlie", 1]] },
    { family: "Garcia", guardian: "Blair", kids: [["Dakota", 0], ["Kennedy", 2], ["Sage", 3]] },
    { family: "Hughes", guardian: "Kendall", kids: [["Logan", 3], ["Robin", 2]] },
    { family: "Irwin", guardian: "Payton", kids: [["Micah", 1], ["Noel", 0], ["Bailey", 2]] },
    { family: "James", guardian: "Harper", kids: [["Elliot", 3]] }
  ] as const;

  let created = 0;
  let registrationIndex = 0;
  const outboxEmails: string[] = [];
  for (const [familyIndex, family] of families.entries()) {
    const email = "showcase." + family.family.toLowerCase() + "@example.test";
    const guardian = await prisma.person.upsert({
      where: { email }, update: {}, create: {
        firstName: family.guardian, lastName: family.family, email, phone: "555-010-" + String(familyIndex).padStart(3,"0")
      }
    });
    outboxEmails.push(email);
    let household = await prisma.household.findFirst({ where: { displayName: "DEMO " + family.family + " Household" } });
    if (!household) household = await prisma.household.create({ data: {
      displayName: "DEMO " + family.family + " Household", status: "demo",
      primaryAddress: { city: "Fictitiousville", state: "MO", postalCode: "00000" }
    } });
    await prisma.householdMember.upsert({
      where: { householdId_personId: { householdId: household.id, personId: guardian.id } },
      update: {}, create: { householdId: household.id, personId: guardian.id, relationship: HouseholdRelationship.GUARDIAN, isPrimaryContact: true, hasPortalAccess: false }
    });

    for (const [childIndex, child] of family.kids.entries()) {
      const spec = sessionData[child[1]];
      const childEmail = "showcase." + family.family.toLowerCase() + "." + child[0].toLowerCase() + "@example.test";
      const camper = await prisma.person.upsert({
        where: { email: childEmail }, update: {}, create: {
          email: childEmail, firstName: child[0], lastName: family.family,
          birthDate: new Date((2030 - spec.grade - 6) + "-05-15T00:00:00Z")
        }
      });
      await prisma.householdMember.upsert({
        where: { householdId_personId: { householdId: household.id, personId: camper.id } },
        update: {}, create: { householdId: household.id, personId: camper.id, relationship: HouseholdRelationship.CAMPER }
      });
      await prisma.camperProfile.upsert({
        where: { personId: camper.id }, update: {}, create: { personId: camper.id, grade: String(spec.grade), gender: registrationIndex % 2 ? "Male" : "Female", school: "Demo District" }
      });
      const statuses = [RegistrationStatus.APPROVED, RegistrationStatus.SUBMITTED, RegistrationStatus.APPROVED,
        RegistrationStatus.CHECKED_IN, RegistrationStatus.WAITLISTED, RegistrationStatus.NEEDS_INFORMATION];
      const status = statuses[registrationIndex % statuses.length];
      const registration = await prisma.registration.upsert({
        where: { sessionId_personId: { sessionId: spec.session.id, personId: camper.id } },
        update: {}, create: {
          sessionId: spec.session.id, personId: camper.id, householdId: household.id, status,
          submittedAt: new Date("2030-03-04T16:00:00Z"),
          approvedAt: [RegistrationStatus.APPROVED,RegistrationStatus.CHECKED_IN].includes(status) ? new Date("2030-03-08T16:00:00Z") : null,
          waitlistPosition: status === RegistrationStatus.WAITLISTED ? registrationIndex + 1 : null
        }
      });
      const answers = {
        grade: String(spec.grade), shirtSize: spec.shirt[(registrationIndex + childIndex) % spec.shirt.length],
        session: spec.code, guardianName: family.guardian + " " + family.family,
        guardianEmail: email, guardianPhone: "555-010-" + String(familyIndex).padStart(3, "0"),
        address: "123 Demo Street, Fictitiousville, MO 00000",
        firstTime: registrationIndex % 3 === 0, swims: true,
        allergies: registrationIndex % 5 === 0 ? "DEMO: example food allergy" : "",
        dietary: registrationIndex % 4 === 0 ? "DEMO: vegetarian" : "",
        medications: registrationIndex % 6 === 0 ? "DEMO: sample medication record" : "",
        healthNotes: "FICTITIOUS DEMO ONLY", emergencyContact: "Demo Emergency Contact",
        insurance: "DEMO INSURANCE - NOT REAL"
      };
      const submission = await prisma.formSubmission.findUnique({ where: {
        registrationId_formVersionId: { registrationId: registration.id, formVersionId: version.id }
      } });
      if (!submission) {
        await prisma.formSubmission.create({ data: {
          registrationId: registration.id, formVersionId: version.id, answers,
          status: "submitted", completedAt: new Date("2030-03-04T16:00:00Z")
        } });
      }
      // Leave a few unassigned so Kim can test placement workflow.
      if (registrationIndex % 6 !== 4) {
        const cabin = spec.cabins[registrationIndex % spec.cabins.length];
        await prisma.camperPlacement.upsert({
          where: { registrationId: registration.id }, update: {},
          create: { registrationId: registration.id, sessionId: spec.session.id, groupId: spec.group.id, cabinId: cabin.id }
        });
      }
      if (status === RegistrationStatus.CHECKED_IN) await prisma.campAttendance.upsert({
        where: { registrationId: registration.id }, update: {},
        create: { registrationId: registration.id, sessionId: spec.session.id, checkedInAt: new Date("2030-06-10T15:00:00Z"), notes: "FICTITIOUS DEMO CHECK-IN" }
      });
      async function entryOnce(key: string, type: FinancialEntryType, amount: string, extra: object = {}) {
        if (!await prisma.financialEntry.findUnique({ where: { sourceKey: key } })) await prisma.financialEntry.create({
          data: { organizationId, registrationId: registration.id, type, amount, sourceKey: key, ...extra }
        });
      }
      await entryOnce("showcase-charge-" + registration.id, FinancialEntryType.CHARGE, spec.price);
      switch (registrationIndex % 6) {
        case 0:
          await entryOnce("showcase-family-paid-" + registration.id, FinancialEntryType.PAYMENT, spec.price, { method: PaymentMethod.CHECK, reference: "DEMO-PAID-" + registrationIndex });
          break;
        case 1:
          await entryOnce("showcase-family-partial-" + registration.id, FinancialEntryType.PAYMENT, "50.00", { method: PaymentMethod.CASH });
          break;
        case 2:
          await entryOnce("showcase-scholarship-" + registration.id, FinancialEntryType.SCHOLARSHIP_CREDIT, "100.00", { scholarshipProgramId: scholarships[registrationIndex % 2].id });
          break;
        case 3:
          await entryOnce("showcase-church-commit-" + registration.id, FinancialEntryType.CHURCH_COMMITMENT, spec.price, { churchId: churches[registrationIndex % churches.length].id });
          await entryOnce("showcase-church-payment-" + registration.id, FinancialEntryType.CHURCH_PAYMENT, "75.00", { churchId: churches[registrationIndex % churches.length].id, method: PaymentMethod.CHECK });
          break;
        case 4:
          await entryOnce("showcase-scholarship2-" + registration.id, FinancialEntryType.SCHOLARSHIP_CREDIT, "75.00", { scholarshipProgramId: scholarships[(registrationIndex + 1) % 2].id });
          await entryOnce("showcase-church-commit2-" + registration.id, FinancialEntryType.CHURCH_COMMITMENT, "100.00", { churchId: churches[0].id });
          break;
      }
      registrationIndex++;
      created++;
    }
  }

  const staff = [
    ["Marlowe", "Sample", StaffRole.CAMP_DIRECTOR, 0, null],
    ["Pat", "Example", StaffRole.GROUP_DIRECTOR, 0, null],
    ["Terry", "Fiction", StaffRole.GROUP_DIRECTOR, 2, null],
    ["Ash", "Demo", StaffRole.COUNSELOR, 0, 0],
    ["Lee", "Placeholder", StaffRole.COUNSELOR, 0, 1],
    ["River", "Sample", StaffRole.COUNSELOR, 1, 0],
    ["Jules", "Example", StaffRole.COUNSELOR, 2, 0],
    ["Gray", "Fiction", StaffRole.COUNSELOR, 3, 2],
    ["Dana", "Demo", StaffRole.MEDICAL, 0, null],
    ["Kris", "Placeholder", StaffRole.MEDICAL, 2, null],
    ["Alexis", "Example", StaffRole.REGISTRAR, 1, null]
  ] as const;
  for (const [i, s] of staff.entries()) {
    const email = "showcase.staff." + i + "@example.test";
    const p = await prisma.person.upsert({
      where: { email }, update: {}, create: { email, firstName: s[0], lastName: s[1] }
    });
    const sd = sessionData[s[3]];
    const exists = await prisma.staffAssignment.findFirst({ where: { sessionId: sd.session.id, personId: p.id, role: s[2], status: StaffAssignmentStatus.ACTIVE } });
    if (!exists) await prisma.staffAssignment.create({ data: {
      sessionId: sd.session.id, personId: p.id, role: s[2],
      groupId: [StaffRole.GROUP_DIRECTOR,StaffRole.COUNSELOR].includes(s[2]) ? sd.group.id : null,
      cabinId: s[4] === null ? null : sd.cabins[s[4]].id
    } });
  }

  const subject = "DEMO: Camp packing reminders";
  const existingMessage = await prisma.outboxMessage.findFirst({ where: { organizationId, subject } });
  if (!existingMessage) await prisma.outboxMessage.create({ data: {
    organizationId, audienceType: OutboxAudienceType.ALL_HOUSEHOLDS,
    recipients: outboxEmails, recipientCount: outboxEmails.length,
    subject, body: "FICTITIOUS EXAMPLE — please bring a water bottle, sleeping bag, and labeled T-shirts.",
    status: OutboxMessageStatus.QUEUED
  } });
  console.log("Registrar showcase: " + families.length + " fictitious families, " + created + " campers, " + staff.length + " staff across " + sessionData.length + " sessions.");
}
