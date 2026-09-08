# ADR 0002: Authentication adapter

Status: accepted.

Better Auth provides email/password credentials and PostgreSQL-backed sessions through `packages/auth`. Business routes import that application module and database authorization helpers rather than Better Auth directly. The existing domain `User` is the Better Auth user record and links one-to-one to `Person`; `HouseholdMember.hasPortalAccess` is the ownership boundary. Outbound email is deliberately deferred behind a future EmailProvider.
