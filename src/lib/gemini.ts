import { createHash } from "node:crypto";
import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  GoogleGenerativeAIRequestInputError,
  GoogleGenerativeAIResponseError,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import type {
  DetectedColumn,
  GeminiExtractResult,
  GeminiManualReviewState,
  GeminiMetadataSuggestion,
  GeminiOverflowBlock,
  GeminiPrimaryBlock,
  GeminiRosterMetadata,
  GeminiRosterRow,
  UploadFieldMapping,
} from "./types";
import { UPLOAD_FIELD_MAPPINGS } from "./types";

export const DEFAULT_GEMINI_MODEL_ID = "gemini-2.5-flash";

export type GeminiImageMimeType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export type GeminiModelOptions = {
  modelId?: string;
};

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
  const selectedModelId = DEFAULT_GEMINI_MODEL_ID;
  const rawApiKey = apiKey ?? "";
  const trimmedApiKey = rawApiKey.trim();
  const hasApiKey = trimmedApiKey.length > 0;

  return {
    model: selectedModelId,
    defaultModel: DEFAULT_GEMINI_MODEL_ID,
    modelOverrideActive: false,
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

function normalizeGeminiModelId(modelId?: string) {
  const trimmedModelId = modelId?.trim();
  return trimmedModelId || DEFAULT_GEMINI_MODEL_ID;
}

function getGeminiClient(operation: GeminiOperation, input: GeminiInputSummary, modelId?: string) {
  const rawApiKey = process.env.GEMINI_API_KEY;
  const trimmedApiKey = rawApiKey?.trim() ?? "";
  const selectedModelId = normalizeGeminiModelId(modelId);
  const config = {
    ...getGeminiConfigDiagnostics(rawApiKey),
    model: selectedModelId,
    modelOverrideActive: selectedModelId !== DEFAULT_GEMINI_MODEL_ID,
  };

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
    modelId?: string;
    safetySettings?: Array<{ category: HarmCategory; threshold: HarmBlockThreshold }>;
  }
) {
  const selectedModelId = normalizeGeminiModelId(options?.modelId);
  const { client, config } = getGeminiClient(operation, input, selectedModelId);
  const model = client.getGenerativeModel({
    model: selectedModelId,
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

const EMPTY_ROSTER_METADATA: GeminiRosterMetadata = {
  class_list_title: "",
  start_time: "",
  stop_time: "",
  room_location: "",
  teacher_name: "",
};

const ALLERGY_TERMS = [
  "allerg",
  "peanut",
  "tree nut",
  "nut",
  "cashew",
  "pistachio",
  "milk",
  "dairy",
  "egg",
  "soy",
  "sesame",
  "gluten",
  "shellfish",
] as const;

const SUPPORT_TERMS = [
  "asthma",
  "inhaler",
  "glasses",
  "wears",
  "wheelchair",
  "needs",
  "support",
  "epi pen",
  "epipen",
  "autism",
  "adhd",
  "speech",
  "mobility",
  "behavior",
  "medical",
] as const;

const DERIVED_COLUMN_DEFINITIONS: Array<{
  key: keyof GeminiRosterRow;
  header: string;
  suggested_mapping: string;
  confidence: number;
}> = [
  { key: "child_display_name", header: "Name", suggested_mapping: "Name", confidence: 99 },
  { key: "child_sheet_number", header: "Sheet #", suggested_mapping: "(Ignore)", confidence: 80 },
  { key: "guardian_full_name", header: "Guardian", suggested_mapping: "Guardian Name", confidence: 92 },
  { key: "guardian_phone", header: "Guardian Phone", suggested_mapping: "Guardian Phone", confidence: 92 },
  { key: "guardian_email", header: "Guardian Email", suggested_mapping: "Guardian Email", confidence: 92 },
  { key: "short_code", header: "Short Code", suggested_mapping: "(Ignore)", confidence: 84 },
  { key: "pickup_drop_location", header: "Pickup/Drop", suggested_mapping: "Pickup Notes-pre", confidence: 90 },
  { key: "allergies", header: "Allergies", suggested_mapping: "Allergies", confidence: 90 },
  { key: "special_needs", header: "Special Needs", suggested_mapping: "Special Needs", confidence: 88 },
];

const MATCHABLE_UPLOAD_FIELD_MAPPINGS = UPLOAD_FIELD_MAPPINGS.filter(
  (mapping): mapping is Exclude<UploadFieldMapping, "(Ignore)"> => mapping !== "(Ignore)"
);

function normalizeMappingLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenizeMappingLabel(value: string) {
  return normalizeMappingLabel(value).split(/[^a-z0-9]+/).filter(Boolean);
}

function normalizeSuggestedMapping(value: string) {
  if (value === "Pickup Location") {
    return "Pickup Notes-pre";
  }

  if (value === "Drop-off Location") {
    return "Pickup Notes-post";
  }

  return value;
}

function findExactMappingMatch(header: string) {
  const normalizedHeader = normalizeMappingLabel(header);
  return MATCHABLE_UPLOAD_FIELD_MAPPINGS.find((mapping) => normalizeMappingLabel(mapping) === normalizedHeader) ?? null;
}

function startsWithSameWord(header: string, mapping: Exclude<UploadFieldMapping, "(Ignore)">) {
  const headerFirstWord = tokenizeMappingLabel(header)[0];
  const mappingFirstWord = tokenizeMappingLabel(mapping)[0];
  return Boolean(headerFirstWord && mappingFirstWord && headerFirstWord === mappingFirstWord);
}

function headerSuggestsGuardianName(header: string) {
  const normalizedHeader = normalizeMappingLabel(header);
  return [
    "guardian",
    "parent",
    "parent guardian",
    "guardian parent",
    "parent or guardian",
    "guardian or parent",
    "authorized pickup",
    "authorized adult",
    "pickup person",
    "pickup contact",
    "primary guardian",
    "contact name",
  ].some((phrase) => normalizedHeader.includes(phrase));
}

function refineDetectedColumnMappings(columns: DetectedColumn[]) {
  const refinedColumns = columns.map((column) => ({
    ...column,
    suggested_mapping: normalizeSuggestedMapping(column.suggested_mapping) || "(Ignore)",
    confidence: normalizeConfidence(column.confidence),
  }));
  const claimedMappings = new Map<Exclude<UploadFieldMapping, "(Ignore)">, number>();

  refinedColumns.forEach((column, index) => {
    const exactMatch = findExactMappingMatch(column.header);
    if (exactMatch) {
      column.suggested_mapping = exactMatch;
      column.confidence = 100;
      claimedMappings.set(exactMatch, index);
      return;
    }

    if (column.suggested_mapping !== "(Ignore)" && MATCHABLE_UPLOAD_FIELD_MAPPINGS.includes(column.suggested_mapping as Exclude<UploadFieldMapping, "(Ignore)">)) {
      claimedMappings.set(column.suggested_mapping as Exclude<UploadFieldMapping, "(Ignore)">, index);
    }
  });

  refinedColumns.forEach((column, index) => {
    if (findExactMappingMatch(column.header)) {
      return;
    }

    const guardianMappingClaim = claimedMappings.get("Guardian Name");
    if (headerSuggestsGuardianName(column.header) && (guardianMappingClaim === undefined || guardianMappingClaim === index)) {
      column.suggested_mapping = "Guardian Name";
      column.confidence = Math.max(column.confidence, 94);
      claimedMappings.set("Guardian Name", index);
      return;
    }

    const pickupPreClaim = claimedMappings.get("Pickup Notes-pre");
    if (startsWithSameWord(column.header, "Pickup Notes-pre") && (pickupPreClaim === undefined || pickupPreClaim === index)) {
      column.suggested_mapping = "Pickup Notes-pre";
      column.confidence = Math.max(column.confidence, 93);
      claimedMappings.set("Pickup Notes-pre", index);
    }
  });

  return refinedColumns;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean)
    : [];
}

function normalizeConfidence(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function padValues(values: string[], length: number) {
  return Array.from({ length }, (_, index) => values[index] ?? "");
}

function normalizeDisplayName(value: string) {
  const cleaned = value
    .replace(/^\s*\d+[.)\-:\s]*/, "")
    .replace(/^\s*[-*•]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned.includes(",")) {
    return cleaned;
  }

  const [lastName, ...rest] = cleaned.split(",");
  const trailing = rest.join(" ").trim();
  return trailing ? `${trailing} ${lastName.trim()}`.replace(/\s+/g, " ").trim() : cleaned;
}

function splitNameParts(value: string) {
  const displayName = normalizeDisplayName(value);
  if (!displayName) {
    return { displayName: "", firstName: "", lastName: "" };
  }

  const parts = displayName.split(/\s+/).filter(Boolean);
  return {
    displayName,
    firstName: parts[0] ?? "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : "",
  };
}

function includesAny(text: string, terms: readonly string[]) {
  return terms.some((term) => text.includes(term));
}

function classifySupportText(value: string) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return { allergies: "", specialNeeds: "" };
  }

  const segments = normalized
    .split(/[;,/]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const allergySegments: string[] = [];
  const supportSegments: string[] = [];
  const ambiguousSegments: string[] = [];

  for (const segment of segments) {
    const lower = segment.toLowerCase();
    const isAllergy = includesAny(lower, ALLERGY_TERMS);
    const isSupport = includesAny(lower, SUPPORT_TERMS);

    if (isAllergy && !isSupport) {
      allergySegments.push(segment);
      continue;
    }

    if (isSupport && !isAllergy) {
      supportSegments.push(segment);
      continue;
    }

    if (isAllergy || isSupport) {
      ambiguousSegments.push(segment);
      continue;
    }

    ambiguousSegments.push(segment);
  }

  if (allergySegments.length && supportSegments.length && ambiguousSegments.length === 0) {
    return {
      allergies: allergySegments.join(", "),
      specialNeeds: supportSegments.join(", "),
    };
  }

  if (allergySegments.length && !supportSegments.length && ambiguousSegments.length === 0) {
    return { allergies: normalized, specialNeeds: "" };
  }

  if (supportSegments.length && !allergySegments.length && ambiguousSegments.length === 0) {
    return { allergies: "", specialNeeds: normalized };
  }

  const lower = normalized.toLowerCase();
  if (includesAny(lower, ALLERGY_TERMS) && !includesAny(lower, SUPPORT_TERMS)) {
    return { allergies: normalized, specialNeeds: "" };
  }

  return { allergies: "", specialNeeds: normalized };
}

function normalizeDetectedColumns(value: unknown, rowCount: number): DetectedColumn[] {
  const detectedColumns = Array.isArray(value)
    ? value
      .filter((column): column is Record<string, unknown> => Boolean(column && typeof column === "object"))
      .map((column) => {
        const normalizedValues = normalizeStringArray(column.values);
        return {
          header: normalizeString(column.header),
          sample_values: normalizeStringArray(column.sample_values),
          suggested_mapping: normalizeSuggestedMapping(normalizeString(column.suggested_mapping)) || "(Ignore)",
          confidence: normalizeConfidence(column.confidence),
          values: rowCount > 0 ? padValues(normalizedValues, rowCount) : normalizedValues,
        } satisfies DetectedColumn;
      })
      .filter((column) => column.header)
    : [];

  return refineDetectedColumnMappings(detectedColumns);
}

function normalizeRosterMetadata(value: unknown): GeminiRosterMetadata {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_ROSTER_METADATA };
  }

  const record = value as Record<string, unknown>;
  return {
    class_list_title: normalizeString(record.class_list_title),
    start_time: normalizeString(record.start_time),
    stop_time: normalizeString(record.stop_time),
    room_location: normalizeString(record.room_location),
    teacher_name: normalizeString(record.teacher_name),
  };
}

