import { withApi, requireUser } from "@/lib/api";
import { scheduleApprovalCycle } from "@/lib/autoapprove";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const response = await withApi(async () => {
    const { supabase, profile } = await requireUser();

    const [{ data: transactions }, { data: settings }] = await Promise.all([
      supabase
        .from("balance_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("app_settings")
        .select("key, value")
        .eq("key", "min_withdrawal"),
    ]);

    const minWithdrawal = settings?.find(
      (row) => row.key === "min_withdrawal"
    )?.value;

    return Response.json({
      profile,
      transactions: transactions ?? [],
      min_withdrawal:
        typeof minWithdrawal === "number" ? minWithdrawal : 50,
    });
  });

  if (response.ok) scheduleApprovalCycle("user-profile");
  return response;
}
