import type { NextRequest } from "next/server";
import { after } from "next/server";
import { withApi, requireAdmin } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncApprovedToSheet } from "@/lib/approvals";
import { singleActionSchema } from "@/lib/validations";
import type { Submission } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/submissions/[id]">
) {
  return withApi(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    const admin = createAdminClient();

    const body = await request.json();
    const parsed = singleActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    let affected: Submission[] = [];

    if (parsed.data.action === "approve") {
      const { data, error } = await admin.rpc("approve_submissions", {
        p_ids: [id],
        p_verified_by: "admin",
      });
      if (error) throw new ApiError(error.message);
      affected = (data ?? []) as Submission[];
      if (affected.length > 0) {
        const ids = affected.map((row) => row.id);
        after(async () => {
          const result = await syncApprovedToSheet(admin, ids);
          if (result.error) console.error("[sheet-sync]", result.error);
        });
      }
    } else if (parsed.data.action === "reject") {
      const { data, error } = await admin.rpc("reject_submissions", {
        p_ids: [id],
        p_reason: parsed.data.reason || null,
      });
      if (error) throw new ApiError(error.message);
      affected = (data ?? []) as Submission[];
    } else {
      const { data, error } = await admin.rpc("reverse_submissions", {
        p_ids: [id],
      });
      if (error) throw new ApiError(error.message);
      affected = (data ?? []) as Submission[];
      if (affected.length === 0) {
        throw new ApiError(
          "Only approved or rejected submissions can be reversed",
          409
        );
      }
    }

    if (affected.length === 0) {
      throw new ApiError("Submission was already processed", 409);
    }

    return Response.json({ submission: affected[0] });
  });
}
