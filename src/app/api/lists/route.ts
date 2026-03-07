import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { canCreateList } from "@/lib/plans";
import {
  buildCustomColumnsFromKeys,
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

function isUploadFieldMapping(value: unknown): value is UploadFieldMapping {
  return typeof value === "string" && UPLOAD_FIELD_MAPPINGS.includes(value as UploadFieldMapping);
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
  if (isUploadFieldMapping(mapping)) {
    return mapping;
  }

  return isUploadFieldMapping(column.suggested_mapping) ? column.suggested_mapping : "(Ignore)";
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
    return { error: "Select an original teacher before assigning a substitute." };
  }

  if (originalTeacherId && substituteTeacherId && originalTeacherId === substituteTeacherId) {
    return { error: "Original teacher and substitute teacher must be different people." };
  }

  const teacherIds = [originalTeacherId, substituteTeacherId].filter((value): value is string => Boolean(value));
  if (teacherIds.length === 0) {
    return { error: null };
  }

  const { data, error } = await supabase
    .from("teachers")
    .select("id")
    .eq("org_id", orgId)
    .in("id", teacherIds);

  if (error) {
    return { error: error.message };
  }

  const validIds = new Set((data ?? []).map((teacher) => String(teacher.id)));
  return {
    error: teacherIds.some((teacherId) => !validIds.has(teacherId))
      ? "Choose teachers from your organization directory only."
      : null,
  };
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const admin = createServiceClient();

  const rollbackCreatedList = async (listId: string) => {
    const { error: rollbackError } = await admin.from("checkin_lists").delete().eq("id", listId);
    if (rollbackError) {
      console.error("[lists/create] rollback failed:", rollbackError);
    }
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
    console.error("[lists/create] profile lookup failed:", profileError);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
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

  if (!extracted) {
    return NextResponse.json({ error: "Extracted roster data is missing." }, { status: 400 });
  }

  const detectedColumns = normalizeDetectedColumns(extracted.detected_columns);
  const selectedMappings = detectedColumns.map((column, index) => getSelectedMapping(column, rawMappings[index]));
  const incomingStudents = buildStudentDraftsFromExtraction(extracted, detectedColumns, selectedMappings);
  if (!incomingStudents.length) {
    return NextResponse.json({ error: "No student names were available to save." }, { status: 400 });
  }

  const incomingCustomColumnKeys = new Set(incomingStudents.flatMap((student) => Object.keys(student.custom_data)));
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

  if (!existingListId) {
    const teacherValidation = await validateTeacherIds(supabase, profile.org_id, originalTeacherId, substituteTeacherId);
    if (teacherValidation.error) {
      return NextResponse.json({ error: teacherValidation.error }, { status: 400 });
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
      console.error("[lists/create] list count failed:", countError);
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    const gate = canCreateList(profile.plan_tier, count ?? 0);
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.reason, code: "PLAN_LIMIT" }, { status: 402 });
    }

    const mergeResult = mergeIncomingStudents([], incomingStudents);
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
      console.error("[lists/create] list insert failed:", listError);
      return NextResponse.json({ error: listError?.message ?? "Failed to create check-in list." }, { status: 500 });
    }

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
      console.error("[lists/create] student insert failed:", studentsError);
      await rollbackCreatedList(createdList.id);
      return NextResponse.json({ error: studentsError.message }, { status: 500 });
    }

    const { data: createdSession, error: sessionError } = await upsertTodaySession(supabase, createdList.id);
    if (sessionError || !createdSession) {
      console.error("[lists/create] session upsert failed:", sessionError);
      await rollbackCreatedList(createdList.id);
      return NextResponse.json({ error: "Failed to create the real check-in session." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
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
    console.error("[lists/append] existing list lookup failed:", existingListError);
    return NextResponse.json({ error: existingListError.message }, { status: 500 });
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
    console.error("[lists/append] existing students lookup failed:", existingStudentsError);
    return NextResponse.json({ error: existingStudentsError.message }, { status: 500 });
  }

  const mergeResult = mergeIncomingStudents((existingStudents ?? []) as ExistingStudentRow[], incomingStudents);
  if (mergeResult.conflictNames.length) {
    return NextResponse.json(
      { error: `Duplicate student rows conflicted and could not be merged honestly: ${mergeResult.conflictNames.join(", ")}.` },
      { status: 409 }
    );
  }

  const existingCustomColumns = normalizeCustomColumns(existingList.custom_columns);
  const nextCustomColumns = mergeCustomColumns(existingCustomColumns, incomingCustomColumnKeys);
  const nextSourceMetadata = mergeSourceMetadata(existingList.source_metadata, sourceMetadata);

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
      console.error("[lists/append] student merge update failed:", failedUpdate.error);
      return NextResponse.json({ error: failedUpdate.error.message }, { status: 500 });
    }
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
      console.error("[lists/append] student append failed:", appendStudentsError);
      return NextResponse.json({ error: appendStudentsError.message }, { status: 500 });
    }
  }

  const { error: updateListError } = await supabase
    .from("checkin_lists")
    .update({ custom_columns: nextCustomColumns, source_metadata: nextSourceMetadata })
    .eq("id", existingList.id)
    .eq("org_id", profile.org_id);

  if (updateListError) {
    console.error("[lists/append] list metadata update failed:", updateListError);
    return NextResponse.json({ error: updateListError.message }, { status: 500 });
  }

  const { data: createdSession, error: sessionError } = await upsertTodaySession(supabase, existingList.id);
  if (sessionError || !createdSession) {
    console.error("[lists/append] session upsert failed:", sessionError);
    return NextResponse.json({ error: "Failed to create the real check-in session." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
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