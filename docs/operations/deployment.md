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

## Important demo warning

The current registration wizard saves its draft in the browser only. It is a development prototype and **must not be used to collect real camper, medical, insurance, or payment data**. Replace it with authenticated server-side persistence and complete the security review before opening registration.
