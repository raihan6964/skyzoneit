import type { NextRequest } from "next/server";
import { withApi, requireAdmin, unwrap } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  adminAdjustSchema,
  adminStatusSchema,
} from "@/lib/validations";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/admin/users/[id]">
) {
  return withApi(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    const admin = createAdminClient();

    const profile = unwrap(
      await admin.from("profiles").select("*").eq("id", id).single()
    );

    const [transactions, submissions, withdrawals] = await Promise.all([
      admin
        .from("balance_transactions")
        .select("*")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      admin
        .from("submissions")
        .select("id, status, submitted_date, reward, task:tasks(app_name)")
        .eq("user_id", id)
        .order("submitted_at", { ascending: false })
        .limit(20),
      admin
        .from("withdrawals")
        .select("*")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    return Response.json({
      profile,
      transactions: transactions.data ?? [],
      submissions: submissions.data ?? [],
      withdrawals: withdrawals.data ?? [],
    });
  });
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/users/[id]">
) {
  return withApi(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    const admin = createAdminClient();
    const body = await request.json();

    if (body.action === "adjust") {
      const parsed = adminAdjustSchema.safeParse({
        amount: body.amount,
        direction: body.direction,
        reason: body.reason ?? "",
      });
      if (!parsed.success) {
        throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid input");
      }
      const profile = unwrap(
        await admin.rpc("admin_adjust_balance", {
          p_user_id: id,
          p_amount: parsed.data.amount,
          p_direction: parsed.data.direction,
          p_reason: parsed.data.reason,
        })
      );
      return Response.json({ profile });
    }

    if (body.action === "status") {
      const parsed = adminStatusSchema.safeParse({ status: body.status });
      if (!parsed.success) {
        throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid input");
      }
      const profile = unwrap(
        await admin.rpc("admin_set_user_status", {
          p_user_id: id,
          p_status: parsed.data.status,
        })
      );
      return Response.json({ profile });
    }

    if (body.action === "role") {
      const role = body.role === "admin" ? "admin" : "user";
      const profile = unwrap(
        await admin.rpc("admin_set_role", { p_user_id: id, p_role: role })
      );
      return Response.json({ profile });
    }

    throw new ApiError("Unknown action");
  });
}
