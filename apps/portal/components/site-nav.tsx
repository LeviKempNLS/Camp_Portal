"use client";
import Link from "next/link";
import { authClient } from "@faith-adventures/auth/client";
import { useRouter } from "next/navigation";

export function SiteNav() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  return <header className="site-nav"><div className="site-nav-inner"><Link className="site-brand" href="/">Faith Adventures Camp</Link><nav aria-label="Portal navigation"><Link href="/">Home</Link>{session && <><Link href="/dashboard">Dashboard</Link><Link href="/household">Household</Link></>}{!isPending && !session && <><Link href="/sign-in">Sign in</Link><Link className="nav-cta" href="/sign-up">Create account</Link></>}{session && <button className="nav-link-button" onClick={async()=>{await authClient.signOut();router.replace("/");router.refresh();}}>Sign out</button>}</nav></div></header>;
}
