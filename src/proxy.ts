import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_PAGES = ["/login", "/signup", "/forgot-password"];

async function resolveSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { user: null, supabase: null };

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user, supabase };
}

async function isAdmin(
  supabase: NonNullable<Awaited<ReturnType<typeof resolveSession>>["supabase"]>,
  userId: string,
  email: string | undefined
) {
  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase();
  if (adminEmail && email && email.toLowerCase() === adminEmail) return true;

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  return data?.role === "admin";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { user, supabase } = await resolveSession(request);

  const isApiAdmin = pathname.startsWith("/api/admin");
  const isAdminPanel = pathname.startsWith("/admin");
  const isUserPanel = pathname.startsWith("/dashboard");
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (isApiAdmin || isAdminPanel) {
    if (!user || !supabase) {
      if (isApiAdmin) {
        return Response.json({ error: "Not authenticated" }, { status: 401 });
      }
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    if (!(await isAdmin(supabase, user.id, user.email))) {
      if (isApiAdmin) {
        return Response.json({ error: "Admin access required" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  if (isUserPanel && !user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  if (isAuthPage && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (pathname === "/" && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/admin/:path*",
    "/login",
    "/signup",
    "/forgot-password",
    "/api/admin/:path*",
  ],
};
