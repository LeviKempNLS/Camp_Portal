import Link from "next/link";
import { getOwnedHousehold, hasRole } from "@faith-adventures/database/portal";
import { requirePortalUser } from "../lib/access";

export default async function DashboardPage() {
  const user = await requirePortalUser();
  const household = await getOwnedHousehold(user.id);
  const registrar = await hasRole(user.id, "registrar");
  return <main className="shell"><p className="eyebrow">Your portal</p><h1>{household.displayName}</h1><p>Signed in as {user.email}. Your available views are based on all roles assigned to this account.</p><div className="home-actions"><Link className="button" href="/household">Household</Link><Link className="button secondary" href="/registrations/new">Start or resume registration</Link>{registrar&&<Link className="button secondary" href="/admin">Registrar tools</Link>}</div><div className="section-heading-row"><h2>Household members</h2><Link href="/household/members/new">Add member</Link></div><div className="member-list">{household.members.map(member=><Link className="member-card" key={member.personId} href={`/household/members/${member.personId}`}><span><strong>{member.person.firstName} {member.person.lastName}</strong><small>{member.relationship.toLowerCase()}</small></span><span aria-hidden="true">→</span></Link>)}</div></main>;
}
