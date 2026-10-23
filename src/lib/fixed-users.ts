import type { SupabaseClient } from "@supabase/supabase-js";

export interface FixedUserInput {
  user_id: string;
  daily_limit: number;
}

// Keep task_fixed_users in sync with the admin's selected user list:
// upsert new/changed rows (daily limits), delete users removed from the list.
export async function syncTaskFixedUsers(
  admin: SupabaseClient,
  taskId: string,
  users: FixedUserInput[]
) {
  const { data: existingRows, error: readError } = await admin
    .from("task_fixed_users")
    .select("user_id, daily_limit")
    .eq("task_id", taskId);
  if (readError) throw new Error(readError.message);

  const existing = new Map(
    (existingRows ?? []).map((row) => [row.user_id, row.daily_limit])
  );
  const nextIds = new Set(users.map((entry) => entry.user_id));

  const upserts = users.filter(
    (entry) => existing.get(entry.user_id) !== entry.daily_limit
  );
  if (upserts.length > 0) {
    const { error } = await admin.from("task_fixed_users").upsert(
      upserts.map((entry) => ({
        task_id: taskId,
        user_id: entry.user_id,
        daily_limit: entry.daily_limit,
      })),
      { onConflict: "task_id,user_id" }
    );
    if (error) throw new Error(error.message);
  }

  const removals = [...existing.keys()].filter((id) => !nextIds.has(id));
  if (removals.length > 0) {
    const { error } = await admin
      .from("task_fixed_users")
      .delete()
      .eq("task_id", taskId)
      .in("user_id", removals);
    if (error) throw new Error(error.message);
  }
}
