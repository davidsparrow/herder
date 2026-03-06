import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// This route receives the access+refresh tokens from the browser after
// signInWithPassword / signUp, sets them as proper server-readable cookies,
// then redirects to the destination.
export async function POST(req: NextRequest) {
    const { access_token, refresh_token, next } = await req.json();

    if (!access_token || !refresh_token) {
        return NextResponse.json({ error: "Missing tokens" }, { status: 400 });
    }

    const response = NextResponse.json({ ok: true });

    // Create server client — this writes the session cookies onto the response
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return []; },
                setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, { ...(options ?? {}), path: "/" })
                    );
                },
            },
        }
    );

    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) {
        console.error("[set-session] error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log("[set-session] session set OK, cookies:", response.cookies.getAll().map(c => c.name));
    return response;
}
