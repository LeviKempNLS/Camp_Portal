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
PORTAL_ENVIRONMENT=demo ALLOW_DEMO_DATA=true npm run db:bootstrap:demo
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

The current registration wizard saves authenticated drafts in PostgreSQL. It remains a development prototype and **must not be used to collect real camper, medical, insurance, or payment data**. Email delivery, verification, password reset, verified production role provisioning, security review, retention controls, and payment processing must be completed before opening registration.

Demo seed is no longer part of the default start command. Nevertheless, production launch remains BLOCKED pending explicit migration automation, backups and restore testing, access/credential review, privacy controls and other P0 acceptance work. The demo-only bootstrap commands can still modify existing fixtures if someone explicitly invokes them; do not point them at a production database.


## Environment isolation and command guards

Use distinct Render services, PostgreSQL databases, authentication secrets and origins for demo, staging and production. `NODE_ENV=production` describes a compiled Node application; it does not distinguish a deployed demo from real production data. Classify each environment with `PORTAL_ENVIRONMENT` (`development`, `test`, `demo`, `staging`, or `production`). Keep `ALLOW_DEMO_DATA=false` or absent in recurring runtime configuration, especially staging and production.

The fixture seed and demo registrar commands require **both** a disposable environment classification (`development`, `test`, or `demo`) and `ALLOW_DEMO_DATA=true`. `db:bootstrap`, `db:bootstrap:demo`, and `start:demo` check these flags **before any migration or server startup**. Direct seed and role-provisioning entry points check again before creating a database client. Staging, production and unclassified environments are refused even if the opt-in flag is true. Normal `start` and explicit `db:migrate:deploy` do not seed or grant roles.

The flags express operator intent; they do not prove database identity. Separate databases and credentials remain mandatory. Never point a demo-classified process at production. Do not store the opt-in on a production service or configure a recurring demo bootstrap.

To provision an already-created fictitious registrar without resetting fixtures, use a shell/release runner with access to the **demo database**, its existing secret configuration, and the reviewed application checkout:

```bash
PORTAL_ENVIRONMENT=demo ALLOW_DEMO_DATA=true npm run demo:registrar
```

Supply `DEMO_REGISTRAR_EMAIL` through that runner's private configuration. This command only grants the existing registrar role to that specific existing `@example.test` account; it does not reset households or ledgers. Use the registrar's normal operations UI to assign counselors/medical staff and scopes. Free Render web services do not support shell access, so this requires a separately authorized runner/database connection or a suitable paid demo service. Account signup alone cannot assign staff roles.

## Controlled production migration release

1. Confirm the exact target service, environment, database identity and reviewed commit. Use distinct production credentials. Verify a recent usable backup and compatibility/rollback plan before schema changes.
2. Test the tracked Prisma migrations against a new isolated database and a restored representative snapshot. Review destructive SQL and use an expand/contract release when older app instances must remain compatible.
3. Serialize releases so only one runner applies migrations. On a paid Render web service, use the reviewed `npm run db:migrate:deploy` pre-deploy command; otherwise use a dedicated release runner with private database access. Do not put migrations in build/start commands.
4. Treat a migration failure as a release failure: inspect and repair deliberately. Do not seed, reset, use `migrate dev`, or blindly resolve a failed migration in production.
5. Start the reviewed build with `npm run start`. Verify `/api/health`, sign-in and representative read/write behavior, then inspect sanitized runtime errors. Configure Render HTTP health checks to `/api/health` (the current demo setting is empty).
6. A code rollback does not reverse a database migration or ledger changes. Roll back only to a schema-compatible build; restoring a backup is a separate incident procedure with explicit recovery-point/data-loss approval.

## Database backup and isolated restore

The current free demo PostgreSQL instance expires **November 29, 2026** and has no managed backups. Move to durable hosting or preserve it through a controlled export before expiry. This document and a local drill do not establish a live backup exists. Keep production launch blocked until a named owner records backup frequency, retention, recovery point/time targets, encryption, restricted access and a successful restore from the actual deployment's backup.

Use a PostgreSQL client matching the source major version (currently 17 for the demo). Configure private libpq service entries `camp_source_backup` and `camp_restore_isolated` through the operator's secret tooling. The latter must refer to a newly created **empty, isolated** database with no connection to production services. Verify host/database identities without printing passwords, exported rows or connection strings.

