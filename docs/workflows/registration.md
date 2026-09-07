# Registration workflow

1. A parent selects a session and camper.
2. A draft Registration is created and the current FormVersion is attached.
3. Answers autosave while the draft remains editable.
4. Submit validates required fields and transitions the registration to `submitted`.
5. A registrar reviews it and can approve, waitlist, cancel, or request information.
6. A parent sees status changes in their dashboard.

The UI prototype demonstrates steps 1-4 with browser-local draft persistence. Production persistence will use the schema and authenticated household authorization; it must not use browser storage for medical answers.
