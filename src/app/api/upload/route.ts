import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { inflateSync } from "node:zlib";
import { createClient } from "@/lib/supabase/server";
import { extractListFromImage, extractListFromText, getGeminiErrorDiagnostics } from "@/lib/gemini";
import { FLOW_ID_HEADER, normalizeFlowId } from "@/lib/flow-diagnostics";

export const runtime = "nodejs";
export const maxDuration = 60; // Gemini vision can be slow

type UploadMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf"
  | "text/csv"
  | "text/plain";

type UploadBinaryMimeType = Exclude<UploadMimeType, "text/csv" | "text/plain">;

type UploadStage = "parse-request" | "extract-text" | "extract-image";

type PdfUnicodeMap = {
  codeToUnicode: Map<string, string>;
  codeLengths: number[];
};

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
  const geminiDiagnostics = getGeminiErrorDiagnostics(error);

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 5).join("\n") ?? null,
      gemini: geminiDiagnostics,
    };
  }

  return {
    message: typeof error === "string" ? error : "Unknown upload error",
    gemini: geminiDiagnostics,
  };
}

function getSafeUploadErrorMessage(error: unknown, stage: UploadStage | null) {
  const geminiDiagnostics = getGeminiErrorDiagnostics(error);
  const fallback = stage === "extract-image"
    ? "Image extraction failed while reading the upload."
    : stage === "extract-text"
      ? "Text extraction failed while reading the upload."
      : "Upload failed while processing the request.";

  if (geminiDiagnostics) {
    switch (geminiDiagnostics.category) {
      case "missing-env":
        return "Upload is not configured yet: GEMINI_API_KEY is missing on the server.";
      case "model-access":
        return "Upload AI model is unavailable on the server. Check the configured Gemini model access and redeploy.";
      case "quota-rate-limit":
        return "The upload extraction service is temporarily rate-limited. Please wait a moment and try again.";
      case "invalid-key":
      case "permission-denied":
        return "Upload is not configured correctly for the extraction service. Check the server Gemini API credentials and permissions.";
      case "transport-service":
        return `${fallback} The extraction service may be temporarily unavailable; please try again.`;
      default:
        break;
    }
  }

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

function buildPdfObjectMap(pdfText: string) {
  const objectMap = new Map<string, string>();
  const objectPattern = /(\d+)\s+\d+\s+obj\b([\s\S]*?)endobj/g;

  let match = objectPattern.exec(pdfText);
  while (match) {
    objectMap.set(match[1], match[2]);
    match = objectPattern.exec(pdfText);
  }

  return objectMap;
}

function getPdfStreamBytes(objectBody: string) {
  const streamMatch = objectBody.match(/stream\r?\n([\s\S]*?)\r?\nendstream/);
  if (!streamMatch) {
    return null;
  }

  const rawBytes = Buffer.from(streamMatch[1], "latin1");
  if (/\/Filter\s*(?:\[[^\]]*?)?\/FlateDecode\b/.test(objectBody)) {
    try {
      return inflateSync(rawBytes);
    } catch {
      return null;
    }
  }

  return rawBytes;
}

function decodePdfUnicodeHex(hex: string) {
  const normalized = hex.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  if (!normalized) {
    return "";
  }

  const chunkSize = normalized.length % 4 === 0 ? 4 : 2;
  let result = "";

  for (let index = 0; index + chunkSize <= normalized.length; index += chunkSize) {
    result += String.fromCharCode(Number.parseInt(normalized.slice(index, index + chunkSize), 16));
  }

  return result;
}

function incrementPdfHexCode(hex: string, offset: number) {
  return (BigInt(`0x${hex}`) + BigInt(offset)).toString(16).toUpperCase().padStart(hex.length, "0");
}

function parsePdfUnicodeMap(cmapText: string): PdfUnicodeMap | null {
  const codeToUnicode = new Map<string, string>();

  const bfcharPattern = /\d+\s+beginbfchar([\s\S]*?)endbfchar/g;
  let bfcharMatch = bfcharPattern.exec(cmapText);
  while (bfcharMatch) {
    const entryPattern = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let entryMatch = entryPattern.exec(bfcharMatch[1]);
    while (entryMatch) {
      codeToUnicode.set(entryMatch[1].toUpperCase(), decodePdfUnicodeHex(entryMatch[2]));
      entryMatch = entryPattern.exec(bfcharMatch[1]);
    }

    bfcharMatch = bfcharPattern.exec(cmapText);
  }

  const bfrangePattern = /\d+\s+beginbfrange([\s\S]*?)endbfrange/g;
  let bfrangeMatch = bfrangePattern.exec(cmapText);
  while (bfrangeMatch) {
    const lines = bfrangeMatch[1].split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    for (const line of lines) {
      const arrayRangeMatch = line.match(/^<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[(.+)\]$/);
      if (arrayRangeMatch) {
        const [, startHex, endHex, valueList] = arrayRangeMatch;
        const values: string[] = [];
        const valuePattern = /<([0-9A-Fa-f]+)>/g;
        let valueMatch = valuePattern.exec(valueList);
        while (valueMatch) {
          values.push(valueMatch[1]);
          valueMatch = valuePattern.exec(valueList);
        }
        const rangeLength = Number.parseInt(endHex, 16) - Number.parseInt(startHex, 16) + 1;

        for (let index = 0; index < Math.min(rangeLength, values.length); index += 1) {
          codeToUnicode.set(incrementPdfHexCode(startHex, index), decodePdfUnicodeHex(values[index]));
        }

        continue;
      }

      const sequentialRangeMatch = line.match(/^<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>$/);
      if (!sequentialRangeMatch) {
        continue;
      }

      const [, startHex, endHex, firstValueHex] = sequentialRangeMatch;
      const rangeLength = Number.parseInt(endHex, 16) - Number.parseInt(startHex, 16) + 1;

      for (let index = 0; index < rangeLength; index += 1) {
        codeToUnicode.set(
          incrementPdfHexCode(startHex, index),
          decodePdfUnicodeHex(incrementPdfHexCode(firstValueHex, index)),
        );
      }
    }

    bfrangeMatch = bfrangePattern.exec(cmapText);
  }

  if (codeToUnicode.size === 0) {
    return null;
  }

  const uniqueCodeLengths = new Set<number>();
  codeToUnicode.forEach((_, code) => {
    uniqueCodeLengths.add(code.length);
  });

  const codeLengths = Array.from(uniqueCodeLengths).sort((left, right) => right - left);
  return { codeToUnicode, codeLengths };
}

function buildPdfFontUnicodeMaps(objectMap: Map<string, string>) {
  const fontResourceToObjectId = new Map<string, string>();

  objectMap.forEach((objectBody) => {
    const fontBlockPattern = /\/Font\s*<<([\s\S]*?)>>/g;
    let fontBlockMatch = fontBlockPattern.exec(objectBody);
    while (fontBlockMatch) {
      const fontEntryPattern = /\/([A-Za-z0-9]+)\s+(\d+)\s+\d+\s+R/g;
      let fontEntryMatch = fontEntryPattern.exec(fontBlockMatch[1]);
      while (fontEntryMatch) {
        fontResourceToObjectId.set(fontEntryMatch[1], fontEntryMatch[2]);
        fontEntryMatch = fontEntryPattern.exec(fontBlockMatch[1]);
      }

      fontBlockMatch = fontBlockPattern.exec(objectBody);
    }
  });

  const fontObjectToUnicodeMap = new Map<string, PdfUnicodeMap>();

  objectMap.forEach((objectBody, objectId) => {
    const toUnicodeMatch = objectBody.match(/\/Type\s*\/Font\b[\s\S]*?\/ToUnicode\s+(\d+)\s+\d+\s+R/);
    if (!toUnicodeMatch) {
      return;
    }

    const cmapObjectBody = objectMap.get(toUnicodeMatch[1]);
    if (!cmapObjectBody) {
      return;
    }

    const cmapBytes = getPdfStreamBytes(cmapObjectBody);
    if (!cmapBytes) {
      return;
    }

    const unicodeMap = parsePdfUnicodeMap(cmapBytes.toString("latin1"));
    if (unicodeMap) {
      fontObjectToUnicodeMap.set(objectId, unicodeMap);
    }
  });

  const fontResourceToUnicodeMap = new Map<string, PdfUnicodeMap>();
  fontResourceToObjectId.forEach((objectId, resourceName) => {
    const unicodeMap = fontObjectToUnicodeMap.get(objectId);
    if (unicodeMap) {
      fontResourceToUnicodeMap.set(resourceName, unicodeMap);
    }
  });

  return fontResourceToUnicodeMap;
}

function extractPdfContentObjectIds(objectMap: Map<string, string>) {
  const contentObjectIds = new Set<string>();

  objectMap.forEach((objectBody) => {
    if (!/\/Type\s*\/Page\b/.test(objectBody)) {
      return;
    }

    const contentsMatch = objectBody.match(/\/Contents\s*(\[[^\]]+\]|\d+\s+\d+\s+R)/);
    if (!contentsMatch) {
      return;
    }

    const referencePattern = /(\d+)\s+\d+\s+R/g;
    let referenceMatch = referencePattern.exec(contentsMatch[1]);
    while (referenceMatch) {
      contentObjectIds.add(referenceMatch[1]);
      referenceMatch = referencePattern.exec(contentsMatch[1]);
    }
  });

  return Array.from(contentObjectIds);
}