```bash
umask 077
PORTAL_BACKUP_FILE="/protected-backups/camp-backup.dump"
pg_dump 'service=camp_source_backup' --format=custom --file="$PORTAL_BACKUP_FILE"
pg_restore --list "$PORTAL_BACKUP_FILE" > "$PORTAL_BACKUP_FILE.manifest"
sha256sum "$PORTAL_BACKUP_FILE" > "$PORTAL_BACKUP_FILE.sha256"
# Verify the destination is the designated empty isolated database before restoring.
pg_restore --exit-on-error --no-owner --no-acl --dbname='service=camp_restore_isolated' "$PORTAL_BACKUP_FILE"
```

Move the dump and manifest to encrypted, access-restricted storage with expiry/retention controls; never commit or attach them to issues. A dump includes authentication and private records even when the data was fictitious. Restrict or revoke restored auth sessions before exposing any restored environment. A database dump does not back up Render secrets/service configuration; preserve those separately in the approved secret manager.

For verification, compare migration versions, table counts and representative relationships/ledger totals captured at the backup's recovery point; run health and role/household smoke tests against the restored app with fresh isolated secrets. Validate permissions and append-only ledger behavior. Record source/destination identities, backup checksum, timestamps, elapsed recovery time, results and remaining gaps. Do not use `--clean`, reset, truncate or overwrite the live database for a drill.

### Local drill evidence — November 17, 2026

A custom-format PostgreSQL 17 dump of the isolated fictitious acceptance database was restored with `pg_restore --exit-on-error --no-owner` into a new empty local database. Counts matched: 33 households, 42 camper profiles, 37 registrations, 57 ledger entries, 22 users and 7 Prisma migrations. No deployed database was exported or changed. The dump remains outside the repository with mode 0600. This proves a local dump/restore procedure only; a live backup, restore smoke test, incident drill and production recovery targets still require sign-off under #19.


## Production configuration and migration preflight

Export configuration through the release runner or Render's environment settings; the preflight scripts do not load `.env` files. Use a separate production database, a fresh cryptographically random `BETTER_AUTH_SECRET` of at least 32 characters and the exact public HTTPS origin in `BETTER_AUTH_URL`. Leave `DEMO_REGISTRAR_EMAIL` absent and `ALLOW_DEMO_DATA` absent or `false`. `NODE_ENV` is not the environment classifier.

```bash
# Configuration only: no database connection, migration or server startup.
npm run production:check
# Configuration plus read-only migration-history inspection; never applies migrations.
npm run release:check
# Validated production startup; does not migrate, seed or provision roles.
npm run start:production
```

All three commands require `PORTAL_ENVIRONMENT=production`. The standard root `npm run start` also validates these settings whenever the environment is explicitly classified `production` or `staging`; unknown classifications fail. The existing unclassified demo remains able to start. This compatibility path is not production approval: production must use explicit classification and the guarded production entry point, not omit the marker or bypass the root scripts with a workspace start command.

Validation rejects missing/malformed PostgreSQL configuration, known placeholder credentials, missing/short/known-placeholder authentication secrets, local or non-HTTPS auth origins, auth URLs with credentials/path/query/fragment, and enabled demo settings. Errors name configuration keys and requirements without echoing values. A format check cannot prove secret entropy, database identity, network encryption, origin reachability or credential separation; verify those through infrastructure controls and the release checklist. An optional payment provider is not required to pass these checks.

`release:check` first validates production configuration, then runs `prisma migrate status`. A zero exit means the tracked migration history matches the database's applied history. Pending, failed, divergent or uninitialized migration history produces a nonzero exit; connection failures also fail the check. It does not apply migrations, inspect schema drift or prove that the application is healthy. Review pending SQL, verify backup/recovery and run the separately controlled `db:migrate:deploy` release step, then repeat the check before rollout. Never auto-resolve a failed migration to make a preflight green. A SELECT-only database role with access to `_prisma_migrations` can run the status check; the separate migration runner needs DDL privileges.

Rotate secrets through the approved secret manager and controlled deployment configuration. Auth-secret rotation can invalidate sessions; account for that operationally. Do not print credentials to demonstrate rotation and do not copy a production secret into demo/staging.


## Reviewed infrastructure template

[Separate staging/production Blueprint](../../infra/render/README.md) documents the four-resource template, current $29/month resource baseline, explicit planning/apply controls, generated per-environment secrets, private database ingress, migration checks and production maintenance mode. The existing demo is excluded. This is a separately approved provisioning plan, not an automatic infrastructure sync or production launch approval.

## Non-fixture release initialization

After reviewed migrations, follow the [private reference-data and first-administrator procedure](release-initialization.md). These explicit commands prepare a new isolated release database without demo fixtures or account/password creation. They are not part of normal startup, Blueprint pre-deploy, or recovery. The existing demo showcase must not be adopted or reset by them.
