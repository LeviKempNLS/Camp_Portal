import { loadOwnedDraft, AuthorizationError, ValidationError } from "@faith-adventures/database/portal";
import { saveOwnedDraftSafely } from "@faith-adventures/database/registration-operations";
import { currentPortalUser } from "../../../lib/access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await currentPortalUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(request.url).searchParams;
  try {
    return Response.json(await loadOwnedDraft(user.id, q.get("sessionId") || "", q.get("camperId") || ""));
  } catch (error) {
    return Response.json({ error: "Forbidden" }, { status: error instanceof AuthorizationError ? 403 : 400 });
  }
}

export async function PATCH(request: Request) {
  const user = await currentPortalUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { sessionId?: string; camperId?: string; answers?: unknown };
    if (!body.sessionId || !body.camperId || !body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
      return Response.json({ error: "Invalid draft" }, { status: 400 });
    }
    return Response.json(await saveOwnedDraftSafely(user.id, { sessionId: body.sessionId, camperId: body.camperId, answers: body.answers as never }));
  } catch (error) {
    if (error instanceof AuthorizationError) return Response.json({ error: "Forbidden" }, { status: 403 });
    if (error instanceof ValidationError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "Unable to save draft" }, { status: 500 });
  }
}
