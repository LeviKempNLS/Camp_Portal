import Link from "next/link";
import { AuthorizationError, getOwnedHousehold, hasPermission, hasRole } from "@faith-adventures/database/portal";
import { hasStaffAssignment } from "@faith-adventures/database/operations";
import { requirePortalUser } from "../lib/access";

export default async function DashboardPage() {
  const user = await requirePortalUser();
  let household: Awaited<ReturnType<typeof getOwnedHousehold>> | null = null;
  try {
    household = await getOwnedHousehold(user.id);
  } catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;
  }

  const [registrar, staff, canConfigure, canOperations] = await Promise.all([
    hasRole(user.id, "registrar"),
    hasStaffAssignment(user.id),
    hasPermission(user.id, "camp.configure"),
    hasPermission(user.id, "operations.manage"),
  ]);
  const hasAdminTools = registrar || canConfigure || canOperations;

  return <main className="shell">
    <p className="eyebrow">Your portal</p>
    <h1>{household?.displayName || "Faith Adventures Camp"}</h1>
    <p>Signed in as {user.email}. Household and camp roles are additive, so one account can be both a guardian and camp staff member.</p>
    <div className="home-actions">
      {household && <Link className="button" href="/household">Household</Link>}
      {household && <Link className="button secondary" href="/registrations/new">Start or resume registration</Link>}
      {staff && <Link className="button secondary" href="/staff">Staff workspace</Link>}
      {hasAdminTools && <Link className="button secondary" href="/admin">Camp administration</Link>}
    </div>
    {household ? <>
      <div className="section-heading-row"><h2>Household members</h2><Link href="/household/members/new">Add member</Link></div>
      <div className="member-list">{household.members.map(member => <Link className="member-card" key={member.personId} href={`/household/members/${member.personId}`}><span><strong>{member.person.firstName} {member.person.lastName}</strong><small>{member.relationship.toLowerCase()}</small></span><span aria-hidden="true">→</span></Link>)}</div>
    </> : <section className="detail-card"><h2>Staff account</h2><p>This login is not linked to a household. Use the staff or administration workspace assigned to this account.</p></section>}
  </main>;
}
