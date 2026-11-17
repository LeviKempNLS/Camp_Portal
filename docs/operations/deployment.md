# Render deployment

Deploy the portal separately from Wix at `portal.faithadventurescamp.org` as a Render **Node Web Service**.

| Render setting | Value |
| --- | --- |
| Branch | `main` |
| Root Directory | Leave blank (repository root) |
| Build Command | `npm ci && npm run build` |
| Pre-Deploy Command | **Leave blank for the current development/demo service** |
| Start Command | `npm run start` |
| Instance | Free is acceptable for development and demo use |

The portal's `next start` command binds to `0.0.0.0` and respects Render's supplied `PORT` environment variable. Do not set a fixed port or localhost host binding in application code.

Supply `DATABASE_URL`, `BETTER_AUTH_SECRET` (a long random value), and `BETTER_AUTH_URL` (the public Render URL) through Render's secret management. Never commit real values. No email provider is configured: verification and password-reset delivery are intentionally deferred behind a future EmailProvider.

## Render PostgreSQL and Prisma

The Render Web Service receives `DATABASE_URL` through its secure environment configuration. Do not add the connection string to source control, `.env.example`, logs, or support messages.

On every deployment, Render runs `npm ci && npm run build`; the build runs `prisma generate` so the application has a generated database client. The standard `npm run start` now starts Next.js **without migration, seeding or demo role provisioning**. This deliberately avoids modifying database records merely because Render restarted or redeployed. For an existing demo whose schema has already been applied, the normal start command preserves existing data. For a fresh environment, explicitly apply reviewed migrations and (only in a disposable demo database) seed test fixtures before starting. On the free tier without shell access, use an explicitly configured one-time deployment command or separate controlled release job; do not silently reintroduce seeding into the app start path.

**Demo initialization is explicit**: `npm run db:bootstrap:demo` runs migration, fictitious seed, and optional demo registrar provisioning; `npm run start:demo` does the same immediately before serving. Do not configure those commands in a recurring Render start/pre-deploy setting unless repeated fixture mutation is intentionally required. **Production must never run demo bootstrap.**

```bash
npm run db:migrate:deploy
```

For a production environment, run `npm run db:migrate:deploy` through a deliberate and reviewed release step, then `npm run start:production` (or `npm run start`) as the web-service start command. Never run `npm run db:seed` against production. For a new disposable demo environment only, initialization can be requested manually with:

```bash
npm run db:bootstrap:demo
npm run start
```

`db:migrate:deploy` uses `prisma migrate deploy` and is the only migration command for deployed environments. `npm run db:migrate:dev` is local-development only.

`GET /api/health` performs a `SELECT 1` against PostgreSQL. It returns `{ "status": "ok", "database": "connected" }` with HTTP 200 when available; otherwise it returns only `{ "status": "unavailable", "database": "unavailable" }` with HTTP 503. It never returns a connection string, database error, or other sensitive detail.

## Authentication and demo operations

Better Auth uses PostgreSQL-backed sessions and the existing `User` record. The app applies the source-controlled Better Auth/RBAC migration with `prisma migrate deploy`; it does not run `prisma migrate dev` in deployment. Prisma seed configuration lives in `packages/database/prisma.config.ts`, not the deprecated `package.json#prisma` key.

`DEMO_REGISTRAR_EMAIL`, when configured, must be a fictitious `@example.test` address for an existing Better Auth user. Demo registrar provisioning is idempotent: it ensures the registrar role exists and then upserts the user's role assignment. The normal seed remains responsible for the registrar permission mapping.

`npm audit --omit=dev` currently reports three high findings on Prisma CLI's build-time `@prisma/config → deepmerge-ts@7.1.5` path. This parser is used by `prisma generate`/migration tooling, not by the deployed Prisma query client or portal request path. Do not run `npm audit fix --force`: its offered remedy changes Prisma's major version. Track the advisory and upgrade Prisma only after a tested stable major migration; no real data may be introduced while an unresolved high finding remains.

Parents receive a server-created `Person`, `Household`, and guardian membership after their first authenticated request. Household and registration identifiers supplied by the browser are always checked against that membership server-side. The `/admin` queue requires the `registrar` role; role checks are not based on an email address.

## Important demo warning

The current registration wizard saves authenticated drafts in PostgreSQL. It remains a development prototype and **must not be used to collect real camper, medical, insurance, or payment data**. Email delivery, verification, password reset, production role provisioning, security review, retention controls, and payment processing must be completed before opening registration.

Demo seed is no longer part of the default start command. Nevertheless, production launch remains BLOCKED pending explicit migration automation, backups and restore testing, access/credential review, privacy controls and other P0 acceptance work. The demo-only bootstrap commands can still modify existing fixtures if someone explicitly invokes them; do not point them at a production database.
