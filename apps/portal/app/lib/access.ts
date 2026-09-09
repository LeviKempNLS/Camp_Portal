import { auth } from "@faith-adventures/auth";
import { ensurePortalProfile, AuthorizationError } from "@faith-adventures/database/portal";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
export async function currentPortalUser() { const session = await auth.api.getSession({ headers: await headers() }); return session?.user ? ensurePortalProfile({ id: session.user.id, email: session.user.email, name: session.user.name }) : null; }
export async function requirePortalUser() { const user = await currentPortalUser(); if (!user) redirect("/sign-in"); return user; }
export { AuthorizationError };
