import Link from "next/link";
import { getOwnedHousehold } from "@faith-adventures/database/portal";
import { requirePortalUser } from "../lib/access";
import { saveHousehold } from "./actions";

export default async function HouseholdPage({ searchParams }: { searchParams: Promise<{ edit?: string; saved?: string }> }) {
  const user = await requirePortalUser();
  const household = await getOwnedHousehold(user.id);
  const address = (household.primaryAddress || {}) as Record<string, string>;
  const query = await searchParams;
  const editing = query.edit === "1";
  return <main className="shell narrow">
    <div className="page-heading-row"><div><p className="eyebrow">Your camp family</p><h1>Household</h1></div>{!editing && <Link className="button secondary" href="/household?edit=1">Edit household</Link>}</div>
    {query.saved === "1" && <p className="save-confirmation" role="status">Household details saved.</p>}
    {editing ? <form action={saveHousehold} className="auth-form">
      <label>Household name <input name="displayName" defaultValue={household.displayName} required /></label>
      <label>Street <input name="street" defaultValue={address.street} /></label>
      <label>City <input name="city" defaultValue={address.city} /></label>
      <label>State <input name="state" defaultValue={address.state} /></label>
      <label>Postal code <input name="postalCode" defaultValue={address.postalCode} /></label>
      <div className="form-actions"><button>Save household</button><Link className="button secondary" href="/household">Cancel</Link></div>
    </form> : <section className="detail-card" aria-label="Household details">
      <dl className="detail-grid"><div><dt>Household name</dt><dd>{household.displayName}</dd></div><div><dt>Address</dt><dd>{[address.street, address.city, [address.state, address.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Not provided"}</dd></div></dl>
    </section>}
    <div className="section-heading-row"><h2>Members</h2><Link className="button" href="/household/members/new">Add household member</Link></div>
    <div className="member-list">{household.members.map(member=><Link className="member-card" key={member.personId} href={`/household/members/${member.personId}`}><span><strong>{member.person.firstName} {member.person.lastName}</strong><small>{member.relationship === "CAMPER" ? "Camper" : member.relationship === "GUARDIAN" ? "Guardian" : member.relationship.toLowerCase()}</small></span><span aria-hidden="true">→</span></Link>)}</div>
  </main>;
}