function normalizeMetadataSuggestions(value: unknown) {
  return Array.isArray(value)
    ? value
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry && typeof entry === "object"))
      .map((entry) => {
        const record = entry as Record<string, unknown>;
        const field = normalizeString(record.field) as GeminiMetadataSuggestion["field"];
        return {
          field,
          value: normalizeString(record.value),
          confidence: normalizeConfidence(record.confidence),
          reason: normalizeString(record.reason),
        } satisfies GeminiMetadataSuggestion;
      })
      .filter((entry) => entry.field && entry.value)
    : [];
}

function normalizeOverflowBlocks(value: unknown) {
  return Array.isArray(value)
    ? value
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry && typeof entry === "object"))
      .map((entry) => {
        const record = entry as Record<string, unknown>;
        const kind = normalizeString(record.kind) as GeminiOverflowBlock["kind"];
        return {
          label: normalizeString(record.label),
          kind: kind || "other",
          raw_text: normalizeString(record.raw_text),
        } satisfies GeminiOverflowBlock;
      })
      .filter((entry) => entry.label || entry.raw_text)
    : [];
}

function normalizeManualReview(value: unknown): GeminiManualReviewState | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const required = Boolean(record.required);
  const reason = normalizeString(record.reason);
  const candidate_block_labels = normalizeStringArray(record.candidate_block_labels);
  if (!required && !reason && candidate_block_labels.length === 0) {
    return undefined;
  }

  return {
    required,
    reason,
    candidate_block_labels,
  };
}

