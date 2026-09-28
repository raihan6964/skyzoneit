"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, LogOut, Menu } from "lucide-react";
import { toast } from "sonner";
import { AdminNav } from "@/components/admin/admin-nav";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useApi } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

function getInitials(profile: Profile): string {
  const name = (profile.full_name ?? "").trim();
  if (!name) return profile.sky_id.slice(0, 2).toUpperCase();
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function BackLink({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      href="/dashboard"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Back to user panel
    </Link>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { data } = useApi<{ profile: Profile }>("/api/user/profile", {
    onError: () => undefined,
    shouldRetryOnError: false,
  });

  const profile = data?.profile;

  const signOut = async () => {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      toast.success("Signed out");
      router.replace("/login");
    } catch {
      toast.error("Could not sign out, please try again");
      setSigningOut(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-card md:flex">
        <div className="flex h-14 shrink-0 items-center border-b px-4">
          <Link href="/admin">
            <Logo />
          </Link>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
          <div>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Manage
            </p>
            <AdminNav />
          </div>
          <Separator />
          <BackLink />
        </div>

        <div className="shrink-0 border-t p-3">
          {profile && (
            <div className="mb-2 flex items-center gap-2.5 px-2 py-1">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {getInitials(profile)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {profile.full_name || "Administrator"}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {profile.sky_id}
                </p>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={signOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <Loader2 className="animate-spin" />
            ) : (
              <LogOut />
            )}
            Log out
          </Button>
        </div>
      </aside>

      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:hidden">
        <Link href="/admin">
          <Logo />
        </Link>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Open navigation" />
            }
          >
            <Menu />
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader className="pr-10">
              <SheetTitle className="sr-only">Admin navigation</SheetTitle>
              <Link href="/admin" onClick={() => setSheetOpen(false)}>
                <Logo />
              </Link>
            </SheetHeader>
            <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
              <AdminNav onNavigate={() => setSheetOpen(false)} />
              <Separator />
              <BackLink onClick={() => setSheetOpen(false)} />
              <Button
                variant="outline"
                className="mt-auto w-full"
                onClick={signOut}
                disabled={signingOut}
              >
                {signingOut ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <LogOut />
                )}
                Log out
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <main className="md:pl-64">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
