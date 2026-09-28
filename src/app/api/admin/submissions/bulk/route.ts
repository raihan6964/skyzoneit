import type { NextRequest } from "next/server";
import { withApi, requireAdmin } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncApprovedToSheet } from "@/lib/approvals";
import { bulkActionSchema } from "@/lib/validations";
import type { Submission } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return withApi(async () => {
    await requireAdmin();
    const admin = createAdminClient();

    const body = await request.json();
    const parsed = bulkActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { ids, action, reason } = parsed.data;
    let affected: Submission[] = [];
    let sheetSynced = 0;

    if (action === "approve") {
      const { data, error } = await admin.rpc("approve_submissions", {
        p_ids: ids,
        p_verified_by: "admin",
      });
      if (error) throw new ApiError(error.message);
      affected = (data ?? []) as Submission[];
      if (affected.length > 0) {
        const sync = await syncApprovedToSheet(
          admin,
          affected.map((row) => row.id)
        );
        sheetSynced = sync.synced;
      }
    } else {
      const { data, error } = await admin.rpc("reject_submissions", {
        p_ids: ids,
        p_reason: reason || null,
      });
      if (error) throw new ApiError(error.message);
      affected = (data ?? []) as Submission[];
    }

    return Response.json({
      processed: affected.length,
      skipped: ids.length - affected.length,
      sheet_synced: sheetSynced,
    });
  });
}