function normalizeRosterRow(value: unknown): GeminiRosterRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const nameParts = splitNameParts(
    normalizeString(record.child_display_name)
    || normalizeString(record.child_full_name)
    || normalizeString(record.name)
  );
  if (!nameParts.displayName) {
    return null;
  }

  const explicitAllergies = normalizeString(record.allergies);
  const explicitSpecialNeeds = normalizeString(record.special_needs);
  const classifiedSpecialNeeds = explicitSpecialNeeds && !explicitAllergies
    ? classifySupportText(explicitSpecialNeeds)
    : { allergies: "", specialNeeds: explicitSpecialNeeds };

  return {
    child_display_name: nameParts.displayName,
    child_first_name: normalizeString(record.child_first_name) || nameParts.firstName,
    child_last_name: normalizeString(record.child_last_name) || nameParts.lastName,
    child_sheet_number: normalizeString(record.child_sheet_number),
    guardian_full_name: normalizeDisplayName(normalizeString(record.guardian_full_name)),
    guardian_phone: normalizeString(record.guardian_phone),
    guardian_email: normalizeString(record.guardian_email),
    short_code: normalizeString(record.short_code),
    pickup_drop_location: normalizeString(record.pickup_drop_location),
    allergies: explicitAllergies || classifiedSpecialNeeds.allergies,
    special_needs: explicitSpecialNeeds
      ? classifiedSpecialNeeds.specialNeeds
      : "",
    raw_row_text: normalizeString(record.raw_row_text),
  };
}

