import { createHash } from "node:crypto";
import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  GoogleGenerativeAIRequestInputError,
  GoogleGenerativeAIResponseError,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import type { GeminiExtractResult } from "@/lib/types";

const GEMINI_MULTIMODAL_MODEL = "gemini-2.5-flash";

type GeminiOperation = "extract-image" | "extract-text";

type GeminiErrorCategory =
  | "missing-env"
  | "invalid-key"
  | "permission-denied"
  | "model-access"
  | "quota-rate-limit"
  | "transport-service"
  | "request-input"
  | "response-error"
  | "unknown";

type GeminiInputSummary = {
  mimeType?: string;
  base64Length?: number;
  textLength?: number;
};

type GeminiSanitizedErrorDetail = {
  type: string | null;
  reason: string | null;
  domain: string | null;
  metadata: Record<string, unknown> | null;
};

export type GeminiErrorDiagnostics = {
  operation: GeminiOperation;
  category: GeminiErrorCategory;
  status: number | null;
  statusText: string | null;
  errorName: string;
  message: string;
  detailReasons: string[];
  detailMetadata: Array<Record<string, unknown>>;
  responseSummary: Record<string, unknown> | null;
  config: ReturnType<typeof getGeminiConfigDiagnostics>;
  input: GeminiInputSummary;
};

class GeminiDiagnosticError extends Error {
  diagnostics: GeminiErrorDiagnostics;

