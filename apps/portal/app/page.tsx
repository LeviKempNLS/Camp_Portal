import Link from "next/link";
import { hasRole } from "@faith-adventures/database/portal";
import { currentPortalUser } from "./lib/access";

export default async function Home() {
  const user = await currentPortalUser();
  const registrar = user ? await hasRole(user.id, "registrar") : false;
  return <main className="shell"><header><p className="eyebrow">Faith Adventures Camp</p><h1>One place for your camp family.</h1><p className="lede">Start a registration, come back when it is convenient, and keep every camper’s camp information together.</p><div className="home-actions">{user ? <><Link className="button" href="/dashboard">Open dashboard</Link><Link className="button secondary" href="/household">View household</Link></> : <><Link className="button" href="/sign-up">Create account</Link><Link className="button secondary" href="/sign-in">Sign in</Link></>}</div></header><section className="cards"><article><h2>Parents & guardians</h2><p>Register more than one camper without re-entering your household information.</p><Link className="button" href={user ? "/registrations/new" : "/sign-in"}>{user ? "Start a registration" : "Family sign in"}</Link></article><article><h2>Camp team</h2><p>Camp roles are additive. Staff who are also guardians keep access to their household alongside their staff tools.</p>{registrar ? <Link className="button secondary" href="/admin">Open registrar tools</Link> : !user ? <Link className="button secondary" href="/sign-in">Staff / registrar sign in</Link> : <p className="muted">Staff tools appear here when a staff role is assigned.</p>}</article></section><p className="notice">Development/demo only. Use fictitious information; do not enter real personal, medical, or payment information.</p></main>;
}
