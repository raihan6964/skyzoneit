"use client";

import { ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import {
  TaskCard,
  TaskCardSkeleton,
} from "@/components/user/task-card";
import { useApi } from "@/lib/hooks";
import type { UserTask } from "@/lib/types";

export default function TasksPage() {
  const { data, error, isLoading, mutate } = useApi<{ tasks: UserTask[] }>(
    "/api/user/tasks",
    { refreshInterval: 8000 }
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Active tasks
        </h1>
        <p className="text-sm text-muted-foreground">
          Complete a review, then submit your details for verification.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <TaskCardSkeleton key={index} />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={ClipboardList}
          title="Could not load tasks"
          description={error.message}
        />
      ) : !data || data.tasks.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No active tasks right now"
          description="Check back soon — new apps are added every day."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.tasks.map((task) => (
            <TaskCard key={task.id} task={task} onChanged={() => mutate()} />
          ))}
        </div>
      )}
    </div>
  );
}
