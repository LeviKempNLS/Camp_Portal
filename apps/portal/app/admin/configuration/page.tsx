import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAuthorizationError, listCampConfiguration } from "@faith-adventures/database/admin";
import { requirePortalUser } from "../../lib/access";
import { formatCampDateTime } from "../../../lib/camp-timezone";
import { addSeason, addSession, saveSeason, saveSession } from "./actions";

const statuses = ["draft", "open", "closed", "archived"];

export default async function CampConfigurationPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requirePortalUser();
  let organization;
  try {
    organization = await listCampConfiguration(user.id);
  } catch (error) {
    if (error instanceof AdminAuthorizationError) notFound();
    throw error;
  }
  const query = await searchParams;
  const localDate = (value: Date | null | undefined) => formatCampDateTime(value, organization.timezone);

  return <main className="shell">
    <p><Link href="/admin">← Admin workspace</Link></p>
    <p className="eyebrow">Camp administration</p>
    <h1>Seasons &amp; sessions</h1>
    {query.saved && <p className="save-confirmation" role="status">Camp configuration saved.</p>}
    <p>Times are entered in {organization.timezone}. Open seasons and sessions control family registration. Capacity is enforced at submission, with waitlisting when enabled. Price fields configure the future ledger; payment processing is still disabled.</p>

    <section className="detail-card">
      <h2>Add season</h2>
      <form action={addSeason} className="auth-form">
        <label>Name<input name="name" required placeholder="2031 Camp Season" /></label>
        <label>Year<input name="year" type="number" required min="2000" max="2200" /></label>
        <label>Status<select name="status" defaultValue="draft">{statuses.map(status => <option key={status} value={status}>{status}</option>)}</select></label>
        <label>Registration opens<input name="registrationOpen" type="datetime-local" /></label>
        <label>Registration closes<input name="registrationClose" type="datetime-local" /></label>
        <button>Add season</button>
      </form>
    </section>

    {organization.seasons.map(season => <section className="detail-card" key={season.id}>
      <div className="section-heading-row"><div><p className="eyebrow">{season.year}</p><h2>{season.name}</h2></div><strong>{season.status}</strong></div>
      <form action={saveSeason} className="auth-form">
        <input type="hidden" name="seasonId" value={season.id} />
        <label>Season name<input name="name" required defaultValue={season.name} /></label>
        <label>Status<select name="status" defaultValue={season.status}>{statuses.map(status => <option key={status} value={status}>{status}</option>)}</select></label>
        <label>Registration opens<input name="registrationOpen" type="datetime-local" defaultValue={localDate(season.registrationOpen)} /></label>
        <label>Registration closes<input name="registrationClose" type="datetime-local" defaultValue={localDate(season.registrationClose)} /></label>
        <button>Save season</button>
      </form>

      <div className="section-heading-row"><h3>Sessions</h3></div>
      {season.sessions.length === 0 ? <p>No sessions yet.</p> : season.sessions.map(session => <form action={saveSession} className="detail-card auth-form" key={session.id}>
        <input type="hidden" name="sessionId" value={session.id} />
        <div className="section-heading-row"><strong>{session.name}</strong><span>{session.status}</span></div>
        <label>Name<input name="name" required defaultValue={session.name} /></label>
        <label>Description<textarea name="description" defaultValue={session.description ?? ""} /></label>
        <label>Starts<input name="startDate" type="datetime-local" required defaultValue={localDate(session.startDate)} /></label>
        <label>Ends<input name="endDate" type="datetime-local" required defaultValue={localDate(session.endDate)} /></label>
        <label>Capacity<input name="capacity" type="number" min="1" required defaultValue={session.capacity} /></label>
        <label>Minimum grade<input name="minimumGrade" defaultValue={session.minimumGrade ?? ""} /></label>
        <label>Maximum grade<input name="maximumGrade" defaultValue={session.maximumGrade ?? ""} /></label>
        <label>Base price<input name="basePrice" inputMode="decimal" required defaultValue={session.basePrice.toString()} /></label>
        <label>Deposit<input name="depositAmount" inputMode="decimal" defaultValue={session.depositAmount?.toString() ?? ""} /></label>
        <label>Registration opens<input name="registrationOpen" type="datetime-local" defaultValue={localDate(session.registrationOpen)} /></label>
        <label>Registration closes<input name="registrationClose" type="datetime-local" defaultValue={localDate(session.registrationClose)} /></label>
        <label>Status<select name="status" defaultValue={session.status}>{statuses.map(status => <option key={status} value={status}>{status}</option>)}</select></label>
        <label className="check-field"><input name="waitlistEnabled" type="checkbox" defaultChecked={session.waitlistEnabled} /><span>Waitlist enabled</span></label>
        <button>Save session</button>
      </form>)}

      <div className="detail-card">
        <h3>Add session to {season.name}</h3>
        <form action={addSession} className="auth-form">
          <input type="hidden" name="seasonId" value={season.id} />
          <label>Name<input name="name" required /></label>
          <label>Description<textarea name="description" /></label>
          <label>Starts<input name="startDate" type="datetime-local" required /></label>
          <label>Ends<input name="endDate" type="datetime-local" required /></label>
          <label>Capacity<input name="capacity" type="number" min="1" required defaultValue="130" /></label>
          <label>Minimum grade<input name="minimumGrade" /></label>
          <label>Maximum grade<input name="maximumGrade" /></label>
          <label>Base price<input name="basePrice" required inputMode="decimal" defaultValue="250.00" /></label>
          <label>Deposit<input name="depositAmount" inputMode="decimal" defaultValue="50.00" /></label>
          <label>Registration opens<input name="registrationOpen" type="datetime-local" /></label>
          <label>Registration closes<input name="registrationClose" type="datetime-local" /></label>
          <label>Status<select name="status" defaultValue="draft">{statuses.map(status => <option key={status} value={status}>{status}</option>)}</select></label>
          <label className="check-field"><input name="waitlistEnabled" type="checkbox" /><span>Waitlist enabled</span></label>
          <button>Add session</button>
        </form>
      </div>
    </section>)}
  </main>;
}
