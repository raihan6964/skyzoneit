import type { NextRequest } from "next/server";
import { withApi, requireAdmin, unwrap } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { createAdminClient } from "@/lib/supabase/admin";
import { withdrawalActionSchema } from "@/lib/validations";
import type { Withdrawal } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/withdrawals/[id]">
) {
  return withApi(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    const admin = createAdminClient();

    const body = await request.json();
    const parsed = withdrawalActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const withdrawal = unwrap(
      await admin.rpc("set_withdrawal_status", {
        p_id: id,
        p_status: parsed.data.status,
      })
    );

    return Response.json({ withdrawal: withdrawal as Withdrawal });
  });
}
