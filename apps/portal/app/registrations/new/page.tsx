import Link from "next/link";
import { RegistrationWizard } from "../../../components/registration-wizard";
import { getPrismaClient } from "@faith-adventures/database";
import { getOwnedHousehold, loadOwnedDraft } from "@faith-adventures/database/portal";
import { requirePortalUser } from "../../lib/access";

function formatDate(value: Date | null | undefined) { return value ? value.toISOString().slice(0, 10) : ""; }
function formatAddress(address: Record<string, string>) { return [address.street, address.city, [address.state, address.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", "); }
function statusLabel(status:string){return status.replaceAll("_"," ").toLowerCase().replace(/^./,c=>c.toUpperCase());}
function statusMessage(status:string){
  switch(status){
    case "SUBMITTED": case "PENDING_REVIEW": return "Camp has received this registration and it is waiting for review.";
    case "APPROVED": return "This registration has been approved. Payment is not enabled in the demo yet.";
    case "WAITLISTED": return "This camper is currently waitlisted. Camp will update the status if space becomes available.";
    case "CANCELLED": return "This registration has been cancelled and is no longer active.";
    case "CHECKED_IN": return "This camper is checked in for camp.";
    case "COMPLETED": return "This camp registration is complete.";
    default: return "This registration is read-only in its current status.";
  }
}

function sessionWindowOpen(session: { status:string; registrationOpen:Date|null; registrationClose:Date|null; season:{status:string;registrationOpen:Date|null;registrationClose:Date|null} }) {
  if(session.status!=="open"||session.season.status!=="open") return false;
  const now=new Date();
  const opens=session.registrationOpen??session.season.registrationOpen;
  const closes=session.registrationClose??session.season.registrationClose;
  return (!opens||now>=opens)&&(!closes||now<=closes);
}

export default async function NewRegistrationPage({searchParams}:{searchParams:Promise<{camperId?:string;sessionId?:string}>}) {
  const user=await requirePortalUser();
  const household=await getOwnedHousehold(user.id);
  const campers=household.members.filter(member=>member.relationship==="CAMPER");
  const query=await searchParams;
  const camperId=query.camperId;
  if(!camperId)return <main className="shell narrow"><p className="eyebrow">Registration</p><h1>Select a camper</h1><div className="member-list">{campers.map(camper=><Link className="member-card" key={camper.personId} href={`/registrations/new?camperId=${camper.personId}`}><span><strong>{camper.person.firstName} {camper.person.lastName}</strong><small>Start, resume, or view registration</small></span><span aria-hidden="true">→</span></Link>)}</div>{campers.length===0&&<p>No campers have been added yet. <Link href="/household/members/new">Add a household member</Link>.</p>}</main>;
  const camper=campers.find(candidate=>candidate.personId===camperId);
  if(!camper)return <main className="shell narrow"><h1>Camper unavailable</h1><p><Link href="/registrations/new">Choose a household camper</Link>.</p></main>;

  const sessions=await getPrismaClient().session.findMany({include:{season:true},orderBy:{startDate:"asc"}});
  const available=sessions.filter(sessionWindowOpen);
  if(!query.sessionId&&available.length>1) return <main className="shell narrow"><p className="eyebrow">Registration</p><h1>Choose a camp session</h1><p>Select the session for {camper.person.firstName}. Each configured open session has its own registration and capacity.</p><div className="member-list">{available.map(session=><Link className="member-card" key={session.id} href={`/registrations/new?camperId=${camper.personId}&sessionId=${session.id}`}><span><strong>{session.name}</strong><small>{session.season.name}{session.minimumGrade||session.maximumGrade?` · Grades ${session.minimumGrade??"?"}-${session.maximumGrade??"?"}`:""}</small></span><span aria-hidden="true">→</span></Link>)}</div></main>;
  const session=query.sessionId?sessions.find(candidate=>candidate.id===query.sessionId):available[0];
  if(!session)return <main className="shell narrow"><h1>Registration unavailable</h1><p>No open camp session is currently accepting registrations.</p></main>;

  const draft=await loadOwnedDraft(user.id,session.id,camper.personId);
  if(draft&&draft.status!=="DRAFT"&&draft.status!=="NEEDS_INFORMATION") return <main className="shell narrow"><p className="eyebrow">Registration status</p><h1>{camper.person.firstName} {camper.person.lastName}</h1><section className="detail-card"><dl className="detail-grid"><div><dt>Camp</dt><dd>{session.name}</dd></div><div><dt>Status</dt><dd>{statusLabel(draft.status)}</dd></div><div><dt>Submitted</dt><dd>{draft.submittedAt?.toLocaleDateString()??"Not recorded"}</dd></div></dl></section><p>{statusMessage(draft.status)}</p><p><Link className="button secondary" href={`/household/members/${camper.personId}`}>View camper</Link></p></main>;
  const correctionAllowed=draft?.status==="NEEDS_INFORMATION"&&session.status==="open"&&session.season.status==="open";
  if(!sessionWindowOpen(session)&&!correctionAllowed)return <main className="shell narrow"><h1>Registration unavailable</h1><p>{session.name} is not currently accepting registrations.</p><p><Link href={`/registrations/new?camperId=${camper.personId}`}>Choose another session</Link></p></main>;

  const guardian=household.members.find(member=>member.personId===user.personId)??household.members.find(member=>member.isPrimaryContact)??household.members.find(member=>member.relationship==="GUARDIAN");
  const address=(household.primaryAddress||{}) as Record<string,string>;
  const defaults:Record<string,string|boolean>={
    camperName:`${camper.person.firstName} ${camper.person.lastName}`.trim(),
    birthDate:formatDate(camper.person.birthDate),
    grade:camper.person.camperProfile?.grade??"",
    camperEmail:camper.person.email??"",
    guardianName:guardian?`${guardian.person.firstName} ${guardian.person.lastName}`.trim():"",
    guardianEmail:guardian?.person.email??user.email,
    guardianPhone:guardian?.person.phone??"",
    address:formatAddress(address),
  };
  const saved=(draft?.answers??{}) as Record<string,string|boolean>;
  const initialAnswers:Record<string,string|boolean>={...defaults,...saved};
  for(const [key,value] of Object.entries(defaults)) if((initialAnswers[key]===undefined||initialAnswers[key]==="")&&value!=="") initialAnswers[key]=value;
  return <main className="shell narrow"><p className="eyebrow">Registration</p><h1>Register {camper.person.firstName}</h1><p><strong>{session.season.name} — {session.name}</strong></p>{draft?.status==="NEEDS_INFORMATION"&&<p className="notice">Camp requested more information. Update the registration and submit it again for review.</p>}<RegistrationWizard sessionId={session.id} camperId={camper.personId} initialAnswers={initialAnswers}/></main>;
}
