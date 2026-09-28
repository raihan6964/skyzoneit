import type { NextRequest } from "next/server";
import { withApi, requireAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withApi(async () => {
    await requireAdmin();
    const admin = createAdminClient();

    const params = request.nextUrl.searchParams;
    const status = params.get("status");
    const taskId = params.get("task_id");
    const date = params.get("date");
    const q = (params.get("q") ?? "").trim().slice(0, 80);
    const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.get("page_size") ?? "25") || 25));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = admin
      .from("submissions")
      .select(
        "*, task:tasks(app_name, banner_url, platform), profile:profiles(sky_id, full_name, email)",
        { count: "exact" }
      )
      .order("submitted_at", { ascending: false })
      .range(from, to);

    if (status && ["pending", "approved", "rejected"].includes(status)) {
      query = query.eq("status", status);
    }
    if (taskId) query = query.eq("task_id", taskId);
    if (date) query = query.eq("submitted_date", date);
    if (q) {
      const safe = q.replace(/[,()%\\]/g, " ").trim();
      if (safe) {
        const orParts = [
          `reviewer_name.ilike.%${safe}%`,
          `reviewer_gmail.ilike.%${safe}%`,
        ];
        const { data: matchedProfiles } = await admin
          .from("profiles")
          .select("id")
          .or(`sky_id.ilike.%${safe}%,full_name.ilike.%${safe}%`)
          .limit(50);
        const ids = (matchedProfiles ?? []).map((row) => row.id);
        if (ids.length > 0) {
          orParts.push(`user_id.in.(${ids.join(",")})`);
        }
        query = query.or(orParts.join(","));
      }
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return Response.json({
      submissions: data ?? [],
      total: count ?? 0,
      page,
      page_size: pageSize,
    });
  });
}
