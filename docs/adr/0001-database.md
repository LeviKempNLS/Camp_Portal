# ADR 0001: PostgreSQL with Prisma

Status: accepted.

Camp operations are relationship-heavy and require constraints, transactions, and reliable reporting. PostgreSQL is the system of record; Prisma was chosen for strong TypeScript support, schema visibility, and source-controlled migrations. JSONB is used for form schemas and answers, not as a replacement for core relationships.
