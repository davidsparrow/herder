import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  FLOW_ID_HEADER,
  getSchemaDriftDiagnosticFromStrings,
  getSchemaDriftUserMessage,
  normalizeFlowId,
} from "@/lib/flow-diagnostics";
import { canCreateList } from "@/lib/plans";
import {
  buildCustomColumnsFromKeys,
  buildMappedCustomFieldKeys,
  buildSourceMetadataFromExtraction,
  buildStudentDraftsFromExtraction,
  getNextStudentUid,
  mergeSourceMetadata,
  mergeStudentDrafts,
  normalizeStudentNameKey,
  type PersistedStudentDraft,
} from "@/lib/roster-persistence";
import {
  UPLOAD_FIELD_MAPPINGS,
  type CustomColumn,
  type CheckinListSourceMetadata,
  type DetectedColumn,
  type GeminiExtractResult,
  type Student,
  type UploadFieldMapping,
} from "@/lib/types";

const UI_DAY_TO_SCHEMA_DAY = [1, 2, 3, 4, 5, 6, 0] as const;

type CreateListRequestBody = {
  className?: string;
  recurringDays?: boolean[];
  recurringTime?: string;
  extracted?: GeminiExtractResult;
  mappings?: string[];
  sourceMetadata?: Partial<CheckinListSourceMetadata>;
  existingListId?: string;
  originalTeacherId?: string;
  substituteTeacherId?: string;
};

type ExistingStudentRow = Pick<Student, "id" | "uid" | "name" | "first_name" | "last_name" | "custom_data">;

type ListStage =
  | "profile-lookup"
  | "count-lists"
  | "insert-list"
  | "insert-students"
  | "update-students"
  | "append-students"
  | "update-list-metadata"
  | "upsert-session"
  | "lookup-existing-list"
  | "lookup-existing-students"
  | "rollback-created-list";

function serializeListError(error: unknown) {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = typeof record.message === "string" ? record.message : error instanceof Error ? error.message : null;
  const details = typeof record.details === "string" ? record.details : null;
  const hint = typeof record.hint === "string" ? record.hint : null;
  const code = typeof record.code === "string" ? record.code : null;
  const schemaDrift = getSchemaDriftDiagnosticFromStrings(message, details, hint);

  return {
    code,
    message,
    details,
    hint,
    schemaDrift,
  };
}

function getSafeListFailureMessage(
  serializedError: ReturnType<typeof serializeListError>,
  fallback: string,
  partialPersistenceHint?: string | null,
) {
  const schemaDriftMessage = getSchemaDriftUserMessage("List persistence", serializedError.schemaDrift);
  const baseMessage = schemaDriftMessage ?? serializedError.message ?? fallback;

  if (partialPersistenceHint) {
    return `${baseMessage} ${partialPersistenceHint}`;
  }

  return baseMessage;
}

function getListFailureCode(partialPersistenceHint?: string | null) {
  return partialPersistenceHint ? "LIST_PERSISTENCE_PARTIAL" : "LIST_PERSISTENCE_FAILED";
}

function isUploadFieldMapping(value: unknown): value is UploadFieldMapping {
  return typeof value === "string" && UPLOAD_FIELD_MAPPINGS.includes(value as UploadFieldMapping);
}

function normalizeUploadFieldMapping(value: unknown): UploadFieldMapping | null {
  if (value === "Pickup Location") {
    return "Pickup Notes-pre";
  }

  if (value === "Drop-off Location") {
    return "Pickup Notes-post";
  }

  return isUploadFieldMapping(value) ? value : null;
}

function normalizeTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableTrimmedString(value: unknown) {
  const trimmed = normalizeTrimmedString(value);
  return trimmed || null;
}

function normalizeRecurringDays(value: unknown) {
  if (!Array.isArray(value) || value.length !== 7 || value.some((day) => typeof day !== "boolean")) {
    return null;
  }

  return value as boolean[];
}

