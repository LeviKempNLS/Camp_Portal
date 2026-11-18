# Faith Adventures Camp Portal

A standalone, Wix-independent camp registration and operations portal for **Faith Adventures Camp**. The codebase is a **Next.js/TypeScript modular monolith** with PostgreSQL, Prisma, Better Auth and shared npm workspaces. Its intended public address is `portal.faithadventurescamp.org`; the current development/demo instance is [camp-portal-33on.onrender.com](https://camp-portal-33on.onrender.com).

> **DEVELOPMENT / DEMO ONLY — NO REAL CAMPER DATA.** The application contains registration, roster, medical, finance and other operational workflows, but production security, account recovery, reliable email, launch verification and a safe production deployment are not yet complete. Enter fictitious test data only—never real children's information, health details, credentials or payment details.

## Documentation

| Guide | Audience | Contents |
| --- | --- | --- |
| **[Technical architecture & developer reference](docs/TECHNICAL_REFERENCE.md)** | Maintainers and developers | Technology versions, repository layout, package responsibilities, diagrams, module interactions, design patterns, data model, API flows, tests, release limitations |
| **[Complete user guide](docs/USER_GUIDE.md)** | Parents, registrar, directors, counselors, medical and finance staff | Navigation, registration, household management, camp setup, rosters, payments, check-in/out, reports, communications, troubleshooting |
| [Deployment operations](docs/operations/deployment.md) | Maintainers | Render demo configuration, PostgreSQL, secrets, health checks and production cautions |
| [Authorization and privacy](docs/security/authorization.md) | Developers / administrators | Permissions, household ownership and staff scope |
| [Domain model](docs/data-model/domain-model.md) | Developers | Core relationships and constraints |
| [Architecture overview](docs/architecture/overview.md) | Developers | High-level design boundaries |
| [Registration workflow](docs/workflows/registration.md) | Developers | Registration state lifecycle |
| **[Production completion roadmap — issue #18](https://github.com/LeviKempNLS/Camp_Portal/issues/18)** | Project leadership | Prioritized launch backlog and release gates |

## What is implemented

- **Families:** Better Auth email/password identities, PostgreSQL-backed sessions, parent-linked households, multiple campers and secure additional-adult invitation workflow (demo link preview only; no outbound email).
- **Registration:** per-camper/session draft persistence with serialized autosave, submission and registrar review, requested corrections, status tracking, season/session eligibility, capacity checks and optional waitlisting.
- **Camp configuration:** seasons, sessions, dates, registration windows, prices/deposit configuration, groups and cabins with capacities, staff roles/assignments, and assignment-aware views.
- **Roster and logistics:** registrar search/filter/sort, camper cabin/group placement, T-shirt reporting, safe CSV and limited counselor/director rosters.
- **Finances without payment gateway:** internal append-only financial ledger for registration charges, offline checks/cash, scholarship credits, church commitments and payments, adjustments, refunds and reversals; role-restricted finance page and balances. **No real card checkout or processor integration.**
- **Camp operations:** check-in/check-out and attendance status, permissioned medical workspace, operational/contact reports and CSV exports.
- **Communications:** audience-based internal outbox that saves recipient snapshots and can mark a message **simulated sent**. **No real email delivery.**
- **Testing:** unit tests, PostgreSQL integration tests, Playwright desktop/mobile browser configurations, lint/typecheck/build and CI foundations.

The implemented features are **not equivalent to launch sign-off**; permissions, forms, operational workflows and deployment still require end-to-end validation.

## Technology and architecture

| Concern | Implementation |
| --- | --- |
| Front end / server | Next.js 16 App Router, React 19, TypeScript |
| Authentication | Better Auth with database-backed sessions |
| Domain rules | `packages/domain`: versioned registration form and state-machine rules |
| Data layer | `packages/database`: Prisma 6, PostgreSQL, RBAC and scoped use cases |
| Main application | `apps/portal`: server pages, server actions, API routes, React components |
| Host | Render Node web service + PostgreSQL for current demo |
| Future integrations | Optional external payment gateway, real transactional email, Wix public-site links |

```text
apps/portal      → pages, actions, APIs, registration wizard
packages/auth    → authentication adapter, sessions and client
packages/domain  → vendor-neutral form and state rules
packages/database → Prisma schema, migrations, access checks and camp services
PostgreSQL       → persistent operational records, ledgers, form answers and audit
```

See the [technical reference](docs/TECHNICAL_REFERENCE.md) for detailed dependency paths, diagrams, services and architecture patterns.

## Local setup

Prerequisites: **Node.js 22+**, npm as declared in the root `package.json`, PostgreSQL 16+.

```bash
cp .env.example .env
npm ci
npm run prisma:generate
npm run db:migrate:dev
PORTAL_ENVIRONMENT=development ALLOW_DEMO_DATA=true npm run db:seed  # disposable local data ONLY
npm run dev
```

Configure a **local development** `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` as appropriate. Keep all values private. Navigate to [http://localhost:3000](http://localhost:3000). The non-sensitive health endpoint is `GET /api/health`.

### Quality and test commands

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration  # isolated PostgreSQL test database required
npm run test:e2e         # Playwright desktop Chromium
npm run test:e2e:all     # desktop and mobile Chromium
npm run build
npm run format:check
```

Database tests and demo seeding must **not** use production data. For implementation details see [technical reference §7](docs/TECHNICAL_REFERENCE.md#7-local-development-and-testing).

## Important deployment warning

The default root `npm run start` validates any declared staging/production configuration and then starts Next.js. Unclassified demo startup remains compatible. It does not run migrations, create fixtures or promote demo registrars. Explicitly initialize a disposable demo database with `npm run db:bootstrap:demo` when needed; `npm run start:demo` combines that operation with starting the server and must **not** be used for production. Use `npm run production:check` to validate production configuration without connecting to the database, `npm run release:check` to also inspect applied migration history without applying migrations, and `npm run start:production` for the guarded production entry point. Production must apply reviewed migrations through a controlled release path and avoid all demo fixtures/reseeding. This change is one safety improvement, not production approval. All fixture and demo-role commands require `PORTAL_ENVIRONMENT=development|test|demo` and `ALLOW_DEMO_DATA=true`; production and unclassified environments are refused before demo bootstrap can migrate. These flags do not verify the database identity: use separate databases/credentials and never mislabel production. Review [deployment instructions](docs/operations/deployment.md) and [P0 infrastructure issue #19](https://github.com/LeviKempNLS/Camp_Portal/issues/19) before changing environments.

## Release priorities

1. **P0 — Safe pilot:** production separation/backup/restore, children's privacy and permission audit, real browser acceptance, final forms/consent.
2. **P1 — Public launch:** verified email delivery, optional online checkout and reconciliation, parent/registrar improvements, Wix integration and SEO.
3. **P2 — Expansion:** deeper staff onboarding, analytics and year-over-year reporting.

See the [master roadmap](https://github.com/LeviKempNLS/Camp_Portal/issues/18) and individual issues #19–#30. **Online payment is always optional:** a family can register without paying online, and the camp can track offline payments, scholarships and church sponsorships.

## Maintainer notes

- Keep business authorization **server-side**; hiding a link does not enforce access.
- Keep medical and financial data out of generic rosters and exports.
- Preserve append-only financial corrections and audit history.
- Make schema changes with tracked Prisma migrations and test assignment/session/capacity constraints.
- Update both guides when behavior, dependencies, roles or public workflows change.
- Do not assume historical planning documentation accurately reflects the latest shipped modules; refer to the code and [technical reference](docs/TECHNICAL_REFERENCE.md).
