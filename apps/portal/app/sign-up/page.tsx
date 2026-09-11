import Link from "next/link";
import { AuthForm } from "../../components/auth-forms";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const invite = (await searchParams).invite;
  const suffix = invite ? `?invite=${encodeURIComponent(invite)}` : "";
  return <main className="shell narrow auth-page"><p className="eyebrow">Faith Adventures Camp Portal</p><h1>{invite ? "Accept household invitation" : "Create a demo account"}</h1>
    {invite ? <p>Create your own login with the invited email address. This securely links your login to the existing household member instead of creating a second household.</p> : <p>Create one account for yourself. Other adults in your household can receive their own secure invitations and keep separate logins.</p>}
    <AuthForm mode="sign-up" inviteToken={invite} />
    <p>Already have an account? <Link href={`/sign-in${suffix}`}>Sign in</Link>.</p>
    <p className="notice">Use a fictitious identity only. Do not enter real personal, medical, or payment information.</p>
  </main>;
}