function normalizeRecurringTime(value: unknown) {
  const trimmed = normalizeTrimmedString(value);
  return trimmed || null;
}

function normalizeSourceMetadata(value: unknown): Partial<CheckinListSourceMetadata> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const record = value as Record<string, unknown>;
  const next: Partial<CheckinListSourceMetadata> = {};

  if (Object.prototype.hasOwnProperty.call(record, "class_list_title")) {
    next.class_list_title = normalizeTrimmedString(record.class_list_title);
  }
  if (Object.prototype.hasOwnProperty.call(record, "start_time")) {
    next.start_time = normalizeTrimmedString(record.start_time);
  }
  if (Object.prototype.hasOwnProperty.call(record, "stop_time")) {
    next.stop_time = normalizeTrimmedString(record.stop_time);
  }
  if (Object.prototype.hasOwnProperty.call(record, "room_location")) {
    next.room_location = normalizeTrimmedString(record.room_location);
  }
  if (Object.prototype.hasOwnProperty.call(record, "teacher_name")) {
    next.teacher_name = normalizeTrimmedString(record.teacher_name);
  }

  return next;
}

function normalizeExtracted(value: unknown): GeminiExtractResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const extracted = value as GeminiExtractResult;
  if (!Array.isArray(extracted.names) || !Array.isArray(extracted.detected_columns) || typeof extracted.raw_text !== "string") {
    return null;
  }

  return extracted;
}

function normalizeDetectedColumns(columns: DetectedColumn[]) {
  return columns.map((column) => ({
    header: typeof column.header === "string" ? column.header.trim() : "",
    sample_values: Array.isArray(column.sample_values)
      ? column.sample_values.filter((value): value is string => typeof value === "string")
      : [],
    suggested_mapping: typeof column.suggested_mapping === "string" ? column.suggested_mapping : "(Ignore)",
    confidence: typeof column.confidence === "number" ? column.confidence : 0,
    values: Array.isArray(column.values)
      ? column.values.filter((value): value is string => typeof value === "string")
      : [],
  }));
}

function normalizeCustomColumns(value: unknown): CustomColumn[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((column) => {
    if (!column || typeof column !== "object") {
      return [];
    }

    const record = column as Record<string, unknown>;
    const id = normalizeTrimmedString(record.id);
    const name = normalizeTrimmedString(record.name);
    const type = record.type;

    if (!id || !name || (type !== "text" && type !== "phone" && type !== "select" && type !== "boolean")) {
      return [];
    }

    return [{
      id,
      name,
      type,
      required: Boolean(record.required),
      global: Boolean(record.global),
      options: Array.isArray(record.options) ? record.options.filter((option): option is string => typeof option === "string") : undefined,
    } satisfies CustomColumn];
  });
}

function getSelectedRecurringDays(recurringDays: boolean[]) {
  return recurringDays.flatMap((selected, index) => (selected ? [UI_DAY_TO_SCHEMA_DAY[index]] : []));
}

function getSelectedMapping(column: DetectedColumn, mapping: unknown): UploadFieldMapping {
  const selectedMapping = normalizeUploadFieldMapping(mapping);
  if (selectedMapping) {
    return selectedMapping;
  }

  return normalizeUploadFieldMapping(column.suggested_mapping) ?? "(Ignore)";
}

function draftFromStudent(student: ExistingStudentRow): PersistedStudentDraft {
  return {
    name: student.name,
    first_name: student.first_name,
    last_name: student.last_name,
    custom_data: { ...student.custom_data },
  };
}

function mergeCustomColumns(existing: CustomColumn[], incomingKeys: Iterable<string>) {
  const merged = [...existing];
  const seen = new Set(existing.map((column) => column.id));

  buildCustomColumnsFromKeys(incomingKeys).forEach((column) => {
    if (!seen.has(column.id)) {
      seen.add(column.id);
      merged.push(column);
    }
  });

  return merged;
}

