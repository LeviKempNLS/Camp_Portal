# Architecture overview

Faith Adventures Camp Portal is a Wix-independent modular monolith. The Next.js application owns the web experience; PostgreSQL stores relational camp operations data; JSONB holds versioned form schemas, answers, integration metadata, and audit context.

Initial boundaries are identity, households, camp configuration, forms, registrations, payments, reporting, storage, communications, and audit. Providers are adapters, so the domain layer does not directly depend on Stripe, Resend, S3, or an authentication vendor.

Sensitive medical data is persisted separately as versioned form answers and must only be exposed through server-side `medical.read`/`medical.write` checks. It must not enter logs or analytics.
