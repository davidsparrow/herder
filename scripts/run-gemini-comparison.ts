import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  DEFAULT_GEMINI_MODEL_ID,
  extractListFromImage,
  extractListFromText,
  getGeminiErrorDiagnostics,
  type GeminiImageMimeType,
} from "../src/lib/gemini";
import type { GeminiExtractResult } from "../src/lib/types";

type SupportedMimeType = GeminiImageMimeType | "text/csv" | "text/plain";
type HarnessEntrypoint = "extractListFromImage" | "extractListFromText";
type HarnessModality = "image" | "document" | "text";

type CliOptions = {
  models: string[];
  inputSpecs: string[];
  repeat: number;
  outputDir: string;
  label: string | null;
};

type ParsedInputSpec = {
  caseId: string;
  filePath: string;
};

type PreparedInput = {
  caseId: string;
  filePath: string;
  absolutePath: string;
  fileName: string;
  mimeType: SupportedMimeType;
  entrypoint: HarnessEntrypoint;
  modality: HarnessModality;
  sizeBytes: number;
  sha256: string;
  base64?: string;
  text?: string;
};

type HarnessRunRecord = {
  caseId: string;
  fileName: string;
  filePath: string;
  mimeType: SupportedMimeType;
  entrypoint: HarnessEntrypoint;
  modality: HarnessModality;
  modelId: string;
  repeatIndex: number;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  inputSha256: string;
  sizeBytes: number;
  status: "success" | "error";
  summary: {
    namesCount: number;
    rowCount: number;
    manualReviewRequired: boolean;
    overflowBlockCount: number;
    detectedColumnHeaders: string[];
    metadata: GeminiExtractResult["primary_block"] extends infer T
      ? T extends { metadata: infer U }
        ? U
        : null
      : null;
    namesPreview: string[];
  } | null;
  output?: GeminiExtractResult;
  error?: {
    name: string;
    message: string;
    diagnostics: ReturnType<typeof getGeminiErrorDiagnostics>;
  };
};

function printHelp() {
  console.log(`Usage: npm run compare:gemini -- --model <model-id> [--model <model-id>] --input <path|caseId::path> [--input <path|caseId::path>] [--repeat 1] [--output-dir tmp/gemini-comparison-results] [--label name]`);
}

function requireValue(args: string[], index: number, flag: string) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function sanitizeLabel(value: string) {
  return value.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "comparison";
}

function parseArgs(args: string[]): CliOptions {
  const models: string[] = [];
  const inputSpecs: string[] = [];
  let repeat = 1;
  let outputDir = "tmp/gemini-comparison-results";
  let label: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      case "--model":
        models.push(requireValue(args, index, arg));
        index += 1;
        break;
      case "--input":
        inputSpecs.push(requireValue(args, index, arg));
        index += 1;
        break;
      case "--repeat": {
        const rawRepeat = Number.parseInt(requireValue(args, index, arg), 10);
        if (!Number.isInteger(rawRepeat) || rawRepeat < 1) {
          throw new Error("--repeat must be an integer >= 1.");
        }
        repeat = rawRepeat;
        index += 1;
        break;
      }
      case "--output-dir":
        outputDir = requireValue(args, index, arg);
        index += 1;
        break;
      case "--label":
        label = requireValue(args, index, arg);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (models.length === 0) {
    throw new Error("Provide at least one --model value.");
  }

  if (inputSpecs.length === 0) {
    throw new Error("Provide at least one --input value.");
  }

  return { models, inputSpecs, repeat, outputDir, label };
}

function parseInputSpec(spec: string): ParsedInputSpec {
  const separatorIndex = spec.indexOf("::");
  if (separatorIndex <= 0) {
    const filePath = spec;
    return {
      caseId: path.parse(filePath).name || "input",
      filePath,
    };
  }

  return {
    caseId: spec.slice(0, separatorIndex).trim() || "input",
    filePath: spec.slice(separatorIndex + 2),
  };
}

function detectInputMode(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return { mimeType: "image/jpeg" as const, entrypoint: "extractListFromImage" as const, modality: "image" as const };
    case ".png":
      return { mimeType: "image/png" as const, entrypoint: "extractListFromImage" as const, modality: "image" as const };
    case ".webp":
      return { mimeType: "image/webp" as const, entrypoint: "extractListFromImage" as const, modality: "image" as const };
    case ".pdf":
      return { mimeType: "application/pdf" as const, entrypoint: "extractListFromImage" as const, modality: "document" as const };
    case ".csv":
      return { mimeType: "text/csv" as const, entrypoint: "extractListFromText" as const, modality: "text" as const };
    case ".txt":
      return { mimeType: "text/plain" as const, entrypoint: "extractListFromText" as const, modality: "text" as const };
    default:
      throw new Error(`Unsupported input extension for ${filePath}. Use jpg/jpeg/png/webp/pdf/csv/txt.`);
  }
}

async function prepareInput(spec: ParsedInputSpec): Promise<PreparedInput> {
  const absolutePath = path.resolve(spec.filePath);
  const fileBuffer = await readFile(absolutePath);
  const inputMode = detectInputMode(absolutePath);
  const sha256 = createHash("sha256").update(fileBuffer).digest("hex");

  return {
    caseId: spec.caseId,
    filePath: spec.filePath,
    absolutePath,
    fileName: path.basename(absolutePath),
    mimeType: inputMode.mimeType,
    entrypoint: inputMode.entrypoint,
    modality: inputMode.modality,
    sizeBytes: fileBuffer.byteLength,
    sha256,
    ...(inputMode.entrypoint === "extractListFromImage"
      ? { base64: fileBuffer.toString("base64") }
      : { text: fileBuffer.toString("utf8") }),
  };
}

