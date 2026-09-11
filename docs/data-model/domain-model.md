# Domain model

Core relationships: Organization has Seasons; a Season has Sessions; a Household has People through HouseholdMember; a Person can have a CamperProfile; a Registration ties one Person, Household, and Session together. Registration answers point to immutable FormVersions. Emergency contacts are structured records, not a text blob.

Camp operations are modeled independently from family relationships. A Session can have CampGroups and Cabins. A Cabin may belong to a CampGroup. StaffAssignment ties a Person to a Session with an explicit camp role and optional group/cabin scope. The Person can simultaneously remain a household guardian, so guardian and counselor responsibilities do not require duplicate people or accounts.

The committed Prisma schema enforces primary keys, foreign keys, unique group/cabin names within a session, uniqueness for one camper registration per session, and indexes for registrar and operations workload queries. CamperProfile includes an optional gender field for future cabin-assignment workflows; this slice does not expose medical data to staff workspaces.

Camper-to-cabin assignment and attendance/check-in records are intentionally the next operations migration. Financial ledger entities remain separate and will be added before payment collection is activated.
