# Domain model

> Canonical entity definitions: [Prisma schema](../../packages/database/prisma/schema.prisma). See the [full technical reference](../TECHNICAL_REFERENCE.md#5-data-model-and-persistence-patterns).

## Identity and family

`User` is the Better Auth identity record and links to `Person`. A `Household` contains people through `HouseholdMember`; authorized guardians must have portal access to the household. One `Person` may also have a `CamperProfile` and camp staff assignments. Authorization is server-side and scope-aware; household and staff roles are additive.

## Seasons and registration

`Organization` owns `Season`; a season owns `Session`. `Registration` associates one camper, household and session, with a unique camper/session constraint. Versioned `FormDefinition`, `FormVersion` and `FormSubmission` retain registration answers; JSONB carries schema/answer versions. Registration status is independent from payments.

## Camp operations

`CampGroup` and `Cabin` belong to a session. `StaffAssignment` ties a `Person` to a session, a camp role and optional group/cabin scope. `CamperPlacement` stores the current group/cabin placement for a registration. Composite foreign keys ensure groups, cabins and registrations all reference the same session. Assignment capacity is validated with transaction/locking behavior. `CampAttendance` stores check-in/check-out timestamps and actors.

## Financial and communication records

`FinancialEntry` is the append-only charge/payment/scholarship/church-commitment/refund/adjustment/reversal ledger, with `Church` and `ScholarshipProgram` dimensions. Amounts use decimal money fields; source keys and reversal relationships support auditability. `OutboxMessage` and recipients snapshot communications audiences; delivery is **simulated only** at this baseline. `AuditEvent` records material actions.

## Read projections

Registrar/counselor rosters show operational fields including camper/session/group/cabin and T-shirt sizes but never return raw medical, insurance, finance or general emergency contact answers. Medical and finance workspaces are restricted separately. CSV exports use safe projections.

See [Authorization](../security/authorization.md) and [User guide](../USER_GUIDE.md) for access by role.
