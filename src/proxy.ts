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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { user, supabase } = await resolveSession(request);

  const isApiAdmin = pathname.startsWith("/api/admin");
  const isAdminPanel = pathname.startsWith("/admin");
  const isUserPanel = pathname.startsWith("/dashboard");
  const isAuthPage = AUTH_PAGES.includes(pathname);
  const isTestPage = pathname === "/access-test";

  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase();
  let profile: { role: string | null; access_test_passed: boolean | null } | null =
    null;
  if (user && supabase) {
    const { data } = await supabase
      .from("profiles")
      .select("role, access_test_passed")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  const isAdminUser =
    profile?.role === "admin" ||
    (!!adminEmail && !!user?.email && user.email.toLowerCase() === adminEmail);
  const testPassed = isAdminUser || profile?.access_test_passed === true;

  if (isApiAdmin || isAdminPanel) {
    if (!user || !supabase) {
      if (isApiAdmin) {
        return Response.json({ error: "Not authenticated" }, { status: 401 });
      }
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    if (!isAdminUser) {
      if (isApiAdmin) {
        return Response.json({ error: "Admin access required" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  if (isTestPage) {
    if (!user) return NextResponse.redirect(new URL("/login", request.url));
    if (testPassed)
      return NextResponse.redirect(new URL("/dashboard", request.url));
    return NextResponse.next();
  }

  if (isUserPanel) {
    if (!user) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    if (!testPassed)
      return NextResponse.redirect(new URL("/access-test", request.url));
  }

  const landing = user && !testPassed ? "/access-test" : "/dashboard";

  if (isAuthPage && user) {
    return NextResponse.redirect(new URL(landing, request.url));
  }

  if (pathname === "/" && user) {
    return NextResponse.redirect(new URL(landing, request.url));
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
    "/access-test",
    "/api/admin/:path*",
  ],
};
