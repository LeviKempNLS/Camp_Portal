import { auth } from "@faith-adventures/auth";
import { claimPortalInvitation, InvitationError } from "@faith-adventures/database/invitations";
import { headers } from "next/headers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Response.json({ error: "Sign in before accepting the invitation." }, { status: 401 });
  try {
    const body = await request.json() as { token?: unknown };
    if (typeof body.token !== "string" || !body.token) return Response.json({ error: "Invitation token is required." }, { status: 400 });
    return Response.json(await claimPortalInvitation(body.token, { id: session.user.id, email: session.user.email }));
  } catch (error) {
    return Response.json({ error: error instanceof InvitationError ? error.message : "Unable to accept invitation." }, { status: error instanceof InvitationError ? 400 : 500 });
  }
}
