# Domain model

Core relationships: Organization has Seasons; a Season has Sessions; a Household has People through HouseholdMember; a Person can have a CamperProfile; a Registration ties one Person, Household, and Session together. Registration answers point to immutable FormVersions. Emergency contacts are structured records, not a text blob.

The committed Prisma schema enforces primary keys, foreign keys, uniqueness for one camper per session, and indexes for registrar workload queries. Financial ledger entities are intentionally the next migration, before payment collection is activated.