function normalizePrimaryBlock(value: unknown): GeminiPrimaryBlock | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const status = normalizeString(record.status) === "manual_review" ? "manual_review" : "selected";
  const rows = Array.isArray(record.rows)
    ? record.rows.map((row) => normalizeRosterRow(row)).filter((row): row is GeminiRosterRow => Boolean(row))
    : [];

  return {
    status,
    selection_reason: normalizeString(record.selection_reason),
    rows: status === "manual_review" ? [] : rows,
    metadata: normalizeRosterMetadata(record.metadata),
    raw_text: normalizeString(record.raw_text),
  };
}

function filterMetadataSuggestions(suggestions: GeminiMetadataSuggestion[], metadata: GeminiRosterMetadata) {
  return suggestions.filter((suggestion) => {
    const metadataValue = metadata[suggestion.field];
    return !metadataValue || metadataValue !== suggestion.value;
  });
}

function mergeNoteIntoRow(row: GeminiRosterRow, value: string) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return;
  }

  const classified = classifySupportText(normalized);
  if (!row.allergies && classified.allergies) {
    row.allergies = classified.allergies;
  }

  if (!row.special_needs) {
    row.special_needs = classified.specialNeeds || (!classified.allergies ? normalized : "");
  }
}

function hydrateRowsFromLegacy(names: string[], detectedColumns: DetectedColumn[]) {
  const rows = names.map((name) => {
    const nameParts = splitNameParts(name);
    return {
      child_display_name: nameParts.displayName,
      child_first_name: nameParts.firstName,
      child_last_name: nameParts.lastName,
      child_sheet_number: "",
      guardian_full_name: "",
      guardian_phone: "",
      guardian_email: "",
      short_code: "",
      pickup_drop_location: "",
      allergies: "",
      special_needs: "",
      raw_row_text: "",
    } satisfies GeminiRosterRow;
  });

  detectedColumns.forEach((column) => {
    const header = column.header.toLowerCase();
    const values = padValues(normalizeStringArray(column.values), rows.length);

    values.forEach((value, index) => {
      const row = rows[index];
      if (!row || !value) {
        return;
      }

      if (column.suggested_mapping === "Guardian Name") {
        row.guardian_full_name ||= normalizeDisplayName(value);
        return;
      }

      if (column.suggested_mapping === "Guardian Phone") {
        row.guardian_phone ||= value;
        return;
      }

      if (column.suggested_mapping === "Guardian Email") {
        row.guardian_email ||= value;
        return;
      }

      if (column.suggested_mapping === "Allergies") {
        row.allergies ||= value;
        return;
      }

      if (column.suggested_mapping === "Pickup Notes-pre" || column.suggested_mapping === "Pickup Notes-post") {
        row.pickup_drop_location ||= value;
        return;
      }

      if (column.suggested_mapping === "Special Needs" || column.suggested_mapping === "Notes") {
        mergeNoteIntoRow(row, value);
        return;
      }

      if ((header.includes("code") || header.includes("tag")) && !row.short_code) {
        row.short_code = value;
        return;
      }

      if ((header.includes("guardian") || header.includes("parent") || header.includes("contact") || (header.includes("authorized") && header.includes("pickup"))) && !row.guardian_full_name) {
        row.guardian_full_name = normalizeDisplayName(value);
        return;
      }

      if ((header.includes("pickup") || header.includes("drop") || header.includes("location")) && !row.pickup_drop_location) {
        row.pickup_drop_location = value;
        return;
      }

      if ((header.includes("sheet") || header === "#" || header.includes("number")) && !row.child_sheet_number) {
        row.child_sheet_number = value;
      }
    });
  });

  return rows;
}

