import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractListFromImage, extractListFromText } from "@/lib/gemini";
import { canCreateList } from "@/lib/plans";

export const runtime = "nodejs";
export const maxDuration = 60; // Gemini vision can be slow

type UploadMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf"
  | "text/csv"
  | "text/plain";

type UploadStage = "parse-request" | "extract-text" | "extract-image";

function normalizeUploadMimeType(rawMimeType?: string | null, fileName?: string | null): UploadMimeType | null {
  const mimeType = rawMimeType?.toLowerCase().trim();

  switch (mimeType) {
    case "image/jpeg":
    case "image/jpg":
    case "image/pjpeg":
      return "image/jpeg";
    case "image/png":
    case "image/webp":
    case "application/pdf":
    case "text/csv":
    case "text/plain":
      return mimeType;
  }

  const extension = fileName?.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    case "csv":
      return "text/csv";
    case "txt":
      return "text/plain";
    default:
      return null;
  }
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 5).join("\n") ?? null,
    };
  }

  return {
    message: typeof error === "string" ? error : "Unknown upload error",
  };
}

function getSafeUploadErrorMessage(error: unknown, stage: UploadStage | null) {
  const fallback = stage === "extract-image"
    ? "Image extraction failed while reading the upload."
    : stage === "extract-text"
      ? "Text extraction failed while reading the upload."
      : "Upload failed while processing the request.";

  if (!(error instanceof Error) || !error.message) {
    return fallback;
  }

  const normalizedMessage = error.message.toLowerCase();

  if (error.message.includes("Missing GEMINI_API_KEY")) {
    return "Upload is not configured yet: GEMINI_API_KEY is missing on the server.";
  }

  if (
    error.message.includes("not found for API version") ||
    error.message.includes("not supported for generateContent")
  ) {
    return "Upload AI model is unavailable on the server. Switch to a current Gemini model and redeploy.";
  }

  if (error.message.includes("Gemini returned non-JSON response")) {
    return "The extraction service returned an unexpected response. Try a clearer image, PDF, CSV, or pasted text.";
  }

  if (
    normalizedMessage.includes("quota") ||
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("resource exhausted") ||
    normalizedMessage.includes("429")
  ) {
    return "The upload extraction service is temporarily rate-limited. Please wait a moment and try again.";
  }

  if (
    normalizedMessage.includes("api key not valid") ||
    normalizedMessage.includes("invalid api key") ||
    normalizedMessage.includes("permission denied") ||
    normalizedMessage.includes("403")
  ) {
    return "Upload is not configured correctly for the extraction service. Check the server Gemini API credentials and permissions.";
  }

  if (
    normalizedMessage.includes("service unavailable") ||
    normalizedMessage.includes("deadline exceeded") ||
    normalizedMessage.includes("timed out") ||
    normalizedMessage.includes("timeout") ||
    normalizedMessage.includes("500") ||
    normalizedMessage.includes("503")
  ) {
    return `${fallback} The extraction service may be temporarily unavailable; please try again.`;
  }

  return fallback;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  console.log("[upload] auth check:", { userId: user?.id, email: user?.email, authError: authError?.message ?? null });
  if (!user || authError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch profile to get plan + org
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("org_id, plan_tier")
    .eq("id", user.id)
    .single();

  console.log("[upload] profile query:", { userId: user.id, profile, profileError });
  if (profileError) {
    console.error("[upload] Supabase profile error (full):", JSON.stringify(profileError, null, 2));
  }

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  console.log("[upload] profile details:", { org_id: profile.org_id, plan_tier: profile.plan_tier });

  // Plan gate: count existing lists for this org
  const { count, error: countError } = await supabase
    .from("checkin_lists")
    .select("*", { count: "exact", head: true })
    .eq("org_id", profile.org_id)
    .eq("archived", false);

  console.log("[upload] checkin_lists count:", { count, countError: countError?.message ?? null });

  const gate = canCreateList(profile.plan_tier, count ?? 0);
  if (!gate.allowed) {
    return NextResponse.json({ error: gate.reason, code: "PLAN_LIMIT" }, { status: 402 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  console.log("[upload] request metadata:", { contentType });

  let result;
  let stage: UploadStage | null = null;
  let uploadContext: Record<string, unknown> = { contentType };

  try {
    if (contentType.includes("multipart/form-data")) {
      stage = "parse-request";
      const formData = await req.formData();
      const file = formData.get("file") as File | null;

      if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

      const normalizedMimeType = normalizeUploadMimeType(file.type, file.name);
      uploadContext = {
        ...uploadContext,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || null,
        normalizedMimeType,
      };

      console.log("[upload] file received:", uploadContext);

      if (!normalizedMimeType) {
        return NextResponse.json(
          {
            error: "Unsupported file type. Upload a JPG, PNG, WEBP, PDF, CSV, or TXT file.",
            code: "UNSUPPORTED_FILE_TYPE",
          },
          { status: 400 },
        );
      }

      if (normalizedMimeType === "text/csv" || normalizedMimeType === "text/plain") {
        stage = "extract-text";
        console.log("[upload] extraction start:", { stage, ...uploadContext });
        const text = await file.text();
        result = await extractListFromText(text);
      } else {
        stage = "extract-image";
        console.log("[upload] extraction start:", { stage, ...uploadContext });
        const bytes = await file.arrayBuffer();
        const base64 = Buffer.from(bytes).toString("base64");
        result = await extractListFromImage(base64, normalizedMimeType);
      }
    } else {
      stage = "parse-request";
      const body = await req.json() as { text?: string; base64?: string; mimeType?: string; fileName?: string };

      if (body.text) {
        stage = "extract-text";
        uploadContext = {
          ...uploadContext,
          textLength: body.text.length,
        };
        console.log("[upload] extraction start:", { stage, ...uploadContext });
        result = await extractListFromText(body.text);
      } else if (body.base64 && body.mimeType) {
        const normalizedMimeType = normalizeUploadMimeType(body.mimeType, body.fileName);
        uploadContext = {
          ...uploadContext,
          mimeType: body.mimeType,
          normalizedMimeType,
          hasBase64: true,
        };

        if (!normalizedMimeType || normalizedMimeType === "text/csv" || normalizedMimeType === "text/plain") {
          return NextResponse.json({ error: "Invalid image upload payload" }, { status: 400 });
        }

        stage = "extract-image";
        console.log("[upload] extraction start:", { stage, ...uploadContext });
        result = await extractListFromImage(body.base64, normalizedMimeType);
      } else {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
      }
    }
  } catch (error) {
    const safeMessage = getSafeUploadErrorMessage(error, stage);

    console.error("[upload] extraction failed:", {
      stage,
      ...uploadContext,
      error: serializeError(error),
    });

    return NextResponse.json(
      {
        error: safeMessage,
        code: "UPLOAD_EXTRACTION_FAILED",
        stage,
      },
      { status: 500 },
    );
  }

  console.log("[upload] extraction success:", {
    stage,
    namesCount: result?.names?.length ?? 0,
    detectedColumnsCount: result?.detected_columns?.length ?? 0,
  });

  return NextResponse.json({ success: true, data: result });
}
