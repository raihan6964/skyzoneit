import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runApprovalCycle, scheduleApprovalCycle } from "@/lib/autoapprove";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Default: return immediately, run the cycle after the response (safe for
  // short-timeout pingers like pg_net). ?sync=1 awaits and returns the summary.
  if (request.nextUrl.searchParams.get("sync") === "1") {
    const summary = await runApprovalCycle(createAdminClient(), "cron-sync");
    return Response.json(summary);
  }

  scheduleApprovalCycle("cron");
  return Response.json({ ok: true, scheduled: true });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
