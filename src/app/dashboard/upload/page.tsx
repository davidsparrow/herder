"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { appendFlowIdToPath, FLOW_ID_HEADER, normalizeFlowId } from "@/lib/flow-diagnostics";
import {
  UPLOAD_FIELD_MAPPINGS,
  type CheckinList,
  type CheckinListSourceMetadata,
  type GeminiExtractResult,
  type Profile,
  type Teacher,
  type UploadFieldMapping,
} from "@/lib/types";

const DAY_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

type Step = 0 | 1 | 2 | 3;

interface UploadApiResponse {
  data?: GeminiExtractResult;
  error?: string;
  code?: string;
  stage?: string;
  flow_id?: string;
}

interface CreateListApiResponse {
  data?: {
    list_id: string;
    session_id: string;
    student_count: number;
    merged_student_count?: number;
    created_new_list?: boolean;
    checkin_path: string;
  };
  error?: string;
  code?: string;
  stage?: string;
  flow_id?: string;
  diagnostic_hint?: string | null;
}

function createFlowId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `upload-${Date.now()}`;
}

type ExistingListOption = Pick<CheckinList, "id" | "name" | "created_at">;
type TeacherOption = Pick<Teacher, "id" | "name" | "email" | "phone">;
type CurrentUserTeacherContext = Pick<Profile, "full_name" | "email">;

type TeacherMatchResult =
  | { status: "none" | "ambiguous" | "unmatched" }
  | { status: "matched"; teacher: TeacherOption };

type HeaderMetadataField = Exclude<keyof CheckinListSourceMetadata, "default_pickup_drop_location">;

type ManualHeaderSuggestion = {
  id: string;
  field: HeaderMetadataField;
  value: string;
  confidence: number;
  reason: string;
  applyLabel: string | null;
  applyValue: string | null;
};

const EMPTY_SOURCE_METADATA: CheckinListSourceMetadata = {
  class_list_title: "",
  start_time: "",
  stop_time: "",
  room_location: "",
  teacher_name: "",
  default_pickup_drop_location: "",
};

const HEADER_FIELD_LABELS: Record<HeaderMetadataField, string> = {
  class_list_title: "Class / Event Name",
  start_time: "Start Time",
  stop_time: "Stop Time",
  room_location: "Room / Location",
  teacher_name: "Roster Teacher Name",
};

async function readApiResponse<T>(res: Response): Promise<T> {
  const text = await res.text();

  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text } as T;
  }
}

function getUploadErrorMessage(payload: UploadApiResponse) {
  if (payload.code === "PLAN_LIMIT" && payload.error) {
    return `${payload.error} 👉 Upgrade your plan in Admin settings.`;
  }

  if (payload.error) {
    return payload.error;
  }

  return "Upload failed.";
}

function getCreateListErrorMessage(payload: CreateListApiResponse) {
  if (payload.code === "PLAN_LIMIT" && payload.error) {
    return `${payload.error} 👉 Upgrade your plan in Admin settings.`;
  }

  return payload.error ?? "Failed to create the check-in list.";
}

function normalizeEmail(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeOptionalString(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTimeInputValue(value: string | null | undefined) {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)?$/i);
  if (!match) {
    return "";
  }

  const rawHours = Number(match[1]);
  const rawMinutes = Number(match[2] ?? "0");
  const meridiem = match[3]?.toLowerCase() ?? "";
  if (!Number.isInteger(rawHours) || !Number.isInteger(rawMinutes) || rawMinutes < 0 || rawMinutes > 59) {
    return "";
  }

  if (!meridiem) {
    if (rawHours < 0 || rawHours > 23) {
      return "";
    }

    return `${String(rawHours).padStart(2, "0")}:${String(rawMinutes).padStart(2, "0")}`;
  }

  if (rawHours < 1 || rawHours > 12) {
    return "";
  }

  const convertedHours = meridiem === "pm"
    ? rawHours === 12 ? 12 : rawHours + 12
    : rawHours === 12 ? 0 : rawHours;

  return `${String(convertedHours).padStart(2, "0")}:${String(rawMinutes).padStart(2, "0")}`;
}

function normalizeMatchValue(value: string | null | undefined) {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    : "";
}

function findTeacherMatchByName(teachers: TeacherOption[], rawName: string | null | undefined): TeacherMatchResult {
  const normalizedName = normalizeMatchValue(rawName);
  if (!normalizedName) {
    return { status: "none" };
  }

  const matches = teachers.filter((teacher) => normalizeMatchValue(teacher.name) === normalizedName);
  if (matches.length === 1) {
    return { status: "matched", teacher: matches[0] };
  }

  return matches.length > 1 ? { status: "ambiguous" } : { status: "unmatched" };
}

function findCurrentUserTeacherMatch(teachers: TeacherOption[], currentUser: CurrentUserTeacherContext | null) {
  if (!currentUser) {
    return null;
  }

  const normalizedEmail = normalizeEmail(currentUser.email);
  if (normalizedEmail) {
    const emailMatches = teachers.filter((teacher) => normalizeEmail(teacher.email) === normalizedEmail);
    if (emailMatches.length === 1) {
      return emailMatches[0];
    }
  }

  const normalizedName = normalizeMatchValue(currentUser.full_name);
  if (!normalizedName) {
    return null;
  }

  const nameMatches = teachers.filter((teacher) => normalizeMatchValue(teacher.name) === normalizedName);
  return nameMatches.length === 1 ? nameMatches[0] : null;
}

