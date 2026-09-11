import { AuthorizationError, submitOwnedRegistration } from "@faith-adventures/database/portal";
import { currentPortalUser } from "../../../lib/access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await currentPortalUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { sessionId?: string; camperId?: string; answers?: unknown };
    if (!body.sessionId || !body.camperId || !body.answers || typeof body.answers !== "object") {
      return Response.json({ error: "Invalid registration" }, { status: 400 });
    }
    return Response.json(await submitOwnedRegistration(user.id, {
      sessionId: body.sessionId,
      camperId: body.camperId,
      answers: body.answers as never,
    }));
  } catch (error) {
    return Response.json(
      { error: error instanceof AuthorizationError ? "Forbidden" : "Unable to submit registration" },
      { status: error instanceof AuthorizationError ? 403 : 500 },
    );
  }
}
