import Link from "next/link";
import { notFound } from "next/navigation";
import { CommunicationsAuthorizationError, listOutbox } from "@faith-adventures/database/communications";
import { hasPermission } from "@faith-adventures/database/portal";
import { requirePortalUser } from "../../lib/access";
import { queueMessageAction, simulateSentAction } from "./actions";

function valueOf(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function label(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase()); }

function MessageFields() {
  return <><label>Subject<input name="subject" required maxLength={200}/></label><label>Message<textarea name="body" required rows={5}/></label><button type="submit">Queue message</button></>;
}

export default async function CommunicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalUser();
  let data: Awaited<ReturnType<typeof listOutbox>>;
  try { data = await listOutbox(user.id); }
  catch (error) { if (error instanceof CommunicationsAuthorizationError) notFound(); throw error; }
  const canWrite = await hasPermission(user.id, "communications.write");
  const query = await searchParams;
  const saved = valueOf(query.saved);
  const error = valueOf(query.error);
  return <main className="shell">
    <p><Link href="/admin">← Admin workspace</Link></p>
    <p className="eyebrow">Demo communications</p><h1>Communications outbox</h1>
    <p className="notice"><strong>No external delivery occurs here.</strong> Messages are queued with a recipient snapshot and can only be marked as simulated sent. A future email provider can consume this outbox without changing registrar workflows.</p>
    {saved && <p className="save-confirmation" role="status">{saved === "sent" ? "Message marked simulated sent." : "Message queued."}</p>}
    {error && <p className="notice" role="alert">{error}</p>}
    {canWrite && <div className="card-grid">
      <article><h2>All registered households</h2><form action={queueMessageAction} className="auth-form"><input type="hidden" name="audienceType" value="ALL_HOUSEHOLDS"/><MessageFields/></form></article>
      <article><h2>One session</h2><form action={queueMessageAction} className="auth-form"><input type="hidden" name="audienceType" value="SESSION"/><label>Session<select name="audienceRef" required defaultValue=""><option value="" disabled>Select session</option>{data.sessions.map(session => <option key={session.id} value={session.id}>{session.season.name} — {session.name}</option>)}</select></label><MessageFields/></form></article>
      <article><h2>Registration status</h2><form action={queueMessageAction} className="auth-form"><input type="hidden" name="audienceType" value="REGISTRATION_STATUS"/><label>Status<select name="audienceRef" required defaultValue=""><option value="" disabled>Select status</option>{data.registrationStatuses.map(status => <option key={status} value={status}>{label(status)}</option>)}</select></label><MessageFields/></form></article>
      <article><h2>All active staff</h2><form action={queueMessageAction} className="auth-form"><input type="hidden" name="audienceType" value="STAFF"/><MessageFields/></form></article>
    </div>}
    <section className="table-card"><div><h2>Outbox history</h2><p>{data.messages.length} message{data.messages.length === 1 ? "" : "s"} retained for audit and later provider integration.</p></div>
      {data.messages.length === 0 ? <p>No messages queued yet.</p> : <table><thead><tr><th>Created</th><th>Audience</th><th>Recipients</th><th>Subject</th><th>Status</th>{canWrite && <th></th>}</tr></thead>
      <tbody>{data.messages.map(message => <tr key={message.id}><td>{message.createdAt.toLocaleString()}<br/><small>{message.actorUser?.name || "System"}</small></td><td>{label(message.audienceType)}{message.audienceRef && <><br/><small>{message.audienceRef}</small></>}</td><td>{message.recipientCount}</td><td><strong>{message.subject}</strong><br/><small>{message.body}</small></td><td>{label(message.status)}{message.simulatedSentAt && <><br/><small>{message.simulatedSentAt.toLocaleString()}</small></>}</td>{canWrite && <td>{message.status === "QUEUED" ? <form action={simulateSentAction}><input type="hidden" name="messageId" value={message.id}/><button type="submit">Simulate sent</button></form> : <span className="muted">Recorded</span>}</td>}</tr>)}</tbody></table>}
    </section>
  </main>;
}
