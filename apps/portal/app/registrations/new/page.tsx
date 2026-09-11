import Link from "next/link";
import { RegistrationWizard } from "../../../components/registration-wizard";
import { getPrismaClient } from "@faith-adventures/database";
import { getOwnedHousehold, loadOwnedDraft } from "@faith-adventures/database/portal";
import { requirePortalUser } from "../../lib/access";

function formatDate(value: Date | null | undefined) { return value ? value.toISOString().slice(0, 10) : ""; }
function formatAddress(address: Record<string, string>) { return [address.street, address.city, [address.state, address.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", "); }
function statusLabel(status:string){return status.replaceAll("_"," ").toLowerCase().replace(/^./,c=>c.toUpperCase());}

export default async function NewRegistrationPage({searchParams}:{searchParams:Promise<{camperId?:string}>}) {
  const user=await requirePortalUser();
  const household=await getOwnedHousehold(user.id);
  const campers=household.members.filter(m=>m.relationship==="CAMPER");
  const camperId=(await searchParams).camperId;
  if(!camperId)return <main className="shell narrow"><p className="eyebrow">Registration</p><h1>Select a camper</h1><div className="member-list">{campers.map(c=><Link className="member-card" key={c.personId} href={`/registrations/new?camperId=${c.personId}`}><span><strong>{c.person.firstName} {c.person.lastName}</strong><small>Start, resume, or view registration</small></span><span aria-hidden="true">→</span></Link>)}</div>{campers.length===0&&<p>No campers have been added yet. <Link href="/household/members/new">Add a household member</Link>.</p>}</main>;
  const camper=campers.find(c=>c.personId===camperId);
  if(!camper)return <main className="shell narrow"><h1>Camper unavailable</h1><p><Link href="/registrations/new">Choose a household camper</Link>.</p></main>;
  const session=await getPrismaClient().session.findFirst({where:{status:"open"},orderBy:{startDate:"asc"}});
  if(!session)return <main className="shell narrow"><h1>Registration unavailable</h1></main>;
  const draft=await loadOwnedDraft(user.id,session.id,camper.personId);
  if(draft && draft.status!=="DRAFT" && draft.status!=="NEEDS_INFORMATION") return <main className="shell narrow"><p className="eyebrow">Registration status</p><h1>{camper.person.firstName} {camper.person.lastName}</h1><section className="detail-card"><dl className="detail-grid"><div><dt>Camp</dt><dd>{session.name}</dd></div><div><dt>Status</dt><dd>{statusLabel(draft.status)}</dd></div><div><dt>Submitted</dt><dd>{draft.submittedAt?.toLocaleDateString()??"Not recorded"}</dd></div></dl></section><p>Your submitted registration is read-only while camp reviews it.</p><p><Link className="button secondary" href={`/household/members/${camper.personId}`}>View camper</Link></p></main>;
  const guardian=household.members.find(m=>m.personId===user.personId) ?? household.members.find(m=>m.isPrimaryContact) ?? household.members.find(m=>m.relationship==="GUARDIAN");
  const address=(household.primaryAddress||{}) as Record<string,string>;
  const defaults: Record<string,string|boolean>={
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
  return <main className="shell narrow"><p className="eyebrow">Registration</p><h1>Register {camper.person.firstName}</h1>{draft?.status==="NEEDS_INFORMATION"&&<p className="notice">Camp requested more information. Update the registration and submit it again for review.</p>}<RegistrationWizard sessionId={session.id} camperId={camper.personId} initialAnswers={initialAnswers}/></main>;
}
