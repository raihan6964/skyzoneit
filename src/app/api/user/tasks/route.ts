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

    // Fixed-user tasks are only visible to their selected members.
    const restrictedIds = visible
      .filter((task) => task.fixed_user_mode)
      .map((task) => task.id);
    const memberLimits = new Map<string, number>();
    if (restrictedIds.length > 0) {
      const { data: memberships, error: memberError } = await admin
        .from("task_fixed_users")
        .select("task_id, daily_limit")
        .eq("user_id", profile.id)
        .in("task_id", restrictedIds);
      if (memberError) throw new Error(memberError.message);
      for (const row of memberships ?? []) {
        memberLimits.set(row.task_id, row.daily_limit);
      }
    }
    const allowed = visible.filter(
      (task) => !task.fixed_user_mode || memberLimits.has(task.id)
    );

    if (allowed.length === 0) {
      return Response.json({ tasks: [] });
    }

    const taskIds = allowed.map((task) => task.id);
    const { data: counts, error: countError } = await admin.rpc(
      "task_board_counts",
      { p_task_ids: taskIds, p_user_id: profile.id }
    );
    if (countError) throw new Error(countError.message);

    const countMap = new Map<
      string,
      { today_cnt: number; my_cnt: number; my_today: number }
    >();
    for (const row of (counts ?? []) as Array<{
      task_id: string;
      today_cnt: number;
      my_cnt: number;
      my_today: number;
    }>) {
      countMap.set(row.task_id, {
        today_cnt: Number(row.today_cnt),
        my_cnt: Number(row.my_cnt),
        my_today: Number(row.my_today),
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

    const result: UserTask[] = allowed.map((task) => {
      const today_cnt = countMap.get(task.id)?.today_cnt ?? 0;
      const myTotal = countMap.get(task.id)?.my_cnt ?? 0;
      const myToday = countMap.get(task.id)?.my_today ?? 0;
      const opensAt = toSeconds(task.start_time);
      const closesAt = toSeconds(task.end_time);
      const inWindow =
        (opensAt === null || nowSeconds >= opensAt) &&
        (closesAt === null || nowSeconds <= closesAt);
      // Fixed-user tasks: the member's own daily limit replaces both the
      // global cap and the normal per-user cap.
      const isRestricted = task.fixed_user_mode === true;
      const memberLimit = memberLimits.get(task.id) ?? null;
      const limitReached =
        !isRestricted &&
        task.daily_limit !== null &&
        today_cnt >= task.daily_limit;
      const userLimitReached = isRestricted
        ? memberLimit !== null && myToday >= memberLimit
        : typeof task.per_user_limit === "number" &&
          task.per_user_limit > 0 &&
          myToday >= task.per_user_limit;
      return {
        ...task,
        daily_limit: isRestricted ? null : task.daily_limit,
        per_user_limit: isRestricted ? memberLimit : task.per_user_limit,
        submitted_today: today_cnt,
        my_total: myTotal,
        my_today: myToday,
        locked: !inWindow || limitReached || userLimitReached,
        lock_reason: !inWindow
          ? "window"
          : limitReached
            ? "limit"
            : userLimitReached
              ? "user_limit"
              : null,
      };
    });

    return Response.json({ tasks: result });
  });

  if (response.ok) scheduleApprovalCycle("user-tasks");
  return response;
}
