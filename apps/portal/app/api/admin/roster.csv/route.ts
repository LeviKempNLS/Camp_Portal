import { campRosterCsv, listCampRoster, RosterAuthorizationError, type RosterFilters, type RosterSort } from "@faith-adventures/database/roster";
import { currentPortalUser } from "../../../lib/access";

export const runtime = "nodejs";

const sortValues = new Set<RosterSort>(["name", "session", "age", "grade", "ageGroup", "group", "cabin", "shirtSize", "status"]);

export async function GET(request: Request) {
  const user = await currentPortalUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const sort = url.searchParams.get("sort") as RosterSort | null;
  const filters: RosterFilters = {
    sessionId: url.searchParams.get("sessionId") || undefined,
    ageGroup: url.searchParams.get("ageGroup") || undefined,
    groupId: url.searchParams.get("groupId") || undefined,
    cabinId: url.searchParams.get("cabinId") || undefined,
    shirtSize: url.searchParams.get("shirtSize") || undefined,
    status: url.searchParams.get("status") || undefined,
    search: url.searchParams.get("search") || undefined,
    sort: sort && sortValues.has(sort) ? sort : "name",
    direction: url.searchParams.get("direction") === "desc" ? "desc" : "asc",
  };
  try {
    const { rows } = await listCampRoster(user.id, filters);
    return new Response(campRosterCsv(rows), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="camp-roster.csv"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof RosterAuthorizationError) return Response.json({ error: "Forbidden" }, { status: 403 });
    return Response.json({ error: "Unable to export roster" }, { status: 500 });
  }
}
