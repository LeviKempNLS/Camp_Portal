import Link from "next/link";
import { notFound } from "next/navigation";
import { getOwnedHouseholdMember } from "@faith-adventures/database/portal";
import { requirePortalUser } from "../../../lib/access";

function dateOnly(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "Not provided";
}

export default async function HouseholdMemberPage({ params, searchParams }: { params: Promise<{ personId: string }>; searchParams: Promise<{ added?: string }> }) {
  const user = await requirePortalUser();
  const { personId } = await params;
  const member = await getOwnedHouseholdMember(user.id, personId);
  if (!member) notFound();
  const query = await searchParams;
  const person = member.person;
  const label = member.relationship === "CAMPER" ? "Camper" : member.relationship === "GUARDIAN" ? "Guardian" : member.relationship.toLowerCase();
  return <main className="shell narrow">
    <p><Link href="/household">← Back to household</Link></p>
    {query.added === "1" && <p className="save-confirmation" role="status">Household member added.</p>}
    <p className="eyebrow">{label}</p><h1>{person.firstName} {person.lastName}</h1>
    <section className="detail-card"><dl className="detail-grid">
      <div><dt>Email</dt><dd>{person.email || "Not provided"}</dd></div>
      <div><dt>Phone</dt><dd>{person.phone || "Not provided"}</dd></div>
      <div><dt>Date of birth</dt><dd>{dateOnly(person.birthDate)}</dd></div>
      {person.camperProfile && <div><dt>Grade just completed</dt><dd>{person.camperProfile.grade || "Not provided"}</dd></div>}
      <div><dt>Portal access</dt><dd>{member.hasPortalAccess ? "Enabled" : "Not yet linked to a login"}</dd></div>
    </dl></section>
    {member.relationship === "CAMPER" && <p><Link className="button" href={`/registrations/new?camperId=${person.id}`}>Start or resume registration</Link></p>}
    <div className="section-heading-row"><h2>Registration history</h2></div>
    {person.registrations.length === 0 ? <p>No registrations yet.</p> : <div className="member-list">{person.registrations.map(registration=><div className="member-card static" key={registration.id}><span><strong>{registration.session.season.name} — {registration.session.name}</strong><small>{registration.status.replaceAll("_", " ").toLowerCase()}</small></span><span>{registration.createdAt.getFullYear()}</span></div>)}</div>}
  </main>;
}
