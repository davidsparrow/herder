import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/email";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // Build origin from host header to work correctly on Vercel
  const host = request.headers.get("host") ?? "";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  console.log("[auth/callback] code present:", !!code, "origin:", origin);

  if (!code) {
    console.error("[auth/callback] No code param in request URL:", request.url);
    return NextResponse.redirect(`${origin}/auth/login?error=no_code`);
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  console.log("[auth/callback] exchange result:", { userId: data?.user?.id, error: error?.message });

  if (error || !data.user) {
    const msg = error?.message ?? "unknown";
    console.error("[auth/callback] Exchange failed:", msg);
    return NextResponse.redirect(
      `${origin}/auth/login?error=auth_error&detail=${encodeURIComponent(msg)}`
    );
  }

  const user = data.user;

  // Check if profile already exists (returning user)
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .single();

  if (!existing) {
    // ── First-time sign-in: create org + profile on Free plan ──────────

    const emailDomain = user.email?.split("@")[1] ?? "my-org";
    const { data: org } = await supabase
      .from("orgs")
      .insert({ name: emailDomain, plan_tier: "free" })
      .select()
      .single();

    if (org) {
      await supabase.from("profiles").insert({
        id: user.id,
        email: user.email!,
        full_name: user.user_metadata?.full_name ?? null,
        role: "admin",
        org_id: org.id,
        plan_tier: "free",
      });
    }

    // Send welcome email (non-blocking)
    if (user.email) {
      sendWelcomeEmail(
        user.email,
        user.user_metadata?.full_name ?? user.email
      ).catch(console.error);
    }

    return NextResponse.redirect(`${origin}/onboard`);
  }

  // Returning user — go to dashboard
  return NextResponse.redirect(`${origin}${next}`);
}
