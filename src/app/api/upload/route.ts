import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractListFromImage, extractListFromText } from "@/lib/gemini";
import { canCreateList } from "@/lib/plans";

export const runtime = "nodejs";
export const maxDuration = 60; // Gemini vision can be slow

export async function POST(req: NextRequest) {
  const supabase = createClient();

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || authError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch profile to get plan + org
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, plan_tier")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Plan gate: count existing lists for this org
  const { count } = await supabase
    .from("checkin_lists")
    .select("*", { count: "exact", head: true })
    .eq("org_id", profile.org_id)
    .eq("archived", false);

  const gate = canCreateList(profile.plan_tier, count ?? 0);
  if (!gate.allowed) {
    return NextResponse.json({ error: gate.reason, code: "PLAN_LIMIT" }, { status: 402 });
  }

  const contentType = req.headers.get("content-type") ?? "";

  let result;

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mime = file.type as "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

    if (file.type === "text/csv" || file.type === "text/plain") {
      const text = await file.text();
      result = await extractListFromText(text);
    } else {
      result = await extractListFromImage(base64, mime);
    }
  } else {
    // JSON body with base64
    const body = await req.json();
    if (body.text) {
      result = await extractListFromText(body.text);
    } else if (body.base64 && body.mimeType) {
      result = await extractListFromImage(body.base64, body.mimeType);
    } else {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
  }

  return NextResponse.json({ success: true, data: result });
}
