"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownRight, ArrowUpRight, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { mutate } from "swr";
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
import { Textarea } from "@/components/ui/textarea";
import { postJson } from "@/lib/hooks";
import { adminAdjustSchema } from "@/lib/validations";

type AdjustValues = z.input<typeof adminAdjustSchema>;
type AdjustOutput = z.output<typeof adminAdjustSchema>;

export function UserBalanceDialog({
  userId,
  direction,
  userName,
  open,
  onOpenChange,
}: {
  userId: string | null;
  direction: "add" | "deduct";
  userName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AdjustValues, unknown, AdjustOutput>({
    resolver: zodResolver(adminAdjustSchema),
    defaultValues: { amount: 0, direction, reason: "" },
  });

  useEffect(() => {
    if (open) reset({ amount: 0, direction, reason: "" });
  }, [open, direction, reset]);

  const onSubmit = async (values: AdjustOutput) => {
    if (!userId) return;
    setBusy(true);
    try {
      await postJson(
        `/api/admin/users/${userId}`,
        {
          action: "adjust",
          direction,
          amount: values.amount,
          reason: values.reason,
        },
        "PATCH"
      );
      toast.success(
        direction === "add" ? "Balance added" : "Balance deducted"
      );
      onOpenChange(false);
      void mutate(() => true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update balance"
      );
    } finally {
      setBusy(false);
    }
  };

  const adding = direction === "add";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {adding ? "Add balance" : "Deduct balance"}
          </DialogTitle>
          <DialogDescription>
            {adding
              ? `Credit earnings to ${userName ?? "this worker"}. The change is written to the balance ledger.`
              : `Remove balance from ${userName ?? "this worker"}. This cannot be undone.`}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="adjust-amount">Amount (TK)</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex w-9 items-center justify-center text-sm text-muted-foreground">
                {adding ? (
                  <ArrowUpRight className="size-4 text-emerald-600" />
                ) : (
                  <ArrowDownRight className="size-4 text-red-600" />
                )}
              </span>
              <Input
                id="adjust-amount"
                type="number"
                min="1"
                step="1"
                placeholder="Enter amount"
                className="pl-9"
                {...register("amount")}
              />
            </div>
            {errors.amount && (
              <p className="text-xs text-destructive">
                {errors.amount.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjust-reason">Reason (optional)</Label>
            <Textarea
              id="adjust-reason"
              placeholder="e.g. Bonus for perfect reviews"
              rows={2}
              {...register("reason")}
            />
            {errors.reason && (
              <p className="text-xs text-destructive">
                {errors.reason.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {adding ? "Add balance" : "Deduct balance"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
