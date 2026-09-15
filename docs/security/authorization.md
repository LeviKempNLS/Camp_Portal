# Authorization

Authorization is server-side and permission-based. Parent users can access only their authorized households. Registrar, treasurer, medical, counselor, director, and system-administrator roles receive granular permissions; the interface alone is never an authorization boundary.

Required high-sensitivity permissions include `medical.read`, `medical.write`, `payment.read`, `payment.record`, `registration.approve`, and `user.manage`.

Camp setup uses `camp.configure`. Group, cabin, and staff-assignment administration uses the separate `operations.manage` permission. The seeded Camp Director receives both permissions; the System Administrator receives all currently seeded administrative permissions. Counselor, Group Director, and Medical role records do not inherit unrelated administrative permissions.

Staff authorization is also assignment-scoped. An active `StaffAssignment` ties a Person to a Session and optionally a CampGroup and Cabin. The staff workspace is derived from those active assignments rather than from a broad role alone. A counselor assigned to a cabin sees only staff in that assignment scope plus the relevant directors. Camp-wide roles may see the staff team for the session. Camper medical details and registration-form answers are intentionally absent from this workspace.

Household and camp roles are additive. Assigning a guardian as a counselor adds the counselor role without removing parent/guardian access. Removing a staff assignment immediately removes access to the assignment-scoped staff workspace; global role records are not used as a substitute for an active assignment.

The application does not log password material, session tokens, medical answers, or complete form-answer payloads.
