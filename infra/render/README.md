# Separate staging and production resources

Roadmap #18, infrastructure #19. `environments.yaml` declares **new** Render resources, leaving the existing `Camp_Portal` demo and its PostgreSQL instance untouched. The file is outside the repository root so it is not an implicit replacement for the demo's standalone configuration.

## Proposed resources

| Environment | Web service | Database | Public behavior |
| --- | --- | --- | --- |
| Staging | `fac-portal-staging`, 0.5 CPU / 512 MB | `fac-portal-staging-db`, PostgreSQL 17, 256 MB, 5 GB disk | Fictitious testing only |
| Production | `fac-portal-production`, 0.5 CPU / 512 MB | `fac-portal-production-db`, PostgreSQL 17, 256 MB, 5 GB disk | Maintenance mode enabled; public requests receive 503 |

Render's `create_new` planning mode adds unique suffixes to resource names. The logical names above are references in the file, not guaranteed final public hostnames.

Each environment has its own database, generated database credentials, generated 256-bit auth secret and self-referenced `RENDER_EXTERNAL_URL` for `BETTER_AUTH_URL`. No password, connection string, existing demo resource reference or shared secret group is checked into the template. Self-referencing the platform URL avoids guessing a new service hostname or asking for manual origin entry. A custom domain requires a later reviewed Blueprint change and matching auth-origin validation.

Database public IP allowlists are empty. Logical resource/credential separation is enabled; **private-network traffic isolation is not enabled**. Render requires a Pro-or-higher workspace for that additional boundary. On a shared Hobby private network, other same-region workspace resources can reach network peers, although they do not receive the new database credentials. Do not equate separate database instances with a private-network firewall.

Both environments are protected against destructive actions by non-admin workspace members. Both use paid compute, `/api/health`, guarded starts and explicit migration/status pre-deploy commands. There is no fixture seed, demo bootstrap, demo registrar promotion, attached disk, replica, autoscaler, preview stack or payment-gateway requirement. Production stays closed to public traffic until the production release gates pass. Maintenance mode leaves private-network and SSH access available; external `/api/health` also returns the platform maintenance response while closed.

## Estimated baseline cost

Verified against Render documentation on November 18, 2026:

| Resource | Quantity | Monthly estimate |
| --- | --- | --- |
| Web service `0.5c-512mb` | 2 × $7 | $14 |
| PostgreSQL `0.1c-256mb` | 2 × $6 | $12 |
| PostgreSQL disk | 2 × 5 GB × $0.30 | $3 |
| **Resource baseline** | | **$29/month** |

This is a baseline, not a spending cap or a claim that the minimum plans suit production load. It excludes existing resources, workspace fees, bandwidth/build overages, taxes, additional exports/storage and temporary recovery instances. Automatic service scaling and disk growth are disabled; monitor disk capacity and obtain a new cost review before increasing it. If private-network isolation is required, account for the workspace upgrade separately (current Pro list price: $25/month if not already on that plan). Review the actual planned billing before applying.

Paid PostgreSQL enables managed point-in-time recovery: currently three days on Hobby and seven days on Pro or higher. A paid plan does not prove a successful restore. Validate the actual recovery window and perform an isolated restore before real camper data. No high availability or replica is included in this minimum configuration.

## Validate and plan without provisioning

```bash
npm ci
npm run infra:validate
npm test
```

`infra:validate` fetches Render's current public JSON Schema, validates the file, and checks the reviewed resource boundaries/release policy. Unit tests exercise unsafe changes such as cross-environment references, copied secrets, public database ingress, fixture commands and accidental cost increases. Validation never creates resources. CI runs the same validation. Playwright is locked as a development dependency; browser setup does not re-resolve the application's installed dependencies after `npm ci`.

Commit and push the reviewed file, then create a Render Blueprint plan with:

- Repository: `https://github.com/LeviKempNLS/Camp_Portal`
- Branch: `main`
- Path: `infra/render/environments.yaml`
- Workspace: the confirmed intended workspace
- Existing-resource handling: **`create_new`**, never `adopt`
- Blueprint automatic sync: **`false`**

Inspect the planned four resources, costs, references and any notices. **Do not approve a failed plan. Apply only after the user explicitly authorizes the reviewed plan, including creating and deploying the paid resources.** Planning, generating values or accepting a price alone is not permission to deploy. Do not point this Blueprint at the existing demo or copy its database into production.

## Controlled releases and launch gates

The initial approved sync creates empty database instances, applies tracked Prisma migrations, and deploys the app. Automatic app deployment is off, and automatic Blueprint sync must also remain off. Later releases require a reviewed commit with passing CI, a verified backup/recovery plan, a reviewed migration diff and an explicit deployment. Pre-deploy validates configuration before migrations and checks migration history afterwards. Normal startup never seeds, migrates or grants roles.

A fresh database has schema only. **Camp organization/reference data and the first authorized production administrator still need a separate, non-fixture initialization/provisioning path.** The existing demo seed mixes reference definitions with fictitious records and must never fill that gap in staging/production. Do not treat a successful health check as operational camp readiness.

Before opening production traffic: complete reference-data/administrator provisioning without fixtures, #20's security/privacy audit, #21's role-scoped acceptance, #22's approved forms/consent, account recovery/email readiness, an actual backup/restore drill, monitoring/alerts and appropriate capacity checks. Update the Blueprint and its policy tests deliberately when changing maintenance mode or canonical domains. Never introduce real camper/medical records merely because the infrastructure exists.

This plan does **not** preserve or upgrade the current demo database. Its known expiry remains November 29, 2026. Preserve that database through an authorized private export or upgrade before expiry; verify the existing showcase and restore in an isolated target. Do not reseed/reset it to create an acceptance test fixture.

## Current references

- [Blueprint fields and self-references](https://render.com/docs/blueprint-spec)
- [Compute plans](https://render.com/docs/compute-plans) and [pricing](https://render.com/pricing)
- [Default environment variables](https://render.com/docs/environment-variables)
- [Private networking](https://render.com/docs/private-network)
- [Maintenance mode](https://render.com/docs/maintenance-mode)
- [PostgreSQL backup and recovery](https://render.com/docs/postgresql-backups)
- [Project deployment operations](../../docs/operations/deployment.md)
