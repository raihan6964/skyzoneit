import type { NextRequest } from "next/server";
import { withApi, requireUser, unwrap } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { scheduleApprovalCycle } from "@/lib/autoapprove";
import { withdrawSchema } from "@/lib/validations";
import type { Withdrawal } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const response = await withApi(async () => {
    const { supabase } = await requireUser();
    const { data, error } = await supabase
      .from("withdrawals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return Response.json({ withdrawals: data ?? [] });
  });

  if (response.ok) scheduleApprovalCycle("user-withdrawals");
  return response;
}

export async function POST(request: NextRequest) {
  return withApi(async () => {
    const { supabase } = await requireUser();
    const body = await request.json();
    const parsed = withdrawSchema.safeParse({
      method: body.method ?? "bkash",
      bkash_number: body.bkash_number,
      amount: body.amount,
    });
    if (!parsed.success) {
      throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const withdrawal = unwrap(
      await supabase.rpc("request_withdrawal", {
        p_bkash_number: parsed.data.bkash_number,
        p_amount: parsed.data.amount,
      })
    );

    return Response.json(
      { withdrawal: withdrawal as Withdrawal },
      { status: 201 }
    );
  });
}
