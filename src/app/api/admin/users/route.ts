import type { NextRequest } from "next/server";
import { withApi, requireAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withApi(async () => {
    await requireAdmin();
    const admin = createAdminClient();

    const params = request.nextUrl.searchParams;
    const q = (params.get("q") ?? "").trim().slice(0, 80);
    const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
    const pageSize = Math.min(50, Math.max(1, Number(params.get("page_size") ?? "20") || 20));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = admin
      .from("profiles")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (q) {
      const safe = q.replace(/[,()%\\]/g, " ").trim();
      if (safe) {
        query = query.or(
          `full_name.ilike.%${safe}%,email.ilike.%${safe}%,sky_id.ilike.%${safe}%`
        );
      }
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return Response.json({
      users: data ?? [],
      total: count ?? 0,
      page,
      page_size: pageSize,
    });
  });
}
