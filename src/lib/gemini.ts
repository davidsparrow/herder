import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import type { GeminiExtractResult } from "@/lib/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
  });

  const result = await model.generateContent([
    EXTRACT_PROMPT,
    { inlineData: { data: base64Image, mimeType } },
  ]);

  const text = result.response.text().trim();

  // Strip accidental markdown fences
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as GeminiExtractResult;
    // Ensure shape is complete
    if (!Array.isArray(parsed.names)) parsed.names = [];
    if (!Array.isArray(parsed.detected_columns)) parsed.detected_columns = [];
    if (!parsed.raw_text) parsed.raw_text = "";
    return parsed;
  } catch (e) {
    throw new Error(`Gemini returned non-JSON response: ${text.slice(0, 200)}`);
  }
}

/**
 * For plain text/CSV input — no vision model needed, just parse structure.
 */
export async function extractListFromText(text: string): Promise<GeminiExtractResult> {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
  const raw = result.response.text().trim()
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    return JSON.parse(raw) as GeminiExtractResult;
  } catch {
    // Fallback: treat each line as a name
    const names = text.split("\n").map(l => l.trim()).filter(Boolean);
    return { names, detected_columns: [], raw_text: text };
  }
}
