import type { SupabaseClient } from "@supabase/supabase-js";
import { pushToSheet } from "@/lib/sheets";
import type { SheetRow } from "@/lib/types";

interface ApprovedRow {
  id: string;
  submitted_date: string;
  reviewer_name: string;
  reviewer_gmail: string;
  screenshot_url: string;
  profiles: { sky_id: string } | null;
  tasks: { app_name: string } | null;
}

export async function syncApprovedToSheet(
  supabase: SupabaseClient,
  ids?: string[]
): Promise<{ synced: number; error?: string }> {
  let query = supabase
    .from("submissions")
    .select(
      "id, submitted_date, reviewer_name, reviewer_gmail, screenshot_url, profiles(sky_id), tasks(app_name)"
    )
    .eq("status", "approved");

  if (ids && ids.length > 0) {
    query = query.in("id", ids);
  } else {
    query = query.eq("synced_to_sheet", false).limit(200);
  }

  const { data, error } = await query;
  if (error) return { synced: 0, error: error.message };

  const rows = (data ?? []) as unknown as ApprovedRow[];
  if (rows.length === 0) return { synced: 0 };

  const sheetRows: SheetRow[] = rows
    .filter((row) => row.profiles && row.tasks)
    .map((row) => ({
      date: row.submitted_date,
      user_id: row.profiles!.sky_id,
      app_name: row.tasks!.app_name,
      reviewer_name: row.reviewer_name,
      gmail: row.reviewer_gmail,
      screenshot_link: row.screenshot_url,
    }));

  if (sheetRows.length === 0) return { synced: 0 };

  const result = await pushToSheet(sheetRows);
  if (!result.ok) return { synced: 0, error: result.error };

  const pushedIds = rows.map((row) => row.id);
  const { error: markError } = await supabase.rpc("mark_sheet_synced", {
    p_ids: pushedIds,
  });
  if (markError) return { synced: sheetRows.length, error: markError.message };

  return { synced: sheetRows.length };
}
