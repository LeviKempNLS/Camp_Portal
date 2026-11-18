# Configuration and release preflight verification — November 18, 2026

Roadmap #18, infrastructure #19. This work builds on PR #35's explicit demo-command guards. All database tests below used isolated local PostgreSQL 17 with fictitious data. No live database, Render configuration, deployment or existing demonstration records were changed.

| Scenario | Expected | Observed |
| --- | --- | --- |
| Valid production/staging configuration | Pass without a payment provider | PASS; configuration functions do not connect to PostgreSQL |
| Missing or placeholder auth/database configuration | Reject before server startup | PASS |
| Non-HTTPS/local/malformed auth origin or URL credentials/path/query/fragment | Reject with a key-specific error | PASS |
| Production/staging with demo opt-in or registrar email | Reject | PASS |
| Explicit production command without production classification | Reject | PASS for unclassified, demo and staging inputs |
| Invalid configuration through `start`, `start:production` or `release:check` | Stop before Next.js/Prisma, do not echo credentials | PASS; subprocess tests use synthetic sentinel values |
| Legacy unclassified demo startup | Continue to start | PASS; built server returned HTTP 200 and database connected |
| Migration preflight with applied tracked history | Exit 0 without writes | PASS using a SELECT-only role with default read-only transactions |
| Migration preflight with a pending local migration | Exit nonzero, do not apply it | PASS, exit 1; temporary local probe removed after testing |
| Migration preflight against an uninitialized database | Exit nonzero, do not initialize it | PASS, exit 1; public schema still contained zero tables |
| First guarded production startup and restart | Health succeeds and database contents remain unchanged | PASS for both starts, using a read-only role and an existing fictitious local database; row counts and row-content hashes matched across all 32 tables before and after |

Automated checks: 20 unit/command tests, workspace TypeScript checks, lint and production build passed on lockfile dependencies. Built-server smoke tests exercised actual root npm start commands and `GET /api/health`; no browser/UI behavior changed.

The preflight inspects configuration shape and tracked migration history. It does not verify actual production database identity, schema drift, secret entropy/rotation, backup availability, network encryption, or the rest of the production release gates. A successful local check is not production launch sign-off.

Production must use explicit classification and the guarded root commands. Unclassified startup remains supported for the existing demo, and directly invoking a workspace start command bypasses the root guard. Keep production release configuration controlled accordingly.

Remaining #19 infrastructure work: durable separate demo/staging/production resources, actual-deployment backup and isolated restore, an authorized private release/provisioning runner, HTTP health monitoring/alerts, and secret-rotation evidence. The known free demo database expiry is November 29, 2026. Positive privileged-role live acceptance also remains open under #21.