function mergeIncomingStudents(existingStudents: ExistingStudentRow[], incomingStudents: PersistedStudentDraft[]) {
  const entries = new Map<string, { source: "existing" | "incoming"; student: PersistedStudentDraft; id?: string; uid?: string }>();
  const conflictNames = new Set<string>();
  const updatedStudents = new Map<string, Pick<ExistingStudentRow, "id"> & PersistedStudentDraft>();
  let mergedCount = 0;

  existingStudents.forEach((student) => {
    const key = normalizeStudentNameKey(student.name);
    if (!key) {
      return;
    }

    if (entries.has(key)) {
      conflictNames.add(student.name);
      return;
    }

    entries.set(key, { source: "existing", student: draftFromStudent(student), id: student.id, uid: student.uid });
  });

  incomingStudents.forEach((incomingStudent) => {
    const key = normalizeStudentNameKey(incomingStudent.name);
    if (!key) {
      return;
    }

    const existingEntry = entries.get(key);
    if (!existingEntry) {
      entries.set(key, { source: "incoming", student: incomingStudent });
      return;
    }

    const { merged, conflicts } = mergeStudentDrafts(existingEntry.student, incomingStudent);
    if (conflicts.length > 0) {
      conflictNames.add(existingEntry.student.name || incomingStudent.name);
      return;
    }

    mergedCount += 1;
    existingEntry.student = merged;

    if (existingEntry.source === "existing" && existingEntry.id) {
      updatedStudents.set(existingEntry.id, { id: existingEntry.id, ...merged });
    }
  });

  return {
    newStudents: Array.from(entries.values()).filter((entry) => entry.source === "incoming").map((entry) => entry.student),
    updatedStudents: Array.from(updatedStudents.values()),
    mergedCount,
    conflictNames: Array.from(conflictNames),
  };
}

async function upsertTodaySession(supabase: ReturnType<typeof createClient>, listId: string) {
  const sessionDate = new Date().toISOString().slice(0, 10);
  return supabase
    .from("checkin_sessions")
    .upsert({ list_id: listId, session_date: sessionDate }, { onConflict: "list_id,session_date" })
    .select("id, list_id, session_date")
    .single();
}

