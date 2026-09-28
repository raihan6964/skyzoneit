import type { SupabaseClient } from "@supabase/supabase-js";
import { pushToSheet } from "@/lib/sheets";
import type { SheetRow } from "@/lib/types";

interface ApprovedRow {
  id: string;
  submitted_date: string;
  reviewer_name: string;
  reviewer_gmail: string;
  screenshot_url: string;
  profiles: { sky_id: string; full_name: string | null } | null;
  tasks: { app_name: string } | null;
}

export async function syncApprovedToSheet(
  supabase: SupabaseClient,
  ids?: string[]
): Promise<{ synced: number; error?: string }> {
  let query = supabase
    .from("submissions")
    .select(
      "id, submitted_date, reviewer_name, reviewer_gmail, screenshot_url, profiles(sky_id, full_name), tasks(app_name)"
    )
    .eq("status", "approved")
    .eq("synced_to_sheet", false);

  if (ids && ids.length > 0) {
    query = query.in("id", ids);
  } else {
    query = query.limit(200);
  }

  const { data, error } = await query;
  if (error) return { synced: 0, error: error.message };

  const rows = (data ?? []) as unknown as ApprovedRow[];
  if (rows.length === 0) return { synced: 0 };

  const eligible = rows.filter((row) => row.profiles && row.tasks);
  if (eligible.length === 0) return { synced: 0 };

  const sheetRows: SheetRow[] = eligible.map((row) => ({
    date: row.submitted_date,
    user_name: row.profiles!.full_name?.trim() || row.profiles!.sky_id,
    app_name: row.tasks!.app_name,
    reviewer_name: row.reviewer_name,
    gmail: row.reviewer_gmail,
    screenshot_link: row.screenshot_url,
  }));

  const result = await pushToSheet(sheetRows);
  if (!result.ok) return { synced: 0, error: result.error };

  const pushedIds = eligible.map((row) => row.id);
  const { error: markError } = await supabase.rpc("mark_sheet_synced", {
    p_ids: pushedIds,
  });
  if (markError) return { synced: sheetRows.length, error: markError.message };

  return { synced: sheetRows.length };
}
