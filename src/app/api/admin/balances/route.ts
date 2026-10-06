import type { NextRequest } from "next/server";
import { withApi, requireAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withApi(async () => {
    await requireAdmin();
    const admin = createAdminClient();

    const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);

    let query = admin
      .from("profiles")
      .select("id, sky_id, full_name, email, balance, status")
      .neq("balance", 0)
      .order("balance", { ascending: false })
      .limit(500);

    if (q) {
      const safe = q.replace(/[,()%\\]/g, " ").trim();
      if (safe) {
        query = query.or(
          `full_name.ilike.%${safe}%,email.ilike.%${safe}%,sky_id.ilike.%${safe}%`
        );
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data ?? [];

    return Response.json({
      rows,
      count: rows.length,
      sum: rows.reduce((total, row) => total + Number(row.balance), 0),
    });
  });
}
