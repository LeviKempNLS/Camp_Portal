# Authorization

Authorization is server-side and permission-based. Parent users can access only their authorized households. Registrar, treasurer, medical, counselor, director, and system-administrator roles receive granular permissions; the interface alone is never an authorization boundary.

Required high-sensitivity permissions include `medical.read`, `medical.write`, `payment.read`, `payment.record`, `registration.approve`, and `user.manage`.

Camp setup uses `camp.configure`. Group, cabin, and staff-assignment administration uses the separate `operations.manage` permission. The operational camper roster uses `roster.read`, while changing camper group/cabin placement uses `roster.manage`. Registrar, Camp Director, and System Administrator receive roster permissions in the current seed; counselor and group-director roster access is derived from active staff assignment scope instead of global roster permissions.

The registrar roster deliberately projects only operational fields needed to run camp: camper name, age/grade, registration age group, T-shirt size, registration status, session, group, and cabin. Medical answers, insurance data, guardian contact details, emergency-contact details, and financial information are not returned by the roster query or CSV export.

Staff authorization is assignment-scoped. An active `StaffAssignment` ties a Person to a Session and optionally a CampGroup and Cabin. Counselors see only campers placed in their assigned cabin or group; Group Directors see their group; camp-wide staff roles can receive a session-wide safe roster. The staff workspace uses the same narrow operational projection and does not expose raw registration answers.

Household and camp roles are additive. Assigning a guardian as a counselor adds the counselor role without removing parent/guardian access. Assignment-created portal roles carry provenance so they can be removed when the final relevant staff assignment is removed without deleting independently granted roles.

Financial tracking remains separately permissioned and is not inferred from roster or counselor access. Registration is not intended to require an online payment.

The application does not log password material, session tokens, medical answers, financial details, or complete form-answer payloads.
