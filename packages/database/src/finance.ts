import { FinancialEntryType, PaymentMethod, Prisma, RegistrationStatus } from "@prisma/client";
import { getPrismaClient } from "./index.ts";

export class FinanceAuthorizationError extends Error {}
export class FinanceValidationError extends Error {}

export type FinancePaymentStatus = "paid" | "partial" | "unpaid";
export type FinanceFilters = {
  sessionId?: string;
  paymentStatus?: FinancePaymentStatus;
  churchId?: string;
  scholarshipProgramId?: string;
  search?: string;
};

const financeRegistrationStatuses: RegistrationStatus[] = [
  RegistrationStatus.SUBMITTED,
  RegistrationStatus.PENDING_REVIEW,
  RegistrationStatus.NEEDS_INFORMATION,
  RegistrationStatus.APPROVED,
  RegistrationStatus.WAITLISTED,
  RegistrationStatus.CHECKED_IN,
  RegistrationStatus.COMPLETED,
];
const MAX_MONEY = 99_999_999.99;

function moneyNumber(value: Prisma.Decimal | number | string) {
  return Number(value);
}

function parsePositiveMoney(value: string | number, label = "Amount") {
  const text = String(value).trim();
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text)) throw new FinanceValidationError(`${label} must be a positive dollar amount with no more than two decimals.`);
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_MONEY) throw new FinanceValidationError(`${label} is outside the supported range.`);
  return amount.toFixed(2);
}

function parseSignedMoney(value: string | number, label = "Amount") {
  const text = String(value).trim();
  if (!/^-?\d{1,8}(?:\.\d{1,2})?$/.test(text)) throw new FinanceValidationError(`${label} must be a dollar amount with no more than two decimals.`);
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_MONEY) throw new FinanceValidationError(`${label} is outside the supported range.`);
  return amount.toFixed(2);
}

async function requirePermission(userId: string, key: string) {
  const found = await getPrismaClient().userRole.findFirst({
    where: { userId, role: { permissions: { some: { permission: { key } } } } },
    select: { userId: true },
  });
  if (!found) throw new FinanceAuthorizationError(`Permission ${key} is required.`);
}

async function defaultOrganizationId() {
  const organization = await getPrismaClient().organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!organization) throw new FinanceValidationError("Camp organization is not configured.");
  return organization.id;
}

async function loadFinanceRegistration(tx: Prisma.TransactionClient, organizationId: string, registrationId: string) {
  const registration = await tx.registration.findFirst({
    where: { id: registrationId, session: { season: { organizationId } } },
    include: { session: { include: { season: true } }, person: { select: { firstName: true, lastName: true } } },
  });
  if (!registration) throw new FinanceValidationError("Registration not found in this camp organization.");
  if (!financeRegistrationStatuses.includes(registration.status)) throw new FinanceValidationError("Financial entries can only be recorded for an active or completed registration.");
  return registration;
}

export async function ensureRegistrationBaseCharge(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; registrationId: string; amount: Prisma.Decimal | string | number; actorUserId?: string | null },
) {
  const sourceKey = `registration-charge:${input.registrationId}`;
  const existing = await tx.financialEntry.findUnique({ where: { sourceKey } });
  if (existing) return existing;
  const charge = await tx.financialEntry.create({
    data: {
      organizationId: input.organizationId,
      registrationId: input.registrationId,
      type: FinancialEntryType.CHARGE,
      amount: input.amount,
      sourceKey,
      createdByUserId: input.actorUserId ?? null,
    },
  });
  await tx.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      action: "financial.base_charge_recorded",
      entityType: "FinancialEntry",
      entityId: charge.id,
      after: { type: charge.type, amount: String(charge.amount), registrationId: input.registrationId },
    },
  });
  return charge;
}

function balanceEffect(type: FinancialEntryType, amount: number) {
  switch (type) {
    case FinancialEntryType.CHARGE:
    case FinancialEntryType.REFUND:
    case FinancialEntryType.ADJUSTMENT:
      return amount;
    case FinancialEntryType.PAYMENT:
    case FinancialEntryType.SCHOLARSHIP_CREDIT:
    case FinancialEntryType.CHURCH_PAYMENT:
      return -amount;
    case FinancialEntryType.CHURCH_COMMITMENT:
    case FinancialEntryType.REVERSAL:
      return 0;
  }
}

