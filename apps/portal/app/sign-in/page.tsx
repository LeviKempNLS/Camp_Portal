import Link from "next/link";
import { AuthForm } from "../../components/auth-forms";
export default function SignInPage() { return <main className="shell narrow auth-page"><p className="eyebrow">Faith Adventures Camp Portal</p><h1>Sign in</h1><p>Families and camp staff use the same sign-in. Your role determines which portal tools you can access.</p><AuthForm mode="sign-in" /><p>New to the portal? <Link href="/sign-up">Create an account</Link>.</p><p className="notice">Development/demo only. Do not enter real personal, medical, or payment information.</p></main>; }
