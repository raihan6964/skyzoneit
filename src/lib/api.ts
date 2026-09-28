import { ApiError } from "@/lib/error";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export async function withApi(
  handler: () => Promise<Response>
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[api]", error);
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    return Response.json({ error: message }, { status: 500 });
  }
}

type SupabaseResult<T> = { data: T | null; error: { message: string } | null };

export function unwrap<T>(result: SupabaseResult<T>): NonNullable<T> {
  if (result.error) {
    throw new ApiError(result.error.message, 400);
  }
  if (result.data === null) {
    throw new ApiError("Not found", 404);
  }
  return result.data as NonNullable<T>;
}

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new ApiError("Not authenticated", 401);

  const profile = unwrap<Profile>(
    await supabase.from("profiles").select("*").eq("id", user.id).single()
  );

  if (profile.status === "suspended") {
    throw new ApiError("Your account is suspended", 403);
  }
  return { supabase, user, profile };
}

export async function requireAdmin() {
  const context = await requireUser();
  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase();
  const isAdmin =
    context.profile.role === "admin" ||
    (!!adminEmail && context.user.email?.toLowerCase() === adminEmail);
  if (!isAdmin) throw new ApiError("Admin access required", 403);
  return context;
}
