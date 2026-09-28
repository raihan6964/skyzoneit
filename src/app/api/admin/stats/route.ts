import { withApi, requireAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CrmStats } from "@/lib/types";

export const dynamic = "force-dynamic";

interface SubRow {
  submitted_date: string;
  status: string;
}

export async function GET() {
  return withApi(async () => {
    await requireAdmin();
    const admin = createAdminClient();

    const since = new Date();
    since.setDate(since.getDate() - 13);
    const sinceDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(since);

    const [statsResult, chartResult, recentResult] = await Promise.all([
      admin.rpc("get_crm_stats"),
      admin
        .from("submissions")
        .select("submitted_date, status")
        .gte("submitted_date", sinceDate),
      admin
        .from("submissions")
        .select(
          "id, submitted_at, status, reviewer_name, task:tasks(app_name), profile:profiles(sky_id, full_name)"
        )
        .order("submitted_at", { ascending: false })
        .limit(8),
    ]);

    if (statsResult.error) throw new Error(statsResult.error.message);
    if (chartResult.error) throw new Error(chartResult.error.message);
    if (recentResult.error) {
      console.error("[stats:recent]", recentResult.error.message);
    }

    const days = new Map<
      string,
      { date: string; pending: number; approved: number; rejected: number }
    >();
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      const key = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
      days.set(key, { date: key, pending: 0, approved: 0, rejected: 0 });
    }
    for (const row of (chartResult.data ?? []) as SubRow[]) {
      const bucket = days.get(row.submitted_date);
      if (!bucket) continue;
      if (row.status === "approved") bucket.approved += 1;
      else if (row.status === "rejected") bucket.rejected += 1;
      else bucket.pending += 1;
    }

    return Response.json({
      stats: statsResult.data as CrmStats,
      chart: [...days.values()],
      recent: recentResult.data ?? [],
    });
  });
}
