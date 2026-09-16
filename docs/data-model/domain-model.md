# Domain model

Core relationships: Organization has Seasons; a Season has Sessions; a Household has People through HouseholdMember; a Person can have a CamperProfile; a Registration ties one Person, Household, and Session together. Registration answers point to immutable FormVersions. Emergency contacts are structured records, not a text blob.

Camp operations are modeled independently from family relationships. A Session can have CampGroups and Cabins. A Cabin may belong to a CampGroup. StaffAssignment ties a Person to a Session with an explicit camp role and optional group/cabin scope. The Person can simultaneously remain a household guardian, so guardian and counselor responsibilities do not require duplicate people or accounts.

CamperPlacement provides the current operational group/cabin placement for one Registration. It redundantly carries the Session key so composite database foreign keys guarantee that the Registration, CampGroup, and Cabin all belong to the same Session. Cabin and group capacities are enforced by the roster service under a session row lock, and placement changes create audit events.

The registrar and staff roster do not expose raw form submissions. They project the small set of operational registration answers needed for camp logistics, currently including registration age group and T-shirt size, alongside camper age/grade and group/cabin placement.

The committed Prisma schema enforces primary keys, foreign keys, unique group/cabin names within a session, uniqueness for one camper registration per session, one current placement per registration, and indexes for registrar and operations workload queries.

Attendance/check-in records are the next operations migration. Financial ledger entities remain separate from registration and operations data and will be added before payment collection is activated; online payment will not be required to register.