  constructor(message: string, diagnostics: GeminiErrorDiagnostics, cause?: unknown) {
    super(message);
    this.name = "GeminiDiagnosticError";
    this.diagnostics = diagnostics;

    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

function getGeminiConfigDiagnostics(apiKey: string | undefined) {
  const rawApiKey = apiKey ?? "";
  const trimmedApiKey = rawApiKey.trim();
  const hasApiKey = trimmedApiKey.length > 0;

  return {
    model: GEMINI_MULTIMODAL_MODEL,
    hasApiKey,
    apiKeyTrimmedForUse: rawApiKey !== trimmedApiKey,
    apiKeyLength: hasApiKey ? trimmedApiKey.length : null,
    apiKeyFingerprint: hasApiKey
      ? createHash("sha256").update(trimmedApiKey).digest("hex").slice(0, 12)
      : null,
    apiKeyShapeHint: hasApiKey
      ? (trimmedApiKey.startsWith("AIza") ? "AIza…" : "non-AIza-prefix")
      : null,
    nodeEnv: process.env.NODE_ENV ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelRegion: process.env.VERCEL_REGION ?? null,
    runtime: "nodejs",
    nodeVersion: process.version,
  };
}

function getGeminiClient(operation: GeminiOperation, input: GeminiInputSummary) {
  const rawApiKey = process.env.GEMINI_API_KEY;
  const trimmedApiKey = rawApiKey?.trim() ?? "";
  const config = getGeminiConfigDiagnostics(rawApiKey);

  console.log("[upload] gemini init:", {
    operation,
    input,
    config,
  });

  if (!trimmedApiKey) {
    const diagnostics: GeminiErrorDiagnostics = {
      operation,
      category: "missing-env",
      status: null,
      statusText: null,
      errorName: "GeminiDiagnosticError",
      message: "Missing GEMINI_API_KEY on the server.",
      detailReasons: [],
      detailMetadata: [],
      responseSummary: null,
      config,
      input,
    };

    console.error("[upload] gemini init failed:", diagnostics);
    throw new GeminiDiagnosticError(diagnostics.message, diagnostics);
  }

  return {
    client: new GoogleGenerativeAI(trimmedApiKey),
    config,
  };
}

function sanitizeGeminiErrorDetails(errorDetails: unknown): GeminiSanitizedErrorDetail[] {
  if (!Array.isArray(errorDetails)) {
    return [];
  }

  return errorDetails
    .map((detail) => {
      if (!detail || typeof detail !== "object") {
        return null;
      }

      const record = detail as Record<string, unknown>;
      return {
        type: typeof record["@type"] === "string" ? record["@type"] : null,
        reason: typeof record.reason === "string" ? record.reason : null,
        domain: typeof record.domain === "string" ? record.domain : null,
        metadata:
          record.metadata && typeof record.metadata === "object"
            ? record.metadata as Record<string, unknown>
            : null,
      };
    })
    .filter((detail): detail is GeminiSanitizedErrorDetail => detail !== null);
}

function getGeminiResponseSummary(error: unknown) {
  if (!(error instanceof GoogleGenerativeAIResponseError) || !error.response || typeof error.response !== "object") {
    return null;
  }

  const response = error.response as Record<string, unknown>;
  const promptFeedback = response.promptFeedback && typeof response.promptFeedback === "object"
    ? response.promptFeedback as Record<string, unknown>
    : null;

  return {
    promptFeedbackBlockReason:
      promptFeedback && typeof promptFeedback.blockReason === "string"
        ? promptFeedback.blockReason
        : null,
    candidateCount: Array.isArray(response.candidates) ? response.candidates.length : null,
  };
}

function classifyGeminiError(
  error: unknown,
  detailReasons: string[],
  detailMetadata: GeminiSanitizedErrorDetail[],
  status: number | null,
  statusText: string | null
): GeminiErrorCategory {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedText = [
    message,
    statusText ?? "",
    ...detailReasons,
    JSON.stringify(detailMetadata),
  ]
    .join(" ")
    .toLowerCase();

  if (normalizedText.includes("missing gemini_api_key")) {
    return "missing-env";
  }

  if (
    status === 401
    || normalizedText.includes("api key not valid")
    || normalizedText.includes("invalid api key")
    || normalizedText.includes("invalid argument") && normalizedText.includes("api key")
  ) {
    return "invalid-key";
  }

  if (
    status === 404
    || normalizedText.includes("not found for api version")
    || normalizedText.includes("not supported for generatecontent")
    || normalizedText.includes("unsupported model")
    || normalizedText.includes("model not found")
  ) {
    return "model-access";
  }

  if (
    status === 429
    || normalizedText.includes("quota")
    || normalizedText.includes("rate limit")
    || normalizedText.includes("resource exhausted")
  ) {
    return "quota-rate-limit";
  }

  if (
    status === 403
    || normalizedText.includes("permission denied")
    || normalizedText.includes("forbidden")
  ) {
    return normalizedText.includes("model") && normalizedText.includes("access")
      ? "model-access"
      : "permission-denied";
  }

  if (error instanceof GoogleGenerativeAIRequestInputError) {
    return "request-input";
  }

  if (
    error instanceof GoogleGenerativeAIFetchError
    || status === 500
    || status === 503
    || normalizedText.includes("service unavailable")
    || normalizedText.includes("deadline exceeded")
    || normalizedText.includes("timed out")
    || normalizedText.includes("timeout")
    || normalizedText.includes("error fetching from")
    || normalizedText.includes("network")
    || normalizedText.includes("fetch failed")
  ) {
    return "transport-service";
  }

  if (error instanceof GoogleGenerativeAIResponseError) {
    return "response-error";
  }

  return "unknown";
}

function buildGeminiDiagnostics(
  error: unknown,
  operation: GeminiOperation,
  input: GeminiInputSummary,
  config: ReturnType<typeof getGeminiConfigDiagnostics>
): GeminiErrorDiagnostics {
  const detailMetadata = error instanceof GoogleGenerativeAIFetchError
    ? sanitizeGeminiErrorDetails(error.errorDetails)
    : [];
  const detailReasons = detailMetadata
    .map((detail) => (typeof detail.reason === "string" ? detail.reason : null))
    .filter((reason): reason is string => Boolean(reason));
  const status = error instanceof GoogleGenerativeAIFetchError ? error.status ?? null : null;
  const statusText = error instanceof GoogleGenerativeAIFetchError ? error.statusText ?? null : null;

  return {
    operation,
    category: classifyGeminiError(error, detailReasons, detailMetadata, status, statusText),
    status,
    statusText,
    errorName: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    detailReasons,
    detailMetadata,
    responseSummary: getGeminiResponseSummary(error),
    config,
    input,
  };
}

async function runGeminiRequest<T>(
  operation: GeminiOperation,
  input: GeminiInputSummary,
  run: (model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>) => Promise<T>,
  options?: {
    safetySettings?: Array<{ category: HarmCategory; threshold: HarmBlockThreshold }>;
  }
) {
  const { client, config } = getGeminiClient(operation, input);
  const model = client.getGenerativeModel({
    model: GEMINI_MULTIMODAL_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
    },
    ...(options?.safetySettings ? { safetySettings: options.safetySettings } : {}),
  });

  console.log("[upload] gemini request start:", {
    operation,
    input,
    model: config.model,
  });

  try {
    return await run(model);
  } catch (error) {
    const diagnostics = buildGeminiDiagnostics(error, operation, input, config);

    console.error("[upload] gemini upstream error:", diagnostics);
    throw new GeminiDiagnosticError(diagnostics.message, diagnostics, error);
  }
}

export function getGeminiErrorDiagnostics(error: unknown): GeminiErrorDiagnostics | null {
  return error instanceof GeminiDiagnosticError ? error.diagnostics : null;
}

function parseGeminiJson(rawText: string): GeminiExtractResult {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as GeminiExtractResult;

    if (!Array.isArray(parsed.names)) parsed.names = [];
    if (!Array.isArray(parsed.detected_columns)) parsed.detected_columns = [];
    if (!parsed.raw_text) parsed.raw_text = "";

    return parsed;
  } catch {
    throw new Error(`Gemini returned non-JSON response: ${rawText.slice(0, 200)}`);
  }
}

