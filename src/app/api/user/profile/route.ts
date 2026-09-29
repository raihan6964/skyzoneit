import { withApi, requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(async () => {
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
}
