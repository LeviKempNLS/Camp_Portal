import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getOwnedHouseholdMember } from "@faith-adventures/database/portal";
import { getHouseholdInvitationStatus } from "@faith-adventures/database/invitations";
import { requirePortalUser } from "../../../lib/access";
import { createPortalInvitation, revokePortalInvitation } from "../../actions";

function dateOnly(value: Date | null | undefined) { return value ? value.toISOString().slice(0, 10) : "Not provided"; }

export default async function HouseholdMemberPage({ params, searchParams }: { params: Promise<{ personId: string }>; searchParams: Promise<{ added?: string; inviteReady?: string; inviteRevoked?: string }> }) {
  const user = await requirePortalUser();
  const { personId } = await params;
  const member = await getOwnedHouseholdMember(user.id, personId);
  if (!member) notFound();
  const query = await searchParams;
  const person = member.person;
  const label = member.relationship === "CAMPER" ? "Camper" : member.relationship === "GUARDIAN" ? "Guardian" : member.relationship.toLowerCase();
  const activeInvitation = member.relationship === "GUARDIAN" && !member.hasPortalAccess ? await getHouseholdInvitationStatus(user.id, personId) : null;
  const previewToken = query.inviteReady === "1" ? (await cookies()).get("camp_invitation_preview")?.value : undefined;
  const inviteUrl = previewToken ? `${process.env.BETTER_AUTH_URL || ""}/invite/${encodeURIComponent(previewToken)}` : null;
  return <main className="shell narrow">
    <p><Link href="/household">← Back to household</Link></p>
    {query.added === "1" && <p className="save-confirmation" role="status">Household member added.</p>}
    {query.inviteRevoked === "1" && <p className="save-confirmation" role="status">Portal invitation revoked.</p>}
    <p className="eyebrow">{label}</p><h1>{person.firstName} {person.lastName}</h1>
    <section className="detail-card"><dl className="detail-grid">
      <div><dt>Email</dt><dd>{person.email || "Not provided"}</dd></div><div><dt>Phone</dt><dd>{person.phone || "Not provided"}</dd></div><div><dt>Date of birth</dt><dd>{dateOnly(person.birthDate)}</dd></div>
      {person.camperProfile && <div><dt>Grade just completed</dt><dd>{person.camperProfile.grade || "Not provided"}</dd></div>}
      <div><dt>Portal access</dt><dd>{member.hasPortalAccess ? "Enabled with an individual login" : "Not yet linked to a login"}</dd></div>
    </dl></section>
    {member.relationship === "GUARDIAN" && !member.hasPortalAccess && <section className="detail-card"><h2>Individual portal login</h2>
      {!person.email ? <p>Add an email address before creating an invitation.</p> : activeInvitation ? <><p>An invitation is active for <strong>{activeInvitation.email}</strong> until {activeInvitation.expiresAt.toLocaleString()}.</p><form action={revokePortalInvitation}><input type="hidden" name="personId" value={person.id}/><input type="hidden" name="invitationId" value={activeInvitation.id}/><button className="button secondary">Revoke invitation</button></form></> : <><p>Create a one-time, seven-day invitation that links this adult&apos;s own login to the existing household record. Email matching alone never grants access.</p><form action={createPortalInvitation}><input type="hidden" name="personId" value={person.id}/><button className="button">Create portal invitation</button></form></>}
      {inviteUrl && <div className="notice"><strong>Demo invitation link</strong><p><code>{inviteUrl}</code></p><p>No external email was sent. Copy this only to the fictitious test recipient. The raw token is not stored in the database and this preview disappears shortly.</p></div>}
    </section>}
    {member.relationship === "CAMPER" && <p><Link className="button" href={`/registrations/new?camperId=${person.id}`}>Start or resume registration</Link></p>}
    <div className="section-heading-row"><h2>Registration history</h2></div>
    {person.registrations.length === 0 ? <p>No registrations yet.</p> : <div className="member-list">{person.registrations.map(registration=><div className="member-card static" key={registration.id}><span><strong>{registration.session.season.name} — {registration.session.name}</strong><small>{registration.status.replaceAll("_", " ").toLowerCase()}</small></span><span>{registration.createdAt.getFullYear()}</span></div>)}</div>}
  </main>;
}
