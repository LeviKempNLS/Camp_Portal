import Link from "next/link";
import { notFound } from "next/navigation";
import { listCampRoster, RosterAuthorizationError, type RosterFilters, type RosterSort } from "@faith-adventures/database/roster";
import { hasPermission } from "@faith-adventures/database/portal";
import { requirePortalUser } from "../../lib/access";
import { clearCamperPlacement, saveCamperPlacement } from "./actions";

const sortOptions: { value: RosterSort; label: string }[] = [
  { value: "name", label: "Camper name" },
  { value: "session", label: "Camp session" },
  { value: "age", label: "Age" },
  { value: "grade", label: "Grade" },
  { value: "ageGroup", label: "Age group" },
  { value: "group", label: "Camp group" },
  { value: "cabin", label: "Cabin" },
  { value: "shirtSize", label: "T-shirt size" },
  { value: "status", label: "Registration status" },
];

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, character => character.toUpperCase());
}

function filtersFrom(query: Record<string, string | string[] | undefined>): RosterFilters {
  const sort = valueOf(query.sort);
  const direction = valueOf(query.direction);
  return {
    sessionId: valueOf(query.sessionId) || undefined,
    ageGroup: valueOf(query.ageGroup) || undefined,
    groupId: valueOf(query.groupId) || undefined,
    cabinId: valueOf(query.cabinId) || undefined,
    shirtSize: valueOf(query.shirtSize) || undefined,
    status: valueOf(query.status) || undefined,
    search: valueOf(query.search) || undefined,
    sort: sortOptions.some(option => option.value === sort) ? sort as RosterSort : "name",
    direction: direction === "desc" ? "desc" : "asc",
  };
}

function filterParams(filters: RosterFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return params;
}

