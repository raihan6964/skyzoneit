import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runApprovalCycle } from "@/lib/autoapprove";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await runApprovalCycle(createAdminClient(), "cron");
  return Response.json(summary);
}
