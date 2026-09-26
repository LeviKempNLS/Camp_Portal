import { OutboxAudienceType, OutboxMessageStatus, RegistrationStatus, StaffAssignmentStatus } from "@prisma/client";
import { getPrismaClient } from "./index.ts";

export class CommunicationsAuthorizationError extends Error {}
export class CommunicationsValidationError extends Error {}

async function requirePermission(userId: string, key: string) {
  const found = await getPrismaClient().userRole.findFirst({
    where: { userId, role: { permissions: { some: { permission: { key } } } } },
    select: { userId: true },
  });
  if (!found) throw new CommunicationsAuthorizationError(`Permission ${key} is required.`);
}

async function defaultOrganizationId() {
  const organization = await getPrismaClient().organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!organization) throw new CommunicationsValidationError("Camp organization is not configured.");
  return organization.id;
}

function uniqueEmails(values: Array<string | null | undefined>) {
  return [...new Set(values.map(value => value?.trim().toLowerCase()).filter((value): value is string => Boolean(value)))].sort();
}

async function householdEmails(where: object) {
  const rows = await getPrismaClient().householdMember.findMany({
    where: { relationship: "GUARDIAN", person: { email: { not: null } }, ...where },
    select: { person: { select: { email: true } } },
  });
  return uniqueEmails(rows.map(row => row.person.email));
}

async function resolveRecipients(organizationId: string, audienceType: OutboxAudienceType, audienceRef?: string) {
  const prisma = getPrismaClient();
  if (audienceType === OutboxAudienceType.ALL_HOUSEHOLDS) {
    return householdEmails({ household: { registrations: { some: { session: { season: { organizationId } }, status: { notIn: [RegistrationStatus.DRAFT, RegistrationStatus.CANCELLED] } } } } });
  }
  if (audienceType === OutboxAudienceType.SESSION) {
    if (!audienceRef) throw new CommunicationsValidationError("A session is required.");
    const session = await prisma.session.findFirst({ where: { id: audienceRef, season: { organizationId } }, select: { id: true } });
    if (!session) throw new CommunicationsValidationError("Session not found.");
    return householdEmails({ household: { registrations: { some: { sessionId: session.id, status: { notIn: [RegistrationStatus.DRAFT, RegistrationStatus.CANCELLED] } } } } });
  }
  if (audienceType === OutboxAudienceType.REGISTRATION_STATUS) {
    if (!audienceRef || !Object.values(RegistrationStatus).includes(audienceRef as RegistrationStatus)) throw new CommunicationsValidationError("A valid registration status is required.");
    return householdEmails({ household: { registrations: { some: { status: audienceRef as RegistrationStatus, session: { season: { organizationId } } } } } });
  }
  const staff = await prisma.staffAssignment.findMany({
    where: { status: StaffAssignmentStatus.ACTIVE, session: { season: { organizationId } } },
    select: { person: { select: { email: true, user: { select: { email: true } } } } },
  });
  return uniqueEmails(staff.flatMap(row => [row.person.user?.email, row.person.email]));
}

export async function listOutbox(userId: string) {
  await requirePermission(userId, "communications.read");
  const organizationId = await defaultOrganizationId();
  const prisma = getPrismaClient();
  const [messages, sessions] = await Promise.all([
    prisma.outboxMessage.findMany({
      where: { organizationId },
      include: { actorUser: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.session.findMany({
      where: { season: { organizationId } },
      select: { id: true, name: true, season: { select: { name: true } } },
      orderBy: { startDate: "asc" },
    }),
  ]);
  return { messages, sessions, registrationStatuses: Object.values(RegistrationStatus) };
}

export async function queueOutboxMessage(userId: string, input: { audienceType: string; audienceRef?: string; subject: string; body: string }) {
  await requirePermission(userId, "communications.write");
  const organizationId = await defaultOrganizationId();
  const audienceType = input.audienceType as OutboxAudienceType;
  if (!Object.values(OutboxAudienceType).includes(audienceType)) throw new CommunicationsValidationError("Audience type is invalid.");
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject) throw new CommunicationsValidationError("Subject is required.");
  if (!body) throw new CommunicationsValidationError("Message body is required.");
  if (subject.length > 200) throw new CommunicationsValidationError("Subject is too long.");
  const recipients = await resolveRecipients(organizationId, audienceType, input.audienceRef?.trim() || undefined);
  if (!recipients.length) throw new CommunicationsValidationError("No recipients matched this audience.");
  const prisma = getPrismaClient();
  const message = await prisma.outboxMessage.create({
    data: {
      organizationId,
      actorUserId: userId,
      audienceType,
      audienceRef: input.audienceRef?.trim() || null,
      recipients,
      recipientCount: recipients.length,
      subject,
      body,
    },
  });
  await prisma.auditEvent.create({
    data: { organizationId, actorUserId: userId, action: "communications.queued", entityType: "OutboxMessage", entityId: message.id, after: { audienceType, audienceRef: message.audienceRef, recipientCount: recipients.length, subject } },
  });
  return message;
}

export async function markOutboxSimulatedSent(userId: string, messageId: string) {
  await requirePermission(userId, "communications.write");
  const organizationId = await defaultOrganizationId();
  const prisma = getPrismaClient();
  const existing = await prisma.outboxMessage.findFirst({ where: { id: messageId, organizationId } });
  if (!existing) throw new CommunicationsValidationError("Outbox message not found.");
  if (existing.status === OutboxMessageStatus.SIMULATED_SENT) return existing;
  if (existing.status !== OutboxMessageStatus.QUEUED) throw new CommunicationsValidationError("Only queued messages can be marked sent.");
  const sent = await prisma.outboxMessage.update({ where: { id: existing.id }, data: { status: OutboxMessageStatus.SIMULATED_SENT, simulatedSentAt: new Date() } });
  await prisma.auditEvent.create({
    data: { organizationId, actorUserId: userId, action: "communications.simulated_sent", entityType: "OutboxMessage", entityId: sent.id, before: { status: existing.status }, after: { status: sent.status, simulatedSentAt: sent.simulatedSentAt } },
  });
  return sent;
}
