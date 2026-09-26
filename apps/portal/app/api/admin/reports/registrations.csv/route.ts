import { listRegistrarReports, registrarReportCsv, ReportsAuthorizationError, type ReportFilters } from "@faith-adventures/database/reports";
import { currentPortalUser } from "../../../../lib/access";

export const runtime = "nodejs";
const statuses = new Set(["SUBMITTED","PENDING_REVIEW","NEEDS_INFORMATION","APPROVED","WAITLISTED","CANCELLED","CHECKED_IN","COMPLETED"]);

export async function GET(request: Request) {
  const user = await currentPortalUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const filters: ReportFilters = {
    sessionId: url.searchParams.get("sessionId") || undefined,
    status: status && statuses.has(status) ? status as ReportFilters["status"] : undefined,
    search: url.searchParams.get("search") || undefined,
  };
  try {
    const { rows } = await listRegistrarReports(user.id, filters);
    return new Response(registrarReportCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="registration-report.csv"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof ReportsAuthorizationError) return Response.json({ error: "Forbidden" }, { status: 403 });
    return Response.json({ error: "Unable to generate report" }, { status: 500 });
  }
}
