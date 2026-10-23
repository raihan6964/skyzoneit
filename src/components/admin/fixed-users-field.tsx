"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/hooks";
import type { Profile } from "@/lib/types";

export interface FixedUserEntry {
  user_id: string;
  daily_limit: number;
  label?: string;
}

// Search users by username (sky_id), name or email, then pick them into the
// task's fixed user list with a per-user daily limit.
export function FixedUsersField({
  value,
  onChange,
  error,
}: {
  value: FixedUserEntry[];
  onChange: (next: FixedUserEntry[]) => void;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequenceRef = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (term.length < 2) {
      debounceRef.current = setTimeout(() => {
        setResults([]);
        setSearching(false);
      }, 150);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }

    const seq = ++sequenceRef.current;
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await fetcher<{ users: Profile[] }>(
          `/api/admin/users?q=${encodeURIComponent(term)}&page_size=8`
        );
        if (seq !== sequenceRef.current) return;
        setResults(data.users ?? []);
      } catch {
        if (seq === sequenceRef.current) setResults([]);
      } finally {
        if (seq === sequenceRef.current) setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const add = (profile: Profile) => {
    if (value.some((entry) => entry.user_id === profile.id)) {
      toast.error("User already added");
      return;
    }
    onChange([
      ...value,
      {
        user_id: profile.id,
        daily_limit: 1,
        label: `${profile.sky_id} · ${profile.full_name || profile.email || ""}`.trim(),
      },
    ]);
    setQuery("");
    setResults([]);
  };

  const setLimit = (userId: string, limit: number) => {
    onChange(
      value.map((entry) =>
        entry.user_id === userId
          ? { ...entry, daily_limit: Number.isFinite(limit) ? limit : 1 }
          : entry
      )
    );
  };

  const remove = (userId: string) => {
    onChange(value.filter((entry) => entry.user_id !== userId));
  };

  const selectedIds = new Set(value.map((entry) => entry.user_id));
  const visibleResults = results.filter((item) => !selectedIds.has(item.id));

  return (
    <div className="space-y-2">
      <Label>Allowed users</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by username, name or email..."
          className="pl-9"
          autoComplete="off"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        {visibleResults.length > 0 && (
          <div className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-lg border bg-popover shadow-md">
            {visibleResults.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => add(item)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {item.full_name || item.email || "Unnamed"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.email}
                  </span>
                </span>
                <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
                  {item.sky_id}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {value.length > 0 && (
        <div className="space-y-2 rounded-lg border p-2">
          {value.map((entry) => (
            <div
              key={entry.user_id}
              className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5"
            >
              <UserPlus className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {entry.label || entry.user_id}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={entry.daily_limit}
                  onChange={(event) =>
                    setLimit(entry.user_id, Number(event.target.value))
                  }
                  className="h-8 w-20 text-center"
                  aria-label="Daily review limit"
                />
                <span className="text-xs text-muted-foreground">/day</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove user"
                onClick={() => remove(entry.user_id)}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Only these users will see this task. Each user gets their own daily
        review limit; global limits are ignored while this mode is on.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
