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
    const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.get("page_size") ?? "25") || 25));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = admin
      .from("withdrawals")
      .select(
        "*, profile:profiles(sky_id, full_name, email)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status && ["pending", "paid", "cancelled"].includes(status)) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return Response.json({
      withdrawals: data ?? [],
      total: count ?? 0,
      page,
      page_size: pageSize,
    });
  });
}