export default function UploadPage() {
  const router  = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep]         = useState<Step>(0);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const [extracted, setExtracted] = useState<GeminiExtractResult | null>(null);
  const [mappings, setMappings]   = useState<UploadFieldMapping[]>([]);
  const [className, setClassName] = useState("");
  const [stopTime, setStopTime] = useState("");
  const [roomLocation, setRoomLocation] = useState("");
  const [headerTeacherName, setHeaderTeacherName] = useState("");
  const [days, setDays]           = useState([true, false, true, false, true, false, false]);
  const [time, setTime]           = useState("08:30");
  const [createdListId, setCreatedListId] = useState<string | null>(null);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [createdStudentCount, setCreatedStudentCount] = useState(0);
  const [mergedStudentCount, setMergedStudentCount] = useState(0);
  const [createdCheckinPath, setCreatedCheckinPath] = useState<string | null>(null);
  const [createdNewList, setCreatedNewList] = useState(true);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [existingLists, setExistingLists] = useState<ExistingListOption[]>([]);
  const [existingListId, setExistingListId] = useState("");
  const [loadingLists, setLoadingLists] = useState(false);
  const [appendToExisting, setAppendToExisting] = useState(false);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [currentUserTeacherContext, setCurrentUserTeacherContext] = useState<CurrentUserTeacherContext | null>(null);
  const [originalTeacherId, setOriginalTeacherId] = useState("");
  const [substituteEnabled, setSubstituteEnabled] = useState(false);
  const [substituteTeacherId, setSubstituteTeacherId] = useState("");
  const [teacherSelectionTouched, setTeacherSelectionTouched] = useState(false);

  useEffect(() => {
    let active = true;

    const loadPageContext = async () => {
      setLoadingLists(true);
      setLoadingTeachers(true);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!active) {
        return;
      }

      if (userError || !user) {
        setExistingLists([]);
        setTeachers([]);
        setCurrentUserTeacherContext(null);
        setLoadingLists(false);
        setLoadingTeachers(false);
        return;
      }

      const [listsResult, teachersResult, profileResult] = await Promise.all([
        supabase
          .from("checkin_lists")
          .select("id, name, created_at")
          .eq("archived", false)
          .order("created_at", { ascending: false }),
        supabase
          .from("teachers")
          .select("id, name, email, phone")
          .order("name", { ascending: true }),
        supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      if (!active) {
        return;
      }

      if (listsResult.error) {
        console.error("[upload-ui] failed to load existing lists:", listsResult.error);
        setExistingLists([]);
      } else {
        setExistingLists((listsResult.data ?? []) as ExistingListOption[]);
      }

      if (teachersResult.error) {
        console.error("[upload-ui] failed to load teachers:", teachersResult.error);
        setTeachers([]);
      } else {
        setTeachers((teachersResult.data ?? []) as TeacherOption[]);
      }

      setCurrentUserTeacherContext({
        full_name: profileResult.data?.full_name ?? (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null),
        email: profileResult.data?.email ?? user.email ?? null,
      });

      setLoadingLists(false);
      setLoadingTeachers(false);
    };

    void loadPageContext();

    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (appendToExisting && existingLists.length === 0) {
      setAppendToExisting(false);
      setExistingListId("");
    }
  }, [appendToExisting, existingLists.length]);

  const extractedTeacherName = headerTeacherName.trim();
  const extractedTeacherMatch = useMemo(
    () => findTeacherMatchByName(teachers, extractedTeacherName),
    [teachers, extractedTeacherName]
  );
  const currentUserTeacherMatch = useMemo(
    () => findCurrentUserTeacherMatch(teachers, currentUserTeacherContext),
    [teachers, currentUserTeacherContext]
  );

  useEffect(() => {
    if (appendToExisting || teacherSelectionTouched) {
      return;
    }

    let nextOriginalTeacherId = "";
    if (extractedTeacherMatch.status === "matched") {
      nextOriginalTeacherId = extractedTeacherMatch.teacher.id;
    } else if (!extractedTeacherName) {
      if (teachers.length === 1) {
        nextOriginalTeacherId = teachers[0]?.id ?? "";
      } else if (currentUserTeacherMatch) {
        nextOriginalTeacherId = currentUserTeacherMatch.id;
      }
    }

    setOriginalTeacherId(nextOriginalTeacherId);
    if (!nextOriginalTeacherId) {
      setSubstituteEnabled(false);
      setSubstituteTeacherId("");
    }
  }, [appendToExisting, currentUserTeacherMatch, extractedTeacherMatch, extractedTeacherName, teacherSelectionTouched, teachers]);

  useEffect(() => {
    if (!originalTeacherId) {
      setSubstituteEnabled(false);
      setSubstituteTeacherId("");
    }
  }, [originalTeacherId]);

  const manualHeaderSuggestions = useMemo(() => {
    if (!extracted) {
      return [] as ManualHeaderSuggestion[];
    }

    const nextSuggestions = new Map<string, ManualHeaderSuggestion>();

    const pushSuggestion = ({
      field,
      value,
      confidence,
      reason,
      applyLabel,
      applyValue,
    }: Omit<ManualHeaderSuggestion, "id">) => {
      const normalizedValue = normalizeOptionalString(value);
      if (!normalizedValue) {
        return;
      }

      const normalizedApplyValue = normalizeOptionalString(applyValue ?? undefined);
      const alreadyApplied =
        (field === "class_list_title" && normalizeOptionalString(className) === normalizedValue)
        || (field === "room_location" && normalizeOptionalString(roomLocation) === normalizedValue)
        || (field === "teacher_name" && normalizeOptionalString(headerTeacherName) === normalizedValue)
        || (field === "start_time" && normalizedApplyValue && time === normalizedApplyValue)
        || (field === "stop_time" && normalizedApplyValue && stopTime === normalizedApplyValue);

      if (alreadyApplied) {
        return;
      }

      const id = `${field}:${normalizedValue.toLowerCase()}`;
      const existing = nextSuggestions.get(id);
      if (existing && existing.confidence >= confidence) {
        return;
      }

      nextSuggestions.set(id, {
        id,
        field,
        value: normalizedValue,
        confidence,
        reason: reason.trim() || "Saved as a manual-apply suggestion because the extraction was not obvious enough to force.",
        applyLabel,
        applyValue: normalizedApplyValue || null,
      });
    };

    (extracted.metadata_suggestions ?? []).forEach((suggestion) => {
      const suggestionField = suggestion.field as HeaderMetadataField;
      if (!(suggestionField in HEADER_FIELD_LABELS)) {
        return;
      }

      if (suggestionField === "start_time" || suggestionField === "stop_time") {
        const parsedValue = normalizeTimeInputValue(suggestion.value);
        pushSuggestion({
          field: suggestionField,
          value: suggestion.value,
          confidence: suggestion.confidence,
          reason: suggestion.reason,
          applyLabel: parsedValue ? "Apply" : null,
          applyValue: parsedValue || null,
        });
        return;
      }

      if (suggestionField === "teacher_name") {
        const suggestionTeacherMatch = findTeacherMatchByName(teachers, suggestion.value);
        pushSuggestion({
          field: suggestionField,
          value: suggestion.value,
          confidence: suggestion.confidence,
          reason: suggestion.reason,
          applyLabel: suggestionTeacherMatch.status === "matched" ? `Use & match ${suggestionTeacherMatch.teacher.name}` : "Use name",
          applyValue: suggestionTeacherMatch.status === "matched" ? suggestionTeacherMatch.teacher.id : null,
        });
        return;
      }

      pushSuggestion({
        field: suggestionField,
        value: suggestion.value,
        confidence: suggestion.confidence,
        reason: suggestion.reason,
        applyLabel: "Apply",
        applyValue: suggestion.value,
      });
    });

    const extractedMetadata = extracted.primary_block?.metadata ?? EMPTY_SOURCE_METADATA;
    (["start_time", "stop_time"] as const).forEach((field) => {
      const rawValue = normalizeOptionalString(extractedMetadata[field]);
      if (rawValue && !normalizeTimeInputValue(rawValue)) {
        pushSuggestion({
          field,
          value: rawValue,
          confidence: 100,
          reason: "This was extracted as primary metadata, but it could not be formatted into the time picker automatically.",
          applyLabel: null,
          applyValue: null,
        });
      }
    });

    return Array.from(nextSuggestions.values()).sort(
      (left, right) => right.confidence - left.confidence || HEADER_FIELD_LABELS[left.field].localeCompare(HEADER_FIELD_LABELS[right.field]) || left.value.localeCompare(right.value)
    );
  }, [className, extracted, headerTeacherName, roomLocation, stopTime, teachers, time]);

  const applyHeaderSuggestion = (suggestion: ManualHeaderSuggestion) => {
    switch (suggestion.field) {
      case "class_list_title":
        setClassName(suggestion.value);
        return;
      case "room_location":
        setRoomLocation(suggestion.value);
        return;
      case "start_time":
        if (suggestion.applyValue) {
          setTime(suggestion.applyValue);
        }
        return;
      case "stop_time":
        if (suggestion.applyValue) {
          setStopTime(suggestion.applyValue);
        }
        return;
      case "teacher_name":
        setHeaderTeacherName(suggestion.value);
        if (suggestion.applyValue) {
          setTeacherSelectionTouched(true);
          setOriginalTeacherId(suggestion.applyValue);
          if (suggestion.applyValue === substituteTeacherId) {
            setSubstituteTeacherId("");
          }
        }
        return;
    }
  };

  const applyExtractionResult = (data: GeminiExtractResult) => {
    const extractedMetadata = data.primary_block?.metadata ?? EMPTY_SOURCE_METADATA;
    const extractedStartTime = normalizeOptionalString(extractedMetadata.start_time);
    const parsedStartTime = normalizeTimeInputValue(extractedStartTime);

    setCreatedListId(null);
    setCreatedSessionId(null);
    setCreatedStudentCount(0);
    setMergedStudentCount(0);
    setCreatedCheckinPath(null);
    setCreatedNewList(true);
    setOriginalTeacherId("");
    setSubstituteEnabled(false);
    setSubstituteTeacherId("");
    setTeacherSelectionTouched(false);
    setExtracted(data);
    setMappings(data.detected_columns.map((column) =>
      UPLOAD_FIELD_MAPPINGS.includes(column.suggested_mapping as UploadFieldMapping)
        ? column.suggested_mapping as UploadFieldMapping
        : "(Ignore)"
    ));
    setClassName(normalizeOptionalString(extractedMetadata.class_list_title));
    setTime(parsedStartTime || (extractedStartTime ? "" : "08:30"));
    setStopTime(normalizeTimeInputValue(extractedMetadata.stop_time));
    setRoomLocation(normalizeOptionalString(extractedMetadata.room_location));
    setHeaderTeacherName(normalizeOptionalString(extractedMetadata.teacher_name));
    setStep(1);
  };

  // ── Upload handler ──────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    const nextFlowId = createFlowId();
    setFlowId(nextFlowId);
    setLoading(true);
    setError(null);
    console.log("[upload-ui] upload start:", {
      flowId: nextFlowId,
      mode: "file",
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || null,
    });
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: form,
        headers: {
          [FLOW_ID_HEADER]: nextFlowId,
        },
      });
      const json = await readApiResponse<UploadApiResponse>(res);
      const resolvedFlowId = normalizeFlowId(json.flow_id) ?? nextFlowId;
      setFlowId(resolvedFlowId);
      if (!res.ok) {
        console.error("[upload-ui] upload request failed:", {
          flowId: resolvedFlowId,
          status: res.status,
          code: json.code ?? null,
          stage: json.stage ?? null,
          error: json.error ?? null,
        });
        setError(getUploadErrorMessage(json));
        setLoading(false);
        return;
      }
      const data = json.data;
      if (!data) {
        setError("Upload succeeded but returned no extracted data.");
        setLoading(false);
        return;
      }
      console.log("[upload-ui] upload success:", {
        flowId: resolvedFlowId,
        namesCount: data.names.length,
        primaryRowsCount: data.primary_block?.rows?.length ?? 0,
        detectedColumnsCount: data.detected_columns.length,
      });
      applyExtractionResult(data);
    } catch (e) {
      console.error("[upload-ui] upload request crashed:", { flowId: nextFlowId, error: e });
      setError(e instanceof Error ? e.message : "Something went wrong while uploading.");
    }
    setLoading(false);
  };

  const handleTextPaste = async (text: string) => {
    const nextFlowId = createFlowId();
    setFlowId(nextFlowId);
    setLoading(true);
    setError(null);
    console.log("[upload-ui] upload start:", {
      flowId: nextFlowId,
      mode: "text",
      textLength: text.length,
    });
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [FLOW_ID_HEADER]: nextFlowId,
        },
        body: JSON.stringify({ text }),
      });
      const json = await readApiResponse<UploadApiResponse>(res);
      const resolvedFlowId = normalizeFlowId(json.flow_id) ?? nextFlowId;
      setFlowId(resolvedFlowId);
      if (!res.ok) {
        console.error("[upload-ui] text upload failed:", {
          flowId: resolvedFlowId,
          status: res.status,
          code: json.code ?? null,
          stage: json.stage ?? null,
          error: json.error ?? null,
        });
        setError(getUploadErrorMessage(json));
        setLoading(false);
        return;
      }
      if (!json.data) {
        setError("Upload succeeded but returned no extracted data.");
        setLoading(false);
        return;
      }
      console.log("[upload-ui] upload success:", {
        flowId: resolvedFlowId,
        namesCount: json.data.names.length,
        primaryRowsCount: json.data.primary_block?.rows?.length ?? 0,
        detectedColumnsCount: json.data.detected_columns.length,
      });
      applyExtractionResult(json.data);
    } catch (e) {
      console.error("[upload-ui] text upload crashed:", { flowId: nextFlowId, error: e });
      setError(e instanceof Error ? e.message : "Upload failed.");
    }
    setLoading(false);
  };

  const handleCreateList = async () => {
    if (!extracted) {
      setError("Upload the roster before creating a list.");
      return;
    }

    if (appendToExisting && !existingListId) {
      setError("Choose an existing list to append this roster into.");
      return;
    }

    setCreating(true);
    setError(null);
    const activeFlowId = flowId ?? createFlowId();
    if (!flowId) {
      setFlowId(activeFlowId);
    }
    console.log("[upload-ui] create-list start:", {
      flowId: activeFlowId,
      mode: appendToExisting ? "append" : "create",
      existingListId: appendToExisting ? existingListId : null,
      namesCount: extracted.names.length,
      primaryRowsCount: extracted.primary_block?.rows?.length ?? 0,
      detectedColumnsCount: extracted.detected_columns.length,
      recurringDaysSelected: days.filter(Boolean).length,
      recurringTime: time,
    });

    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [FLOW_ID_HEADER]: activeFlowId,
        },
        body: JSON.stringify({
          className,
          recurringDays: days,
          recurringTime: time,
          extracted,
          mappings,
          sourceMetadata: appendToExisting ? undefined : {
            class_list_title: className,
            start_time: time,
            stop_time: stopTime,
            room_location: roomLocation,
            teacher_name: headerTeacherName,
          },
          existingListId: appendToExisting ? existingListId : undefined,
          originalTeacherId: appendToExisting ? undefined : originalTeacherId || undefined,
          substituteTeacherId: appendToExisting || !substituteEnabled ? undefined : substituteTeacherId || undefined,
        }),
      });

      const json = await readApiResponse<CreateListApiResponse>(res);
      const resolvedFlowId = normalizeFlowId(json.flow_id) ?? activeFlowId;
      setFlowId(resolvedFlowId);
      if (!res.ok || !json.data?.list_id || !json.data.session_id || !json.data.checkin_path) {
        console.error("[upload-ui] create-list failed:", {
          flowId: resolvedFlowId,
          status: res.status,
          stage: json.stage ?? null,
          code: json.code ?? null,
          diagnosticHint: json.diagnostic_hint ?? null,
          error: json.error ?? null,
        });
        setError(getCreateListErrorMessage(json));
        return;
      }

      const nextCheckinPath = appendFlowIdToPath(json.data.checkin_path, resolvedFlowId);
      console.log("[upload-ui] create-list success:", {
        flowId: resolvedFlowId,
        listId: json.data.list_id,
        sessionId: json.data.session_id,
        checkinPath: nextCheckinPath,
      });

      setCreatedListId(json.data.list_id);
      setCreatedSessionId(json.data.session_id);
      setCreatedStudentCount(json.data.student_count);
      setMergedStudentCount(json.data.merged_student_count ?? 0);
      setCreatedCheckinPath(nextCheckinPath);
      setCreatedNewList(json.data.created_new_list ?? !appendToExisting);
      setStep(3);
    } catch (e) {
      console.error("[upload-ui] list creation crashed:", { flowId: activeFlowId, error: e });
      setError(e instanceof Error ? e.message : "Failed to create the check-in list.");
    } finally {
      setCreating(false);
    }
  };

  const confColor = (n: number) => n >= 88 ? "text-sage-dark bg-sage-light" : n >= 70 ? "text-gold bg-gold-light" : "text-blush bg-blush-light";
  const canAppend = existingLists.length > 0;
  const selectedOriginalTeacher = teachers.find((teacher) => teacher.id === originalTeacherId) ?? null;
  const selectedSubstituteTeacher = teachers.find((teacher) => teacher.id === substituteTeacherId) ?? null;
  const teacherGuidance = useMemo(() => {
    if (appendToExisting) {
      return null;
    }

    if (loadingTeachers) {
      return { tone: "neutral", text: "Loading your organization’s teacher directory…" };
    }

    if (teachers.length === 0) {
      return {
        tone: "neutral",
        text: "No teacher directory records exist yet. Add teachers in Admin → Teachers to use directory-backed assignment.",
      };
    }

    if (extractedTeacherName) {
      if (extractedTeacherMatch.status === "matched") {
        return {
          tone: "success",
          text: `Extracted teacher “${extractedTeacherName}” matched ${extractedTeacherMatch.teacher.name}.`,
        };
      }

      if (extractedTeacherMatch.status === "ambiguous") {
        return {
          tone: "warning",
          text: `Extracted teacher “${extractedTeacherName}” matched multiple teacher records. Please choose the correct original teacher manually.`,
        };
      }

      return {
        tone: "warning",
        text: `Extracted teacher “${extractedTeacherName}” did not map cleanly to the teacher directory, so no teacher was auto-selected.`,
      };
    }

    if (teachers.length === 1 && teachers[0]) {
      return { tone: "neutral", text: `Defaulting to your only teacher record: ${teachers[0].name}.` };
    }

    if (currentUserTeacherMatch) {
      return {
        tone: "neutral",
        text: `Defaulting to ${currentUserTeacherMatch.name} based on your signed-in profile.`,
      };
    }

    return {
      tone: "neutral",
      text: "Choose an original teacher now, or leave it blank and assign one later from the list view.",
    };
  }, [appendToExisting, currentUserTeacherMatch, extractedTeacherMatch, extractedTeacherName, loadingTeachers, teachers]);

  const steps = ["Upload","Map Columns","Schedule","Done"];

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto">
      {/* Step dots */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`rounded-full transition-all duration-300 ${
              i === step ? "w-7 h-2.5 bg-terra" : i < step ? "w-2.5 h-2.5 bg-sage" : "w-2.5 h-2.5 bg-cream-border"
            }`} />
            {i < steps.length - 1 && <div className={`w-5 h-0.5 rounded ${i < step ? "bg-sage" : "bg-cream-border"}`} />}
          </div>
        ))}
        <span className="ml-2 text-xs font-bold text-ink-light">{steps[step]}</span>
      </div>

      {error && (
        <div className="bg-blush-light text-blush text-sm rounded-2xl px-4 py-3 mb-4">{error}</div>
      )}

      {/* ── Step 0: Upload ───────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="animate-float-up">
          <h2 className="font-display font-black text-2xl text-ink tracking-tight mb-2">Upload your roster</h2>
          <p className="text-sm text-ink-light mb-7 leading-relaxed">
            Snap a photo, drag in a spreadsheet, or paste names. Gemini AI will extract everything.
          </p>

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-14 text-center cursor-pointer transition-all mb-4
              ${dragging ? "border-terra bg-terra-light" : "border-cream-border bg-parchment hover:border-terra hover:bg-terra-light/30"}`}>
            <input ref={fileRef} type="file" className="hidden"
              accept="image/*,application/pdf,.csv,.xlsx,.xls,.txt"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {loading ? (
              <div className="text-ink-light text-sm">
                <div className="text-4xl mb-3 animate-spin">⏳</div>
                Extracting names with Gemini AI…
              </div>
            ) : (
              <>
                <div className="text-5xl mb-3">📄</div>
                <p className="font-bold text-ink mb-1">Drop your file here</p>
                <p className="text-xs text-ink-light">PDF · Excel · CSV · JPG · PNG</p>
                <div className="mt-5">
                  <span className="btn-primary px-5 py-2 text-sm inline-block">Browse files</span>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { emoji: "📸", title: "Snap a photo",  desc: "Point your camera at a paper list" },
              { emoji: "📋", title: "Paste names",   desc: "Type or paste one name per line" },
            ].map(o => (
              <button key={o.title} onClick={() => {
                if (o.title === "Paste names") {
                  const t = window.prompt("Paste your list (one name per line):");
                  if (t) handleTextPaste(t);
                } else {
                  fileRef.current?.click();
                }
              }}
                className="bg-white border border-cream-border rounded-2xl p-5 cursor-pointer flex items-center gap-4
                           hover:border-terra hover:shadow-warm transition-all text-left">
                <span className="text-3xl">{o.emoji}</span>
                <div>
                  <p className="text-sm font-bold text-ink">{o.title}</p>
                  <p className="text-xs text-ink-light">{o.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 1: Map columns ──────────────────────────────────────────── */}
      {step === 1 && extracted && (
        <div className="animate-float-up">
          <h2 className="font-display font-black text-2xl text-ink tracking-tight mb-2">Map your columns</h2>
          <p className="text-sm text-ink-light mb-6 leading-relaxed">
            We found <strong>{extracted.names.length} names</strong> and these columns. Confirm or reassign each one.
          </p>

          <div className="card overflow-hidden mb-5">
            <div className="grid grid-cols-[1fr_24px_1fr_72px] gap-3 px-5 py-3 bg-parchment border-b border-cream-border text-xs font-bold uppercase tracking-widest text-ink-light">
              <span>In your file</span><span /><span>Maps to</span><span>Match</span>
            </div>
            {extracted.detected_columns.map((col, i) => (
              <div key={i} className="grid grid-cols-[1fr_24px_1fr_72px] gap-3 px-5 py-3.5 border-b border-cream-border last:border-0 items-center">
                <span className="text-sm font-semibold text-ink">{col.header}</span>
                <span className="text-terra text-center">→</span>
                <select value={mappings[i] ?? col.suggested_mapping}
                  onChange={e => setMappings(m => m.map((v, j) => j === i ? e.target.value as UploadFieldMapping : v))}
                  className="input-warm py-2 text-sm">
                  {UPLOAD_FIELD_MAPPINGS.map(o => <option key={o}>{o}</option>)}
                </select>
                <div className="pl-2">
                  <span className={`text-xs font-bold rounded-lg px-2 py-1 ${confColor(col.confidence)}`}>
                    {col.confidence}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-terra-light border border-terra/30 rounded-2xl px-5 py-3.5 text-sm text-terra-dark mb-6">
            💡 <strong>Admin tip:</strong> Custom columns you've defined in Admin → Custom Columns will also appear automatically.
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="btn-primary px-6 py-3 text-sm">Looks good →</button>
            <button onClick={() => setStep(0)} className="btn-ghost px-5 py-3 text-sm">← Back</button>
          </div>
        </div>
      )}

      {/* ── Step 2: Schedule ─────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="animate-float-up space-y-5">
          <h2 className="font-display font-black text-2xl text-ink tracking-tight mb-2">Set your schedule</h2>
          <p className="text-sm text-ink-light leading-relaxed">
            {appendToExisting
              ? "Append this uploaded roster into an existing real list and open today’s real check-in session for that list."
              : "Save the recurring schedule on this list and open a real check-in session for today."}
          </p>

          <div>
            <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-3">Save Mode</label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={() => setAppendToExisting(false)}
                className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                  !appendToExisting ? "border-terra bg-terra-light" : "border-cream-border bg-white hover:border-terra/40"
                }`}
              >
                <p className="text-sm font-bold text-ink">Create new list</p>
                <p className="mt-1 text-xs text-ink-light">Use the uploaded roster to create a brand-new check-in list.</p>
              </button>
              <button
                onClick={() => canAppend && setAppendToExisting(true)}
                disabled={!canAppend}
                className={`rounded-2xl border px-4 py-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                  appendToExisting ? "border-sage bg-sage-light" : "border-cream-border bg-white hover:border-sage/40"
                }`}
              >
                <p className="text-sm font-bold text-ink">Append to existing list</p>
                <p className="mt-1 text-xs text-ink-light">
                  {canAppend ? "Merge duplicate names conservatively and only add new students when the evidence is safe." : "Create a list first before using append mode."}
                </p>
              </button>
            </div>
          </div>

          {appendToExisting ? (
            <div>
              <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">Existing List</label>
              <select
                value={existingListId}
                onChange={e => setExistingListId(e.target.value)}
                className="input-warm"
                disabled={loadingLists}
              >
                <option value="">{loadingLists ? "Loading lists…" : "Select an existing list"}</option>
                {existingLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name} · {new Date(list.created_at).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-sky/30 bg-sky-light/50 px-5 py-4 text-sm text-sky">
                We autofilled only the header details Gemini marked as obvious in the selected primary roster block. Review them below, and use any manual-apply suggestions for the ambiguous leftovers.
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">Class / Event Name</label>
                  <input value={className} onChange={e => setClassName(e.target.value)}
                    placeholder="e.g. 3rd Grade · Room 12"
                    className="input-warm" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">Start Time</label>
                  <input type="time" value={time} onChange={e => setTime(e.target.value)}
                    className="input-warm" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">Stop Time</label>
                  <input type="time" value={stopTime} onChange={e => setStopTime(e.target.value)}
                    className="input-warm" />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">Room / Location</label>
                  <input value={roomLocation} onChange={e => setRoomLocation(e.target.value)}
                    placeholder="e.g. Room 12"
                    className="input-warm" />
                </div>
              </div>

              {manualHeaderSuggestions.length > 0 && (
                <div className="card p-5 space-y-4">
                  <div>
                    <p className="text-xs font-bold text-ink-light uppercase tracking-widest">Manual-apply header suggestions</p>
                    <p className="mt-1 text-sm text-ink-light leading-relaxed">
                      Gemini preserved these candidates for review instead of forcing them into a header field.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {manualHeaderSuggestions.map((suggestion) => (
                      <div key={suggestion.id} className="rounded-2xl border border-cream-border bg-white px-4 py-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-lg bg-parchment px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-ink-light">
                                {HEADER_FIELD_LABELS[suggestion.field]}
                              </span>
                              <span className={`text-xs font-bold rounded-lg px-2 py-1 ${confColor(suggestion.confidence)}`}>
                                {suggestion.confidence}%
                              </span>
                            </div>
                            <p className="mt-2 text-sm font-bold text-ink">{suggestion.value}</p>
                            <p className="mt-1 text-xs text-ink-light leading-relaxed">{suggestion.reason}</p>
                          </div>

                          {suggestion.applyLabel ? (
                            <button
                              type="button"
                              onClick={() => applyHeaderSuggestion(suggestion)}
                              className="btn-ghost whitespace-nowrap px-3.5 py-2 text-xs"
                            >
                              {suggestion.applyLabel}
                            </button>
                          ) : (
                            <span className="text-xs text-ink-light md:text-right">Review manually</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-3">Recurring Days</label>
                <div className="flex gap-2">
                  {DAY_LABELS.map((d, i) => (
                    <button key={d} onClick={() => setDays(ds => ds.map((v, j) => j === i ? !v : v))}
                      className={`w-12 h-12 rounded-2xl font-black text-xs transition-all duration-200
                        ${days[i] ? "bg-terra-light border-2 border-terra text-terra scale-105 shadow-terra/30 shadow-md" : "bg-white border border-cream-border text-ink-light hover:border-terra/50"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="card p-5 space-y-4">
                <div>
                  <p className="text-xs font-bold text-ink-light uppercase tracking-widest">Teacher Assignment</p>
                  <p className="mt-1 text-sm text-ink-light">
                    Choose the original teacher for this list, and optionally a substitute teacher for today’s displayed staffing.
                  </p>
                </div>

                {teacherGuidance && (
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm ${
                      teacherGuidance.tone === "warning"
                        ? "bg-gold-light text-gold-dark"
                        : teacherGuidance.tone === "success"
                          ? "bg-sage-light text-sage-dark"
                          : "bg-parchment text-ink-light"
                    }`}
                  >
                    {teacherGuidance.text}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">Roster Teacher Name</label>
                  <input
                    value={headerTeacherName}
                    onChange={e => setHeaderTeacherName(e.target.value)}
                    placeholder="e.g. Ms. Rivera"
                    className="input-warm"
                  />
                  <p className="mt-2 text-xs text-ink-light leading-relaxed">
                    This preserves the uploaded teacher metadata in the list header even when no safe directory match is confirmed.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">Original Teacher</label>
                  <select
                    value={originalTeacherId}
                    onChange={e => {
                      const nextTeacherId = e.target.value;
                      setTeacherSelectionTouched(true);
                      setOriginalTeacherId(nextTeacherId);
                      if (!nextTeacherId || nextTeacherId === substituteTeacherId) {
                        setSubstituteTeacherId("");
                      }
                    }}
                    className="input-warm"
                    disabled={loadingTeachers || teachers.length === 0}
                  >
                    <option value="">
                      {loadingTeachers ? "Loading teachers…" : teachers.length === 0 ? "No teachers in directory yet" : "Select original teacher"}
                    </option>
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.name}
                      </option>
                    ))}
                  </select>
                </div>

                <label className={`flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 ${originalTeacherId ? "border-terra/30 bg-terra-light/40" : "border-cream-border bg-white"}`}>
                  <div>
                    <p className="text-sm font-bold text-ink">Use substitute teacher</p>
                    <p className="mt-1 text-xs text-ink-light">
                      Keep the original teacher visible while highlighting the substitute teacher in the live list header.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={substituteEnabled}
                    onChange={e => {
                      const checked = e.target.checked;
                      setTeacherSelectionTouched(true);
                      setSubstituteEnabled(checked);
                      if (!checked) {
                        setSubstituteTeacherId("");
                      }
                    }}
                    disabled={!originalTeacherId}
                    className="mt-1 h-4 w-4 rounded border-cream-border text-terra focus:ring-terra"
                  />
                </label>

                {substituteEnabled && (
                  <div>
                    <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">Substitute Teacher</label>
                    <select
                      value={substituteTeacherId}
                      onChange={e => {
                        setTeacherSelectionTouched(true);
                        setSubstituteTeacherId(e.target.value);
                      }}
                      className="input-warm"
                      disabled={loadingTeachers || teachers.length <= 1}
                    >
                      <option value="">
                        {teachers.length <= 1 ? "Add another teacher record first" : "Select substitute teacher"}
                      </option>
                      {teachers.filter((teacher) => teacher.id !== originalTeacherId).map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {(selectedOriginalTeacher || selectedSubstituteTeacher || extractedTeacherName) && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {selectedSubstituteTeacher && (
                      <div className="rounded-2xl border border-terra/30 bg-terra-light px-4 py-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-terra-dark">Substitute Teacher</p>
                        <p className="mt-2 text-base font-black text-ink">{selectedSubstituteTeacher.name}</p>
                        <div className="mt-1 space-y-0.5 text-xs text-ink-light">
                          <p>{selectedSubstituteTeacher.email || "No email saved"}</p>
                          <p>{selectedSubstituteTeacher.phone || "No phone saved"}</p>
                        </div>
                      </div>
                    )}

                    {(selectedOriginalTeacher || extractedTeacherName) && (
                      <div className={`rounded-2xl border px-4 py-4 ${selectedSubstituteTeacher ? "border-cream-border bg-parchment text-ink-light" : "border-sky/30 bg-sky-light/60 text-ink"}`}>
                        <p className="text-xs font-bold uppercase tracking-widest">Original Teacher</p>
                        <p className="mt-2 text-base font-black text-ink">
                          {selectedOriginalTeacher?.name ?? extractedTeacherName}
                        </p>
                        <div className="mt-1 space-y-0.5 text-xs">
                          <p>{selectedOriginalTeacher?.email || (selectedOriginalTeacher ? "No email saved" : "Directory match not confirmed")}</p>
                          <p>{selectedOriginalTeacher?.phone || (selectedOriginalTeacher ? "No phone saved" : "Using extracted teacher metadata only")}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {days.some(Boolean) && (
                <div className="bg-sage-light border border-sage/30 rounded-2xl px-5 py-4">
                  <p className="text-xs font-bold text-sage-dark mb-1">📅 Recurring schedule</p>
                  <p className="text-sm text-sage-dark">
                    {DAY_LABELS.filter((_, i) => days[i]).join(" · ")} at {time || "—"}
                    {stopTime ? ` until ${stopTime}` : ""}
                    {roomLocation ? ` · ${roomLocation}` : ""}
                  </p>
                </div>
              )}
            </>
          )}

          <div className="flex gap-3">
            <button onClick={handleCreateList} disabled={(appendToExisting ? !existingListId : !className) || creating}
              className="btn-primary px-6 py-3 text-sm disabled:opacity-50">
              {creating ? (appendToExisting ? "Appending roster…" : "Creating check-in list…") : appendToExisting ? "Append roster →" : "Create check-in list →"}
            </button>
            <button onClick={() => setStep(1)} className="btn-ghost px-5 py-3 text-sm">← Back</button>
          </div>
        </div>
      )}

      {/* ── Step 3: Done ─────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="animate-float-up text-center py-8">
          <div className="text-6xl mb-5">✅</div>
          <h2 className="font-display font-black text-3xl text-ink tracking-tight mb-3">{createdNewList ? `${className} is ready!` : "Roster appended successfully!"}</h2>
          <p className="text-sm text-ink-light mb-8 leading-relaxed">
            {createdStudentCount} students saved{mergedStudentCount > 0 ? ` · ${mergedStudentCount} duplicate rows merged` : ""} · {extracted?.detected_columns.length ?? 0} columns mapped
            {!appendToExisting ? <><br />Recurring {DAY_LABELS.filter((_, i) => days[i]).join(" · ")} at {time}</> : null}
            {createdListId ? <><br />Real list ID: {createdListId}</> : null}
            {createdSessionId ? <><br />Real session ID: {createdSessionId}</> : null}
          </p>

          <div className="bg-terra-light rounded-2xl p-5 text-left mb-8 max-w-sm mx-auto">
            <p className="text-xs font-bold text-terra-dark mb-3">What happens next</p>
            {[
              createdNewList ? "Recurring schedule is saved on the real list" : "The selected existing list kept its current schedule and metadata",
              createdNewList ? "A real session row now exists for today's check-in" : "A real session row now exists (or was reused) for today’s check-in",
              "Check-in now loads the real roster from these list/session IDs",
            ].map((t, i) => (
              <div key={i} className="flex gap-2.5 mb-2 last:mb-0">
                <span className="text-terra font-black">→</span>
                <span className="text-sm text-ink-mid">{t}</span>
              </div>
            ))}
          </div>

          <button onClick={() => {
            console.log("[upload-ui] navigate to check-in:", {
              flowId,
              checkinPath: createdCheckinPath ?? "/dashboard/checkin",
            });
            router.push(createdCheckinPath ?? "/dashboard/checkin");
          }}
            className="btn-primary px-10 py-4 text-base">
            Open Check-in Screen →
          </button>
        </div>
      )}
    </div>
  );
}
