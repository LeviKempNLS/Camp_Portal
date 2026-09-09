# Render deployment

Deploy the portal separately from Wix at `portal.faithadventurescamp.org` as a Render **Node Web Service**.

| Render setting | Value |
| --- | --- |
| Branch | `main` |
| Root Directory | Leave blank (repository root) |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm run start` |
| Instance | Free is acceptable for development and demo use |

The portal's `next start` command binds to `0.0.0.0` and respects Render's supplied `PORT` environment variable. Do not set a fixed port or localhost host binding in application code.

Supply `DATABASE_URL`, `BETTER_AUTH_SECRET` (a long random value), and `BETTER_AUTH_URL` (the public Render URL) through Render's secret management. Never commit real values. No email provider is configured: verification and password-reset delivery are intentionally deferred behind a future EmailProvider.

## Render PostgreSQL and Prisma

The Render Web Service receives `DATABASE_URL` through its secure environment configuration. Do not add the connection string to source control, `.env.example`, logs, or support messages.

On every deployment, Render runs `npm ci && npm run build`; the build runs `prisma generate` so the application has a generated database client. The current development/demo start command then runs `npm run db:bootstrap`, which applies committed migrations with `prisma migrate deploy` and runs the idempotent fictitious-data seed before starting Next.js. This avoids requiring Render Shell access on the free tier.

```bash
npm run db:migrate:deploy
```

For a future production environment, run that command through a deliberate release/pre-deploy step instead of using the demo bootstrap:

```bash
npm run db:seed
```

`db:migrate:deploy` uses `prisma migrate deploy` and is the only migration command for deployed environments. `npm run db:migrate:dev` is local-development only.

`GET /api/health` performs a `SELECT 1` against PostgreSQL. It returns `{ "status": "ok", "database": "connected" }` with HTTP 200 when available; otherwise it returns only `{ "status": "unavailable", "database": "unavailable" }` with HTTP 503. It never returns a connection string, database error, or other sensitive detail.

## Authentication and demo operations

Better Auth uses PostgreSQL-backed sessions and the existing `User` record. The app applies the source-controlled Better Auth/RBAC migration with `prisma migrate deploy`; it does not run `prisma migrate dev` in deployment. Prisma seed configuration lives in `packages/database/prisma.config.ts`, not the deprecated `package.json#prisma` key.

`npm audit --omit=dev` currently reports three high findings on Prisma CLI's build-time `@prisma/config → deepmerge-ts@7.1.5` path. This parser is used by `prisma generate`/migration tooling, not by the deployed Prisma query client or portal request path. Do not run `npm audit fix --force`: its offered remedy changes Prisma's major version. Track the advisory and upgrade Prisma only after a tested stable major migration; no real data may be introduced while an unresolved high finding remains.

Parents receive a server-created `Person`, `Household`, and guardian membership after their first authenticated request. Household and registration identifiers supplied by the browser are always checked against that membership server-side. The `/admin` queue requires the `registrar` role; role checks are not based on an email address.

## Important demo warning

The current registration wizard saves authenticated drafts in PostgreSQL. It remains a development prototype and **must not be used to collect real camper, medical, insurance, or payment data**. Email delivery, verification, password reset, production role provisioning, security review, retention controls, and payment processing must be completed before opening registration.

The automatic seed on start is also development/demo-only. It creates or updates only the committed fictitious 2030 demo household and registrations. Remove `db:bootstrap` from the start path before the service is used for real camp operations.
