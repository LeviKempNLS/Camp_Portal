import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffWorkspace, OperationsAuthorizationError } from "@faith-adventures/database/operations";
import { requirePortalUser } from "../lib/access";

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, character => character.toUpperCase());
}

export default async function StaffPage() {
  const user = await requirePortalUser();
  let assignments: Awaited<ReturnType<typeof getStaffWorkspace>>;
  try {
    assignments = await getStaffWorkspace(user.id);
  } catch (error) {
    if (error instanceof OperationsAuthorizationError) notFound();
    throw error;
  }

  return <main className="shell">
    <p className="eyebrow">Staff workspace</p>
    <h1>Your camp assignments</h1>
    <p>Staff access is scoped to active session, group and cabin assignments. This view intentionally excludes camper medical details and registration-form answers.</p>
    {assignments.map(assignment => <section className="detail-card" key={assignment.id}>
      <div className="section-heading-row">
        <div><p className="eyebrow">{assignment.session.season.name}</p><h2>{assignment.session.name}</h2></div>
        <strong>{label(assignment.role)}</strong>
      </div>
      <dl className="detail-grid">
        <div><dt>Group</dt><dd>{assignment.group?.name || "Camp-wide"}</dd></div>
        <div><dt>Cabin</dt><dd>{assignment.cabin?.name || "Not cabin-specific"}</dd></div>
        <div><dt>Session dates</dt><dd>{assignment.session.startDate.toLocaleDateString()} – {assignment.session.endDate.toLocaleDateString()}</dd></div>
      </dl>
      <h3>Your team</h3>
      {assignment.team.length === 0 ? <p>No other staff are currently in your assignment scope.</p> : <div className="member-list">{assignment.team.map(teammate => <div className="member-card static" key={teammate.id}>
        <span><strong>{teammate.person.firstName} {teammate.person.lastName}</strong><small>{label(teammate.role)}</small></span>
        <span>{teammate.cabin?.name || teammate.group?.name || "Camp-wide"}</span>
      </div>)}</div>}
      <p className="muted">Camper rosters and cabin assignments will be added in the next operations slice. Medical information remains separately permissioned.</p>
    </section>)}
    <p><Link href="/dashboard">Back to dashboard</Link></p>
  </main>;
}
