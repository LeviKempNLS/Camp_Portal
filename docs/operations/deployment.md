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

Supply future PostgreSQL, object storage, authentication, payment, email, and application secrets through Render's secret management. Never commit real values. Apply reviewed, source-controlled migrations before a production rollout.

## Render PostgreSQL and Prisma

The Render Web Service receives `DATABASE_URL` through its secure environment configuration. Do not add the connection string to source control, `.env.example`, logs, or support messages.

On every deployment, Render runs `npm ci && npm run build`; the build runs `prisma generate` so the application has a generated database client. Applying schema changes is a separate, deliberate production operation:

```bash
npm run db:migrate:deploy
```

Run that command in Render Shell after a deployment containing a new migration, then run the development-only seed once:

```bash
npm run db:seed
```

`db:migrate:deploy` uses `prisma migrate deploy` and is the only migration command for deployed environments. `npm run db:migrate:dev` is local-development only.

`GET /api/health` performs a `SELECT 1` against PostgreSQL. It returns `{ "status": "ok", "database": "connected" }` with HTTP 200 when available; otherwise it returns only `{ "status": "unavailable", "database": "unavailable" }` with HTTP 503. It never returns a connection string, database error, or other sensitive detail.

## Important demo warning

The current registration wizard saves its draft in the browser only. It is a development prototype and **must not be used to collect real camper, medical, insurance, or payment data**. Replace it with authenticated server-side persistence and complete the security review before opening registration.
