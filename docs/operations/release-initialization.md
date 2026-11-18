# Release reference data and first administrator

Use this procedure once for a new, isolated staging or production database after reviewed Prisma migrations. It creates the camp organization and authorization definitions without fictitious campers, households, sessions, forms, financial entries or accounts. Neither command runs during build, startup or Blueprint pre-deploy. Do not use demo seed/bootstrap to prepare a release database.

## Private runner and reference initialization

Confirm the target database identity, environment, reviewed commit, migration status and backup/recovery arrangements. Use a private operator runner with the generated Prisma client and database access. Do not expose an HTTP initialization endpoint or temporarily open database ingress. Export the existing release `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `PORTAL_ENVIRONMENT=staging|production` through the secret manager. Demo flags must be absent/false and `DEMO_REGISTRAR_EMAIL` absent. Configuration validation does not independently prove database identity.

Provide these non-secret settings through that runner's configuration:

| Setting                  | Required value                                                        |
| ------------------------ | --------------------------------------------------------------------- |
| `CAMP_ORGANIZATION_SLUG` | Stable lowercase slug, such as `faith-adventures`; no `-demo` suffix  |
| `CAMP_ORGANIZATION_NAME` | Approved camp organization display name                               |
| `CAMP_TIMEZONE`          | Valid IANA timezone, such as `America/Chicago`                        |
| `PROVISIONING_REFERENCE` | Operator/change-ticket reference identifying the authorized execution |

Run the opt-in only for this invocation:

```bash
ALLOW_REFERENCE_DATA_INITIALIZATION=true npm run db:init:reference
```

A transaction creates one organization, seven roles, sixteen permissions, their existing role-permission mappings and an audit event `system.reference_data_initialized`. It grants no user roles. An environment-bound version marker records initialization. Existing unmarked/demo organizations, multiple organizations or partial role/permission definitions are refused without mutation. Existing users/households are left intact. Repeating against the same initialized organization returns `already_initialized` without overwriting settings or restoring revoked permissions. This is initialization, not a reference-data synchronization or upgrade tool.

## First authorized administrator

The designated operator must create their own account through normal Better Auth signup and sign in once so that the portal creates its linked person profile. Independently verify the operator's identity/account ownership through the organization's approved process. Privately inspect the exact existing `User.id` and matching email; set `INITIAL_ADMIN_USER_ID` and `INITIAL_ADMIN_EMAIL` in the runner's private configuration. Email matching alone is not ownership verification. The command does not send verification email, mark an email verified, enable a disabled account, set a password or bypass login.

Retain the matching environment, organization slug and provisioning reference, then run:

```bash
ALLOW_INITIAL_ADMIN_PROVISIONING=true npm run admin:provision:initial
```

The account must already be ACTIVE and linked to a person. With no prior administrator grant or provisioning receipt, one transaction adds the existing `system_administrator` role and records `system.initial_administrator_provisioned`, including the selected user ID and operator reference. Existing parent roles, credentials, household data and sessions are unchanged. The operator then signs in normally and uses the existing permission-based configuration/operations workflows. Registrar-queue access still requires the registrar role; bootstrap does not also grant it.

The two commands share a database advisory lock so concurrent attempts cannot initialize duplicate catalogs or grant different first administrators. A repeat for the same account with its original grant returns `already_provisioned`; a second target is refused. The durable audit receipt also prevents using bootstrap to restore a revoked grant. Never remove that receipt to re-enable bootstrap. Subsequent access changes or recovery require a separately authorized, audited access-management procedure; this command is not an account recovery tool.

Remove the one-off opt-ins and administrator selectors from the runner after completion. Keep operator references and audit events according to the access-audit retention policy. The CLI reports only fixed status/validation messages and suppresses raw database errors; troubleshoot connection failures privately without copying secrets or identity details into issues.

## Release evidence and boundaries

Record the reviewed commit, environment, database identity, authorized operator/change reference, command status, audit receipts and successful normal sign-in/configuration checks. Do not attach credentials or database dumps. Keep production maintenance mode enabled until the remaining [launch gates](../../infra/render/README.md#controlled-releases-and-launch-gates) pass.

Local automated tests cover fresh initialization without fixtures, existing/demo/ambiguous database refusal, environment mismatch, preservation of customized permissions and credentials, invalid/inactive/unlinked account refusal, idempotence, revocation and concurrent requests. They do not establish that a live production administrator has been authorized or provisioned. These commands have not been run against the existing live demo showcase.
