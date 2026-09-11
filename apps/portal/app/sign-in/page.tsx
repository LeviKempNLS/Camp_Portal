import Link from "next/link";
import { AuthForm } from "../../components/auth-forms";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const invite = (await searchParams).invite;
  const suffix = invite ? `?invite=${encodeURIComponent(invite)}` : "";
  return <main className="shell narrow auth-page"><p className="eyebrow">Faith Adventures Camp Portal</p><h1>Sign in</h1>
    {invite && <p className="notice">Sign in with the email address named on the household invitation. The invitation is one-time and expires.</p>}
    <p>Families and camp staff use the same sign-in. Your roles determine which portal tools you can access.</p>
    <AuthForm mode="sign-in" inviteToken={invite} />
    <p>New to the portal? <Link href={`/sign-up${suffix}`}>Create an account</Link>.</p>
    <p className="notice">Development/demo only. Do not enter real personal, medical, or payment information.</p>
  </main>;
}