function buildDetectedColumnsFromRows(rows: GeminiRosterRow[], fallbackColumns: DetectedColumn[]): DetectedColumn[] {
  const derivedColumns: DetectedColumn[] = [];
  const seenHeaders = new Set<string>();

  DERIVED_COLUMN_DEFINITIONS.forEach(({ key, header, suggested_mapping, confidence }) => {
    const values = rows.map((row) => normalizeString(row[key]));
    if (header !== "Name" && values.every((value) => !value)) {
      return;
    }

    derivedColumns.push({
      header,
      sample_values: values.filter(Boolean).slice(0, 3),
      suggested_mapping,
      confidence,
      values,
    });
    seenHeaders.add(header.trim().toLowerCase());
  });

  fallbackColumns.forEach((column) => {
    const header = normalizeString(column.header);
    const headerKey = header.toLowerCase();
    if (!header || seenHeaders.has(headerKey)) {
      return;
    }

    const values = padValues(normalizeStringArray(column.values), rows.length);
    derivedColumns.push({
      header,
      sample_values: normalizeStringArray(column.sample_values).filter(Boolean).slice(0, 3),
      suggested_mapping: normalizeString(column.suggested_mapping),
      confidence: typeof column.confidence === "number" ? column.confidence : 0,
      values,
    });
    seenHeaders.add(headerKey);
  });

  return refineDetectedColumnMappings(derivedColumns);
}

function stripJsonCodeFences(rawText: string) {
  return rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonFenceBodies(rawText: string) {
  return [...rawText.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
}

function extractBalancedJsonObjects(rawText: string, maxCandidates = 6) {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < rawText.length && candidates.length < maxCandidates; index += 1) {
    const char = rawText[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(rawText.slice(start, index + 1).trim());
        start = -1;
      }
    }
  }

  return candidates;
}

function collectGeminiJsonCandidates(rawText: string) {
  const cleaned = stripJsonCodeFences(rawText);
  const candidates = [
    cleaned,
    ...extractJsonFenceBodies(rawText),
    ...extractBalancedJsonObjects(rawText),
    ...extractBalancedJsonObjects(cleaned),
  ];

  return candidates.filter((candidate, index) => candidate && candidates.indexOf(candidate) === index);
}

