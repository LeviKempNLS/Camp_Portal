import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorizationError, getRegistrarRegistration } from "@faith-adventures/database/portal";
import { requirePortalUser } from "../../../lib/access";
import { reviewRegistration } from "../../actions";

const labels: Record<string,string> = {
  session: "Camp group", firstTime: "First time at Faith Adventures", swims: "Swims", shirtSize: "T-shirt size",
  camperName: "Camper name", birthDate: "Date of birth", grade: "Grade just completed", camperEmail: "Camper email", cabinMate: "Cabin-mate request",
  guardianName: "Guardian name", guardianEmail: "Guardian email", guardianPhone: "Guardian phone", address: "Home address", emergencyContact: "Emergency contact", pickupRestrictions: "Pickup restrictions",
  medicalRelease: "Medical release", transportRelease: "Transportation release", photoRelease: "Photo release", covenant: "Camp covenant",
};
function display(value: unknown) { if(value===true)return "Yes"; if(value===false)return "No"; if(value===null||value===undefined||value==="")return "Not provided"; return String(value); }
function statusLabel(status:string){return status.replaceAll("_"," ").toLowerCase().replace(/^./,c=>c.toUpperCase());}

export default async function RegistrarRegistrationPage({params,searchParams}:{params:Promise<{registrationId:string}>;searchParams:Promise<{saved?:string}>}) {
  const user=await requirePortalUser();
  const {registrationId}=await params;
  let registration;
  try { registration=await getRegistrarRegistration(user.id,registrationId); }
  catch(error){ if(error instanceof AuthorizationError) notFound(); throw error; }
  if(!registration) notFound();
  const query=await searchParams;
  const allowed = registration.status === "SUBMITTED" || registration.status === "PENDING_REVIEW"
    ? ["APPROVED","NEEDS_INFORMATION","WAITLISTED","CANCELLED"]
    : registration.status === "NEEDS_INFORMATION" ? ["CANCELLED"]
    : registration.status === "WAITLISTED" ? ["APPROVED","CANCELLED"]
    : registration.status === "APPROVED" ? ["CANCELLED"] : [];
  return <main className="shell">
    <p><Link href="/admin">← Back to registration queue</Link></p>
    {query.saved==="1"&&<p className="save-confirmation" role="status">Registration status updated.</p>}
    <div className="page-heading-row"><div><p className="eyebrow">Registrar review</p><h1>{registration.person.firstName} {registration.person.lastName}</h1></div><strong>{statusLabel(registration.status)}</strong></div>
    <section className="detail-card"><dl className="detail-grid"><div><dt>Season</dt><dd>{registration.session.season.name}</dd></div><div><dt>Session</dt><dd>{registration.session.name}</dd></div><div><dt>Household</dt><dd>{registration.household.displayName}</dd></div><div><dt>Submitted</dt><dd>{registration.submittedAt?.toLocaleString()??"Not submitted"}</dd></div></dl></section>
    <div className="section-heading-row"><h2>Registration answers</h2></div>
    <p className="muted">Medical and health-detail answers are intentionally excluded from the registrar workspace. Those require separate medical authorization.</p>
    <section className="detail-card"><dl className="detail-grid">{Object.entries(registration.reviewAnswers).map(([key,value])=><div key={key}><dt>{labels[key]??key}</dt><dd>{display(value)}</dd></div>)}</dl></section>
    {allowed.length>0&&<section className="detail-card"><h2>Review decision</h2><form action={reviewRegistration} className="auth-form"><input type="hidden" name="registrationId" value={registration.id}/><label>Status<select name="status" required defaultValue=""><option value="" disabled>Select a decision</option>{allowed.map(status=><option key={status} value={status}>{statusLabel(status)}</option>)}</select></label><label>Internal reason / follow-up note <textarea name="reason" placeholder="Optional; stored in the audit trail."/></label><button>Save review decision</button></form></section>}
  </main>;
}
