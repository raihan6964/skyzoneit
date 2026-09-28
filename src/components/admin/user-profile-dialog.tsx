"use client";

import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatDateTime, formatTK } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { BalanceTransaction, Profile, Withdrawal } from "@/lib/types";

interface UserDetail {
  profile: Profile;
  transactions: BalanceTransaction[];
  submissions: Array<{
    id: string;
    status: string;
    submitted_date: string;
    reward: number;
    task: { app_name: string } | null;
  }>;
  withdrawals: Withdrawal[];
}

function initials(profile: Profile): string {
  const name = (profile.full_name ?? "").trim();
  if (!name) return profile.sky_id.slice(0, 2).toUpperCase();
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium break-words">{value}</p>
    </div>
  );
}

export function UserProfileDialog({
  userId,
  open,
  onOpenChange,
}: {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, error, isLoading } = useApi<UserDetail>(
    open && userId ? `/api/admin/users/${userId}` : null
  );

  const profile = data?.profile;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>User profile</DialogTitle>
          <DialogDescription>
            Account details, balance history and recent activity.
          </DialogDescription>
        </DialogHeader>

        {!data && !error ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error || !profile ? (
          <EmptyState
            icon={Inbox}
            title="Could not load this user"
            description={error?.message ?? "User not found"}
          />
        ) : (
          <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
            <div className="flex items-center gap-3">
              <Avatar size="lg">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {initials(profile)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {profile.full_name || "Unnamed worker"}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {profile.sky_id} · {profile.email ?? "no email"}
                </p>
              </div>
              <div className="ml-auto flex shrink-0 gap-1.5">
                <StatusBadge status={profile.role} />
                <StatusBadge status={profile.status} />
              </div>
            </div>

            <Tabs defaultValue="overview">
              <TabsList className="w-full justify-start sm:w-auto">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="transactions">Transactions</TabsTrigger>
                <TabsTrigger value="submissions">Submissions</TabsTrigger>
                <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Detail label="Current balance" value={formatTK(profile.balance, true)} />
                  <Detail label="Role" value={profile.role === "admin" ? "Administrator" : "Worker"} />
                  <Detail label="Account status" value={<StatusBadge status={profile.status} />} />
                  <Detail label="Joined" value={formatDate(profile.created_at)} />
                  <Detail label="Sky ID" value={<span className="font-mono">{profile.sky_id}</span>} />
                  <Detail label="Email" value={profile.email ?? "—"} />
                </div>
              </TabsContent>

              <TabsContent value="transactions" className="mt-3">
                {isLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : data.transactions.length === 0 ? (
                  <EmptyState
                    icon={Inbox}
                    title="No balance transactions"
                    description="Credits and deductions will appear here."
                  />
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead className="hidden sm:table-cell">
                            Reason
                          </TableHead>
                          <TableHead className="text-right">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.transactions.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>
                              <span
                                className={
                                  row.type === "credit"
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-red-600 dark:text-red-400"
                                }
                              >
                                {row.type === "credit" ? "Credit" : "Debit"}
                              </span>
                            </TableCell>
                            <TableCell className="font-medium tabular-nums">
                              {formatTK(row.amount)}
                            </TableCell>
                            <TableCell className="hidden max-w-56 truncate text-muted-foreground sm:table-cell">
                              {row.reason || "—"}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatDateTime(row.created_at)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="submissions" className="mt-3">
                {isLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : data.submissions.length === 0 ? (
                  <EmptyState
                    icon={Inbox}
                    title="No submissions yet"
                    description="Reviews submitted by this worker will appear here."
                  />
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>App</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="hidden sm:table-cell">
                            Reward
                          </TableHead>
                          <TableHead className="text-right">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.submissions.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">
                              {row.task?.app_name ?? "—"}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={row.status} />
                            </TableCell>
                            <TableCell className="hidden tabular-nums sm:table-cell">
                              {formatTK(row.reward)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatDate(row.submitted_date)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="withdrawals" className="mt-3">
                {isLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : data.withdrawals.length === 0 ? (
                  <EmptyState
                    icon={Inbox}
                    title="No withdrawal requests"
                    description="bKash payout requests will appear here."
                  />
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="hidden sm:table-cell">
                            bKash number
                          </TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Requested</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.withdrawals.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="hidden font-mono text-xs sm:table-cell">
                              {row.bkash_number}
                            </TableCell>
                            <TableCell className="font-medium tabular-nums">
                              {formatTK(row.amount)}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={row.status} />
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatDateTime(row.created_at)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
