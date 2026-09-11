import Link from "next/link";
import { notFound } from "next/navigation";
import { listOperationsSetup, OperationsAuthorizationError, STAFF_ROLES } from "@faith-adventures/database/operations";
import { requirePortalUser } from "../../lib/access";
import { addCabin, addGroup, addStaff, removeStaff } from "./actions";

function roleLabel(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, character => character.toUpperCase());
}

export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requirePortalUser();
  let data: Awaited<ReturnType<typeof listOperationsSetup>>;
  try {
    data = await listOperationsSetup(user.id);
  } catch (error) {
    if (error instanceof OperationsAuthorizationError) notFound();
    throw error;
  }
  const query = await searchParams;

  return <main className="shell">
    <p><Link href="/admin">← Admin workspace</Link></p>
    <p className="eyebrow">Camp operations setup</p>
    <h1>Groups, cabins & staff</h1>
    {query.saved && <p className="save-confirmation" role="status">Operations setup saved.</p>}
    <p>Camp roles are additive. Assigning a guardian as a counselor keeps their family access. Staff workspaces are assignment-scoped and do not expose camper medical details.</p>

    {data.sessions.length === 0 && <section className="detail-card"><h2>No sessions configured</h2><p>Create a season and session before building operational groups and cabins.</p><Link className="button" href="/admin/configuration">Configure camp</Link></section>}

    {data.sessions.map(session => <section className="detail-card" key={session.id}>
      <div className="section-heading-row">
        <div><p className="eyebrow">{session.season.name}</p><h2>{session.name}</h2></div>
        <span>{session.startDate.toLocaleDateString()} – {session.endDate.toLocaleDateString()}</span>
      </div>

      <div className="card-grid">
        <form action={addGroup} className="auth-form">
          <h3>Add group</h3>
          <input type="hidden" name="sessionId" value={session.id} />
          <label>Group name<input name="name" required placeholder="Junior Faith" /></label>
          <label>Capacity<input name="capacity" type="number" min="1" /></label>
          <button>Add group</button>
        </form>
        <form action={addCabin} className="auth-form">
          <h3>Add cabin</h3>
          <input type="hidden" name="sessionId" value={session.id} />
          <label>Cabin name<input name="name" required placeholder="Cabin C" /></label>
          <label>Group<select name="groupId"><option value="">No group</option>{session.groups.map(group => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label>
          <label>Capacity<input name="capacity" type="number" min="1" required defaultValue="10" /></label>
          <button>Add cabin</button>
        </form>
      </div>

      <div className="section-heading-row"><h3>Groups & cabins</h3></div>
      {session.groups.length === 0 && session.cabins.length === 0 ? <p>No groups or cabins configured.</p> : <div className="member-list">
        {session.groups.map(group => <div className="member-card static" key={group.id}>
          <span><strong>{group.name}</strong><small>{group.capacity ? `Capacity ${group.capacity}` : "No group capacity set"}</small></span>
          <span>{session.cabins.filter(cabin => cabin.groupId === group.id).map(cabin => `${cabin.name} (${cabin.capacity})`).join(", ") || "No cabins"}</span>
        </div>)}
        {session.cabins.filter(cabin => !cabin.groupId).map(cabin => <div className="member-card static" key={cabin.id}><span><strong>{cabin.name}</strong><small>Ungrouped cabin</small></span><span>Capacity {cabin.capacity}</span></div>)}
      </div>}

      <div className="detail-card">
        <h3>Assign staff</h3>
        <form action={addStaff} className="auth-form">
          <input type="hidden" name="sessionId" value={session.id} />
          <label>Person<select name="personId" required defaultValue=""><option value="" disabled>Select person</option>{data.people.map(person => <option value={person.id} key={person.id}>{person.lastName}, {person.firstName}{person.user ? " — login linked" : " — no login yet"}</option>)}</select></label>
          <label>Camp role<select name="role" required defaultValue="COUNSELOR">{STAFF_ROLES.map(role => <option value={role} key={role}>{roleLabel(role)}</option>)}</select></label>
          <label>Group<select name="groupId"><option value="">No group</option>{session.groups.map(group => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label>
          <label>Cabin<select name="cabinId"><option value="">No cabin</option>{session.cabins.map(cabin => <option value={cabin.id} key={cabin.id}>{cabin.name}{cabin.group ? ` — ${cabin.group.name}` : ""}</option>)}</select></label>
          <button>Assign staff</button>
        </form>
        <p className="muted">Choosing a cabin automatically scopes the assignment to that cabin&apos;s group. A linked login is required before the person can open the staff workspace.</p>
      </div>

      <div className="section-heading-row"><h3>Staff team</h3></div>
      {session.staffAssignments.length === 0 ? <p>No staff assigned.</p> : <div className="member-list">{session.staffAssignments.map(assignment => <div className="member-card static" key={assignment.id}>
        <span><strong>{assignment.person.firstName} {assignment.person.lastName}</strong><small>{roleLabel(assignment.role)} · {assignment.group?.name || "Camp-wide"} · {assignment.cabin?.name || "No cabin"}{assignment.person.user ? " · login linked" : " · no login"}</small></span>
        <form action={removeStaff}><input type="hidden" name="assignmentId" value={assignment.id} /><button className="button secondary">Remove</button></form>
      </div>)}</div>}
    </section>)}
  </main>;
}