type EffectiveEntry = {
  id: string;
  type: FinancialEntryType;
  amount: Prisma.Decimal;
  churchId: string | null;
  scholarshipProgramId: string | null;
};

function summarizeEntries(entries: EffectiveEntry[]) {
  let charges = 0;
  let householdPaid = 0;
  let churchPaid = 0;
  let scholarships = 0;
  let churchCommitted = 0;
  let refunds = 0;
  let adjustments = 0;
  let balance = 0;
  for (const entry of entries) {
    const amount = moneyNumber(entry.amount);
    balance += balanceEffect(entry.type, amount);
    if (entry.type === FinancialEntryType.CHARGE) charges += amount;
    else if (entry.type === FinancialEntryType.PAYMENT) householdPaid += amount;
    else if (entry.type === FinancialEntryType.CHURCH_PAYMENT) churchPaid += amount;
    else if (entry.type === FinancialEntryType.SCHOLARSHIP_CREDIT) scholarships += amount;
    else if (entry.type === FinancialEntryType.CHURCH_COMMITMENT) churchCommitted += amount;
    else if (entry.type === FinancialEntryType.REFUND) refunds += amount;
    else if (entry.type === FinancialEntryType.ADJUSTMENT) adjustments += amount;
  }
  const paymentStatus: FinancePaymentStatus = balance <= 0.005 ? "paid" : householdPaid + churchPaid + scholarships > 0 ? "partial" : "unpaid";
  return { charges, householdPaid, churchPaid, scholarships, churchCommitted, refunds, adjustments, balance, paymentStatus };
}