async function validateTeacherIds(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  originalTeacherId: string | null,
  substituteTeacherId: string | null
) {
  if (substituteTeacherId && !originalTeacherId) {
    return {
      error: "Select an original teacher before assigning a substitute.",
      code: null,
      diagnosticHint: null,
      status: 400,
    };
  }

  if (originalTeacherId && substituteTeacherId && originalTeacherId === substituteTeacherId) {
    return {
      error: "Original teacher and substitute teacher must be different people.",
      code: null,
      diagnosticHint: null,
      status: 400,
    };
  }

  const teacherIds = [originalTeacherId, substituteTeacherId].filter((value): value is string => Boolean(value));
  if (teacherIds.length === 0) {
    return {
      error: null,
      code: null,
      diagnosticHint: null,
      status: 400,
    };
  }

  const { data, error } = await supabase
    .from("teachers")
    .select("id")
    .eq("org_id", orgId)
    .in("id", teacherIds);

  if (error) {
    const serializedError = serializeListError(error);
    return {
      error: getSafeListFailureMessage(serializedError, "Failed to validate the selected teachers before saving the real list."),
      code: getListFailureCode(),
      diagnosticHint: serializedError.schemaDrift.reason,
      status: 500,
    };
  }

  const validIds = new Set((data ?? []).map((teacher) => String(teacher.id)));
  return {
    error: teacherIds.some((teacherId) => !validIds.has(teacherId))
      ? "Choose teachers from your organization directory only."
      : null,
    code: null,
    diagnosticHint: null,
    status: 400,
  };
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const admin = createServiceClient();
  const flowId = normalizeFlowId(req.headers.get(FLOW_ID_HEADER)) ?? randomUUID();
  const vercelRequestId = req.headers.get("x-vercel-id") ?? null;
  const appendPartialPersistenceHint = "Some roster changes may already be saved to the selected list. Review the live list before retrying so you do not duplicate or overwrite data.";

  const rollbackCreatedList = async (listId: string) => {
    const { error: rollbackError } = await admin.from("checkin_lists").delete().eq("id", listId);
    if (rollbackError) {
      const serializedError = serializeListError(rollbackError);
      console.error("[lists] request failed:", {
        flowId,
        vercelRequestId,
        stage: "rollback-created-list" satisfies ListStage,
        listId,
        error: serializedError,
      });
      return serializedError;
    }

    return null;
  };

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || authError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("org_id, plan_tier")
    .eq("id", user.id)
    .single();

  if (profileError) {
    const serializedError = serializeListError(profileError);
    console.error("[lists] request failed:", {
      flowId,
      vercelRequestId,
      userId: user.id,
      stage: "profile-lookup" satisfies ListStage,
      error: serializedError,
    });
    return NextResponse.json(
      {
        error: getSafeListFailureMessage(serializedError, "Failed to load the user profile for list persistence."),
        code: "LIST_PERSISTENCE_FAILED",
        stage: "profile-lookup",
        flow_id: flowId,
        diagnostic_hint: serializedError.schemaDrift.reason,
      },
      { status: 500 }
    );
  }

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const body = await req.json() as CreateListRequestBody;
  const className = normalizeTrimmedString(body.className);
  const existingListId = normalizeTrimmedString(body.existingListId);
  const originalTeacherId = normalizeNullableTrimmedString(body.originalTeacherId);
  const substituteTeacherId = normalizeNullableTrimmedString(body.substituteTeacherId);
  const recurringDays = normalizeRecurringDays(body.recurringDays);
  const recurringTime = normalizeRecurringTime(body.recurringTime);
  const extracted = normalizeExtracted(body.extracted);
  const requestedSourceMetadata = normalizeSourceMetadata(body.sourceMetadata);
  const rawMappings = Array.isArray(body.mappings) ? body.mappings : [];
  const mode = existingListId ? "append" : "create";

  if (!extracted) {
    return NextResponse.json({ error: "Extracted roster data is missing." }, { status: 400 });
  }

  const detectedColumns = normalizeDetectedColumns(extracted.detected_columns);
  const selectedMappings = detectedColumns.map((column, index) => getSelectedMapping(column, rawMappings[index]));
  const incomingStudents = buildStudentDraftsFromExtraction(extracted, detectedColumns, selectedMappings);
  if (!incomingStudents.length) {
    return NextResponse.json({ error: "No student names were available to save." }, { status: 400 });
  }

  const mappedCustomColumnKeys = buildMappedCustomFieldKeys(selectedMappings);
  const incomingCustomColumnKeys = new Set([
    ...Array.from(mappedCustomColumnKeys),
    ...incomingStudents.flatMap((student) => Object.keys(student.custom_data)),
  ]);
  const extractedSourceMetadata = buildSourceMetadataFromExtraction(extracted);
  const sourceMetadata: CheckinListSourceMetadata = {
    ...extractedSourceMetadata,
    class_list_title: className || requestedSourceMetadata.class_list_title || extractedSourceMetadata.class_list_title,
    start_time: Object.prototype.hasOwnProperty.call(requestedSourceMetadata, "start_time") ? requestedSourceMetadata.start_time ?? "" : extractedSourceMetadata.start_time,
    stop_time: Object.prototype.hasOwnProperty.call(requestedSourceMetadata, "stop_time") ? requestedSourceMetadata.stop_time ?? "" : extractedSourceMetadata.stop_time,
    room_location: Object.prototype.hasOwnProperty.call(requestedSourceMetadata, "room_location") ? requestedSourceMetadata.room_location ?? "" : extractedSourceMetadata.room_location,
    teacher_name: Object.prototype.hasOwnProperty.call(requestedSourceMetadata, "teacher_name") ? requestedSourceMetadata.teacher_name ?? "" : extractedSourceMetadata.teacher_name,
    default_pickup_drop_location: extractedSourceMetadata.default_pickup_drop_location,
  };

  console.log("[lists] request start:", {
    flowId,
    vercelRequestId,
    userId: user.id,
    orgId: profile.org_id,
    mode,
    classNameProvided: Boolean(className),
    existingListId: existingListId || null,
    namesCount: extracted.names.length,
    primaryRowsCount: extracted.primary_block?.rows?.length ?? 0,
    detectedColumnsCount: detectedColumns.length,
    recurringDaysSelected: recurringDays?.filter(Boolean).length ?? null,
    recurringTime,
    customColumnCount: incomingCustomColumnKeys.size,
    originalTeacherSelected: Boolean(originalTeacherId),
    substituteTeacherSelected: Boolean(substituteTeacherId),
  });

  if (!existingListId) {
    const teacherValidation = await validateTeacherIds(supabase, profile.org_id, originalTeacherId, substituteTeacherId);
    if (teacherValidation.error) {
      return NextResponse.json(
        {
          error: teacherValidation.error,
          code: teacherValidation.code,
          flow_id: flowId,
          diagnostic_hint: teacherValidation.diagnosticHint,
        },
        { status: teacherValidation.status },
      );
    }

    if (!className) {
      return NextResponse.json({ error: "Class / Event Name is required." }, { status: 400 });
    }

    if (!recurringDays) {
      return NextResponse.json({ error: "Recurring days are invalid." }, { status: 400 });
    }

    const { count, error: countError } = await supabase
      .from("checkin_lists")
      .select("*", { count: "exact", head: true })
      .eq("org_id", profile.org_id)
      .eq("archived", false);

    if (countError) {
      const serializedError = serializeListError(countError);
      console.error("[lists] request failed:", {
        flowId,
        vercelRequestId,
        orgId: profile.org_id,
        mode,
        stage: "count-lists" satisfies ListStage,
        error: serializedError,
      });
      return NextResponse.json(
        {
          error: getSafeListFailureMessage(serializedError, "Failed to count existing lists before creating a new one."),
          code: "LIST_PERSISTENCE_FAILED",
          stage: "count-lists",
          flow_id: flowId,
          diagnostic_hint: serializedError.schemaDrift.reason,
        },
        { status: 500 }
      );
    }

    const gate = canCreateList(profile.plan_tier, count ?? 0);
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.reason, code: "PLAN_LIMIT" }, { status: 402 });
    }

    const mergeResult = mergeIncomingStudents([], incomingStudents);
    console.log("[lists/create] merge summary:", {
      flowId,
      incomingStudentsCount: incomingStudents.length,
      newStudentsCount: mergeResult.newStudents.length,
      mergedCount: mergeResult.mergedCount,
      conflictCount: mergeResult.conflictNames.length,
    });
    if (mergeResult.conflictNames.length) {
      return NextResponse.json(
        { error: `Duplicate student rows conflicted and could not be merged honestly: ${mergeResult.conflictNames.join(", ")}.` },
        { status: 409 }
      );
    }

    const { data: createdList, error: listError } = await supabase
      .from("checkin_lists")
      .insert({
        org_id: profile.org_id,
        name: className,
        created_by: user.id,
        recurring_days: getSelectedRecurringDays(recurringDays),
        recurring_time: recurringTime,
        custom_columns: buildCustomColumnsFromKeys(incomingCustomColumnKeys),
        source_metadata: sourceMetadata,
        original_teacher_id: originalTeacherId,
        substitute_teacher_id: substituteTeacherId,
      })
      .select("id")
      .single();

    if (listError || !createdList) {
      const serializedError = serializeListError(listError);
      console.error("[lists] request failed:", {
        flowId,
        vercelRequestId,
        orgId: profile.org_id,
        mode,
        stage: "insert-list" satisfies ListStage,
        error: serializedError,
      });
      return NextResponse.json(
        {
          error: getSafeListFailureMessage(serializedError, "Failed to create the real check-in list."),
          code: "LIST_PERSISTENCE_FAILED",
          stage: "insert-list",
          flow_id: flowId,
          diagnostic_hint: serializedError.schemaDrift.reason,
        },
        { status: 500 }
      );
    }

    console.log("[lists/create] list inserted:", { flowId, listId: createdList.id });

    const usedUids: string[] = [];
    const studentsToInsert = mergeResult.newStudents.map((student) => {
      const uid = getNextStudentUid(usedUids);
      usedUids.push(uid);
      return { ...student, uid, list_id: createdList.id };
    });

    const { data: createdStudents, error: studentsError } = await supabase
      .from("students")
      .insert(studentsToInsert)
      .select("id");

    if (studentsError) {
      const serializedError = serializeListError(studentsError);
      console.error("[lists] request failed:", {
        flowId,
        vercelRequestId,
        listId: createdList.id,
        mode,
        stage: "insert-students" satisfies ListStage,
        studentsAttempted: studentsToInsert.length,
        error: serializedError,
      });
      const rollbackError = await rollbackCreatedList(createdList.id);
      const partialPersistenceHint = rollbackError
        ? "Rollback did not complete cleanly, so some list data may already exist in the database. Review the live data before retrying."
        : null;
      return NextResponse.json(
        {
          error: getSafeListFailureMessage(serializedError, "Failed to save the extracted student roster.", partialPersistenceHint),
          code: getListFailureCode(partialPersistenceHint),
          stage: "insert-students",
          flow_id: flowId,
          diagnostic_hint: serializedError.schemaDrift.reason,
        },
        { status: 500 }
      );
    }

    console.log("[lists/create] students inserted:", {
      flowId,
      listId: createdList.id,
      createdStudentCount: createdStudents?.length ?? 0,
    });

    const { data: createdSession, error: sessionError } = await upsertTodaySession(supabase, createdList.id);
    if (sessionError || !createdSession) {
      const serializedError = serializeListError(sessionError);
      console.error("[lists] request failed:", {
        flowId,
        vercelRequestId,
        listId: createdList.id,
        mode,
        stage: "upsert-session" satisfies ListStage,
        error: serializedError,
      });
      const rollbackError = await rollbackCreatedList(createdList.id);
      const partialPersistenceHint = rollbackError
        ? "Rollback did not complete cleanly, so some list data may already exist in the database. Review the live data before retrying."
        : null;
      return NextResponse.json(
        {
          error: getSafeListFailureMessage(serializedError, "Failed to create the real check-in session.", partialPersistenceHint),
          code: getListFailureCode(partialPersistenceHint),
          stage: "upsert-session",
          flow_id: flowId,
          diagnostic_hint: serializedError.schemaDrift.reason,
        },
        { status: 500 }
      );
    }

    console.log("[lists/create] session ready:", { flowId, listId: createdList.id, sessionId: createdSession.id });

    return NextResponse.json({
      success: true,
      flow_id: flowId,
      data: {
        list_id: createdList.id,
        session_id: createdSession.id,
        student_count: createdStudents?.length ?? 0,
        merged_student_count: mergeResult.mergedCount,
        created_new_list: true,
        checkin_path: `/dashboard/checkin?listId=${createdList.id}&sessionId=${createdSession.id}`,
      },
    });
  }

  const { data: existingList, error: existingListError } = await supabase
    .from("checkin_lists")
    .select("id, name, custom_columns, source_metadata")
    .eq("id", existingListId)
    .eq("org_id", profile.org_id)
    .eq("archived", false)
    .maybeSingle();

  if (existingListError) {
    const serializedError = serializeListError(existingListError);
    console.error("[lists] request failed:", {
      flowId,
      vercelRequestId,
      orgId: profile.org_id,
      mode,
      stage: "lookup-existing-list" satisfies ListStage,
      existingListId,
      error: serializedError,
    });
    return NextResponse.json(
      {
        error: getSafeListFailureMessage(serializedError, "Failed to load the selected existing list."),
        code: "LIST_PERSISTENCE_FAILED",
        stage: "lookup-existing-list",
        flow_id: flowId,
        diagnostic_hint: serializedError.schemaDrift.reason,
      },
      { status: 500 }
    );
  }

  if (!existingList) {
    return NextResponse.json({ error: "The selected existing list could not be found." }, { status: 404 });
  }

  const { data: existingStudents, error: existingStudentsError } = await supabase
    .from("students")
    .select("id, uid, name, first_name, last_name, custom_data")
    .eq("list_id", existingList.id)
    .order("uid");

  if (existingStudentsError) {
    const serializedError = serializeListError(existingStudentsError);
    console.error("[lists] request failed:", {
      flowId,
      vercelRequestId,
      listId: existingList.id,
      mode,
      stage: "lookup-existing-students" satisfies ListStage,
      error: serializedError,
    });
    return NextResponse.json(
      {
        error: getSafeListFailureMessage(serializedError, "Failed to load existing students before append."),
        code: "LIST_PERSISTENCE_FAILED",
        stage: "lookup-existing-students",
        flow_id: flowId,
        diagnostic_hint: serializedError.schemaDrift.reason,
      },
      { status: 500 }
    );
  }

  const mergeResult = mergeIncomingStudents((existingStudents ?? []) as ExistingStudentRow[], incomingStudents);
  console.log("[lists/append] merge summary:", {
    flowId,
    listId: existingList.id,
    incomingStudentsCount: incomingStudents.length,
    newStudentsCount: mergeResult.newStudents.length,
    mergedCount: mergeResult.mergedCount,
    conflictCount: mergeResult.conflictNames.length,
  });
  if (mergeResult.conflictNames.length) {
    return NextResponse.json(
      { error: `Duplicate student rows conflicted and could not be merged honestly: ${mergeResult.conflictNames.join(", ")}.` },
      { status: 409 }
    );
  }

  const existingCustomColumns = normalizeCustomColumns(existingList.custom_columns);
  const nextCustomColumns = mergeCustomColumns(existingCustomColumns, incomingCustomColumnKeys);
  const nextSourceMetadata = mergeSourceMetadata(existingList.source_metadata, sourceMetadata);
  const appendMutationStarted = mergeResult.updatedStudents.length > 0 || mergeResult.newStudents.length > 0;

  const { data: createdSession, error: sessionError } = await upsertTodaySession(supabase, existingList.id);
  if (sessionError || !createdSession) {
    const serializedError = serializeListError(sessionError);
    console.error("[lists] request failed:", {
      flowId,
      vercelRequestId,
      listId: existingList.id,
      mode,
      stage: "upsert-session" satisfies ListStage,
      error: serializedError,
    });
    return NextResponse.json(
      {
        error: getSafeListFailureMessage(serializedError, "Failed to create the real check-in session."),
        code: getListFailureCode(),
        stage: "upsert-session",
        flow_id: flowId,
        diagnostic_hint: serializedError.schemaDrift.reason,
      },
      { status: 500 }
    );
  }

  if (mergeResult.updatedStudents.length) {
    const updateResults = await Promise.all(
      mergeResult.updatedStudents.map((student) =>
        supabase
          .from("students")
          .update({
            name: student.name,
            first_name: student.first_name,
            last_name: student.last_name,
            custom_data: student.custom_data,
          })
          .eq("id", student.id)
          .eq("list_id", existingList.id)
      )
    );

    const failedUpdate = updateResults.find((result) => result.error);
    if (failedUpdate?.error) {
      const serializedError = serializeListError(failedUpdate.error);
      console.error("[lists] request failed:", {
        flowId,
        vercelRequestId,
        listId: existingList.id,
        mode,
        stage: "update-students" satisfies ListStage,
        studentsAttempted: mergeResult.updatedStudents.length,
        error: serializedError,
      });
      return NextResponse.json(
        {
          error: getSafeListFailureMessage(
            serializedError,
            "Failed to merge duplicate student rows into the existing list.",
            appendPartialPersistenceHint,
          ),
          code: getListFailureCode(appendPartialPersistenceHint),
          stage: "update-students",
          flow_id: flowId,
          diagnostic_hint: serializedError.schemaDrift.reason,
        },
        { status: 500 }
      );
    }

    console.log("[lists/append] students updated:", {
      flowId,
      listId: existingList.id,
      updatedStudentCount: mergeResult.updatedStudents.length,
    });
  }

  if (mergeResult.newStudents.length) {
    const usedUids = ((existingStudents ?? []) as ExistingStudentRow[]).map((student) => student.uid);
    const studentsToInsert = mergeResult.newStudents.map((student) => {
      const uid = getNextStudentUid(usedUids);
      usedUids.push(uid);
      return { ...student, uid, list_id: existingList.id };
    });

    const { error: appendStudentsError } = await supabase.from("students").insert(studentsToInsert);
    if (appendStudentsError) {
      const serializedError = serializeListError(appendStudentsError);
      const partialPersistenceHint = mergeResult.updatedStudents.length ? appendPartialPersistenceHint : null;
      console.error("[lists] request failed:", {
        flowId,
        vercelRequestId,
        listId: existingList.id,
        mode,
        stage: "append-students" satisfies ListStage,
        studentsAttempted: studentsToInsert.length,
        error: serializedError,
      });
      return NextResponse.json(
        {
          error: getSafeListFailureMessage(serializedError, "Failed to append new students into the existing list.", partialPersistenceHint),
          code: getListFailureCode(partialPersistenceHint),
          stage: "append-students",
          flow_id: flowId,
          diagnostic_hint: serializedError.schemaDrift.reason,
        },
        { status: 500 }
      );
    }

    console.log("[lists/append] students inserted:", {
      flowId,
      listId: existingList.id,
      createdStudentCount: mergeResult.newStudents.length,
    });
  }

  const { error: updateListError } = await supabase
    .from("checkin_lists")
    .update({ custom_columns: nextCustomColumns, source_metadata: nextSourceMetadata })
    .eq("id", existingList.id)
    .eq("org_id", profile.org_id);

  if (updateListError) {
    const serializedError = serializeListError(updateListError);
    const partialPersistenceHint = appendMutationStarted ? appendPartialPersistenceHint : null;
    console.error("[lists] request failed:", {
      flowId,
      vercelRequestId,
      listId: existingList.id,
      mode,
      stage: "update-list-metadata" satisfies ListStage,
      error: serializedError,
    });
    return NextResponse.json(
      {
        error: getSafeListFailureMessage(serializedError, "Failed to update list metadata after append.", partialPersistenceHint),
        code: getListFailureCode(partialPersistenceHint),
        stage: "update-list-metadata",
        flow_id: flowId,
        diagnostic_hint: serializedError.schemaDrift.reason,
      },
      { status: 500 }
    );
  }

  console.log("[lists/append] list metadata updated:", { flowId, listId: existingList.id });

  console.log("[lists/append] session ready:", { flowId, listId: existingList.id, sessionId: createdSession.id });

  return NextResponse.json({
    success: true,
    flow_id: flowId,
    data: {
      list_id: existingList.id,
      session_id: createdSession.id,
      student_count: mergeResult.newStudents.length,
      merged_student_count: mergeResult.mergedCount,
      created_new_list: false,
      checkin_path: `/dashboard/checkin?listId=${existingList.id}&sessionId=${createdSession.id}`,
    },
  });
}