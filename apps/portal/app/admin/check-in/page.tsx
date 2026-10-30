import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceAuthorizationError, listCheckInDashboard, type AttendanceFilters } from "@faith-adventures/database/attendance";
import { hasPermission } from "@faith-adventures/database/portal";
import { requirePortalUser } from "../../lib/access";
import { checkInAction, checkOutAction } from "./actions";

function valueOf(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function label(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase()); }

export default async function CheckInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalUser();
  const query = await searchParams;
  const filters: AttendanceFilters = { sessionId: valueOf(query.sessionId) || undefined, search: valueOf(query.search) || undefined };
  let data: Awaited<ReturnType<typeof listCheckInDashboard>>;
  try { data = await listCheckInDashboard(user.id, filters); }
  catch (error) { if (error instanceof AttendanceAuthorizationError) notFound(); throw error; }
  const canManage = await hasPermission(user.id, "attendance.manage");
  const params = new URLSearchParams();
  if (filters.sessionId) params.set("sessionId", filters.sessionId);
  if (filters.search) params.set("search", filters.search);
  const returnTo = `/admin/check-in${params.size ? `?${params}` : ""}`;
  const saved = valueOf(query.saved);
  const error = valueOf(query.error);
  return <main className="shell">
    <p><Link href="/admin">← Admin workspace</Link></p>
    <p className="eyebrow">Camp operations</p>
    <h1>Check-in and attendance</h1>
    <p className="notice">This workspace intentionally contains operational attendance details only. Medical and financial information are not loaded here.</p>
    {saved && <p className="save-confirmation" role="status">{saved === "checked-out" ? "Camper checked out." : "Camper checked in."}</p>}
    {error && <p className="notice" role="alert">{error}</p>}
    <section className="detail-card"><h2>Find campers</h2><form className="auth-form" method="get">
      <label>Search<input name="search" defaultValue={filters.search ?? ""} placeholder="Camper name"/></label>
      <label>Session<select name="sessionId" defaultValue={filters.sessionId ?? ""}><option value="">All sessions</option>{data.sessions.map(session => <option key={session.id} value={session.id}>{session.season.name} — {session.name}</option>)}</select></label>
      <div className="home-actions"><button type="submit">Apply</button><Link className="button secondary" href="/admin/check-in">Clear</Link></div>
    </form></section>
    <section className="table-card"><div><h2>Attendance</h2><p>{data.rows.length} approved, checked-in, or completed camper{data.rows.length === 1 ? "" : "s"}.</p></div>
      {data.rows.length === 0 ? <p>No campers are ready for check-in yet. Approve registrations first.</p> : <table><thead><tr><th>Camper</th><th>Session</th><th>Placement</th><th>Status</th><th>Times</th>{canManage && <th>Action</th>}</tr></thead>
      <tbody>{data.rows.map(row => <tr key={row.registrationId}><td><strong>{row.camperName}</strong></td><td>{row.seasonName}<br/><small>{row.sessionName}</small></td><td>{row.groupName || "No group"}<br/><small>{row.cabinName || "No cabin"}</small></td><td>{label(row.registrationStatus)}</td><td>{row.attendance?.checkedInAt ? <>In: {row.attendance.checkedInAt.toLocaleString()}</> : "Not checked in"}{row.attendance?.checkedOutAt && <><br/>Out: {row.attendance.checkedOutAt.toLocaleString()}</>}</td>{canManage && <td>
        {row.registrationStatus === "APPROVED" && <form action={checkInAction} className="auth-form"><input type="hidden" name="registrationId" value={row.registrationId}/><input type="hidden" name="returnTo" value={returnTo}/><label>Arrival note<input name="notes" placeholder="Optional"/></label><button type="submit">Check in</button></form>}
        {row.registrationStatus === "CHECKED_IN" && <form action={checkOutAction}><input type="hidden" name="registrationId" value={row.registrationId}/><input type="hidden" name="returnTo" value={returnTo}/><button type="submit">Check out</button></form>}
        {row.registrationStatus === "COMPLETED" && <span className="muted">Completed</span>}
      </td>}</tr>)}</tbody></table>}
    </section>
  </main>;
}