function decodePdfLiteralBytes(literal: string) {
  const bytes: number[] = [];

  for (let index = 0; index < literal.length; index += 1) {
    const char = literal[index];

    if (char !== "\\") {
      bytes.push(char.charCodeAt(0) & 0xFF);
      continue;
    }

    const nextChar = literal[index + 1];
    if (!nextChar) {
      break;
    }

    index += 1;
    switch (nextChar) {
      case "n":
        bytes.push(0x0A);
        break;
      case "r":
        bytes.push(0x0D);
        break;
      case "t":
        bytes.push(0x09);
        break;
      case "b":
        bytes.push(0x08);
        break;
      case "f":
        bytes.push(0x0C);
        break;
      case "(":
      case ")":
      case "\\":
        bytes.push(nextChar.charCodeAt(0));
        break;
      case "\n":
      case "\r":
        if (nextChar === "\r" && literal[index + 1] === "\n") {
          index += 1;
        }
        break;
      default: {
        if (!/[0-7]/.test(nextChar)) {
          bytes.push(nextChar.charCodeAt(0));
          break;
        }

        let octal = nextChar;
        for (let offset = 1; offset <= 2; offset += 1) {
          const digit = literal[index + offset];
          if (!digit || !/[0-7]/.test(digit)) {
            break;
          }

          octal += digit;
          index += 1;
        }

        bytes.push(Number.parseInt(octal, 8));
        break;
      }
    }
  }

  return Buffer.from(bytes);
}

