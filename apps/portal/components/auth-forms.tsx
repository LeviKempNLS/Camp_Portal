"use client";
import { authClient } from "@faith-adventures/auth/client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AuthForm({ mode, inviteToken }: { mode: "sign-in" | "sign-up"; inviteToken?: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(formData: FormData) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const email = String(formData.get("email") || "");
      const password = String(formData.get("password") || "");
      const name = String(formData.get("name") || "");
      const result = mode === "sign-up" ? await authClient.signUp.email({ email, password, name }) : await authClient.signIn.email({ email, password });
      if (result.error) {
        setMessage("Unable to continue. Check the details and try again.");
        return;
      }
      if (inviteToken) {
        const claim = await fetch("/api/portal-invitations/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: inviteToken }) });
        if (!claim.ok) {
          await authClient.signOut();
          const body = await claim.json().catch(() => ({})) as { error?: string };
          setMessage(body.error || "The household invitation could not be claimed.");
          return;
        }
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setMessage("Unable to continue right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return <form action={submit} className="auth-form">
    {mode === "sign-up" && <label>Name <input name="name" required autoComplete="name" /></label>}
    <label>Email <input name="email" type="email" required autoComplete="email" /></label>
    <label>Password <input name="password" type="password" required minLength={12} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} /></label>
    <button type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "sign-up" ? "Create demo account" : "Sign in"}</button>
    <p role="status">{message}</p>
  </form>;
}
