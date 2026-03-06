import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
    // Verify the caller is authenticated
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Check if profile already exists
    const { data: existing } = await supabase
        .from("profiles").select("id").eq("id", user.id).single();
    if (existing) return NextResponse.json({ exists: true });

    // Use service role client to bypass RLS for org + profile creation
    const admin = createServiceClient();
    const emailDomain = user.email?.split("@")[1] ?? "my-org";

    const { data: org, error: orgError } = await admin
        .from("orgs")
        .insert({ name: emailDomain, plan_tier: "free" })
        .select()
        .single();

    if (orgError || !org) {
        console.error("[setup-profile] org insert failed:", orgError?.message);
        return NextResponse.json({ error: orgError?.message }, { status: 500 });
    }

    const { error: profileError } = await admin.from("profiles").insert({
        id: user.id,
        email: user.email!,
        full_name: null,
        role: "admin",
        org_id: org.id,
        plan_tier: "free",
    });

    if (profileError) {
        console.error("[setup-profile] profile insert failed:", profileError.message);
        return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({ created: true });
}
