"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  History,
  LayoutGrid,
  LogOut,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/hooks";
import { formatTK } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}> = [
  { href: "/dashboard", label: "Tasks", icon: LayoutGrid, exact: true },
  { href: "/dashboard/history", label: "History", icon: History },
  { href: "/dashboard/withdraw", label: "Withdraw", icon: Wallet },
  { href: "/dashboard/ai", label: "AI Review", icon: Sparkles },
];

function useProfile() {
  return useApi<{ profile: Profile; min_withdrawal: number }>(
    "/api/user/profile",
    { revalidateOnFocus: false }
  );
}

async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
}

function NavLinks({
  pathname,
  onNavigate,
  variant,
}: {
  pathname: string;
  onNavigate?: () => void;
  variant: "sidebar" | "bottom";
}) {
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        const Icon = item.icon;

        if (variant === "bottom") {
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="size-5" />
              {item.label}
            </Link>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function UserShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useProfile();
  const profile = data?.profile;

  return (
    <div className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-card md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/dashboard">
            <Logo />
          </Link>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <NavLinks pathname={pathname} variant="sidebar" />
        </nav>
        <div className="border-t p-3">
          {profile ? (
            <div className="rounded-lg bg-muted/60 p-3">
              <p className="truncate text-sm font-medium">
                {profile.full_name || "Worker"}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {profile.sky_id}
              </p>
              <p className="mt-1.5 text-sm font-semibold text-primary">
                {formatTK(profile.balance)}
              </p>
            </div>
          ) : (
            <Skeleton className="h-20 w-full" />
          )}
          <button
            onClick={async () => {
              await signOut();
              router.replace("/login");
            }}
            className="mt-2 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
            Log out
          </button>
        </div>
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-md md:px-6">
          <div className="md:hidden">
            <Link href="/dashboard">
              <Logo className="text-sm [&>span:first-child]:size-7" />
            </Link>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <span className="text-sm text-muted-foreground">
              {profile ? `Welcome back, ${profile.full_name || profile.sky_id}` : "Skyzone IT"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Wallet className="size-3.5" />
              {profile ? formatTK(profile.balance) : "—"}
            </span>
            <ThemeToggle />
            <button
              onClick={async () => {
                await signOut();
                router.replace("/login");
              }}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
              aria-label="Log out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-5 md:px-6 md:pb-10">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 backdrop-blur-md md:hidden">
        <NavLinks pathname={pathname} variant="bottom" />
      </nav>
    </div>
  );
}
