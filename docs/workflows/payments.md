# Payments workflow

The platform will maintain an internal ledger (charges, credits, payments, allocations, adjustments, refunds). A payment processor moves money but does not determine a registration balance. Webhook events will be verified, persisted by provider event ID, and processed idempotently.

Payment collection is not enabled in this foundation release. No payment provider credentials or card fields are present.