function summarizeOutput(result: GeminiExtractResult) {
  return {
    namesCount: result.names.length,
    rowCount: result.primary_block?.rows.length ?? 0,
    manualReviewRequired: Boolean(result.manual_review?.required || result.primary_block?.status === "manual_review"),
    overflowBlockCount: result.overflow_blocks?.length ?? 0,
    detectedColumnHeaders: result.detected_columns.map((column) => column.header),
    metadata: result.primary_block?.metadata ?? null,
    namesPreview: result.names.slice(0, 5),
  };
}

function buildAggregateSummary(runs: HarnessRunRecord[]) {
  const buckets = new Map<string, {
    caseId: string;
    entrypoint: HarnessEntrypoint;
    modality: HarnessModality;
    mimeType: SupportedMimeType;
    modelId: string;
    successCount: number;
    errorCount: number;
    latenciesMs: number[];
    manualReviewCount: number;
    rowCounts: number[];
    namesCounts: number[];
  }>();

  runs.forEach((run) => {
    const key = [run.caseId, run.entrypoint, run.mimeType, run.modelId].join("::");
    const existing = buckets.get(key) ?? {
      caseId: run.caseId,
      entrypoint: run.entrypoint,
      modality: run.modality,
      mimeType: run.mimeType,
      modelId: run.modelId,
      successCount: 0,
      errorCount: 0,
      latenciesMs: [],
      manualReviewCount: 0,
      rowCounts: [],
      namesCounts: [],
    };

    existing.latenciesMs.push(run.latencyMs);
    if (run.status === "success") {
      existing.successCount += 1;
      existing.manualReviewCount += run.summary?.manualReviewRequired ? 1 : 0;
      if (typeof run.summary?.rowCount === "number") {
        existing.rowCounts.push(run.summary.rowCount);
      }
      if (typeof run.summary?.namesCount === "number") {
        existing.namesCounts.push(run.summary.namesCount);
      }
    } else {
      existing.errorCount += 1;
    }

    buckets.set(key, existing);
  });

  return Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    averageLatencyMs: Math.round(bucket.latenciesMs.reduce((sum, value) => sum + value, 0) / bucket.latenciesMs.length),
  }));
}

async function runComparison() {
  const options = parseArgs(process.argv.slice(2));
  const preparedInputs = await Promise.all(options.inputSpecs.map((spec) => prepareInput(parseInputSpec(spec))));
  const runs: HarnessRunRecord[] = [];

  for (const input of preparedInputs) {
    for (const modelId of options.models) {
      for (let repeatIndex = 1; repeatIndex <= options.repeat; repeatIndex += 1) {
        const startedAt = new Date().toISOString();
        const startedMs = Date.now();

        try {
          const output = input.entrypoint === "extractListFromImage"
            ? await extractListFromImage(input.base64!, input.mimeType as GeminiImageMimeType, { modelId })
            : await extractListFromText(input.text!, { modelId });
          const completedAt = new Date().toISOString();
          const latencyMs = Date.now() - startedMs;
          const summary = summarizeOutput(output);

          runs.push({
            caseId: input.caseId,
            fileName: input.fileName,
            filePath: input.absolutePath,
            mimeType: input.mimeType,
            entrypoint: input.entrypoint,
            modality: input.modality,
            modelId,
            repeatIndex,
            startedAt,
            completedAt,
            latencyMs,
            inputSha256: input.sha256,
            sizeBytes: input.sizeBytes,
            status: "success",
            summary,
            output,
          });

          console.log(`[gemini-compare] success case=${input.caseId} file=${input.fileName} model=${modelId} repeat=${repeatIndex} latencyMs=${latencyMs} rows=${summary.rowCount} names=${summary.namesCount} entrypoint=${input.entrypoint}`);
        } catch (error) {
          const completedAt = new Date().toISOString();
          const latencyMs = Date.now() - startedMs;

          runs.push({
            caseId: input.caseId,
            fileName: input.fileName,
            filePath: input.absolutePath,
            mimeType: input.mimeType,
            entrypoint: input.entrypoint,
            modality: input.modality,
            modelId,
            repeatIndex,
            startedAt,
            completedAt,
            latencyMs,
            inputSha256: input.sha256,
            sizeBytes: input.sizeBytes,
            status: "error",
            summary: null,
            error: {
              name: error instanceof Error ? error.name : "UnknownError",
              message: error instanceof Error ? error.message : String(error),
              diagnostics: getGeminiErrorDiagnostics(error),
            },
          });

          console.log(`[gemini-compare] error case=${input.caseId} file=${input.fileName} model=${modelId} repeat=${repeatIndex} latencyMs=${latencyMs}`);
        }
      }
    }
  }

  const generatedAt = new Date().toISOString();
  const outputDir = path.resolve(options.outputDir);
  await mkdir(outputDir, { recursive: true });
  const fileStamp = generatedAt.replace(/[:.]/g, "-");
  const outputPath = path.join(
    outputDir,
    `${fileStamp}${options.label ? `--${sanitizeLabel(options.label)}` : ""}.json`
  );

  const report = {
    generatedAt,
    defaultModelId: DEFAULT_GEMINI_MODEL_ID,
    label: options.label,
    repeat: options.repeat,
    models: options.models,
    inputs: preparedInputs.map((input) => ({
      caseId: input.caseId,
      fileName: input.fileName,
      filePath: input.absolutePath,
      mimeType: input.mimeType,
      entrypoint: input.entrypoint,
      modality: input.modality,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
    })),
    summary: buildAggregateSummary(runs),
    runs,
  };

  await writeFile(outputPath, JSON.stringify(report, null, 2));
  console.log(`[gemini-compare] wrote ${outputPath}`);
}

runComparison().catch((error) => {
  console.error("[gemini-compare] failed to run harness", error);
  process.exitCode = 1;
});