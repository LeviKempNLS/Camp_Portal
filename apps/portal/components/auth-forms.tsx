"use client";
import { authClient } from "@faith-adventures/auth/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [message, setMessage] = useState(""); const router = useRouter();
  async function submit(formData: FormData) { const email = String(formData.get("email") || ""); const password = String(formData.get("password") || ""); const name = String(formData.get("name") || ""); const result = mode === "sign-up" ? await authClient.signUp.email({ email, password, name }) : await authClient.signIn.email({ email, password }); if (result.error) setMessage("Unable to continue. Check the details and try again."); else router.push("/dashboard"); }
  return <form action={submit} className="auth-form">{mode === "sign-up" && <label>Name <input name="name" required autoComplete="name" /></label>}<label>Email <input name="email" type="email" required autoComplete="email" /></label><label>Password <input name="password" type="password" required minLength={12} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} /></label><button type="submit">{mode === "sign-up" ? "Create demo account" : "Sign in"}</button><p role="status">{message}</p></form>;
}
