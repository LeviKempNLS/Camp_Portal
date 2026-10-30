import Link from "next/link";
import { notFound } from "next/navigation";
import { listMedicalWorkspace, MedicalAuthorizationError, type MedicalFilters } from "@faith-adventures/database/medical";
import { requirePortalUser } from "../lib/access";

function valueOf(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function show(value: string) { return value || "Not provided"; }

export default async function MedicalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalUser();
  const query = await searchParams;
  const filters: MedicalFilters = { sessionId: valueOf(query.sessionId) || undefined, search: valueOf(query.search) || undefined };
  let data: Awaited<ReturnType<typeof listMedicalWorkspace>>;
  try { data = await listMedicalWorkspace(user.id, filters); }
  catch (error) { if (error instanceof MedicalAuthorizationError) notFound(); throw error; }
  return <main className="shell">
    <p><Link href="/dashboard">← Dashboard</Link></p>
    <p className="eyebrow">Restricted medical workspace</p>
    <h1>Camper health and care</h1>
    <p className="notice"><strong>Restricted information:</strong> access to this page requires the separate medical.read permission and each view is audited. Finance data and unrelated registration answers are excluded.</p>
    <section className="detail-card"><form className="auth-form" method="get">
      <label>Search camper<input name="search" defaultValue={filters.search ?? ""}/></label>
      <label>Session<select name="sessionId" defaultValue={filters.sessionId ?? ""}><option value="">All sessions</option>{data.sessions.map(session => <option key={session.id} value={session.id}>{session.season.name} — {session.name}</option>)}</select></label>
      <div className="home-actions"><button type="submit">Apply</button><Link className="button secondary" href="/medical">Clear</Link></div>
    </form></section>
    <section className="table-card"><div><h2>Care roster</h2><p>{data.rows.length} approved or attending camper{data.rows.length === 1 ? "" : "s"}.</p></div>
      {data.rows.length === 0 ? <p>No campers match these filters.</p> : <table><thead><tr><th>Camper</th><th>Emergency</th><th>Insurance</th><th>Allergies / diet</th><th>Medications / notes</th></tr></thead>
      <tbody>{data.rows.map(row => <tr key={row.registrationId}><td><strong>{row.camperName}</strong><br/><small>{row.sessionName} · {row.cabinName || row.groupName || "Unassigned"}</small></td><td>{show(row.guardianName)}<br/>{show(row.guardianPhone)}<br/><small>{show(row.emergencyContact)}</small></td><td>{show(row.insurance)}</td><td><strong>Allergies:</strong> {show(row.allergies)}<br/><strong>Dietary:</strong> {show(row.dietary)}</td><td><strong>Medications:</strong> {show(row.medications)}<br/><strong>Notes:</strong> {show(row.healthNotes)}</td></tr>)}</tbody></table>}
    </section>
  </main>;
}
