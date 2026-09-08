# Local development

Prerequisites: Node 22+ and PostgreSQL 16+.

1. Copy `.env.example` to `.env` and set a local-only PostgreSQL `DATABASE_URL`. Never use the Render database URL locally.
2. Run `npm install`.
3. Run `npm run prisma:generate`.
4. Run `npm run db:migrate:dev` to create and apply local development migrations.
5. Run `npm run db:seed` to add only the committed fictitious demo data.
6. Run `npm run test`, `npm run typecheck`, and `npm run build`.
7. Run `npm run dev`, then open `http://localhost:3000`.

Use `npm run db:migrate:deploy` only for already-created, source-controlled migrations in a deployment environment. The safe health endpoint is available at `/api/health`; it exposes no database details.
