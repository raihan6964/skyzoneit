"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/env";

export function createClient() {
  const { url, anon } = supabaseEnv();
  return createBrowserClient(url, anon);
}
