import Link from "next/link";
import { listRegistrarRegistrations, AuthorizationError, hasPermission, hasRole } from "@faith-adventures/database/portal";
import { requirePortalUser } from "../lib/access";
import { notFound } from "next/navigation";

function statusLabel(status: string) { return status.replaceAll("_", " ").toLowerCase().replace(/^./, character => character.toUpperCase()); }

export default async function AdminPage() {
  const user = await requirePortalUser();
  const registrar = await hasRole(user.id, "registrar");
  const canConfigure = await hasPermission(user.id, "camp.configure");
  if (!registrar && !canConfigure) notFound();

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
      {canConfigure && <article><h2>Camp setup</h2><p>Manage seasons, sessions, dates, capacities, waitlists and registration windows.</p><Link className="button" href="/admin/configuration">Configure camp</Link></article>}
      {registrar && <article><h2>Registration review</h2><p>Review submitted registrations without exposing health-detail answers.</p><a className="button secondary" href="#registrations">Registration queue</a></article>}
    </div>
    {registrar && <section className="table-card" id="registrations">
      <div><h2>Registrations</h2><p>Fictitious development records only. Health-detail answers are not exposed in this registrar queue.</p></div>
      <table><thead><tr><th>Camper</th><th>Season / session</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.person.firstName} {row.person.lastName}</td><td>{row.session.season.name}<br /><small>{row.session.name}</small></td><td>{statusLabel(row.status)}</td><td>{row.updatedAt.toLocaleDateString()}</td><td><Link href={`/admin/registrations/${row.id}`}>Review</Link></td></tr>)}</tbody></table>
    </section>}
  </main>;
}
