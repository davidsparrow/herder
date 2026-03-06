import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import type { GeminiExtractResult } from "@/lib/types";

const GEMINI_MULTIMODAL_MODEL = "gemini-2.5-flash";

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY on the server.");
  }

  return new GoogleGenerativeAI(apiKey);
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
  const model = getGenAI().getGenerativeModel({
    model: GEMINI_MULTIMODAL_MODEL,
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent([
    EXTRACT_PROMPT,
    { inlineData: { data: base64Image, mimeType } },
  ]);

  return parseGeminiJson(result.response.text().trim());
}

/**
 * For plain text/CSV input — no vision model needed, just parse structure.
 */
export async function extractListFromText(text: string): Promise<GeminiExtractResult> {
  const model = getGenAI().getGenerativeModel({
    model: GEMINI_MULTIMODAL_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

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

  const result = await model.generateContent(prompt);

  try {
    return parseGeminiJson(result.response.text().trim());
  } catch {
    // Fallback: treat each line as a name
    const names = text.split("\n").map(l => l.trim()).filter(Boolean);
    return { names, detected_columns: [], raw_text: text };
  }
}
