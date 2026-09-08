import Link from "next/link";
import { getOwnedHousehold } from "@faith-adventures/database/portal";
import { requirePortalUser } from "../lib/access";
import { SignOutButton } from "../../components/sign-out-button";
export default async function DashboardPage() { const user = await requirePortalUser(); const household = await getOwnedHousehold(user.id); return <main className="shell"><p className="eyebrow">Authenticated demo household</p><h1>{household.displayName}</h1><p>Signed in as {user.email}. This development portal accepts fictitious data only.</p><SignOutButton/><p><Link href="/household">Manage household and campers</Link> · <Link href="/registrations/new">Start or resume a registration draft</Link></p><h2>Members</h2><ul>{household.members.map(member=><li key={member.personId}>{member.person.firstName} {member.person.lastName} — {member.relationship.toLowerCase()}</li>)}</ul></main>; }
