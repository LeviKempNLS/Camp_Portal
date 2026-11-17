# Registration workflow

> Current implementation reference: [Technical architecture](../TECHNICAL_REFERENCE.md) and [User guide](../USER_GUIDE.md).

1. An authenticated guardian selects a camper belonging to their authorized household and an eligible, open session.
2. The server loads or creates the camper/session registration draft and attaches the appropriate form version.
3. The registration wizard prepopulates available household details and **autosaves authenticated drafts to PostgreSQL** through `/api/registrations/draft`. `DraftSaveCoordinator` serializes saves; drafts do not rely solely on browser-local storage.
4. Submission through `/api/registrations/submit` validates required fields, ownership, registration windows and capacity, and transitions the registration out of draft. A base financial charge is recorded in the internal ledger without requiring any online payment.
5. The registrar reviews the entry from `/admin` and can approve, request more information, waitlist or cancel when transitions are valid. The parent can edit/resubmit a `NEEDS_INFORMATION` registration.
6. Parent sees current status. Approved registrations can proceed to check-in, then check-out/completion using the attendance workspace.

**Do not use real personal, medical or payment data in the current demo.** Production privacy, form/consent and launch approvals remain backlog #19–#22. See `packages/domain/src/index.ts` and `packages/database/src/registration-operations.ts` for authoritative transitions.
