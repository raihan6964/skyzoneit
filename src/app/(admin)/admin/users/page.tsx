"use client";

import { useEffect, useMemo, useState } from "react";
import { mutate } from "swr";
import {
  Ellipsis,
  Eye,
  Loader2,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  ShieldOff,
  UserCog,
  Users as UsersIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/admin/pagination";
import { UserBalanceDialog } from "@/components/admin/user-balance-dialog";
import { UserProfileDialog } from "@/components/admin/user-profile-dialog";
import { StatusBadge } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatTK } from "@/lib/format";
import { postJson, useApi } from "@/lib/hooks";
import type { Profile } from "@/lib/types";

const PAGE_SIZE = 20;

type ConfirmKind = "suspend" | "recover" | "make-admin" | "remove-admin";

const CONFIRM_COPY: Record<
  ConfirmKind,
  { title: string; description: string; action: string; destructive: boolean }
> = {
  suspend: {
    title: "Suspend this account?",
    description:
      "The worker will no longer be able to log in or submit reviews until recovered.",
    action: "Suspend account",
    destructive: true,
  },
  recover: {
    title: "Recover this account?",
    description: "The worker regains full access to tasks and withdrawals.",
    action: "Recover account",
    destructive: false,
  },
  "make-admin": {
    title: "Grant admin access?",
    description: "This user will be able to manage the entire admin panel.",
    action: "Make admin",
    destructive: false,
  },
  "remove-admin": {
    title: "Remove admin access?",
    description: "This user will be limited to the regular worker panel.",
    action: "Remove admin",
    destructive: true,
  },
};

export default function AdminUsersPage() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<Profile | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [balanceDirection, setBalanceDirection] = useState<
    "add" | "deduct" | null
  >(null);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const url = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    if (search) params.set("q", search);
    return `/api/admin/users?${params.toString()}`;
  }, [page, search]);

  const { data, error, isLoading, mutate: refresh } = useApi<{
    users: Profile[];
    total: number;
    page: number;
    page_size: number;
  }>(url);

  const refreshAll = () => {
    void refresh();
    void mutate(() => true);
  };

  const openProfile = (user: Profile) => {
    setTarget(user);
    setProfileOpen(true);
  };

  const openBalance = (user: Profile, direction: "add" | "deduct") => {
    setTarget(user);
    setBalanceDirection(direction);
  };

  const openConfirm = (user: Profile, kind: ConfirmKind) => {
    setTarget(user);
    setConfirm(kind);
  };

  const runConfirm = async () => {
    if (!target || !confirm) return;
    setBusy(true);
    try {
      if (confirm === "suspend") {
        await postJson(
          `/api/admin/users/${target.id}`,
          {
            action: "status",
            status: "suspended",
          },
          "PATCH"
        );
        toast.success(`${target.sky_id} suspended`);
      } else if (confirm === "recover") {
        await postJson(
          `/api/admin/users/${target.id}`,
          {
            action: "status",
            status: "active",
          },
          "PATCH"
        );
        toast.success(`${target.sky_id} recovered`);
      } else if (confirm === "make-admin") {
        await postJson(
          `/api/admin/users/${target.id}`,
          {
            action: "role",
            role: "admin",
          },
          "PATCH"
        );
        toast.success("Admin access granted");
      } else {
        await postJson(
          `/api/admin/users/${target.id}`,
          {
            action: "role",
            role: "user",
          },
          "PATCH"
        );
        toast.success("Admin access removed");
      }
      setConfirm(null);
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update user");
    } finally {
      setBusy(false);
    }
  };

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const confirmCopy = confirm ? CONFIRM_COPY[confirm] : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            Search workers, review balances and manage account access
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email or Sky ID"
            className="pl-8 pr-8"
            aria-label="Search users"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sky ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && !data ? (
              Array.from({ length: 6 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: 7 }).map((__, cellIndex) => (
                    <TableCell key={cellIndex}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error && !data ? (
              <TableRow>
                <TableCell colSpan={7} className="whitespace-normal">
                  <EmptyState
                    icon={UsersIcon}
                    title="Could not load users"
                    description={error.message}
                  />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="whitespace-normal">
                  <EmptyState
                    icon={UsersIcon}
                    title="No users found"
                    description={
                      search
                        ? `Nothing matches “${search}”. Try a different name, email or Sky ID.`
                        : "Workers will show up here once they sign up."
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-mono font-medium">
                    {user.sky_id}
                  </TableCell>
                  <TableCell className="font-medium">
                    {user.full_name || "—"}
                  </TableCell>
                  <TableCell className="hidden max-w-56 truncate text-muted-foreground md:table-cell">
                    {user.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatTK(user.balance)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={user.status} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {formatDate(user.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${user.sky_id}`}
                          />
                        }
                      >
                        <Ellipsis />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openProfile(user)}>
                          <Eye />
                          View profile
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => openBalance(user, "add")}
                        >
                          <Plus />
                          Add balance
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => openBalance(user, "deduct")}
                        >
                          <Minus />
                          Deduct balance
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {user.status === "active" ? (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => openConfirm(user, "suspend")}
                          >
                            <ShieldOff />
                            Suspend
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => openConfirm(user, "recover")}
                          >
                            <ShieldCheck />
                            Recover
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() =>
                            openConfirm(
                              user,
                              user.role === "admin" ? "remove-admin" : "make-admin"
                            )
                          }
                        >
                          <UserCog />
                          {user.role === "admin"
                            ? "Remove admin"
                            : "Make admin"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!error && (data?.total ?? 0) > 0 && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={setPage}
        />
      )}

      <UserProfileDialog
        userId={target?.id ?? null}
        open={profileOpen}
        onOpenChange={(open) => {
          setProfileOpen(open);
          if (!open) setTarget(null);
        }}
      />

      <UserBalanceDialog
        userId={target?.id ?? null}
        direction={balanceDirection ?? "add"}
        userName={target?.full_name ?? target?.sky_id}
        open={balanceDirection !== null}
        onOpenChange={(open) => {
          if (!open) {
            setBalanceDirection(null);
            setTarget(null);
          }
        }}
      />

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmCopy?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmCopy?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              variant={confirmCopy?.destructive ? "destructive" : "default"}
              onClick={runConfirm}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              {confirmCopy?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
