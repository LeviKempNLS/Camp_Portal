# Household and multi-role portal model

This document records the portal behavior discovered during live acceptance testing and the intended direction for household membership and camp roles.

## Identity and household membership

A `Person` represents a human being. A `User` represents that person's sign-in identity. A `HouseholdMember` connects a person to a household and records their household relationship and whether they have portal access.

A household may contain multiple guardians/adults and multiple campers. More than one adult in the same household may have an individual login. Accounts must eventually be linked through a verified invitation/claim flow; simply knowing another member's email must never be enough to take over their household access.

## Roles are additive

Camp roles do not replace household access. A person may simultaneously be a guardian and a counselor, registrar, director, or other staff member. Their portal should expose all authorized views rather than forcing them to choose one permanent identity.

Examples:

- Guardian only: household, campers, registrations, payments.
- Counselor only: assigned cabin/group/team information.
- Guardian + counselor: both household/registration tools and counselor tools.
- Registrar + guardian: registrar workflow plus their own household tools.

## Counselor scope

Future counselor authorization should be assignment-based and season/session scoped. A counselor should only receive the minimum camper information needed for their assignment. Expected views include their cabin roster, appropriate group roster, fellow counselors, and their director. Medical information must remain separately permissioned and must not become visible merely because someone is a counselor.

## UX rules

- Signed-in users should not see primary calls to create an account or sign in.
- Household summary information is read-only by default after saving, with an explicit Edit action.
- Household members are first-class navigable records with their own detail pages.
- Adding a household member is a separate flow and supports at least guardians and campers.
- Registration forms should prefill durable person/household information and preserve registration-specific answers separately.
- A person's current and historical registration statuses should be visible from their household/member context.