function decodePdfHexOperand(hexValue: string, unicodeMap: PdfUnicodeMap | null) {
  const normalized = hexValue.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  if (!normalized) {
    return "";
  }

  if (!unicodeMap || unicodeMap.codeLengths.length === 0) {
    return Buffer.from(normalized, "hex").toString("latin1");
  }

  let decoded = "";
  let index = 0;

  while (index < normalized.length) {
    let matched = false;

    for (const codeLength of unicodeMap.codeLengths) {
      const code = normalized.slice(index, index + codeLength);
      if (code.length !== codeLength) {
        continue;
      }

      const mapped = unicodeMap.codeToUnicode.get(code);
      if (!mapped) {
        continue;
      }

      decoded += mapped;
      index += codeLength;
      matched = true;
      break;
    }

    if (!matched) {
      const fallbackCode = normalized.slice(index, index + 2);
      if (fallbackCode.length === 2) {
        decoded += String.fromCharCode(Number.parseInt(fallbackCode, 16));
      }
      index += Math.max(fallbackCode.length, 1);
    }
  }

  return decoded;
}

function decodePdfTextOperand(operand: string, unicodeMap: PdfUnicodeMap | null) {
  if (operand.startsWith("<") && operand.endsWith(">")) {
    return decodePdfHexOperand(operand.slice(1, -1), unicodeMap);
  }

  if (!operand.startsWith("(") || !operand.endsWith(")")) {
    return "";
  }

  const literalBytes = decodePdfLiteralBytes(operand.slice(1, -1));
  if (unicodeMap && literalBytes.length > 0 && literalBytes.length % 2 === 0 && unicodeMap.codeLengths.some((length) => length >= 4)) {
    return decodePdfHexOperand(literalBytes.toString("hex"), unicodeMap);
  }

  return literalBytes.toString("latin1");
}

