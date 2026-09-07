# Local development

Prerequisites: Node 22+ and PostgreSQL 16+.

1. Copy `.env.example` to `.env` and set a local-only database URL.
2. Run `npm install`.
3. Run `npm run test`, `npm run typecheck`, and `npm run build`.
4. Run `npm run dev`, then open `http://localhost:3000`.

The repository contains the schema but intentionally does not apply a migration automatically. Add the first reviewed migration when a development PostgreSQL database is provisioned.
