# Financial tracking and future payment integration

> See [Technical reference — Finance and communications](../TECHNICAL_REFERENCE.md#finance-and-communications) and [User guide — Offline finances](../USER_GUIDE.md#c-offline-finances-scholarships-and-church-sponsors).

**Implemented:** an internal append-only financial ledger in `packages/database/src/finance.ts`, with restricted registrar finance UI at `/admin/finance`. It records registration charges, check/cash/other offline payments, scholarship credits, church sponsorship commitments and actual church payments, adjustments, refunds and reversals. Each registration has a calculated balance. The record of sponsorship commitment is distinct from funds received. Changes are audited and corrections are recorded as new events, not destructive overwrites. Provider-neutral source keys support future idempotent ingestion.

**Not implemented:** real online checkout, card processing, payment webhook verification, provider reconciliation and bank payout management. No payment gateway credentials are required for the demo. Planned work: [#24](https://github.com/LeviKempNLS/Camp_Portal/issues/24).

**Critical business rule:** registration status and payment status are separate. A family can submit and have a registration approved with no online payment. Future gateway transactions must post into the existing ledger rather than replace its balance calculations. No real camper/payment data may be entered in the demo.
