"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Smartphone,
  Apple,
  ClipboardCheck,
  ExternalLink,
  ImageIcon,
  Loader2,
  Lock,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { formatTK, formatTimeRange, formatDailyWindow } from "@/lib/format";
import { postJson } from "@/lib/hooks";
import { submissionSchema, type SubmissionInput } from "@/lib/validations";
import type { UserTask } from "@/lib/types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <Badge variant="outline" className="gap-1 text-xs font-medium">
      {platform === "ios" ? (
        <Apple className="size-3" />
      ) : (
        <Smartphone className="size-3" />
      )}
      {platform === "ios" ? "App Store" : "Play Store"}
    </Badge>
  );
}

export function TaskCard({
  task,
  onChanged,
}: {
  task: UserTask;
  onChanged: () => void;
}) {
  const limitReached =
    task.daily_limit !== null && task.submitted_today >= task.daily_limit;
  const windowLocked = task.lock_reason === "window";
  const progressValue =
    task.daily_limit !== null
      ? Math.min(100, (task.submitted_today / task.daily_limit) * 100)
      : 0;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
      <div className="bg-brand-gradient relative h-32 w-full">
        {task.banner_url ? (
          <Image
            src={task.banner_url}
            alt={task.app_name}
            fill
            sizes="(max-width: 640px) 100vw, 33vw"
            className="object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-4xl font-bold text-white/90">
            {task.app_name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="absolute left-2 top-2 rounded-md bg-background/90 px-2 py-0.5 text-xs font-semibold text-primary shadow-sm">
          {formatTK(task.reward)} / review
        </span>
        {task.locked && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-amber-500/90 px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
            <Lock className="size-3" />
            {windowLocked ? "Scheduled" : "Limit reached"}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-semibold">{task.app_name}</h3>
          <PlatformBadge platform={task.platform} />
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="font-medium text-foreground/80">
            {formatTimeRange(task.start_at, task.end_at)}
          </p>
          <p className="font-medium text-foreground/80">
            {formatDailyWindow(task.start_time, task.end_time)}
          </p>
          <p>
            You submitted: <span className="font-semibold text-foreground">{task.my_total}</span>
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Today&apos;s reviews</span>
            <span className="font-medium tabular-nums">
              {task.daily_limit !== null
                ? `${task.submitted_today} / ${task.daily_limit}`
                : `${task.submitted_today} submitted`}
            </span>
          </div>
          {task.daily_limit !== null && (
            <Progress value={progressValue}>
              <span className="sr-only">Daily progress</span>
            </Progress>
          )}
        </div>

        <div className="mt-auto space-y-2 pt-1">
          <DetailsDialog task={task} />
          <SubmitDialog
            task={task}
            limitReached={limitReached}
            windowLocked={windowLocked}
            onChanged={onChanged}
          />
        </div>
      </div>
    </div>
  );
}

function DetailsDialog({ task }: { task: UserTask }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" className="w-full" />}>
        Details
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{task.app_name}</DialogTitle>
          <DialogDescription>
            Review the details before opening the store page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative h-40 overflow-hidden rounded-lg bg-gradient-to-br from-primary/70 via-primary/45 to-sky-300/60">
            {task.banner_url && (
              <Image
                src={task.banner_url}
                alt={task.app_name}
                fill
                sizes="500px"
                className="object-cover"
              />
            )}
          </div>

          {task.description && (
            <p className="text-sm text-muted-foreground">{task.description}</p>
          )}

          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-muted/60 p-2.5">
              <dt className="text-xs text-muted-foreground">Reward</dt>
              <dd className="font-semibold text-primary">
                {formatTK(task.reward)}
              </dd>
            </div>
            <div className="rounded-lg bg-muted/60 p-2.5">
              <dt className="text-xs text-muted-foreground">Daily limit</dt>
              <dd className="font-semibold">
                {task.daily_limit ?? "Unlimited"}
              </dd>
            </div>
            <div className="col-span-2 rounded-lg bg-muted/60 p-2.5">
              <dt className="text-xs text-muted-foreground">Schedule</dt>
              <dd className="font-medium">
                {formatTimeRange(task.start_at, task.end_at)}
              </dd>
            </div>
            <div className="col-span-2 rounded-lg bg-muted/60 p-2.5">
              <dt className="text-xs text-muted-foreground">Daily window</dt>
              <dd className="font-medium">
                {formatDailyWindow(task.start_time, task.end_time)}
              </dd>
            </div>
            <div className="col-span-2 rounded-lg bg-muted/60 p-2.5">
              <dt className="text-xs text-muted-foreground">Package</dt>
              <dd className="truncate font-mono text-xs">{task.package_name}</dd>
            </div>
          </dl>

          <Button
            className="w-full"
            render={
              <a href={task.app_link} target="_blank" rel="noopener noreferrer" />
            }
          >
              <ExternalLink className="size-4" />
              Open in {task.platform === "ios" ? "App Store" : "Play Store"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SubmitDialog({
  task,
  limitReached,
  windowLocked,
  onChanged,
}: {
  task: UserTask;
  limitReached: boolean;
  windowLocked: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SubmissionInput>({ resolver: zodResolver(submissionSchema) });

  const pickFile = (selected: File | null | undefined) => {
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (selected.size > MAX_IMAGE_BYTES) {
      toast.error("Screenshot must be smaller than 5MB");
      return;
    }
    setFile(selected);
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(selected);
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onSubmit = async (values: SubmissionInput) => {
    if (!file) {
      toast.error("Please upload your review screenshot");
      return;
    }
    setSubmitting(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("Could not read the image"));
        reader.readAsDataURL(file);
      });

      await postJson("/api/user/submissions", {
        task_id: task.id,
        reviewer_name: values.reviewer_name,
        reviewer_gmail: values.reviewer_gmail,
        image_base64: base64,
      });

      toast.success("Submitted! It will be verified automatically.");
      reset();
      clearFile();
      setOpen(false);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          clearFile();
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            className="w-full"
            disabled={limitReached || windowLocked}
          />
        }
      >
        {limitReached ? (
          "Daily limit reached"
        ) : windowLocked ? (
          <>
            <Lock className="size-4" />
            Locked — opens {task.start_time ?? "00:00"}
          </>
        ) : (
          <>
            <Send className="size-4" />
            Submit review
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Submit review — {task.app_name}</DialogTitle>
          <DialogDescription>
            Fill in exactly what appears on your published review.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            void handleSubmit(onSubmit)(event);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor={`reviewer-${task.id}`}>Reviewer name</Label>
            <Input
              id={`reviewer-${task.id}`}
              placeholder="Name shown on the review"
              {...register("reviewer_name")}
            />
            {errors.reviewer_name && (
              <p className="text-xs text-destructive">
                {errors.reviewer_name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`gmail-${task.id}`}>Reviewer Gmail (optional)</Label>
            <Input
              id={`gmail-${task.id}`}
              type="email"
              placeholder="Leave empty if you don't have one"
              {...register("reviewer_gmail")}
            />
            {errors.reviewer_gmail && (
              <p className="text-xs text-destructive">
                {errors.reviewer_gmail.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Review screenshot</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(event) => pickFile(event.target.files?.[0])}
            />

            {preview ? (
              <div className="relative overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Screenshot preview"
                  className="max-h-56 w-full object-contain bg-muted"
                />
                <button
                  type="button"
                  onClick={clearFile}
                  className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow"
                  aria-label="Remove screenshot"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                <ImageIcon className="size-5 text-primary" />
                <span className="font-medium">Upload screenshot</span>
                <span className="text-xs">JPG, PNG, WEBP — max 5MB</span>
              </button>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ClipboardCheck className="size-4" />
            )}
            {submitting ? "Uploading & submitting..." : "Submit review"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { PlatformBadge };

export function TaskCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="h-32 animate-pulse bg-muted" />
      <div className="space-y-3 p-4">
        <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-8 w-full animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
