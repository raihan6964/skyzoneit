import { withApi, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserTask } from "@/lib/types";

export const dynamic = "force-dynamic";

function dhakaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET() {
  return withApi(async () => {
    const { profile } = await requireUser();
    const admin = createAdminClient();
    const today = dhakaToday();

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
    const [{ data: todayRows, error: todayError }, { data: myRows, error: myError }] =
      await Promise.all([
        admin
          .from("submissions")
          .select("task_id, user_id")
          .in("task_id", taskIds)
          .eq("submitted_date", today),
        admin
          .from("submissions")
          .select("task_id")
          .in("task_id", taskIds)
          .eq("user_id", profile.id),
      ]);

    if (todayError) throw new Error(todayError.message);
    if (myError) throw new Error(myError.message);

    const todayCount = new Map<string, number>();
    for (const row of todayRows ?? []) {
      todayCount.set(row.task_id, (todayCount.get(row.task_id) ?? 0) + 1);
    }

    const myCount = new Map<string, number>();
    for (const row of myRows ?? []) {
      myCount.set(row.task_id, (myCount.get(row.task_id) ?? 0) + 1);
    }

    const result: UserTask[] = visible.map((task) => ({
      ...task,
      submitted_today: todayCount.get(task.id) ?? 0,
      my_total: myCount.get(task.id) ?? 0,
    }));

    return Response.json({ tasks: result });
  });
}
