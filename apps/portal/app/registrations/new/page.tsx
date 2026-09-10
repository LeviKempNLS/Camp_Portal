import Link from "next/link";
import { RegistrationWizard } from "../../../components/registration-wizard";
import { getPrismaClient } from "@faith-adventures/database";
import { getOwnedHousehold, loadOwnedDraft } from "@faith-adventures/database/portal";
import { requirePortalUser } from "../../lib/access";

function formatDate(value: Date | null | undefined) { return value ? value.toISOString().slice(0, 10) : ""; }
function formatAddress(address: Record<string, string>) { return [address.street, address.city, [address.state, address.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", "); }

export default async function NewRegistrationPage({searchParams}:{searchParams:Promise<{camperId?:string}>}) {
  const user=await requirePortalUser();
  const household=await getOwnedHousehold(user.id);
  const campers=household.members.filter(m=>m.relationship==="CAMPER");
  const camperId=(await searchParams).camperId;
  if(!camperId)return <main className="shell narrow"><p className="eyebrow">Registration</p><h1>Select a camper</h1><div className="member-list">{campers.map(c=><Link className="member-card" key={c.personId} href={`/registrations/new?camperId=${c.personId}`}><span><strong>{c.person.firstName} {c.person.lastName}</strong><small>Start or resume registration</small></span><span aria-hidden="true">→</span></Link>)}</div>{campers.length===0&&<p>No campers have been added yet. <Link href="/household/members/new">Add a household member</Link>.</p>}</main>;
  const camper=campers.find(c=>c.personId===camperId);
  if(!camper)return <main className="shell narrow"><h1>Camper unavailable</h1><p><Link href="/registrations/new">Choose a household camper</Link>.</p></main>;
  const session=await getPrismaClient().session.findFirst({where:{status:"open"},orderBy:{startDate:"asc"}});
  if(!session)return <main className="shell narrow"><h1>Registration unavailable</h1></main>;
  const draft=await loadOwnedDraft(user.id,session.id,camper.personId);
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
  return <main className="shell narrow"><p className="eyebrow">Registration</p><h1>Register {camper.person.firstName}</h1><RegistrationWizard sessionId={session.id} camperId={camper.personId} initialAnswers={initialAnswers}/></main>;
}
