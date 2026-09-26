import Link from "next/link";
import { notFound } from "next/navigation";
import {
  FinanceAuthorizationError,
  listFinanceDashboard,
  type FinanceFilters,
  type FinancePaymentStatus,
} from "@faith-adventures/database/finance";
import { hasPermission } from "@faith-adventures/database/portal";
import { requirePortalUser } from "../../lib/access";
import {
  createChurchAction,
  createScholarshipAction,
  recordAdjustmentAction,
  recordChurchCommitmentAction,
  recordChurchPaymentAction,
  recordManualPaymentAction,
  recordRefundAction,
  recordScholarshipAction,
  reverseFinancialEntryAction,
  updateChurchAction,
  updateScholarshipAction,
} from "./actions";

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, character => character.toUpperCase());
}

function filtersFrom(query: Record<string, string | string[] | undefined>): FinanceFilters {
  const paymentStatus = valueOf(query.paymentStatus);
  return {
    sessionId: valueOf(query.sessionId) || undefined,
    paymentStatus: paymentStatus === "paid" || paymentStatus === "partial" || paymentStatus === "unpaid" ? paymentStatus as FinancePaymentStatus : undefined,
    churchId: valueOf(query.churchId) || undefined,
    scholarshipProgramId: valueOf(query.scholarshipProgramId) || undefined,
    search: valueOf(query.search) || undefined,
  };
}

