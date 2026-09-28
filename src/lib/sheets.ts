import type { SheetRow } from "@/lib/types";

export function sortSheetRows(rows: SheetRow[]): SheetRow[] {
  return [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const left = a.app_name.toLowerCase();
    const right = b.app_name.toLowerCase();
    if (left !== right) return left < right ? -1 : 1;
    if (a.user_id !== b.user_id) return a.user_id < b.user_id ? -1 : 1;
    return 0;
  });
}

export function toSheetMatrix(rows: SheetRow[]): string[][] {
  return sortSheetRows(rows).map((row) => [
    row.date,
    row.user_id,
    row.app_name,
    row.reviewer_name,
    row.gmail,
    row.screenshot_link,
  ]);
}

export async function pushToSheet(
  rows: SheetRow[]
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (rows.length === 0) return { ok: true };

  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return { ok: false, skipped: true, error: "SHEETS_WEBHOOK_URL not set" };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: toSheetMatrix(rows) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      return { ok: false, error: `Apps Script responded ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Sheet push failed",
    };
  }
}