const EXTRACT_PROMPT = `
You are a data extraction assistant for a class/event check-in app.

Analyze this image (which may be a photo of a paper roster, a printed list, a spreadsheet screenshot, or a computer screen) and extract ALL student or participant names plus any accompanying columns of data.

Return ONLY valid JSON in this exact shape — no markdown fences, no explanation:
{
  "names": ["Full Name 1", "Full Name 2", ...],
  "detected_columns": [
    {
      "header": "column header as it appears",
      "sample_values": ["val1", "val2", "val3"],
      "suggested_mapping": "one of: Name | Guardian Phone | Age | Allergies | Pickup Location | Drop-off Location | Special Needs | Notes | (Ignore)",
      "confidence": 0-100
    }
  ],
  "raw_text": "all text you can read from the image, verbatim"
}

Rules:
- Always include a "Name" column in detected_columns (confidence 99).
- Extract every visible column, not just names.
- If the list is numbered, strip the number from the name.
- Normalize names to "First Last" format where possible.
- Keep suggested_mapping simple — pick the closest match from the allowed values.
- confidence is your certainty 0-100 that the suggested_mapping is correct.
`.trim();

export async function extractListFromImage(
  base64Image: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"
): Promise<GeminiExtractResult> {
  const result = await runGeminiRequest(
    "extract-image",
    { mimeType, base64Length: base64Image.length },
    (model) => model.generateContent([
      EXTRACT_PROMPT,
      { inlineData: { data: base64Image, mimeType } },
    ]),
    {
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    }
  );

  return parseGeminiJson(result.response.text().trim());
}

/**
 * For plain text/CSV input — no vision model needed, just parse structure.
 */
export async function extractListFromText(text: string): Promise<GeminiExtractResult> {
  const prompt = `
Parse this plain text roster and return JSON in this exact shape with no markdown fences:
{
  "names": ["Full Name 1", ...],
  "detected_columns": [...],
  "raw_text": "${text.slice(0, 2000)}"
}
Same rules as before — extract names and any column data you can identify.

Text to parse:
${text}
  `.trim();

  const result = await runGeminiRequest(
    "extract-text",
    { textLength: text.length },
    (model) => model.generateContent(prompt)
  );

  try {
    return parseGeminiJson(result.response.text().trim());
  } catch {
    // Fallback: treat each line as a name
    const names = text.split("\n").map(l => l.trim()).filter(Boolean);
    return { names, detected_columns: [], raw_text: text };
  }
}