function decodePdfTextArray(arrayOperand: string, unicodeMap: PdfUnicodeMap | null) {
  let decoded = "";

  const tokenPattern = /<[^>]+>|\((?:\\.|[^\\)])*\)/g;
  let tokenMatch = tokenPattern.exec(arrayOperand);
  while (tokenMatch) {
    decoded += decodePdfTextOperand(tokenMatch[0], unicodeMap);
    tokenMatch = tokenPattern.exec(arrayOperand);
  }

  return decoded;
}

function extractTextFromPdfContentStream(streamText: string, fontMaps: Map<string, PdfUnicodeMap>) {
  const tokenPattern = /\/([A-Za-z0-9]+)\s+[-+]?(?:\d+(?:\.\d+)?|\.\d+)\s+Tf|(\[[\s\S]*?\])\s*TJ|(<[^>]+>|\((?:\\.|[^\\)])*\))\s*Tj|T\*|[-+]?(?:\d+(?:\.\d+)?|\.\d+)\s+[-+]?(?:\d+(?:\.\d+)?|\.\d+)\s+T[Dd]|[-+]?(?:\d+(?:\.\d+)?|\.\d+)\s+[-+]?(?:\d+(?:\.\d+)?|\.\d+)\s+[-+]?(?:\d+(?:\.\d+)?|\.\d+)\s+[-+]?(?:\d+(?:\.\d+)?|\.\d+)\s+[-+]?(?:\d+(?:\.\d+)?|\.\d+)\s+[-+]?(?:\d+(?:\.\d+)?|\.\d+)\s+Tm/g;
  const parts: string[] = [];
  let activeFont: PdfUnicodeMap | null = null;

  let match = tokenPattern.exec(streamText);
  while (match) {
    if (match[1]) {
      activeFont = fontMaps.get(match[1]) ?? null;
      match = tokenPattern.exec(streamText);
      continue;
    }

    if (match[2]) {
      parts.push(decodePdfTextArray(match[2], activeFont));
      match = tokenPattern.exec(streamText);
      continue;
    }

    if (match[3]) {
      parts.push(decodePdfTextOperand(match[3], activeFont));
      match = tokenPattern.exec(streamText);
      continue;
    }

    parts.push("\n");
    match = tokenPattern.exec(streamText);
  }

  return parts.join("");
}

function normalizeExtractedPdfText(text: string) {
  const normalizedLines = text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && lines[index - 1] !== ""));

  return normalizedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function isUsefulExtractedPdfText(text: string) {
  const letters = text.match(/[A-Za-z]/g)?.length ?? 0;
  const words = text.match(/[A-Za-z]{2,}/g)?.length ?? 0;
  const lines = text.split("\n").filter(Boolean).length;

  return text.length >= 80 && letters >= 30 && words >= 8 && lines >= 3;
}

