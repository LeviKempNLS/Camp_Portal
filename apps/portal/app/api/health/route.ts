import { databaseHealthCheck } from "@faith-adventures/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const database = await databaseHealthCheck();
  const status = database.ok ? 200 : 503;

  return Response.json(
    { status: database.ok ? "ok" : "unavailable", database: database.ok ? "connected" : "unavailable" },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
