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

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const user = data.user;

      // Check if profile already exists (returning user)
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single();

      if (!existing) {
        // ── First-time sign-in: create org + profile on Free plan ──────────

        // Create a default org named after their email domain or full email
        const emailDomain = user.email?.split("@")[1] ?? "my-org";
        const { data: org, error: orgError } = await supabase
          .from("orgs")
          .insert({ name: emailDomain, plan_tier: "free" })
          .select()
          .single();

        if (org) {
          await supabase.from("profiles").insert({
            id: user.id,
            email: user.email!,
            full_name: user.user_metadata?.full_name ?? null,
            role: "admin",          // first user in org is admin
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

        // Redirect new users to onboarding
        return NextResponse.redirect(`${origin}/onboard`);
      }

      // Returning user — go to dashboard
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth error — redirect to login with error
  return NextResponse.redirect(`${origin}/auth/login?error=auth_error`);
}
