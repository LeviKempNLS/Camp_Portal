import Link from "next/link";
import { listRegistrarRegistrations, AuthorizationError, hasPermission, hasRole } from "@faith-adventures/database/portal";
import { requirePortalUser } from "../lib/access";
import { notFound } from "next/navigation";

function statusLabel(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/^./, character => character.toUpperCase());
}

export default async function AdminPage() {
  const user = await requirePortalUser();
  const [registrar, canConfigure, canOperations, canRoster, canFinance, canAttendance, canReports, canCommunications] = await Promise.all([
    hasRole(user.id, "registrar"),
    hasPermission(user.id, "camp.configure"),
    hasPermission(user.id, "operations.manage"),
    hasPermission(user.id, "roster.read"),
    hasPermission(user.id, "finance.read"),
    hasPermission(user.id, "attendance.read"),
    hasPermission(user.id, "reports.read"),
    hasPermission(user.id, "communications.read"),
  ]);
  if (!registrar && !canConfigure && !canOperations && !canRoster && !canFinance && !canAttendance && !canReports && !canCommunications) notFound();

  let rows: Awaited<ReturnType<typeof listRegistrarRegistrations>> = [];
  if (registrar) {
    try {
      rows = await listRegistrarRegistrations(user.id);
    } catch (error) {
      if (error instanceof AuthorizationError) notFound();
      throw error;
    }
  }

  return <main className="shell">
    <p className="eyebrow">Camp administration</p>
    <h1>Admin workspace</h1>
    <div className="card-grid">
      {canRoster && <article><h2>Camper roster</h2><p>Sort campers by age group, operations group, cabin, T-shirt size and status. Medical and financial data stay out of this view.</p><Link className="button" href="/admin/roster">Open roster</Link></article>}
      {canAttendance && <article><h2>Check-in & attendance</h2><p>Check approved campers in and out and track arrival status without loading medical or financial records.</p><Link className="button" href="/admin/check-in">Open check-in</Link></article>}
      {canFinance && <article><h2>Camp finances</h2><p>Track charges, offline payments, scholarships, church sponsorships and balances in the internal ledger.</p><Link className="button" href="/admin/finance">Open finances</Link></article>}
      {canReports && <article><h2>Registrar reports</h2><p>Export operational and household-contact reports with medical and financial fields intentionally excluded.</p><Link className="button" href="/admin/reports">Open reports</Link></article>}
      {canCommunications && <article><h2>Communications</h2><p>Queue demo email communications to households, sessions, registration statuses, or active staff.</p><Link className="button" href="/admin/communications">Open outbox</Link></article>}
      {canConfigure && <article><h2>Camp setup</h2><p>Manage seasons, sessions, dates, capacities, waitlists and registration windows.</p><Link className="button" href="/admin/configuration">Configure camp</Link></article>}
      {canOperations && <article><h2>Camp operations</h2><p>Build groups and cabins and assign staff with session, group and cabin scope.</p><Link className="button" href="/admin/operations">Groups, cabins & staff</Link></article>}
      {registrar && <article><h2>Registration review</h2><p>Review submitted registrations without exposing health-detail answers.</p><a className="button secondary" href="#registrations">Registration queue</a></article>}
    </div>
    {registrar && <section className="table-card" id="registrations">
      <div><h2>Registrations</h2><p>Fictitious development records only. Health-detail answers are not exposed in this registrar queue.</p></div>
      <table><thead><tr><th>Camper</th><th>Season / session</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.person.firstName} {row.person.lastName}</td><td>{row.session.season.name}<br /><small>{row.session.name}</small></td><td>{statusLabel(row.status)}</td><td>{row.updatedAt.toLocaleDateString()}</td><td><Link href={`/admin/registrations/${row.id}`}>Review</Link></td></tr>)}</tbody></table>
    </section>}
  </main>;
}
