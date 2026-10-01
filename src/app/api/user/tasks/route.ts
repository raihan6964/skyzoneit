import { withApi, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleApprovalCycle } from "@/lib/autoapprove";
import type { UserTask } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const response = await withApi(async () => {
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

    // current time-of-day in Asia/Dhaka (fixed UTC+6, no DST)
    const dhaka = new Date(Date.now() + 6 * 3600 * 1000);
    const nowSeconds =
      dhaka.getUTCHours() * 3600 + dhaka.getUTCMinutes() * 60 + dhaka.getUTCSeconds();
    const toSeconds = (value: string | null) => {
      if (!value) return null;
      const [h, m] = value.split(":");
      return Number(h) * 3600 + Number(m) * 60;
    };

    const result: UserTask[] = visible.map((task) => {
      const today_cnt = countMap.get(task.id)?.today_cnt ?? 0;
      const opensAt = toSeconds(task.start_time);
      const closesAt = toSeconds(task.end_time);
      const inWindow =
        (opensAt === null || nowSeconds >= opensAt) &&
        (closesAt === null || nowSeconds <= closesAt);
      const limitReached =
        task.daily_limit !== null && today_cnt >= task.daily_limit;
      return {
        ...task,
        submitted_today: today_cnt,
        my_total: countMap.get(task.id)?.my_cnt ?? 0,
        locked: !inWindow || limitReached,
        lock_reason: !inWindow ? "window" : limitReached ? "limit" : null,
      };
    });

    return Response.json({ tasks: result });
  });

  if (response.ok) scheduleApprovalCycle("user-tasks");
  return response;
}
