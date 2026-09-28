"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Banknote, Loader2, Send, Wallet } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime, formatTK } from "@/lib/format";
import { postJson, useApi } from "@/lib/hooks";
import type { Profile, Withdrawal } from "@/lib/types";
import { withdrawSchema, type WithdrawInput } from "@/lib/validations";

export default function WithdrawPage() {
  const [submitting, setSubmitting] = useState(false);

  const { data: profileData, mutate: mutateProfile } = useApi<{
    profile: Profile;
    min_withdrawal: number;
  }>("/api/user/profile");

  const { data: withdrawalData, mutate: mutateWithdrawals } = useApi<{
    withdrawals: Withdrawal[];
  }>("/api/user/withdrawals");

  const minWithdrawal = profileData?.min_withdrawal ?? 50;
  const balance = profileData?.profile.balance ?? 0;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<WithdrawInput>({
    resolver: zodResolver(withdrawSchema),
    defaultValues: { method: "bkash" },
  });

  const amountValue = useWatch({ control, name: "amount" });
  const methodValue = useWatch({ control, name: "method" });

  const onSubmit = async (values: WithdrawInput) => {
    setSubmitting(true);
    try {
      await postJson("/api/user/withdrawals", {
        method: values.method,
        bkash_number: values.bkash_number,
        amount: Number(values.amount),
      });
      toast.success("Withdrawal request submitted!");
      reset({ method: "bkash" });
      await Promise.all([mutateProfile(), mutateWithdrawals()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  const withdrawals = withdrawalData?.withdrawals ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Withdraw earnings
        </h1>
        <p className="text-sm text-muted-foreground">
          Cash out your balance to bKash — minimum {formatTK(minWithdrawal)}.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Available balance</CardDescription>
              <CardTitle className="text-3xl text-primary">
                {formatTK(balance)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p className="flex items-center gap-1.5">
                <Wallet className="size-4 text-primary" />
                Minimum withdrawal: {formatTK(minWithdrawal)}
              </p>
              <p className="flex items-center gap-1.5">
                <Banknote className="size-4 text-primary" />
                Payments are sent to your bKash number
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Withdrawal history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {withdrawals.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No withdrawal requests yet.
                </p>
              ) : (
                withdrawals.slice(0, 8).map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {formatTK(row.amount)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.bkash_number} · {formatDateTime(row.created_at)}
                      </p>
                    </div>
                    <StatusBadge status={row.status} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>New withdrawal request</CardTitle>
            <CardDescription>
              Requests are reviewed and paid manually via bKash.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label>Payment method</Label>
                <Select
                  value={methodValue ?? "bkash"}
                  onValueChange={(value) =>
                    setValue("method", (value ?? "bkash") as "bkash")
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bkash">bKash</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bkash_number">bKash number</Label>
                <Input
                  id="bkash_number"
                  inputMode="numeric"
                  placeholder="01XXXXXXXXX"
                  {...register("bkash_number")}
                />
                {errors.bkash_number && (
                  <p className="text-xs text-destructive">
                    {errors.bkash_number.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Amount (TK)</Label>
                <Input
                  id="amount"
                  inputMode="numeric"
                  placeholder={`Minimum ${minWithdrawal}`}
                  {...register("amount")}
                />
                {errors.amount && (
                  <p className="text-xs text-destructive">
                    {errors.amount.message}
                  </p>
                )}
                <div className="flex gap-2 pt-1">
                  {[50, 100, 500, 1000].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setValue("amount", String(value))}
                      className="rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                    >
                      {value}
                    </button>
                  ))}
                </div>
                {Number(amountValue) > balance && (
                  <p className="text-xs text-destructive">
                    Amount exceeds your available balance
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={submitting || Number(amountValue) > balance}
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Request withdrawal
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {withdrawals.length === 0 && (
        <EmptyState
          icon={Banknote}
          title="No requests yet"
          description="Complete tasks to build up your balance, then withdraw here."
          className="md:hidden"
        />
      )}
    </div>
  );
}
