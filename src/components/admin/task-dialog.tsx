"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useWatch, useForm } from "react-hook-form";
import { toast } from "sonner";
import { mutate } from "swr";
import type { z } from "zod";
import {
  Loader2,
  PackageCheck,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toDatetimeLocal } from "@/lib/format";
import { postJson } from "@/lib/hooks";
import { extractPackageInfo, type PackageInfo } from "@/lib/packages";
import type { Task } from "@/lib/types";
import { taskFormSchema } from "@/lib/validations";

type TaskFormValues = z.input<typeof taskFormSchema>;
type TaskFormOutput = z.output<typeof taskFormSchema>;

const DEFAULT_VALUES: TaskFormValues = {
  app_name: "",
  app_link: "",
  package_name: "",
  platform: "android",
  description: "",
  banner_url: "",
  reward: 0,
  daily_limit: "",
  ai_prompt: "",
  cron_time: "21:00",
  fail_action: "pending",
  start_at: "",
  end_at: "",
  start_time: "",
  end_time: "",
  status: "active",
};

export function TaskDialog({
  task,
  open,
  onOpenChange,
}: {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [extracted, setExtracted] = useState<PackageInfo | null>(null);
  const taskRef = useRef<Task | null>(null);
  const taskId = task?.id ?? null;

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<TaskFormValues, unknown, TaskFormOutput>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    if (!open) return;
    const current = taskRef.current;
    reset(
      current
        ? {
            app_name: current.app_name,
            app_link: current.app_link,
            package_name: current.package_name,
            platform: current.platform,
            description: current.description ?? "",
            banner_url: current.banner_url ?? "",
            reward: current.reward,
            daily_limit: current.daily_limit ?? "",
            ai_prompt: current.ai_prompt,
            cron_time: current.cron_time,
            fail_action: current.fail_action,
            start_at: toDatetimeLocal(current.start_at),
            end_at: toDatetimeLocal(current.end_at),
            start_time: current.start_time ?? "",
            end_time: current.end_time ?? "",
            status: current.status,
          }
        : DEFAULT_VALUES
    );
  }, [open, taskId, reset]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setExtracted(null);
    onOpenChange(next);
  };

  const bannerUrl = useWatch({ control, name: "banner_url" });
  const platform = useWatch({ control, name: "platform" });
  const failAction = useWatch({ control, name: "fail_action" });
  const status = useWatch({ control, name: "status" });

  const appLinkField = register("app_link");

  const handleAppLinkBlur = () => {
    const info = extractPackageInfo(getValues("app_link"));
    if (info) {
      setValue("package_name", info.package_name, { shouldDirty: true });
      setValue("platform", info.platform, { shouldDirty: true });
      setExtracted(info);
    } else {
      setExtracted(null);
    }
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const json = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !json.url) {
        throw new Error(json.error || "Upload failed");
      }
      setValue("banner_url", json.url, { shouldDirty: true });
      toast.success("Banner uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (values: TaskFormOutput) => {
    setSubmitting(true);
    try {
      if (task) {
        await postJson(`/api/admin/tasks/${task.id}`, values, "PATCH");
        toast.success("Task updated");
      } else {
        await postJson("/api/admin/tasks", values, "POST");
        toast.success("Task created");
      }
      handleOpenChange(false);
      void mutate(() => true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save task");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {task ? "Edit app task" : "New app task"}
          </DialogTitle>
          <DialogDescription>
            Workers see these details on their task board. Auto-verification
            starts daily at each app&apos;s approval start time (Asia/Dhaka).
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
        >
          <div className="grid max-h-[58vh] gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="task-app-name">App name</Label>
              <Input
                id="task-app-name"
                placeholder="e.g. Foodpanda"
                {...register("app_name")}
              />
              {errors.app_name && (
                <p className="text-xs text-destructive">
                  {errors.app_name.message}
                </p>
              )}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="task-app-link">App link</Label>
              <Input
                id="task-app-link"
                placeholder="https://play.google.com/store/apps/details?id=..."
                {...appLinkField}
                onBlur={(event) => {
                  appLinkField.onBlur(event);
                  handleAppLinkBlur();
                }}
              />
              {errors.app_link && (
                <p className="text-xs text-destructive">
                  {errors.app_link.message}
                </p>
              )}
              {extracted && (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <PackageCheck className="size-3.5" />
                  Package: {extracted.package_name} ·{" "}
                  {extracted.platform === "android" ? "Android" : "iOS"}
                </span>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-package">Package name</Label>
              <Input
                id="task-package"
                placeholder="com.example.app"
                className="font-mono"
                {...register("package_name")}
              />
              {errors.package_name && (
                <p className="text-xs text-destructive">
                  {errors.package_name.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Platform</Label>
              <Select
                value={platform}
                onValueChange={(value) => {
                  if (value === "android" || value === "ios") {
                    setValue("platform", value, { shouldDirty: true });
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  {platform === "ios" ? "iOS" : "Android"}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="android">Android</SelectItem>
                  <SelectItem value="ios">iOS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="task-description">
                Description (optional)
              </Label>
              <Textarea
                id="task-description"
                rows={2}
                placeholder="Short instructions shown on the task card"
                {...register("description")}
              />
              {errors.description && (
                <p className="text-xs text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Banner image</Label>
              {bannerUrl ? (
                <div className="relative overflow-hidden rounded-lg border">
                  <Image
                    src={bannerUrl}
                    alt="Task banner"
                    width={800}
                    height={200}
                    unoptimized
                    className="h-32 w-full object-cover"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon-sm"
                    className="absolute right-2 top-2"
                    aria-label="Remove banner"
                    onClick={() => setValue("banner_url", "")}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ) : (
                <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors hover:bg-muted/50">
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  {uploading ? "Uploading…" : "Upload banner image"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    disabled={uploading}
                    onChange={handleFileChange}
                  />
                </label>
              )}
              <input type="hidden" {...register("banner_url")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-reward">Reward per review (TK)</Label>
              <Input
                id="task-reward"
                type="number"
                min="0"
                step="1"
                placeholder="15"
                {...register("reward")}
              />
              {errors.reward && (
                <p className="text-xs text-destructive">
                  {errors.reward.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-daily-limit">Daily global limit</Label>
              <Input
                id="task-daily-limit"
                type="number"
                min="1"
                step="1"
                placeholder="Unlimited"
                {...register("daily_limit")}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty for no daily cap.
              </p>
              {errors.daily_limit && (
                <p className="text-xs text-destructive">
                  {errors.daily_limit.message}
                </p>
              )}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="task-ai-prompt">
                <Sparkles className="size-3.5 text-primary" />
                AI prompt
              </Label>
              <Textarea
                id="task-ai-prompt"
                rows={5}
                placeholder="Describe the app so the AI Review Generator can write natural reviews..."
                {...register("ai_prompt")}
              />
              <p className="text-xs text-muted-foreground">
                Used by the AI Review Generator on the user panel.
              </p>
              {errors.ai_prompt && (
                <p className="text-xs text-destructive">
                  {errors.ai_prompt.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-cron">Approval start time</Label>
              <Input id="task-cron" type="time" {...register("cron_time")} />
              <p className="text-xs text-muted-foreground">
                Auto-approval starts daily at this time (Asia/Dhaka): pending
                reviews are verified and approved from then. Checks run with
                user traffic and at the daily platform run.
              </p>
              {errors.cron_time && (
                <p className="text-xs text-destructive">
                  {errors.cron_time.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>If review not found</Label>
              <Select
                value={failAction}
                onValueChange={(value) => {
                  if (value === "pending" || value === "rejected") {
                    setValue("fail_action", value, { shouldDirty: true });
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  {failAction === "rejected"
                    ? "Mark rejected if not published"
                    : "Keep pending for manual review"}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rejected">
                    Mark rejected if not published
                  </SelectItem>
                  <SelectItem value="pending">
                    Keep pending for manual review
                  </SelectItem>
                </SelectContent>
              </Select>
              {errors.fail_action && (
                <p className="text-xs text-destructive">
                  {errors.fail_action.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-start">Starts at (optional)</Label>
              <Input
                id="task-start"
                type="datetime-local"
                {...register("start_at")}
              />
              {errors.start_at && (
                <p className="text-xs text-destructive">
                  {errors.start_at.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-end">Ends at (optional)</Label>
              <Input
                id="task-end"
                type="datetime-local"
                {...register("end_at")}
              />
              {errors.end_at && (
                <p className="text-xs text-destructive">
                  {errors.end_at.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-start-time">Daily opens at</Label>
              <Input
                id="task-start-time"
                type="time"
                {...register("start_time")}
              />
              <p className="text-xs text-muted-foreground">
                Asia/Dhaka. Leave empty for always open.
              </p>
              {errors.start_time && (
                <p className="text-xs text-destructive">
                  {errors.start_time.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-end-time">Daily closes at</Label>
              <Input
                id="task-end-time"
                type="time"
                {...register("end_time")}
              />
              <p className="text-xs text-muted-foreground">
                Outside this window the task is locked for everyone.
              </p>
              {errors.end_time && (
                <p className="text-xs text-destructive">
                  {errors.end_time.message}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">
                  Inactive tasks are hidden from workers.
                </p>
              </div>
              <Switch
                checked={status === "active"}
                onCheckedChange={(checked) =>
                  setValue("status", checked ? "active" : "inactive", {
                    shouldDirty: true,
                  })
                }
                aria-label="Task status"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || uploading}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              {task ? "Save changes" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
