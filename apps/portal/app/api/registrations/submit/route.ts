import { AuthorizationError, ValidationError, submitOwnedRegistration } from "@faith-adventures/database/portal";
import { currentPortalUser } from "../../../lib/access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await currentPortalUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { sessionId?: string; camperId?: string; answers?: unknown };
    if (!body.sessionId || !body.camperId || !body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
      return Response.json({ error: "Invalid registration" }, { status: 400 });
    }
    return Response.json(await submitOwnedRegistration(user.id, {
      sessionId: body.sessionId,
      camperId: body.camperId,
      answers: body.answers as never,
    }));
  } catch (error) {
    if (error instanceof AuthorizationError) return Response.json({ error: "Forbidden" }, { status: 403 });
    if (error instanceof ValidationError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "Unable to submit registration" }, { status: 500 });
  }
}