function filterParams(filters: FinanceFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return params;
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalUser();
  const query = await searchParams;
  const filters = filtersFrom(query);
  let data: Awaited<ReturnType<typeof listFinanceDashboard>>;
  try {
    data = await listFinanceDashboard(user.id, filters);
  } catch (error) {
    if (error instanceof FinanceAuthorizationError) notFound();
    throw error;
  }
  const canRecord = await hasPermission(user.id, "finance.record");
  const params = filterParams(filters);
  const returnTo = `/admin/finance${params.size ? `?${params.toString()}` : ""}`;
  const saved = valueOf(query.saved);
  const error = valueOf(query.error);

  return <main className="shell">
    <p><Link href="/admin">← Admin workspace</Link></p>
    <p className="eyebrow">Restricted registrar finance</p>
    <h1>Camp finances</h1>
    <p className="notice"><strong>Separate from registration:</strong> a camper may be fully registered with a balance still due. This ledger is the source of truth for charges, offline payments, scholarships, church sponsorships, refunds and adjustments. Future online processors will post here instead of replacing it.</p>
    {saved && <p className="save-confirmation" role="status">Saved {saved}.</p>}
    {error && <p className="notice" role="alert">{error}</p>}

    <section className="detail-card">
      <h2>Filtered totals</h2>
      <dl className="detail-grid">
        <div><dt>Charges</dt><dd>{money(data.totals.charges)}</dd></div>
        <div><dt>Household paid</dt><dd>{money(data.totals.householdPaid)}</dd></div>
        <div><dt>Church paid</dt><dd>{money(data.totals.churchPaid)}</dd></div>
        <div><dt>Scholarships</dt><dd>{money(data.totals.scholarships)}</dd></div>
        <div><dt>Outstanding</dt><dd>{money(data.totals.balance)}</dd></div>
      </dl>
    </section>

    <section className="detail-card">
      <h2>Find camper accounts</h2>
      <form className="auth-form" method="get">
        <label>Camper search<input name="search" defaultValue={filters.search ?? ""} placeholder="First or last name" /></label>
        <label>Session<select name="sessionId" defaultValue={filters.sessionId ?? ""}><option value="">All sessions</option>{data.sessions.map(session => <option key={session.id} value={session.id}>{session.season.name} — {session.name}</option>)}</select></label>
        <label>Payment status<select name="paymentStatus" defaultValue={filters.paymentStatus ?? ""}><option value="">All balances</option><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="paid">Paid</option></select></label>
        <label>Church sponsor<select name="churchId" defaultValue={filters.churchId ?? ""}><option value="">All churches</option>{data.churches.map(church => <option key={church.id} value={church.id}>{church.name}</option>)}</select></label>
        <label>Scholarship<select name="scholarshipProgramId" defaultValue={filters.scholarshipProgramId ?? ""}><option value="">All scholarships</option>{data.scholarshipPrograms.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label>
        <div className="home-actions"><button type="submit">Apply filters</button><Link className="button secondary" href="/admin/finance">Clear</Link></div>
      </form>
    </section>

    <section className="table-card">
      <div><h2>Camper balances</h2><p>{data.rows.length} registration account{data.rows.length === 1 ? "" : "s"} in this view.</p></div>
      {data.rows.length === 0 ? <p>No registrations match these filters.</p> : <table>
        <thead><tr><th>Camper</th><th>Session</th><th>Funding</th><th>Balance</th><th>Status</th>{canRecord && <th>Record activity</th>}</tr></thead>
        <tbody>{data.rows.map(row => <tr key={row.registrationId}>
          <td><strong>{row.camperName}</strong><br /><small>{label(row.registrationStatus)}</small></td>
          <td>{row.seasonName}<br /><small>{row.sessionName}</small></td>
          <td>Family {money(row.householdPaid)}<br />Church {money(row.churchPaid)}<br />Scholarship {money(row.scholarships)}{row.churchCommitted > row.churchPaid && <><br /><small>Church committed {money(row.churchCommitted)}</small></>}</td>
          <td><strong>{money(row.balance)}</strong><br /><small>{label(row.paymentStatus)}</small></td>
          <td>Charge {money(row.charges)}{row.adjustments !== 0 && <><br /><small>Adjustments {money(row.adjustments)}</small></>}{row.refunds > 0 && <><br /><small>Refunds {money(row.refunds)}</small></>}</td>
          {canRecord && <td>
            <details><summary>Payment</summary><form action={recordManualPaymentAction} className="auth-form"><input type="hidden" name="registrationId" value={row.registrationId}/><input type="hidden" name="returnTo" value={returnTo}/><label>Amount<input name="amount" inputMode="decimal" required placeholder="50.00"/></label><label>Method<select name="method"><option value="CHECK">Check</option><option value="CASH">Cash</option><option value="OTHER">Other</option></select></label><label>Reference<input name="reference" placeholder="Check # / receipt"/></label><label>Note<input name="note"/></label><button type="submit">Record payment</button></form></details>
            <details><summary>Scholarship</summary><form action={recordScholarshipAction} className="auth-form"><input type="hidden" name="registrationId" value={row.registrationId}/><input type="hidden" name="returnTo" value={returnTo}/><label>Program<select name="scholarshipProgramId" required defaultValue=""><option value="" disabled>Select scholarship</option>{data.scholarshipPrograms.filter(program => program.active).map(program => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label><label>Amount<input name="amount" inputMode="decimal" required/></label><label>Note<input name="note"/></label><button type="submit">Apply scholarship</button></form></details>
            <details><summary>Church sponsorship</summary><form action={recordChurchCommitmentAction} className="auth-form"><input type="hidden" name="registrationId" value={row.registrationId}/><input type="hidden" name="returnTo" value={returnTo}/><label>Church<select name="churchId" required defaultValue=""><option value="" disabled>Select church</option>{data.churches.filter(church => church.active).map(church => <option key={church.id} value={church.id}>{church.name}</option>)}</select></label><label>Commitment<input name="amount" inputMode="decimal" required/></label><label>Note<input name="note"/></label><button type="submit">Record commitment</button></form>
              <form action={recordChurchPaymentAction} className="auth-form"><input type="hidden" name="registrationId" value={row.registrationId}/><input type="hidden" name="returnTo" value={returnTo}/><label>Church<select name="churchId" required defaultValue=""><option value="" disabled>Select church</option>{data.churches.filter(church => church.active).map(church => <option key={church.id} value={church.id}>{church.name}</option>)}</select></label><label>Payment<input name="amount" inputMode="decimal" required/></label><label>Method<select name="method"><option value="CHECK">Check</option><option value="CASH">Cash</option><option value="OTHER">Other</option></select></label><label>Reference<input name="reference"/></label><button type="submit">Record church payment</button></form></details>
            <details><summary>Adjustment / refund</summary><form action={recordAdjustmentAction} className="auth-form"><input type="hidden" name="registrationId" value={row.registrationId}/><input type="hidden" name="returnTo" value={returnTo}/><label>Signed adjustment<input name="amount" inputMode="decimal" required placeholder="-25.00 or 25.00"/></label><label>Required reason<input name="note" required/></label><button type="submit">Record adjustment</button></form>
              <form action={recordRefundAction} className="auth-form"><input type="hidden" name="registrationId" value={row.registrationId}/><input type="hidden" name="returnTo" value={returnTo}/><label>Refund amount<input name="amount" inputMode="decimal" required/></label><label>Method<select name="method"><option value="CHECK">Check</option><option value="CASH">Cash</option><option value="OTHER">Other</option></select></label><label>Reference<input name="reference"/></label><label>Note<input name="note"/></label><button type="submit">Record refund</button></form></details>
          </td>}
        </tr>)}</tbody>
      </table>}
    </section>

    <section className="table-card">
      <div><h2>Church sponsorships</h2><p>Commitments do not reduce a camper balance until a church payment is actually recorded.</p></div>
      <table><thead><tr><th>Church</th><th>Committed</th><th>Paid</th><th>Still owed</th>{canRecord && <th>Configuration</th>}</tr></thead><tbody>{data.churchSummaries.map(church => <tr key={church.id}><td><strong>{church.name}</strong><br /><small>{church.contactName || "No contact"}{church.contactEmail ? ` · ${church.contactEmail}` : ""}</small></td><td>{money(church.committed)}</td><td>{money(church.paid)}</td><td>{money(church.owed)}</td>{canRecord && <td><form action={updateChurchAction} className="auth-form"><input type="hidden" name="churchId" value={church.id}/><input type="hidden" name="returnTo" value={returnTo}/><label>Name<input name="name" defaultValue={church.name} required/></label><label>Contact<input name="contactName" defaultValue={church.contactName ?? ""}/></label><label>Email<input name="contactEmail" defaultValue={church.contactEmail ?? ""}/></label><label><input type="checkbox" name="active" defaultChecked={church.active}/> Active</label><button type="submit">Save church</button></form></td>}</tr>)}</tbody></table>
      {canRecord && <form action={createChurchAction} className="auth-form"><input type="hidden" name="returnTo" value={returnTo}/><h3>Add church</h3><label>Name<input name="name" required/></label><label>Contact<input name="contactName"/></label><label>Email<input name="contactEmail" type="email"/></label><button type="submit">Add church</button></form>}
    </section>

    <section className="table-card">
      <div><h2>Scholarship programs</h2><p>Credits reduce the camper balance and remain attributable to their program.</p></div>
      <table><thead><tr><th>Program</th><th>Awarded</th>{canRecord && <th>Configuration</th>}</tr></thead><tbody>{data.scholarshipSummaries.map(program => <tr key={program.id}><td>{program.name}</td><td>{money(program.awarded)}</td>{canRecord && <td><form action={updateScholarshipAction} className="auth-form"><input type="hidden" name="scholarshipProgramId" value={program.id}/><input type="hidden" name="returnTo" value={returnTo}/><label>Name<input name="name" defaultValue={program.name} required/></label><label><input type="checkbox" name="active" defaultChecked={program.active}/> Active</label><button type="submit">Save program</button></form></td>}</tr>)}</tbody></table>
      {canRecord && <form action={createScholarshipAction} className="auth-form"><input type="hidden" name="returnTo" value={returnTo}/><h3>Add scholarship program</h3><label>Name<input name="name" required/></label><button type="submit">Add scholarship</button></form>}
    </section>

    <section className="table-card">
      <div><h2>Ledger history</h2><p>Entries are append-only. Corrections create a reversal or adjustment instead of editing history.</p></div>
      {data.recentEntries.length === 0 ? <p>No ledger activity yet.</p> : <table><thead><tr><th>Date</th><th>Camper</th><th>Type</th><th>Amount</th><th>Source</th><th>Reference / note</th>{canRecord && <th>Correction</th>}</tr></thead><tbody>{data.recentEntries.map(entry => {
        const camper = entry.registration.person;
        const camperName = `${camper.preferredName || camper.firstName} ${camper.lastName}`;
        const source = entry.church?.name || entry.scholarshipProgram?.name || entry.method || "Camp";
        const reversed = Boolean(entry.reversedBy);
        return <tr key={entry.id}><td>{entry.createdAt.toLocaleString()}</td><td>{camperName}<br/><small>{entry.registration.session.name}</small></td><td>{label(entry.type)}{reversed && <><br/><small>Reversed</small></>}</td><td>{money(Number(entry.amount))}</td><td>{source}</td><td>{entry.reference || "—"}{entry.note && <><br/><small>{entry.note}</small></>}</td>{canRecord && <td>{entry.type !== "REVERSAL" && !reversed ? <form action={reverseFinancialEntryAction} className="auth-form"><input type="hidden" name="entryId" value={entry.id}/><input type="hidden" name="returnTo" value={returnTo}/><label>Reason<input name="note" required/></label><button className="button secondary" type="submit">Reverse</button></form> : <span className="muted">Historical</span>}</td>}</tr>;
      })}</tbody></table>}
    </section>
  </main>;
}
