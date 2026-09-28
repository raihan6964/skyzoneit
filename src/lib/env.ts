function first(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value) return value;
  }
  return undefined;
}

export function supabaseEnv() {
  const url = first(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL
  );
  const anon = first(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY
  );
  if (!url || !anon) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel → Settings → Environment Variables (or connect the Supabase integration)"
    );
  }
  return { url, anon };
}

export function serviceRoleEnv() {
  const key = first(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SECRET_KEY,
    process.env.SERVICE_ROLE_KEY
  );
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set (Vercel → Settings → Environment Variables)"
    );
  }
  return key;
}
