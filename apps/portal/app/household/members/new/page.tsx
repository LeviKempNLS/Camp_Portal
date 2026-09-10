import Link from "next/link";
import { requirePortalUser } from "../../../lib/access";
import { addHouseholdMember } from "../../actions";

export default async function AddHouseholdMemberPage() {
  await requirePortalUser();
  return <main className="shell narrow">
    <p className="eyebrow">Household</p><h1>Add a household member</h1>
    <p className="lede">Add another guardian/adult or a camper. Each adult will eventually be able to have their own verified portal login without losing any other camp role they hold.</p>
    <form action={addHouseholdMember} className="auth-form">
      <label>Member type<select name="kind" required defaultValue=""><option value="" disabled>Select one</option><option value="guardian">Guardian / adult</option><option value="camper">Camper</option></select></label>
      <label>First name<input name="firstName" required /></label>
      <label>Last name<input name="lastName" required /></label>
      <label>Email<input name="email" type="email" /></label>
      <label>Phone<input name="phone" type="tel" /></label>
      <label>Date of birth<input name="birthDate" type="date" /></label>
      <label>Grade just completed <small>Used for campers; leave blank for adults.</small><input name="grade" /></label>
      <div className="form-actions"><button>Add member</button><Link className="button secondary" href="/household">Cancel</Link></div>
    </form>
    <p className="notice">Adding an adult here does not create a login yet. A verified invitation flow will connect that person&apos;s individual account to this household; we will not allow household access based only on knowing an email address.</p>
  </main>;
}
