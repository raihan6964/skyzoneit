import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv, serviceRoleEnv } from "@/lib/env";

export function createAdminClient() {
  const { url } = supabaseEnv();
  return createSupabaseClient(url, serviceRoleEnv(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
