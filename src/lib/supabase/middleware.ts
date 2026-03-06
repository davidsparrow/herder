import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function withCopiedCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach(cookie => target.cookies.set(cookie));
  return target;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          request.cookies.set(name, value);
          supabaseResponse = NextResponse.next({ request });
          supabaseResponse.cookies.set(name, value, options);
        },
        remove(name: string, options: any) {
          request.cookies.set(name, "");
          supabaseResponse = NextResponse.next({ request });
          supabaseResponse.cookies.set(name, "", { ...options, maxAge: 0 });
        },
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();

  // Redirect unauthenticated users away from protected routes
  const protectedPaths = ["/dashboard", "/onboard"];
  const isProtected = protectedPaths.some(p => request.nextUrl.pathname.startsWith(p));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("auth_debug", "middleware_no_user");
    url.searchParams.set("from", request.nextUrl.pathname);
    if (error?.message) url.searchParams.set("auth_detail", error.message);
    return withCopiedCookies(supabaseResponse, NextResponse.redirect(url));
  }

  // Redirect authenticated users away from auth pages
  if (user && request.nextUrl.pathname.startsWith("/auth/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return withCopiedCookies(supabaseResponse, NextResponse.redirect(url));
  }

  return supabaseResponse;
}