function normalizeParsedGeminiResult(parsed: GeminiExtractResult): GeminiExtractResult {
  const legacyNames = normalizeStringArray(parsed.names).map((name) => splitNameParts(name).displayName).filter(Boolean);
  const raw_text = normalizeString(parsed.raw_text);
  let detected_columns = normalizeDetectedColumns(parsed.detected_columns, legacyNames.length);
  let primary_block = normalizePrimaryBlock(parsed.primary_block);
  let metadata_suggestions = normalizeMetadataSuggestions(parsed.metadata_suggestions);
  const overflow_blocks = normalizeOverflowBlocks(parsed.overflow_blocks);
  const manual_review = normalizeManualReview(parsed.manual_review);

  if (!primary_block && legacyNames.length > 0) {
    primary_block = {
      status: "selected",
      selection_reason: "Legacy extraction result without explicit primary-block shaping.",
      rows: hydrateRowsFromLegacy(legacyNames, detected_columns),
      metadata: { ...EMPTY_ROSTER_METADATA },
      raw_text,
    };
  }

  if (primary_block && primary_block.status !== "manual_review" && primary_block.rows.length === 0 && legacyNames.length > 0) {
    primary_block.rows = hydrateRowsFromLegacy(legacyNames, detected_columns);
  }

  if (primary_block) {
    metadata_suggestions = filterMetadataSuggestions(metadata_suggestions, primary_block.metadata);
  }

  const manualReviewRequired = manual_review?.required || primary_block?.status === "manual_review";
  if (manualReviewRequired) {
    const reason = manual_review?.reason || primary_block?.selection_reason || "Two candidate roster blocks remained equally strong after scoring.";
    return {
      names: [],
      detected_columns: [],
      raw_text,
      primary_block: {
        status: "manual_review",
        selection_reason: reason,
        rows: [],
        metadata: primary_block?.metadata ?? { ...EMPTY_ROSTER_METADATA },
        raw_text: primary_block?.raw_text ?? "",
      },
      metadata_suggestions,
      overflow_blocks,
      manual_review: {
        required: true,
        reason,
        candidate_block_labels: manual_review?.candidate_block_labels ?? [],
      },
    };
  }

  const rows = primary_block?.rows ?? [];
  const names = rows.length > 0 ? rows.map((row) => row.child_display_name).filter(Boolean) : legacyNames;
  detected_columns = rows.length > 0
    ? buildDetectedColumnsFromRows(rows, normalizeDetectedColumns(parsed.detected_columns, rows.length))
    : detected_columns;

  return {
    names,
    detected_columns,
    raw_text,
    ...(primary_block ? {
      primary_block: {
        ...primary_block,
        rows,
        raw_text: primary_block.raw_text || raw_text,
      },
    } : {}),
    ...(metadata_suggestions.length > 0 ? { metadata_suggestions } : {}),
    ...(overflow_blocks.length > 0 ? { overflow_blocks } : {}),
    ...(manual_review ? { manual_review } : {}),
  };
}

function parseGeminiJson(rawText: string): GeminiExtractResult {
  for (const candidate of collectGeminiJsonCandidates(rawText)) {
    try {
      const parsed = JSON.parse(candidate) as GeminiExtractResult;
      const parsedRecord = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
      const looksLikeExtractionPayload = parsedRecord && (
        "names" in parsedRecord
        || "detected_columns" in parsedRecord
        || "primary_block" in parsedRecord
        || "raw_text" in parsedRecord
      );

      if (!looksLikeExtractionPayload) {
        continue;
      }

      if (candidate !== stripJsonCodeFences(rawText)) {
        console.warn("[upload] recovered wrapped Gemini JSON response", {
          rawPreview: rawText.slice(0, 160),
          candidateLength: candidate.length,
        });
      }

      return normalizeParsedGeminiResult(parsed);
    } catch {
      continue;
    }
  }

  throw new Error(`Gemini returned non-JSON response: ${rawText.slice(0, 200)}`);
}

