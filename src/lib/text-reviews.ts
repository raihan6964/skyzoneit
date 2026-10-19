import type { SupabaseClient } from "@supabase/supabase-js";

// Keep task_text_reviews in sync with the admin's raw text_reviews list:
// insert rows for newly added reviews (never touching existing rows so
// used_at survives), and delete rows for reviews removed from the list.
export async function syncTextReviewPool(
  admin: SupabaseClient,
  taskId: string,
  reviews: string[]
) {
  const { data: existingRows, error: readError } = await admin
    .from("task_text_reviews")
    .select("review")
    .eq("task_id", taskId);
  if (readError) throw new Error(readError.message);

  const existing = new Set((existingRows ?? []).map((row) => row.review));
  const next = new Set(reviews);

  const toInsert = reviews
    .filter((review) => !existing.has(review))
    .map((review) => ({ task_id: taskId, review }));
  if (toInsert.length > 0) {
    const { error } = await admin.from("task_text_reviews").insert(toInsert);
    if (error) throw new Error(error.message);
  }

  const toDelete = [...existing].filter((review) => !next.has(review));
  if (toDelete.length > 0) {
    const { error } = await admin
      .from("task_text_reviews")
      .delete()
      .eq("task_id", taskId)
      .in("review", toDelete);
    if (error) throw new Error(error.message);
  }
}
