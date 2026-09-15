import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffWorkspace, OperationsAuthorizationError } from "@faith-adventures/database/operations";
import { getStaffCamperRoster, RosterAuthorizationError } from "@faith-adventures/database/roster";
import { requirePortalUser } from "../lib/access";

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, character => character.toUpperCase());
}

export default async function StaffPage() {
  const user = await requirePortalUser();
  let assignments: Awaited<ReturnType<typeof getStaffWorkspace>>;
  let camperRosters: Awaited<ReturnType<typeof getStaffCamperRoster>>;
  try {
    [assignments, camperRosters] = await Promise.all([
      getStaffWorkspace(user.id),
      getStaffCamperRoster(user.id),
    ]);
  } catch (error) {
    if (error instanceof OperationsAuthorizationError || error instanceof RosterAuthorizationError) notFound();
    throw error;
  }
  const rosterByAssignment = new Map(camperRosters.map(roster => [roster.assignmentId, roster.rows]));

  return <main className="shell">
    <p className="eyebrow">Staff workspace</p>
    <h1>Your camp assignments</h1>
    <p className="notice"><strong>Confidentiality:</strong> staff access is limited to active assignment scope. This workspace shows operational placement and T-shirt information only; medical details, guardian contact details, and financial information are not included.</p>
    {assignments.map(assignment => {
      const campers = rosterByAssignment.get(assignment.id) ?? [];
      return <section className="detail-card" key={assignment.id}>
        <div className="section-heading-row">
          <div><p className="eyebrow">{assignment.session.season.name}</p><h2>{assignment.session.name}</h2></div>
          <strong>{label(assignment.role)}</strong>
        </div>
        <dl className="detail-grid">
          <div><dt>Group</dt><dd>{assignment.group?.name || "Camp-wide"}</dd></div>
          <div><dt>Cabin</dt><dd>{assignment.cabin?.name || "Not cabin-specific"}</dd></div>
          <div><dt>Session dates</dt><dd>{assignment.session.startDate.toLocaleDateString()} – {assignment.session.endDate.toLocaleDateString()}</dd></div>
        </dl>

        <h3>Campers in your scope</h3>
        {campers.length === 0 ? <p>No campers are currently assigned within this scope.</p> : <div className="table-card"><table>
          <thead><tr><th>Camper</th><th>Age / grade</th><th>Group</th><th>Cabin</th><th>T-shirt</th></tr></thead>
          <tbody>{campers.map(camper => <tr key={camper.registrationId}>
            <td><strong>{camper.camperName}</strong></td>
            <td>{camper.age ?? "—"}<br /><small>Grade {camper.grade || "—"}</small></td>
            <td>{camper.groupName || "Unassigned"}</td>
            <td>{camper.cabinName || "No cabin"}</td>
            <td>{camper.shirtSize || "—"}</td>
          </tr>)}</tbody>
        </table></div>}

        <h3>Your team</h3>
        {assignment.team.length === 0 ? <p>No other staff are currently in your assignment scope.</p> : <div className="member-list">{assignment.team.map(teammate => <div className="member-card static" key={teammate.id}>
          <span><strong>{teammate.person.firstName} {teammate.person.lastName}</strong><small>{label(teammate.role)}</small></span>
          <span>{teammate.cabin?.name || teammate.group?.name || "Camp-wide"}</span>
        </div>)}</div>}
      </section>;
    })}
    <p><Link href="/dashboard">Back to dashboard</Link></p>
  </main>;
}
