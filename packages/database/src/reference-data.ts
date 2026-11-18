/** Canonical reference definitions shared by explicit initialization and demo fixtures. */
export const REFERENCE_ROLES = [
  ["parent", "Parent"],
  ["registrar", "Registrar"],
  ["counselor", "Counselor"],
  ["group_director", "Group Director"],
  ["medical", "Medical"],
  ["camp_director", "Camp Director"],
  ["system_administrator", "System Administrator"],
] as const;

export const REFERENCE_PERMISSIONS = [
  ["household.read", "Read an owned household"],
  ["household.write", "Update an owned household"],
  ["registration.read.all", "Read registrations across camp households"],
  ["registration.approve", "Review and change registration status"],
  ["camp.configure", "Configure camp seasons and sessions"],
  ["operations.manage", "Manage camp groups, cabins and staff assignments"],
  ["roster.read", "Read the non-sensitive operational camper roster"],
  ["roster.manage", "Assign active campers to camp groups and cabins"],
  ["finance.read", "Read restricted registration finance records"],
  [
    "finance.record",
    "Record and reverse restricted registration finance entries",
  ],
  ["attendance.read", "Read camper check-in and attendance status"],
  ["attendance.manage", "Check campers in and out"],
  ["medical.read", "Read restricted camper health and care information"],
  ["reports.read", "Read registrar operational and contact reports"],
  ["communications.read", "Read the internal communications outbox"],
  ["communications.write", "Queue and simulate camp communications"],
] as const;

export type ReferenceRoleKey = (typeof REFERENCE_ROLES)[number][0];
export type ReferencePermissionKey = (typeof REFERENCE_PERMISSIONS)[number][0];
export const ROLE_PERMISSION_KEYS: Partial<
  Record<ReferenceRoleKey, readonly ReferencePermissionKey[]>
> = {
  registrar: [
    "registration.read.all",
    "registration.approve",
    "camp.configure",
    "roster.read",
    "roster.manage",
    "finance.read",
    "finance.record",
    "attendance.read",
    "attendance.manage",
    "reports.read",
    "communications.read",
    "communications.write",
  ],
  medical: ["medical.read"],
  camp_director: [
    "camp.configure",
    "operations.manage",
    "roster.read",
    "roster.manage",
    "attendance.read",
    "attendance.manage",
  ],
  system_administrator: [
    "household.read",
    "household.write",
    "registration.read.all",
    "registration.approve",
    "camp.configure",
    "operations.manage",
    "roster.read",
    "roster.manage",
    "finance.read",
    "finance.record",
    "attendance.read",
    "attendance.manage",
    "medical.read",
    "reports.read",
    "communications.read",
    "communications.write",
  ],
};
