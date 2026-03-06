import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/email";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Build origin from host header to work correctly on Vercel
  const host = request.headers.get("host") ?? "";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as "magiclink" | "email" | "recovery" | null;
  const next = searchParams.get("next") ?? "/dashboard";

  console.log("[auth/callback] params:", { code: !!code, token_hash: !!token_hash, type, origin });

  const supabase = createClient();
  let user = null;
  let exchangeError = null;

  if (token_hash && type) {
    // ── Token hash flow (recommended for SSR — no localStorage needed) ──
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
    console.log("[auth/callback] verifyOtp result:", { userId: data?.user?.id, error: error?.message });
    user = data?.user ?? null;
    exchangeError = error;
  } else if (code) {
    // ── PKCE code flow (fallback) ──
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    console.log("[auth/callback] exchangeCode result:", { userId: data?.user?.id, error: error?.message });
    user = data?.user ?? null;
    exchangeError = error;
  } else {
    console.error("[auth/callback] No code or token_hash in URL:", request.url);
    return NextResponse.redirect(`${origin}/auth/login?error=no_params`);
  }

  if (exchangeError || !user) {
    const msg = exchangeError?.message ?? "unknown";
    console.error("[auth/callback] Auth failed:", msg);
    return NextResponse.redirect(
      `${origin}/auth/login?error=auth_error&detail=${encodeURIComponent(msg)}`
    );
  }

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
