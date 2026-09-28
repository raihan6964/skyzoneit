"use client";

import { useState } from "react";
import { ClipboardCopy, Loader2, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { postJson, useApi } from "@/lib/hooks";
import type { UserTask } from "@/lib/types";

export default function ReviewGeneratorPage() {
  const [taskId, setTaskId] = useState("");
  const [review, setReview] = useState("");
  const [generating, setGenerating] = useState(false);

  const { data } = useApi<{ tasks: UserTask[] }>("/api/user/tasks");
  const tasks = data?.tasks ?? [];

  const selectedTask = tasks.find((task) => task.id === taskId);

  const generate = async () => {
    if (!taskId) {
      toast.error("Select an app first");
      return;
    }
    setGenerating(true);
    try {
      const result = await postJson<{ review: string }>(
        "/api/ai/generate",
        { task_id: taskId }
      );
      setReview(result.review);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const copyAndClear = async () => {
    if (!review) return;
    try {
      await navigator.clipboard.writeText(review);
      setReview("");
      toast.success("Copied to clipboard — review cleared");
    } catch {
      toast.error("Could not access the clipboard");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          AI review generator
        </h1>
        <p className="text-sm text-muted-foreground">
          Generate a unique review for any active app, copy it, and publish it
          on the store.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              Generate
            </CardTitle>
            <CardDescription>
              Each app uses its own admin-configured prompt so every review is
              unique.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Select active app</Label>
              <Select
                value={taskId}
                onValueChange={(value) => setTaskId(value ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose an app...">
                    {(value) => {
                      if (!value) return "Choose an app...";
                      const task = tasks.find((item) => item.id === value);
                      return task ? task.app_name : value;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {tasks.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No active apps
                    </SelectItem>
                  ) : (
                    tasks.map((task) => (
                      <SelectItem key={task.id} value={task.id}>
                        {task.app_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={generate}
                disabled={generating || !taskId || taskId === "none"}
              >
                {generating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Wand2 className="size-4" />
                )}
                {generating ? "Generating..." : "Generate review"}
              </Button>
              {review && (
                <Button
                  variant="outline"
                  onClick={generate}
                  disabled={generating}
                  aria-label="Regenerate"
                >
                  <RefreshCw className="size-4" />
                </Button>
              )}
            </div>

            {selectedTask && (
              <p className="text-xs text-muted-foreground">
                Reward on approval:{" "}
                <span className="font-semibold text-primary">
                  {selectedTask.reward} TK
                </span>{" "}
                · {selectedTask.app_name}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCopy className="size-4 text-primary" />
              Your review
            </CardTitle>
            <CardDescription>
              Copy clears the text immediately so it can never be reused.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              readOnly
              value={review}
              rows={8}
              placeholder={
                generating
                  ? "Generating your unique review..."
                  : "Generated review will appear here."
              }
              className="resize-none bg-muted/40"
            />
            <Button
              className="w-full"
              onClick={copyAndClear}
              disabled={!review}
            >
              <ClipboardCopy className="size-4" />
              Copy & clear
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
