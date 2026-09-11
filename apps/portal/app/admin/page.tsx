import Link from "next/link";
import { listRegistrarRegistrations, AuthorizationError } from "@faith-adventures/database/portal";
import { requirePortalUser } from "../lib/access";
import { notFound } from "next/navigation";

function statusLabel(status:string){return status.replaceAll("_"," ").toLowerCase().replace(/^./,c=>c.toUpperCase());}

export default async function AdminPage(){
 const user=await requirePortalUser();
 let rows;
 try { rows=await listRegistrarRegistrations(user.id); } catch (error) { if(error instanceof AuthorizationError) notFound(); throw error; }
 return <main className="shell"><p className="eyebrow">Registrar workspace</p><h1>Registration queue</h1><section className="table-card"><div><h2>Registrations</h2><p>Fictitious development records only. Health-detail answers are not exposed in this registrar queue.</p></div><table><thead><tr><th>Camper</th><th>Season / session</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.person.firstName} {r.person.lastName}</td><td>{r.session.season.name}<br/><small>{r.session.name}</small></td><td>{statusLabel(r.status)}</td><td>{r.updatedAt.toLocaleDateString()}</td><td><Link href={`/admin/registrations/${r.id}`}>Review</Link></td></tr>)}</tbody></table></section></main>
}