export default async function RegistrarRosterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalUser();
  const query = await searchParams;
  const filters = filtersFrom(query);
  let data: Awaited<ReturnType<typeof listCampRoster>>;
  try {
    data = await listCampRoster(user.id, filters);
  } catch (error) {
    if (error instanceof RosterAuthorizationError) notFound();
    throw error;
  }
  const canManage = await hasPermission(user.id, "roster.manage");

  const params = filterParams(filters);
  const returnTo = `/admin/roster${params.size ? `?${params.toString()}` : ""}`;
  const shirtCounts = [...data.rows.reduce((counts, row) => {
    const size = row.shirtSize || "Not provided";
    counts.set(size, (counts.get(size) ?? 0) + 1);
    return counts;
  }, new Map<string, number>())].sort(([left], [right]) => left.localeCompare(right));
  const saved = valueOf(query.saved);
  const error = valueOf(query.error);

  return <main className="shell">
    <p><Link href="/admin">← Admin workspace</Link></p>
    <p className="eyebrow">Registrar operations</p>
    <h1>Camper roster</h1>
    <p className="notice"><strong>Confidentiality:</strong> this is an operational roster. Medical answers, insurance details, guardian contact details, and financial information are intentionally excluded. Counselors and directors receive separately scoped roster views.</p>
    {saved && <p className="save-confirmation" role="status">Camper placement saved.</p>}
    {error && <p className="notice" role="alert">{error}</p>}

    <section className="detail-card">
      <div className="section-heading-row"><div><h2>Find campers</h2><p>{data.rows.length} camper{data.rows.length === 1 ? "" : "s"} in this view.</p></div><Link className="button secondary" href={`/api/admin/roster.csv${params.size ? `?${params.toString()}` : ""}`}>Download CSV</Link></div>
      <form className="auth-form" method="get">
        <label>Search camper<input name="search" defaultValue={filters.search ?? ""} placeholder="First or last name" /></label>
        <label>Camp session<select name="sessionId" defaultValue={filters.sessionId ?? ""}><option value="">All sessions</option>{data.sessions.map(session => <option key={session.id} value={session.id}>{session.season.name} — {session.name}</option>)}</select></label>
        <label>Age group<select name="ageGroup" defaultValue={filters.ageGroup ?? ""}><option value="">All age groups</option>{data.ageGroups.map(group => <option key={group.key} value={group.key}>{group.label}</option>)}</select></label>
        <label>Operations group<select name="groupId" defaultValue={filters.groupId ?? ""}><option value="">All groups</option>{data.sessions.flatMap(session => session.groups.map(group => <option key={group.id} value={group.id}>{session.name} — {group.name}</option>))}</select></label>
        <label>Cabin<select name="cabinId" defaultValue={filters.cabinId ?? ""}><option value="">All cabins</option>{data.sessions.flatMap(session => session.cabins.map(cabin => <option key={cabin.id} value={cabin.id}>{session.name} — {cabin.name}</option>))}</select></label>
        <label>T-shirt size<select name="shirtSize" defaultValue={filters.shirtSize ?? ""}><option value="">All sizes</option>{data.shirtSizes.map(size => <option key={size} value={size}>{size}</option>)}</select></label>
        <label>Registration status<select name="status" defaultValue={filters.status ?? ""}><option value="">All active roster statuses</option>{data.statuses.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
        <label>Sort by<select name="sort" defaultValue={filters.sort ?? "name"}>{sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label>Direction<select name="direction" defaultValue={filters.direction ?? "asc"}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
        <div className="home-actions"><button type="submit">Apply filters</button><Link className="button secondary" href="/admin/roster">Clear</Link></div>
      </form>
    </section>

    <section className="detail-card">
      <h2>T-shirt count for this view</h2>
      {shirtCounts.length === 0 ? <p>No T-shirt sizes are available for the current filters.</p> : <div className="member-list">{shirtCounts.map(([size, count]) => <div className="member-card static" key={size}><strong>{size}</strong><span>{count}</span></div>)}</div>}
    </section>

    <section className="table-card">
      <div><h2>Campers</h2><p>{canManage ? "Assign campers to groups and cabins here. Cabin and group capacity are enforced server-side." : "This account has read-only roster access. Placement changes require the separate roster.manage permission."}</p></div>
      {data.rows.length === 0 ? <p>No campers match these filters.</p> : <table>
        <thead><tr><th>Camper</th><th>Age / grade</th><th>Age group</th><th>T-shirt</th><th>Current placement</th><th>Registration</th><th>Placement</th></tr></thead>
        <tbody>{data.rows.map(row => {
          const session = data.sessions.find(candidate => candidate.id === row.sessionId);
          return <tr key={row.registrationId}>
            <td><strong>{row.camperName}</strong><br /><small>{row.sessionName}</small></td>
            <td>{row.age ?? "—"}<br /><small>Grade {row.grade || "—"}</small></td>
            <td>{row.ageGroup || "—"}</td>
            <td>{row.shirtSize || "—"}</td>
            <td>{row.groupName || "Unassigned"}<br /><small>{row.cabinName || "No cabin"}</small></td>
            <td>{statusLabel(row.status)}</td>
            <td>{canManage ? <>
              <form action={saveCamperPlacement} className="auth-form">
                <input type="hidden" name="registrationId" value={row.registrationId} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <label>Group<select name="groupId" defaultValue={row.groupId ?? ""}><option value="">No group</option>{session?.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
                <label>Cabin<select name="cabinId" defaultValue={row.cabinId ?? ""}><option value="">No cabin</option>{session?.cabins.map(cabin => <option key={cabin.id} value={cabin.id}>{cabin.name}</option>)}</select></label>
                <button type="submit">Save placement</button>
              </form>
              {row.placementId && <form action={clearCamperPlacement}>
                <input type="hidden" name="registrationId" value={row.registrationId} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button className="button secondary" type="submit">Clear placement</button>
              </form>}
            </> : <span className="muted">Read only</span>}</td>
          </tr>;
        })}</tbody>
      </table>}
    </section>
  </main>;
}