function extractTextFromPdfBuffer(pdfBuffer: Buffer) {
  const pdfText = pdfBuffer.toString("latin1");
  if (!/\/ToUnicode\b/.test(pdfText)) {
    return null;
  }

  const objectMap = buildPdfObjectMap(pdfText);
  if (objectMap.size === 0) {
    return null;
  }

  const fontMaps = buildPdfFontUnicodeMaps(objectMap);
  if (fontMaps.size === 0) {
    return null;
  }

  const contentObjectIds = extractPdfContentObjectIds(objectMap);
  if (contentObjectIds.length === 0) {
    return null;
  }

  const extractedSegments: string[] = [];

  for (const objectId of contentObjectIds) {
    const objectBody = objectMap.get(objectId);
    if (!objectBody) {
      continue;
    }

    const streamBytes = getPdfStreamBytes(objectBody);
    if (!streamBytes) {
      continue;
    }

    extractedSegments.push(extractTextFromPdfContentStream(streamBytes.toString("latin1"), fontMaps));
  }

  const extractedText = extractedSegments.join("\n");

  const normalizedText = normalizeExtractedPdfText(extractedText);
  if (!isUsefulExtractedPdfText(normalizedText)) {
    return null;
  }

  return normalizedText.slice(0, 12000);
}

async function extractFromBinaryUpload(
  bytes: Buffer,
  mimeType: UploadBinaryMimeType,
  uploadContext: Record<string, unknown>,
) {
  if (mimeType === "application/pdf") {
    const extractedPdfText = extractTextFromPdfBuffer(bytes);
    if (extractedPdfText) {
      const textContext = {
        ...uploadContext,
        extractionMode: "pdf-text-fast-path",
        pdfTextFastPathAttempted: true,
        pdfTextFastPathHit: true,
        extractedTextLength: extractedPdfText.length,
      };

      console.log("[upload] extraction start:", { stage: "extract-text", ...textContext });
      return {
        stage: "extract-text" as const,
        result: await extractListFromText(extractedPdfText),
        uploadContext: textContext,
      };
    }
  }

  const imageContext = {
    ...uploadContext,
    extractionMode: mimeType === "application/pdf" ? "pdf-vision-fallback" : "vision",
    ...(mimeType === "application/pdf" ? {
      pdfTextFastPathAttempted: true,
      pdfTextFastPathHit: false,
    } : {}),
  };

  console.log("[upload] extraction start:", { stage: "extract-image", ...imageContext });
  return {
    stage: "extract-image" as const,
    result: await extractListFromImage(bytes.toString("base64"), mimeType),
    uploadContext: imageContext,
  };
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const flowId = normalizeFlowId(req.headers.get(FLOW_ID_HEADER)) ?? randomUUID();
  const vercelRequestId = req.headers.get("x-vercel-id") ?? null;

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  console.log("[upload] auth check:", {
    flowId,
    vercelRequestId,
    userId: user?.id,
    email: user?.email,
    authError: authError?.message ?? null,
  });
  if (!user || authError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch profile to get plan + org
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("org_id, plan_tier")
    .eq("id", user.id)
    .single();

  console.log("[upload] profile query:", { flowId, userId: user.id, profile, profileError });
  if (profileError) {
    console.error("[upload] Supabase profile error (full):", { flowId, profileError: JSON.stringify(profileError, null, 2) });
  }

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  console.log("[upload] profile details:", { flowId, org_id: profile.org_id, plan_tier: profile.plan_tier });

  const contentType = req.headers.get("content-type") ?? "";
  console.log("[upload] request metadata:", { flowId, vercelRequestId, contentType });

  let result: Awaited<ReturnType<typeof extractListFromText>> | null = null;
  let stage: UploadStage | null = null;
  let uploadContext: Record<string, unknown> = { flowId, vercelRequestId, contentType };

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
        const extraction = await extractFromBinaryUpload(Buffer.from(await file.arrayBuffer()), normalizedMimeType, uploadContext);
        stage = extraction.stage;
        result = extraction.result;
        uploadContext = extraction.uploadContext;
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

        const extraction = await extractFromBinaryUpload(Buffer.from(body.base64, "base64"), normalizedMimeType, uploadContext);
        stage = extraction.stage;
        result = extraction.result;
        uploadContext = extraction.uploadContext;
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
        flow_id: flowId,
      },
      { status: 500 },
    );
  }

  console.log("[upload] extraction success:", {
    flowId,
    stage,
    namesCount: result?.names?.length ?? 0,
    detectedColumnsCount: result?.detected_columns?.length ?? 0,
  });

  return NextResponse.json({ success: true, data: result, flow_id: flowId });
}