export async function listFinanceDashboard(userId: string, filters: FinanceFilters = {}) {
  await requirePermission(userId, "finance.read");
  const organizationId = await defaultOrganizationId();
  const prisma = getPrismaClient();
  const search = filters.search?.trim();
  const registrations = await prisma.registration.findMany({
    where: {
      session: { season: { organizationId } },
      status: { in: financeRegistrationStatuses },
      ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
      ...(search ? { person: { OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { preferredName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
      ] } } : {}),
      ...(filters.churchId ? { financialEntries: { some: { churchId: filters.churchId, reversedBy: { is: null }, type: { not: FinancialEntryType.REVERSAL } } } } : {}),
      ...(filters.scholarshipProgramId ? { financialEntries: { some: { scholarshipProgramId: filters.scholarshipProgramId, reversedBy: { is: null }, type: FinancialEntryType.SCHOLARSHIP_CREDIT } } } : {}),
    },
    select: {
      id: true,
      status: true,
      person: { select: { firstName: true, preferredName: true, lastName: true } },
      session: { select: { id: true, name: true, season: { select: { name: true } } } },
      financialEntries: {
        where: { reversedBy: { is: null }, type: { not: FinancialEntryType.REVERSAL } },
        select: { id: true, type: true, amount: true, churchId: true, scholarshipProgramId: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ session: { startDate: "asc" } }, { person: { lastName: "asc" } }, { person: { firstName: "asc" } }],
  });

  let rows = registrations.map(registration => {
    const summary = summarizeEntries(registration.financialEntries);
    const firstName = registration.person.preferredName || registration.person.firstName;
    return {
      registrationId: registration.id,
      camperName: `${firstName} ${registration.person.lastName}`.trim(),
      sessionId: registration.session.id,
      sessionName: registration.session.name,
      seasonName: registration.session.season.name,
      registrationStatus: registration.status,
      ...summary,
    };
  });
  if (filters.paymentStatus) rows = rows.filter(row => row.paymentStatus === filters.paymentStatus);

  const [churches, scholarshipPrograms, sessions, effectiveChurchEntries, effectiveScholarshipEntries, recentEntries] = await Promise.all([
    prisma.church.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
    prisma.scholarshipProgram.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
    prisma.session.findMany({ where: { season: { organizationId } }, select: { id: true, name: true, season: { select: { name: true } } }, orderBy: { startDate: "asc" } }),
    prisma.financialEntry.findMany({
      where: { organizationId, churchId: { not: null }, reversedBy: { is: null }, type: { in: [FinancialEntryType.CHURCH_COMMITMENT, FinancialEntryType.CHURCH_PAYMENT] } },
      select: { churchId: true, type: true, amount: true },
    }),
    prisma.financialEntry.findMany({
      where: { organizationId, scholarshipProgramId: { not: null }, reversedBy: { is: null }, type: FinancialEntryType.SCHOLARSHIP_CREDIT },
      select: { scholarshipProgramId: true, amount: true },
    }),
    prisma.financialEntry.findMany({
      where: { organizationId },
      include: {
        registration: { select: { person: { select: { firstName: true, preferredName: true, lastName: true } }, session: { select: { name: true } } } },
        church: { select: { name: true } },
        scholarshipProgram: { select: { name: true } },
        createdBy: { select: { name: true } },
        reversesEntry: { select: { id: true, type: true } },
        reversedBy: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const churchSummaries = churches.map(church => {
    const entries = effectiveChurchEntries.filter(entry => entry.churchId === church.id);
    const committed = entries.filter(entry => entry.type === FinancialEntryType.CHURCH_COMMITMENT).reduce((total, entry) => total + moneyNumber(entry.amount), 0);
    const paid = entries.filter(entry => entry.type === FinancialEntryType.CHURCH_PAYMENT).reduce((total, entry) => total + moneyNumber(entry.amount), 0);
    return { id: church.id, name: church.name, active: church.active, contactName: church.contactName, contactEmail: church.contactEmail, committed, paid, owed: Math.max(0, committed - paid) };
  });
  const scholarshipSummaries = scholarshipPrograms.map(program => ({
    id: program.id,
    name: program.name,
    active: program.active,
    awarded: effectiveScholarshipEntries.filter(entry => entry.scholarshipProgramId === program.id).reduce((total, entry) => total + moneyNumber(entry.amount), 0),
  }));
  const totals = rows.reduce((result, row) => ({
    charges: result.charges + row.charges,
    householdPaid: result.householdPaid + row.householdPaid,
    churchPaid: result.churchPaid + row.churchPaid,
    scholarships: result.scholarships + row.scholarships,
    balance: result.balance + row.balance,
  }), { charges: 0, householdPaid: 0, churchPaid: 0, scholarships: 0, balance: 0 });

  return { rows, churches, scholarshipPrograms, sessions, churchSummaries, scholarshipSummaries, totals, recentEntries };
}

async function createEntry(
  userId: string,
  input: {
    registrationId: string;
    type: FinancialEntryType;
    amount: string;
    method?: PaymentMethod;
    churchId?: string;
    scholarshipProgramId?: string;
    reference?: string;
    note?: string;
    sourceKey?: string;
  },
) {
  await requirePermission(userId, "finance.record");
  const organizationId = await defaultOrganizationId();
  const prisma = getPrismaClient();
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Registration" WHERE "id" = ${input.registrationId} FOR UPDATE`;
    await loadFinanceRegistration(tx, organizationId, input.registrationId);
    if (input.churchId) {
      const church = await tx.church.findFirst({ where: { id: input.churchId, organizationId, active: true }, select: { id: true } });
      if (!church) throw new FinanceValidationError("Selected church is unavailable.");
    }
    if (input.scholarshipProgramId) {
      const program = await tx.scholarshipProgram.findFirst({ where: { id: input.scholarshipProgramId, organizationId, active: true }, select: { id: true } });
      if (!program) throw new FinanceValidationError("Selected scholarship program is unavailable.");
    }
    if (input.sourceKey) {
      const existing = await tx.financialEntry.findUnique({ where: { sourceKey: input.sourceKey } });
      if (existing) return existing;
    }
    const entry = await tx.financialEntry.create({
      data: {
        organizationId,
        registrationId: input.registrationId,
        type: input.type,
        amount: input.amount,
        method: input.method,
        churchId: input.churchId,
        scholarshipProgramId: input.scholarshipProgramId,
        reference: input.reference?.trim() || null,
        note: input.note?.trim() || null,
        sourceKey: input.sourceKey,
        createdByUserId: userId,
      },
    });
    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId: userId,
        action: "financial.entry_recorded",
        entityType: "FinancialEntry",
        entityId: entry.id,
        after: {
          registrationId: entry.registrationId,
          type: entry.type,
          amount: String(entry.amount),
          churchId: entry.churchId,
          scholarshipProgramId: entry.scholarshipProgramId,
          method: entry.method,
        },
      },
    });
    return entry;
  });
}

export async function recordManualPayment(userId: string, input: { registrationId: string; amount: string | number; method: "CHECK" | "CASH" | "OTHER"; reference?: string; note?: string }) {
  return createEntry(userId, { ...input, type: FinancialEntryType.PAYMENT, amount: parsePositiveMoney(input.amount), method: PaymentMethod[input.method] });
}

export async function recordScholarshipCredit(userId: string, input: { registrationId: string; scholarshipProgramId: string; amount: string | number; note?: string }) {
  return createEntry(userId, { ...input, type: FinancialEntryType.SCHOLARSHIP_CREDIT, amount: parsePositiveMoney(input.amount) });
}

export async function recordChurchCommitment(userId: string, input: { registrationId: string; churchId: string; amount: string | number; note?: string }) {
  return createEntry(userId, { ...input, type: FinancialEntryType.CHURCH_COMMITMENT, amount: parsePositiveMoney(input.amount) });
}

export async function recordChurchPayment(userId: string, input: { registrationId: string; churchId: string; amount: string | number; method: "CHECK" | "CASH" | "OTHER"; reference?: string; note?: string }) {
  return createEntry(userId, { ...input, type: FinancialEntryType.CHURCH_PAYMENT, amount: parsePositiveMoney(input.amount), method: PaymentMethod[input.method] });
}

export async function recordAdjustment(userId: string, input: { registrationId: string; amount: string | number; note: string }) {
  if (!input.note?.trim()) throw new FinanceValidationError("An adjustment note is required.");
  return createEntry(userId, { ...input, type: FinancialEntryType.ADJUSTMENT, amount: parseSignedMoney(input.amount) });
}

export async function recordRefund(userId: string, input: { registrationId: string; amount: string | number; method?: "CHECK" | "CASH" | "OTHER"; reference?: string; note?: string }) {
  return createEntry(userId, { ...input, type: FinancialEntryType.REFUND, amount: parsePositiveMoney(input.amount), method: input.method ? PaymentMethod[input.method] : undefined });
}

export async function recordProviderPayment(userId: string, input: { registrationId: string; provider: string; externalTransactionId: string; amount: string | number; note?: string }) {
  const provider = input.provider.trim().toLowerCase();
  const externalTransactionId = input.externalTransactionId.trim();
  if (!provider || !externalTransactionId) throw new FinanceValidationError("Provider and transaction id are required.");
  return createEntry(userId, {
    registrationId: input.registrationId,
    type: FinancialEntryType.PAYMENT,
    amount: parsePositiveMoney(input.amount),
    method: PaymentMethod.ONLINE,
    reference: `${provider}:${externalTransactionId}`,
    note: input.note,
    sourceKey: `provider:${provider}:${externalTransactionId}`,
  });
}

export async function reverseFinancialEntry(userId: string, entryId: string, note: string) {
  await requirePermission(userId, "finance.record");
  if (!note.trim()) throw new FinanceValidationError("A reversal reason is required.");
  const organizationId = await defaultOrganizationId();
  const prisma = getPrismaClient();
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "FinancialEntry" WHERE "id" = ${entryId} FOR UPDATE`;
    const target = await tx.financialEntry.findFirst({ where: { id: entryId, organizationId }, include: { reversedBy: true } });
    if (!target) throw new FinanceValidationError("Financial entry not found.");
    if (target.type === FinancialEntryType.REVERSAL) throw new FinanceValidationError("A reversal entry cannot itself be reversed.");
    if (target.reversedBy) throw new FinanceValidationError("This financial entry has already been reversed.");
    const reversal = await tx.financialEntry.create({
      data: {
        organizationId,
        registrationId: target.registrationId,
        type: FinancialEntryType.REVERSAL,
        amount: "0.00",
        note: note.trim(),
        createdByUserId: userId,
        reversesEntryId: target.id,
      },
    });
    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId: userId,
        action: "financial.entry_reversed",
        entityType: "FinancialEntry",
        entityId: target.id,
        before: { type: target.type, amount: String(target.amount) },
        after: { reversalEntryId: reversal.id },
        metadata: { reason: note.trim() },
      },
    });
    return reversal;
  });
}

export async function createChurch(userId: string, input: { name: string; contactName?: string; contactEmail?: string }) {
  await requirePermission(userId, "finance.record");
  const organizationId = await defaultOrganizationId();
  const name = input.name.trim();
  if (!name) throw new FinanceValidationError("Church name is required.");
  const prisma = getPrismaClient();
  const church = await prisma.church.create({ data: { organizationId, name, contactName: input.contactName?.trim() || null, contactEmail: input.contactEmail?.trim() || null } });
  await prisma.auditEvent.create({ data: { organizationId, actorUserId: userId, action: "financial.church_created", entityType: "Church", entityId: church.id, after: { name } } });
  return church;
}

export async function updateChurch(userId: string, input: { churchId: string; name: string; contactName?: string; contactEmail?: string; active: boolean }) {
  await requirePermission(userId, "finance.record");
  const organizationId = await defaultOrganizationId();
  const name = input.name.trim();
  if (!name) throw new FinanceValidationError("Church name is required.");
  const prisma = getPrismaClient();
  const existing = await prisma.church.findFirst({ where: { id: input.churchId, organizationId } });
  if (!existing) throw new FinanceValidationError("Church not found.");
  const church = await prisma.church.update({ where: { id: existing.id }, data: { name, contactName: input.contactName?.trim() || null, contactEmail: input.contactEmail?.trim() || null, active: input.active } });
  await prisma.auditEvent.create({ data: { organizationId, actorUserId: userId, action: "financial.church_updated", entityType: "Church", entityId: church.id, before: { name: existing.name, active: existing.active }, after: { name: church.name, active: church.active } } });
  return church;
}

export async function createScholarshipProgram(userId: string, nameInput: string) {
  await requirePermission(userId, "finance.record");
  const organizationId = await defaultOrganizationId();
  const name = nameInput.trim();
  if (!name) throw new FinanceValidationError("Scholarship program name is required.");
  const prisma = getPrismaClient();
  const program = await prisma.scholarshipProgram.create({ data: { organizationId, name } });
  await prisma.auditEvent.create({ data: { organizationId, actorUserId: userId, action: "financial.scholarship_program_created", entityType: "ScholarshipProgram", entityId: program.id, after: { name } } });
  return program;
}

export async function updateScholarshipProgram(userId: string, input: { scholarshipProgramId: string; name: string; active: boolean }) {
  await requirePermission(userId, "finance.record");
  const organizationId = await defaultOrganizationId();
  const name = input.name.trim();
  if (!name) throw new FinanceValidationError("Scholarship program name is required.");
  const prisma = getPrismaClient();
  const existing = await prisma.scholarshipProgram.findFirst({ where: { id: input.scholarshipProgramId, organizationId } });
  if (!existing) throw new FinanceValidationError("Scholarship program not found.");
  const program = await prisma.scholarshipProgram.update({ where: { id: existing.id }, data: { name, active: input.active } });
  await prisma.auditEvent.create({ data: { organizationId, actorUserId: userId, action: "financial.scholarship_program_updated", entityType: "ScholarshipProgram", entityId: program.id, before: { name: existing.name, active: existing.active }, after: { name: program.name, active: program.active } } });
  return program;
}
