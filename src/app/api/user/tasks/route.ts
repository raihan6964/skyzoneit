import { withApi, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserTask } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(async () => {
    const { profile } = await requireUser();
    const admin = createAdminClient();

    const { data: tasks, error } = await admin
      .from("tasks")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const now = Date.now();
    const visible = (tasks ?? []).filter((task) => {
      if (task.start_at && new Date(task.start_at).getTime() > now) return false;
      if (task.end_at && new Date(task.end_at).getTime() < now) return false;
      return true;
    });

    if (visible.length === 0) {
      return Response.json({ tasks: [] });
    }

    const taskIds = visible.map((task) => task.id);
    const { data: counts, error: countError } = await admin.rpc(
      "task_board_counts",
      { p_task_ids: taskIds, p_user_id: profile.id }
    );
    if (countError) throw new Error(countError.message);

    const countMap = new Map<
      string,
      { today_cnt: number; my_cnt: number }
    >();
    for (const row of (counts ?? []) as Array<{
      task_id: string;
      today_cnt: number;
      my_cnt: number;
    }>) {
      countMap.set(row.task_id, {
        today_cnt: Number(row.today_cnt),
        my_cnt: Number(row.my_cnt),
      });
    }

    const result: UserTask[] = visible.map((task) => ({
      ...task,
      submitted_today: countMap.get(task.id)?.today_cnt ?? 0,
      my_total: countMap.get(task.id)?.my_cnt ?? 0,
    }));

    return Response.json({ tasks: result });
  });
}
