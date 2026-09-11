import Link from "next/link";
import { inspectPortalInvitation } from "@faith-adventures/database/invitations";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await inspectPortalInvitation(token);
  if (!invitation) return <main className="shell narrow"><p className="eyebrow">Household invitation</p><h1>Invitation unavailable</h1><p>This invitation is expired, revoked, already used, or invalid.</p><p><Link href="/sign-in">Go to sign in</Link></p></main>;
  const encoded = encodeURIComponent(token);
  return <main className="shell narrow"><p className="eyebrow">Household invitation</p><h1>Join {invitation.household.displayName}</h1>
    <section className="detail-card"><p><strong>{invitation.person.firstName} {invitation.person.lastName}</strong> has been invited to use their own portal login.</p><p>Invited email: <strong>{invitation.email}</strong></p><p>Expires: {invitation.expiresAt.toLocaleString()}</p></section>
    <p>You must authenticate as the invited email. The login will be linked to this existing person and household; it will not create a duplicate household.</p>
    <div className="home-actions"><Link className="button" href={`/sign-up?invite=${encoded}`}>Create invited login</Link><Link className="button secondary" href={`/sign-in?invite=${encoded}`}>I already have a login</Link></div>
    <p className="notice">Development/demo only. This link is a one-time credential; do not share it beyond the fictitious test recipient.</p>
  </main>;
}
