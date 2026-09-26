import Link from "next/link";
import { notFound } from "next/navigation";
import { listRegistrarReports, ReportsAuthorizationError, type ReportFilters } from "@faith-adventures/database/reports";
import { requirePortalUser } from "../../lib/access";

const statuses = ["SUBMITTED","PENDING_REVIEW","NEEDS_INFORMATION","APPROVED","WAITLISTED","CANCELLED","CHECKED_IN","COMPLETED"] as const;
function valueOf(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function label(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase()); }

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalUser();
  const query = await searchParams;
  const rawStatus = valueOf(query.status);
  const filters: ReportFilters = {
    sessionId: valueOf(query.sessionId) || undefined,
    status: statuses.includes(rawStatus as typeof statuses[number]) ? rawStatus as ReportFilters["status"] : undefined,
    search: valueOf(query.search) || undefined,
  };
  let data: Awaited<ReturnType<typeof listRegistrarReports>>;
  try { data = await listRegistrarReports(user.id, filters); }
  catch (error) { if (error instanceof ReportsAuthorizationError) notFound(); throw error; }
  const params = new URLSearchParams();
  if (filters.sessionId) params.set("sessionId", filters.sessionId);
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  return <main className="shell">
    <p><Link href="/admin">← Admin workspace</Link></p>
    <p className="eyebrow">Registrar reporting</p><h1>Camp reports</h1>
    <p className="notice">Reports include operational and household contact information for registrar work. Medical answers and financial ledger details are excluded.</p>
    <section className="detail-card"><div className="section-heading-row"><h2>Filters</h2><Link className="button secondary" href={`/api/admin/reports/registrations.csv${params.size ? `?${params}` : ""}`}>Download CSV</Link></div><form className="auth-form" method="get">
      <label>Search camper<input name="search" defaultValue={filters.search ?? ""}/></label>
      <label>Session<select name="sessionId" defaultValue={filters.sessionId ?? ""}><option value="">All sessions</option>{data.sessions.map(session => <option key={session.id} value={session.id}>{session.season.name} — {session.name}</option>)}</select></label>
      <label>Status<select name="status" defaultValue={filters.status ?? ""}><option value="">All submitted statuses</option>{statuses.map(status => <option key={status} value={status}>{label(status)}</option>)}</select></label>
      <div className="home-actions"><button type="submit">Apply</button><Link className="button secondary" href="/admin/reports">Clear</Link></div>
    </form></section>
    <div className="card-grid">
      <article><h2>Status counts</h2>{data.statusCounts.length ? data.statusCounts.map(([status,count]) => <p key={status}>{label(status)}: <strong>{count}</strong></p>) : <p>No registrations.</p>}</article>
      <article><h2>T-shirt counts</h2>{data.shirtCounts.length ? data.shirtCounts.map(([size,count]) => <p key={size}>{size}: <strong>{count}</strong></p>) : <p>No sizes.</p>}</article>
    </div>
    <section className="table-card"><div><h2>Registration contact report</h2><p>{data.rows.length} row{data.rows.length === 1 ? "" : "s"}.</p></div>
      {data.rows.length === 0 ? <p>No registrations match these filters.</p> : <table><thead><tr><th>Camper</th><th>Session/status</th><th>Grade / shirt</th><th>Placement</th><th>Guardian contact</th><th>Attendance</th></tr></thead>
      <tbody>{data.rows.map(row => <tr key={row.registrationId}><td><strong>{row.camperName}</strong><br/><small>{row.householdName}</small></td><td>{row.seasonName} — {row.sessionName}<br/><small>{label(row.status)}</small></td><td>{row.grade || "—"}<br/><small>{row.shirtSize || "—"}</small></td><td>{row.groupName || "No group"}<br/><small>{row.cabinName || "No cabin"}</small></td><td>{row.guardianName || "Not provided"}<br/>{row.guardianEmail || "No email"}<br/>{row.guardianPhone || "No phone"}<br/><small>{row.address || "No address"}</small></td><td>{row.checkedInAt ? `In ${row.checkedInAt.toLocaleString()}` : "Not checked in"}{row.checkedOutAt && <><br/>{`Out ${row.checkedOutAt.toLocaleString()}`}</>}</td></tr>)}</tbody></table>}
    </section>
  </main>;
}
