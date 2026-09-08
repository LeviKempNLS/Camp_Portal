# Faith Adventures Camp Portal

Standalone camp-management software for Faith Adventures Camp. It is intentionally independent from Wix and designed to run at `portal.faithadventurescamp.org`.

This initial implementation establishes a Next.js/TypeScript monorepo, PostgreSQL/Prisma relational schema and migration, centralized database package, JSON-versioned form contract, registration state machine, mobile-friendly save-and-resume prototype, registrar queue prototype, documentation, and CI.

## Start locally

Requires Node 22+ and PostgreSQL 16+ for the database-backed next phase.

```bash
cp .env.example .env
npm install
npm run test
npm run typecheck
npm run dev
```

Open `http://localhost:3000`. The registration prototype saves a draft in the current browser so it can demonstrate the intended flow without collecting or sending real information. Do not use it to collect real medical or payment data yet.

With a local PostgreSQL `DATABASE_URL`, run `npm run db:migrate:dev` and `npm run db:seed` to create only fictitious development data. `GET /api/health` reports non-sensitive database availability.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the parent/registrar portal |
| `npm run lint` | Run UI linting |
| `npm run typecheck` | Check all workspace TypeScript |
| `npm test` | Test registration domain rules |
| `npm run build` | Build the production application |

## Architecture

The application is a modular monolith. `apps/portal` is the Next.js experience; `packages/domain` holds vendor-neutral registration and form rules; `packages/database` owns the PostgreSQL schema. Core operational entities are relational, while form definitions, form answers, audit metadata, and provider metadata use JSONB when it adds flexibility.

Read the implementation record in `docs/`, especially the architecture, registration workflow, and security guidance. The database schema is intentionally source controlled; supply all secrets through your host, never through committed configuration.