const EXTRACT_PROMPT = `
You are a data extraction assistant for a class/event check-in app.

Analyze this image (which may be a photo of a paper roster, a printed list, a spreadsheet screenshot, or a computer screen) and extract ONE primary roster block only.

Return ONLY valid JSON in this exact shape — no markdown fences, no explanation:
{
  "names": ["Full Name 1", "Full Name 2"],
  "detected_columns": [
    {
      "header": "column header as it appears",
      "sample_values": ["val1", "val2", "val3"],
      "suggested_mapping": "one of: Name | Guardian Name | Guardian Phone | Guardian Email | Age (calculate) | Allergies | Pickup Notes-pre | Pickup Notes-post | Special Needs | Notes | (Ignore)",
      "confidence": 0,
      "values": ["row1 value", "row2 value"]
    }
  ],
  "primary_block": {
    "status": "selected",
    "selection_reason": "why this block won or why manual review is required",
    "rows": [
      {
        "child_display_name": "",
        "child_first_name": "",
        "child_last_name": "",
        "child_sheet_number": "",
        "guardian_full_name": "",
        "guardian_phone": "",
        "guardian_email": "",
        "short_code": "",
        "pickup_drop_location": "",
        "allergies": "",
        "special_needs": "",
        "raw_row_text": ""
      }
    ],
    "metadata": {
      "class_list_title": "",
      "start_time": "",
      "stop_time": "",
      "room_location": "",
      "teacher_name": ""
    },
    "raw_text": "verbatim text for the chosen primary block only"
  },
  "metadata_suggestions": [
    {
      "field": "class_list_title",
      "value": "",
      "confidence": 0,
      "reason": ""
    }
  ],
  "overflow_blocks": [
    {
      "label": "secondary heading or note area",
      "kind": "secondary_roster",
      "raw_text": "verbatim non-primary text"
    }
  ],
  "manual_review": {
    "required": false,
    "reason": "",
    "candidate_block_labels": []
  },
  "raw_text": "all text you can read from the image, verbatim"
}

Rules:
- Extract ONE primary roster block only. Never merge two roster/class sections into one row set.
- If two candidate roster blocks remain equally strong after scoring, do not auto-pick. Set primary_block.status to manual_review, set manual_review.required to true, explain the tie, leave names, detected_columns, and primary_block.rows empty, and preserve both candidates in overflow_blocks/raw_text.
- Candidate block scoring should strongly use spreadsheet-like cues: repeated cell alignment, box/grid structure, commas, repeated spaces, tab-like gaps, repeating separators, and narrow repeated short-code columns.
- Treat isolated short tokens in a repeated narrow column as likely short codes when the pattern is strong enough. Preserve the exact visible token such as B or orange B.
- names must exactly equal the selected primary block row names in display order. If the list is numbered, strip the number from the child name.
- Normalize child names to First Last display order where possible, and split first/last only when reliable.
- Keep every detected_columns values array aligned only to the selected primary block rows. Never include secondary-block rows there.
- Use overflow_blocks for secondary roster sections, legends, footer notes, unmatched side notes, or text that cannot be aligned safely to the primary rows.
- Split allergies from special-needs text only when clearly separable. If mixed text cannot be separated safely, keep it honestly in special_needs and leave allergies blank.
- Preserve ambiguous values honestly. Do not fabricate guardian info, room/time/teacher metadata, pickup/drop semantics, or short-code details.
- If a header exactly matches one of the allowed mapping labels, use that mapping with 100 confidence.
- Headers like Authorized Pickup, Parent/Guardian, Guardian or Parent, and similar guardian-name columns should map to Guardian Name when the values are person names.
- When a pickup-style notes column begins with pickup (for example Pickup/Dropoff), prefer Pickup Notes-pre unless another imported column already owns that target more exactly.
- Put only obvious primary-block header metadata into primary_block.metadata. Put ambiguous/manual-apply candidates into metadata_suggestions instead.
- Always include a Name detected column when a primary block is selected.
- For wide PDFs/spreadsheets with many blank or spacer columns, ignore fully empty columns instead of switching to prose. Empty cells are okay; the response must still be valid JSON in the required schema.
- If you are unsure about a value, keep the JSON shape and leave that field empty rather than returning explanation text outside the JSON.
`.trim();

export async function extractListFromImage(
  base64Image: string,
  mimeType: GeminiImageMimeType,
  options?: GeminiModelOptions
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
      modelId: options?.modelId,
    }
  );

  return parseGeminiJson(result.response.text().trim());
}

/**
 * For plain text/CSV input — no vision model needed, just parse structure.
 */
export async function extractListFromText(text: string, options?: GeminiModelOptions): Promise<GeminiExtractResult> {
  const prompt = `
Parse this plain text roster and return JSON in the same shape and with the same rules as the image extractor.

Focus on ONE primary roster block only, preserve secondary/ambiguous material in overflow, and surface manual review instead of auto-picking on an equal-strength block tie.

Return valid JSON with these top-level keys:
{
  "names": [...],
  "detected_columns": [...],
  "primary_block": {
    "status": "selected",
    "selection_reason": "",
    "rows": [...],
    "metadata": {
      "class_list_title": "",
      "start_time": "",
      "stop_time": "",
      "room_location": "",
      "teacher_name": ""
    },
    "raw_text": ""
  },
  "metadata_suggestions": [...],
  "overflow_blocks": [...],
  "manual_review": {
    "required": false,
    "reason": "",
    "candidate_block_labels": []
  },
  "raw_text": "${text.slice(0, 2000)}"
}

Text to parse:
${text}
  `.trim();

  const result = await runGeminiRequest(
    "extract-text",
    { textLength: text.length },
    (model) => model.generateContent(prompt),
    { modelId: options?.modelId }
  );

  try {
    return parseGeminiJson(result.response.text().trim());
  } catch {
    // Fallback: treat each line as a name
    const names = text.split("\n").map(l => l.trim()).filter(Boolean);
    return { names, detected_columns: [], raw_text: text };
  }
}
