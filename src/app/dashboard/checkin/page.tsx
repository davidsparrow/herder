"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getSchemaDriftDiagnosticFromStrings,
  getSchemaDriftUserMessage,
  normalizeFlowId,
} from "@/lib/flow-diagnostics";
import { STUDENT_CUSTOM_FIELD_LABELS } from "@/lib/roster-persistence";
import type {
  Attendance,
  CheckinList,
  CheckinSubmitRequest,
  CheckinSubmitResponse,
  CheckinSession,
  CustomColumn,
  Student,
  StudentWithStatus,
  Teacher,
} from "@/lib/types";

const SCHEMA_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CUSTOM_FIELD_LABELS: Record<string, string> = STUDENT_CUSTOM_FIELD_LABELS;

type FilterKey = "all" | "present" | "absent" | "unchecked";

type CheckinListSummary = Pick<
  CheckinList,
  | "id"
  | "name"
  | "recurring_days"
  | "recurring_time"
  | "custom_columns"
  | "created_at"
  | "original_teacher_id"
  | "substitute_teacher_id"
  | "source_metadata"
>;

type CheckinSessionSummary = Pick<
  CheckinSession,
  "id" | "list_id" | "session_date" | "submitted_at" | "sub_teacher_name" | "created_at"
>;

type AttendanceRow = Pick<Attendance, "student_id" | "status" | "checkin_type" | "checked_at">;
type TeacherSummary = Pick<Teacher, "id" | "name" | "email" | "phone">;

type UpdateListTeacherApiResponse = {
  success?: true;
  data?: Pick<CheckinList, "id" | "original_teacher_id" | "substitute_teacher_id">;
  error?: string;
};

type AddStudentApiResponse = {
  success?: true;
  data?: Student;
  error?: string;
};

type AddStudentForm = {
  name: string;
  firstName: string;
  lastName: string;
  childSheetNumber: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  shortCode: string;
  pickupNotesPre: string;
  pickupNotesPost: string;
  allergies: string;
  specialNeeds: string;
  notes: string;
};

const EMPTY_ADD_STUDENT_FORM: AddStudentForm = {
  name: "",
  firstName: "",
  lastName: "",
  childSheetNumber: "",
  guardianName: "",
  guardianPhone: "",
  guardianEmail: "",
  shortCode: "",
  pickupNotesPre: "",
  pickupNotesPost: "",
  allergies: "",
  specialNeeds: "",
  notes: "",
};

function shortId(value: string | null) {
  if (!value) {
    return null;
  }

  return `${value.slice(0, 8)}…`;
}

function formatSessionDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value: string | null) {
  if (!value) {
    return "Time not set";
  }

  const [hours, minutes] = value.split(":");
  const parsedHours = Number(hours);
  if (!Number.isFinite(parsedHours)) {
    return value;
  }

  return new Date(2000, 0, 1, parsedHours, Number(minutes ?? 0)).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRecurringSchedule(days: number[], time: string | null) {
  const daySummary = days.length
    ? days.map((day) => SCHEMA_DAY_LABELS[day] ?? `Day ${day}`).join(", ")
    : "No recurring days saved";

  return `${daySummary} · ${formatTime(time)}`;
}

function formatHeaderTimeRange(start: string | null, stop: string | null) {
  const startLabel = start ? formatTime(start) : "";
  const stopLabel = stop ? formatTime(stop) : "";

  if (startLabel && stopLabel) {
    return `${startLabel}–${stopLabel}`;
  }

  return startLabel || stopLabel || "";
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizeCustomFieldValue(value: string | boolean | null | undefined) {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  return null;
}

function labelForCustomField(key: string) {
  return CUSTOM_FIELD_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatNotificationSummary(summary: CheckinSubmitResponse["data"]["notifications"]) {
  if (!summary.enabled) {
    return summary.skipped_reason ?? "Notifications were not sent.";
  }

  const parts = [`${summary.sent} sent`];

  if (summary.missing_guardian_email > 0) {
    parts.push(`${summary.missing_guardian_email} skipped (missing guardian email)`);
  }

  if (summary.failed > 0) {
    parts.push(`${summary.failed} failed`);
  }

  if (summary.sent === 0 && summary.missing_guardian_email === 0 && summary.failed === 0 && summary.skipped > 0) {
    parts.push(`${summary.skipped} skipped`);
  }

  return parts.join(" · ");
}

function getSafeCheckinLoadErrorMessage(message: string) {
  return getSchemaDriftUserMessage("Real check-in", getSchemaDriftDiagnosticFromStrings(message)) ?? message;
}

function getSafeTeacherLoadErrorMessage(message: string) {
  return getSchemaDriftUserMessage("Teacher directory access", getSchemaDriftDiagnosticFromStrings(message))
    ?? `Teacher directory lookup failed: ${message}`;
}

function getCustomFieldEntries(customData: Student["custom_data"], customColumns: CustomColumn[]) {
  const knownKeys = customColumns.map((column) => column.id);
  const orderedKeys = [...knownKeys, ...Object.keys(customData).filter((key) => !knownKeys.includes(key))];

  return orderedKeys.flatMap((key) => {
    const value = normalizeCustomFieldValue(customData[key]);
    if (!value) {
      return [];
    }

    return [{ key, label: labelForCustomField(key), value }];
  });
}

function getCustomText(customData: Student["custom_data"], key: string) {
  const value = normalizeCustomFieldValue(customData[key]);
  return typeof value === "string" ? value : null;
}

function buildStudentForm(student: Student): AddStudentForm {
  return {
    name: student.name,
    firstName: student.first_name,
    lastName: student.last_name,
    childSheetNumber: getCustomText(student.custom_data, "child_sheet_number") ?? "",
    guardianName: getCustomText(student.custom_data, "guardian_name") ?? "",
    guardianPhone: getCustomText(student.custom_data, "guardian_phone") ?? "",
    guardianEmail: getCustomText(student.custom_data, "guardian_email") ?? "",
    shortCode: getCustomText(student.custom_data, "short_code") ?? "",
    pickupNotesPre: getCustomText(student.custom_data, "pickup_notes_pre")
      ?? getCustomText(student.custom_data, "pickup_location")
      ?? getCustomText(student.custom_data, "pickup_drop_location")
      ?? "",
    pickupNotesPost: getCustomText(student.custom_data, "pickup_notes_post")
      ?? getCustomText(student.custom_data, "dropoff_location")
      ?? "",
    allergies: getCustomText(student.custom_data, "allergies") ?? "",
    specialNeeds: getCustomText(student.custom_data, "special_needs") ?? "",
    notes: getCustomText(student.custom_data, "notes") ?? "",
  };
}

function HonestState({
  title,
  description,
  tone = "neutral",
}: {
  title: string;
  description: string;
  tone?: "neutral" | "loading" | "error";
}) {
  const toneStyles = {
    neutral: "bg-white text-ink",
    loading: "bg-sky-light text-sky",
    error: "bg-blush-light text-blush",
  } as const;

  return (
    <div className="flex h-full items-center justify-center bg-cream px-6 py-10">
      <div className={`max-w-xl rounded-3xl p-8 shadow-warm ${toneStyles[tone]}`}>
        <h2 className="font-display text-2xl font-black tracking-tight">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function CheckInPageContent() {
  const searchParams = useSearchParams();
  const listId = searchParams.get("listId") ?? searchParams.get("list_id");
  const sessionId = searchParams.get("sessionId") ?? searchParams.get("session_id");
  const flowId = normalizeFlowId(searchParams.get("flowId"));
  const supabase = useMemo(() => createClient(), []);

  const [list, setList] = useState<CheckinListSummary | null>(null);
  const [session, setSession] = useState<CheckinSessionSummary | null>(null);
  const [students, setStudents] = useState<StudentWithStatus[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [groupModal, setGroupModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<CheckinSubmitResponse["data"] | null>(null);
  const [bouncingId, setBouncingId] = useState<string | null>(null);
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [addStudentForm, setAddStudentForm] = useState<AddStudentForm>(EMPTY_ADD_STUDENT_FORM);
  const [addStudentError, setAddStudentError] = useState<string | null>(null);
  const [addingStudent, setAddingStudent] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<TeacherSummary[]>([]);
  const [teacherLoadError, setTeacherLoadError] = useState<string | null>(null);
  const [teacherEditorOpen, setTeacherEditorOpen] = useState(false);
  const [teacherSaving, setTeacherSaving] = useState(false);
  const [teacherSaveError, setTeacherSaveError] = useState<string | null>(null);
  const [teacherAssignment, setTeacherAssignment] = useState({
    originalTeacherId: "",
    substituteEnabled: false,
    substituteTeacherId: "",
  });

  useEffect(() => {
    setSearch("");
    setFilter("all");
    setSubmitError(null);
    setSubmitResult(null);

    if (!listId || !sessionId) {
      setList(null);
      setSession(null);
      setStudents([]);
      setTeachers([]);
      setTeacherLoadError(null);
      setLoadError(null);
      setLoading(false);
      setAddStudentOpen(false);
      setAddStudentError(null);
      setEditingStudentId(null);
      setAddStudentForm(EMPTY_ADD_STUDENT_FORM);
      setTeacherEditorOpen(false);
      setTeacherSaveError(null);
      return;
    }

    let active = true;

    const loadCheckinData = async () => {
      setList(null);
      setSession(null);
      setStudents([]);
      setLoading(true);
      setLoadError(null);
      setTeacherLoadError(null);
      console.log("[checkin-ui] handoff load start:", {
        flowId,
        listId: shortId(listId) ?? listId,
        sessionId: shortId(sessionId) ?? sessionId,
      });

      try {
        const [listResult, sessionResult, studentsResult, attendanceResult, teachersResult] = await Promise.all([
          supabase
            .from("checkin_lists")
            .select("id, name, recurring_days, recurring_time, custom_columns, created_at, original_teacher_id, substitute_teacher_id, source_metadata")
            .eq("id", listId)
            .eq("archived", false)
            .maybeSingle(),
          supabase
            .from("checkin_sessions")
            .select("id, list_id, session_date, submitted_at, sub_teacher_name, created_at")
            .eq("id", sessionId)
            .maybeSingle(),
          supabase
            .from("students")
            .select("id, list_id, uid, name, first_name, last_name, custom_data, qr_code_url, created_at")
            .eq("list_id", listId)
            .order("uid"),
          supabase
            .from("attendance")
            .select("student_id, status, checkin_type, checked_at")
            .eq("session_id", sessionId),
          supabase
            .from("teachers")
            .select("id, name, email, phone")
            .order("name", { ascending: true }),
        ]);

        if (!active) {
          return;
        }

        if (listResult.error) {
          console.error("[checkin-ui] list lookup failed:", {
            flowId,
            listId: shortId(listId) ?? listId,
            schemaDrift: getSchemaDriftDiagnosticFromStrings(listResult.error.message),
            error: listResult.error.message,
          });
          throw new Error(`List lookup failed: ${listResult.error.message}`);
        }

        if (sessionResult.error) {
          console.error("[checkin-ui] session lookup failed:", {
            flowId,
            sessionId: shortId(sessionId) ?? sessionId,
            error: sessionResult.error.message,
          });
          throw new Error(`Session lookup failed: ${sessionResult.error.message}`);
        }

        if (studentsResult.error) {
          console.error("[checkin-ui] student lookup failed:", {
            flowId,
            listId: shortId(listId) ?? listId,
            schemaDrift: getSchemaDriftDiagnosticFromStrings(studentsResult.error.message),
            error: studentsResult.error.message,
          });
          throw new Error(`Student roster lookup failed: ${studentsResult.error.message}`);
        }

        if (attendanceResult.error) {
          console.error("[checkin-ui] attendance lookup failed:", {
            flowId,
            sessionId: shortId(sessionId) ?? sessionId,
            error: attendanceResult.error.message,
          });
          throw new Error(`Attendance lookup failed: ${attendanceResult.error.message}`);
        }

        const nextList = listResult.data as CheckinListSummary | null;
        const nextSession = sessionResult.data as CheckinSessionSummary | null;
        const nextStudents = (studentsResult.data ?? []) as Student[];
        const nextAttendance = (attendanceResult.data ?? []) as AttendanceRow[];
        const nextTeachers = (teachersResult.data ?? []) as TeacherSummary[];

        if (!nextList) {
          throw new Error(`No real check-in list was found for ${shortId(listId) ?? listId}.`);
        }

        if (!nextSession) {
          throw new Error(`No real check-in session was found for ${shortId(sessionId) ?? sessionId}.`);
        }

        if (nextSession.list_id !== nextList.id) {
          throw new Error("The selected session does not belong to the selected list.");
        }

        const attendanceByStudent = new Map(nextAttendance.map((row) => [row.student_id, row]));

        const hydratedStudents: StudentWithStatus[] = nextStudents.map((student) => {
          const attendance = attendanceByStudent.get(student.id);

          return {
            ...student,
            status: attendance?.status ?? null,
            checkin_type: attendance?.checkin_type ?? undefined,
            checked_at: attendance?.checked_at ?? null,
          };
        });

        setList(nextList);
        setSession(nextSession);
        setStudents(hydratedStudents);
        if (teachersResult.error) {
          setTeachers([]);
          setTeacherLoadError(getSafeTeacherLoadErrorMessage(teachersResult.error.message));
        } else {
          setTeachers(nextTeachers);
        }
        console.log("[checkin-ui] handoff load success:", {
          flowId,
          listId: nextList.id,
          sessionId: nextSession.id,
          studentCount: hydratedStudents.length,
          teacherCount: nextTeachers.length,
          teacherLookupFailed: Boolean(teachersResult.error),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load the real check-in data.";
        console.error("[checkin-ui] handoff load failed:", {
          flowId,
          listId: shortId(listId) ?? listId,
          sessionId: shortId(sessionId) ?? sessionId,
          schemaDrift: getSchemaDriftDiagnosticFromStrings(message),
          error: message,
        });
        setList(null);
        setSession(null);
        setStudents([]);
        setTeachers([]);
        setLoadError(getSafeCheckinLoadErrorMessage(message));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadCheckinData();

    return () => {
      active = false;
    };
  }, [flowId, listId, sessionId, supabase]);

  useEffect(() => {
    setTeacherAssignment({
      originalTeacherId: list?.original_teacher_id ?? "",
      substituteEnabled: Boolean(list?.substitute_teacher_id),
      substituteTeacherId: list?.substitute_teacher_id ?? "",
    });
    setTeacherSaveError(null);
    setTeacherEditorOpen(false);
  }, [list?.id, list?.original_teacher_id, list?.substitute_teacher_id]);

  const sessionSubmitted = Boolean(session?.submitted_at);
  const interactionsDisabled = loading || submitting || sessionSubmitted;
  const addStudentDisabled = loading || submitting || addingStudent;
  const showingStaleContext = Boolean(
    (list && listId && list.id !== listId) ||
    (session && sessionId && session.id !== sessionId)
  );
  const originalTeacher = teachers.find((teacher) => teacher.id === list?.original_teacher_id) ?? null;
  const substituteTeacher = teachers.find((teacher) => teacher.id === list?.substitute_teacher_id) ?? null;
  const extractedTeacherName = list?.source_metadata.teacher_name?.trim() ?? "";

  const saveTeacherAssignment = async () => {
    if (!list) {
      return;
    }

    setTeacherSaving(true);
    setTeacherSaveError(null);

    try {
      const response = await fetch(`/api/lists/${list.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalTeacherId: teacherAssignment.originalTeacherId || null,
          substituteTeacherId: teacherAssignment.substituteEnabled ? teacherAssignment.substituteTeacherId || null : null,
        }),
      });

      const result = await response.json() as UpdateListTeacherApiResponse;
      if (!response.ok || !result.data) {
        throw new Error(result.error ?? "Could not update the teacher assignment for this list.");
      }

      const savedTeacherAssignment = result.data;

      setList((current) => current ? {
        ...current,
        original_teacher_id: savedTeacherAssignment.original_teacher_id,
        substitute_teacher_id: savedTeacherAssignment.substitute_teacher_id,
      } : current);
      setTeacherEditorOpen(false);
    } catch (error) {
      setTeacherSaveError(error instanceof Error ? error.message : "Could not update the teacher assignment for this list.");
    } finally {
      setTeacherSaving(false);
    }
  };

  const toggle = (id: string) => {
    if (interactionsDisabled) {
      return;
    }

    setBouncingId(id);
    setTimeout(() => setBouncingId(null), 350);
    const currentStudent = students.find((student) => student.id === id);
    updateStudentAttendance(id, currentStudent?.status === "present" ? null : "present", "manual");
  };

  const markAbsent = (id: string) => {
    if (interactionsDisabled) {
      return;
    }

    const currentStudent = students.find((student) => student.id === id);
    updateStudentAttendance(id, currentStudent?.status === "absent" ? null : "absent", "manual");
  };

  const doGroup = () => {
    if (interactionsDisabled) {
      return;
    }

    const checkedAt = new Date().toISOString();
    setStudents((current) => current.map((student) => ({
      ...student,
      status: student.status === null ? "present" : student.status,
      checkin_type: student.status === null ? "group" : student.checkin_type,
      checked_at: student.status === null ? checkedAt : student.checked_at,
    })));
    setGroupModal(false);
  };

  const saveStudent = async () => {
    if (!list?.id || addStudentDisabled) {
      return;
    }

    setAddingStudent(true);
    setAddStudentError(null);

    try {
      const response = await fetch(`/api/lists/${list.id}/students`, {
        method: editingStudentId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...addStudentForm,
          studentId: editingStudentId,
        }),
      });

      const result = await response.json() as AddStudentApiResponse;
      if (!response.ok || !result.data) {
        throw new Error(result.error ?? "Failed to save this student on the master list.");
      }

      const savedStudent = result.data;

      if (editingStudentId) {
        setStudents((current) => current.map((student) => (
          student.id === savedStudent.id
            ? { ...savedStudent, status: student.status, checkin_type: student.checkin_type, checked_at: student.checked_at }
            : student
        )));
      } else {
        setStudents((current) => ([
          ...current,
          { ...savedStudent, status: null, checkin_type: undefined, checked_at: null },
        ]).sort((left, right) => (left.uid ?? "").localeCompare(right.uid ?? "")));
      }

      setAddStudentOpen(false);
      setAddStudentForm(EMPTY_ADD_STUDENT_FORM);
      setEditingStudentId(null);
    } catch (error) {
      setAddStudentError(error instanceof Error ? error.message : "Failed to save this student on the master list.");
    } finally {
      setAddingStudent(false);
    }
  };

  const submitCheckin = async () => {
    if (!sessionId || interactionsDisabled || students.length === 0) {
      return;
    }

    const attendanceRows = students.flatMap((student) => {
      if (!student.status) {
        return [];
      }

      return [{
        student_id: student.id,
        status: student.status,
        checkin_type: student.checkin_type ?? "manual",
        checked_at: student.checked_at,
      }];
    });

    if (attendanceRows.length !== students.length) {
      setSubmitError("Every persisted student must be marked present or absent before you can submit the real session.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitResult(null);

    try {
      const payload: CheckinSubmitRequest = {
        session_id: sessionId,
        attendance: attendanceRows,
      };

      const response = await fetch("/api/lists/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json() as CheckinSubmitResponse | { error?: string };
      const responseError = "error" in result ? result.error : undefined;

      if (!response.ok || !("success" in result) || !result.success) {
        throw new Error(responseError ?? "Failed to submit the real check-in.");
      }

      setSession((current) => current ? { ...current, submitted_at: result.data.session.submitted_at } : current);
      setSubmitResult(result.data);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to submit the real check-in.");
    } finally {
      setSubmitting(false);
    }
  };

  const present = students.filter((student) => student.status === "present").length;
  const absent = students.filter((student) => student.status === "absent").length;
  const unchecked = students.filter((student) => student.status === null).length;
  const pct = students.length ? Math.round((present / students.length) * 100) : 0;
  const submitDisabled = interactionsDisabled || students.length === 0 || unchecked > 0;
  const submittedAtLabel = formatTimestamp(session?.submitted_at ?? null);
  const notificationSummary = submitResult ? formatNotificationSummary(submitResult.notifications) : null;
  const displayedTeacherName = originalTeacher?.name ?? (extractedTeacherName || "Teacher not assigned");
  const displayedTeacherEmail = teacherLoadError
    ?? originalTeacher?.email
    ?? (originalTeacher ? "No email saved" : extractedTeacherName ? "Directory match not confirmed" : "No teacher selected");
  const displayedTeacherPhone = originalTeacher?.phone
    || (originalTeacher ? "No phone saved" : extractedTeacherName ? "Using extracted teacher metadata only" : "Use Edit teachers to assign one");
  const headerTimeSummary = formatHeaderTimeRange(list?.source_metadata.start_time ?? list?.recurring_time ?? null, list?.source_metadata.stop_time ?? null);
  const headerLocation = list?.source_metadata.room_location?.trim() ?? "";
  const headerDetailSummary = [headerTimeSummary, headerLocation].filter(Boolean).join(" · ");
  const isEditingStudent = Boolean(editingStudentId);

  const openAddStudentEditor = () => {
    setAddStudentError(null);
    setEditingStudentId(null);
    setAddStudentForm(EMPTY_ADD_STUDENT_FORM);
    setAddStudentOpen(true);
  };

  const openEditStudentEditor = (student: StudentWithStatus) => {
    setAddStudentError(null);
    setEditingStudentId(student.id);
    setAddStudentForm(buildStudentForm(student));
    setAddStudentOpen(true);
  };

  const updateStudentAttendance = (
    id: string,
    nextStatus: StudentWithStatus["status"],
    nextCheckinType?: StudentWithStatus["checkin_type"]
  ) => {
    const checkedAt = nextStatus ? new Date().toISOString() : null;

    setStudents((current) => current.map((student) => (
      student.id === id
        ? {
          ...student,
          status: nextStatus,
          checkin_type: nextStatus ? nextCheckinType ?? "manual" : undefined,
          checked_at: checkedAt,
        }
        : student
    )));
  };

  const filtered = students
    .filter((student) => student.name.toLowerCase().includes(search.toLowerCase()))
    .filter((student) => {
      if (filter === "present") return student.status === "present";
      if (filter === "absent") return student.status === "absent";
      if (filter === "unchecked") return student.status === null;
      return true;
    });

  if (!listId || !sessionId) {
    return (
      <HonestState
        title="A real list and session are required"
        description="Open Check-in from a real upload handoff or provide both `listId` and `sessionId` in the URL. This page no longer falls back to a demo roster when those real identifiers are missing."
      />
    );
  }

  if (loading || showingStaleContext || (!loadError && !list && !session)) {
    return (
      <HonestState
        title="Loading real check-in data"
        description={`Looking up list ${shortId(listId) ?? listId} and session ${shortId(sessionId) ?? sessionId} in Supabase.`}
        tone="loading"
      />
    );
  }

  if (loadError || !list || !session) {
    return (
      <HonestState
        title="Couldn't load this check-in"
        description={loadError ?? "The real list or session could not be loaded."}
        tone="error"
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-cream-border bg-white px-5 py-4 shadow-warm">
        <div className="mb-4 rounded-2xl bg-sky-light px-4 py-3 text-xs font-medium text-sky">
          Real data loaded from Supabase: list {shortId(list.id)} · session {shortId(session.id)} · {students.length} persisted students.
          {sessionSubmitted
            ? " This session is already submitted in the database, so statuses shown here are read-only."
            : " Marking is a local draft until you submit; submitting writes real attendance rows and marks the real session submitted."}
        </div>

        {submitError && (
          <div className="mb-4 rounded-2xl bg-blush-light px-4 py-3 text-xs font-medium text-blush">
            Submit failed honestly: {submitError}
          </div>
        )}

        {submitting && (
          <div className="mb-4 rounded-2xl bg-sky-light px-4 py-3 text-xs font-medium text-sky">
            Submitting real attendance rows for session {shortId(session.id)} and using persisted roster/org notification inputs.
          </div>
        )}

        {submitResult && sessionSubmitted && (
          <div className="mb-4 rounded-2xl bg-sage-light px-4 py-3 text-xs font-medium text-sage-dark">
            Real submission saved {submitResult.attendance_count} attendance rows in Supabase.
            {notificationSummary ? ` Notifications: ${notificationSummary}.` : ""}
          </div>
        )}

        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2.5">
              <h2 className="font-display text-xl font-black tracking-tight text-ink">{list.name}</h2>
              <span className="badge bg-sage-light text-xs text-sage-dark">Real roster</span>
              {sessionSubmitted && <span className="badge bg-gold-light text-xs text-gold">Submitted</span>}
            </div>
            <p className="text-xs text-ink-light">
              {formatSessionDate(session.session_date)} · {students.length} students · {formatRecurringSchedule(list.recurring_days, list.recurring_time)}
            </p>
            {headerDetailSummary && (
              <p className="mt-1 text-[11px] text-ink-light">
                Header · {headerDetailSummary}
              </p>
            )}
            <p className="mt-1 text-[11px] text-ink-light">
              List {shortId(list.id)} · Session {shortId(session.id)}
              {!substituteTeacher && session.sub_teacher_name ? ` · Legacy session sub teacher: ${session.sub_teacher_name}` : ""}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setTeacherEditorOpen(true)}
              disabled={teacherSaving}
              className="btn-ghost px-3.5 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              Edit teachers
            </button>
            <button
              onClick={openAddStudentEditor}
              disabled={addStudentDisabled}
              className="btn-ghost px-3.5 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Student
            </button>
            <button
              onClick={() => setGroupModal(true)}
              disabled={interactionsDisabled || students.length === 0 || unchecked === 0}
              className="btn-ghost px-3.5 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              Group ✓
            </button>
            <button
              onClick={submitCheckin}
              disabled={submitDisabled}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                submitDisabled ? "bg-cream-deep text-ink-light" : "bg-ink text-white hover:opacity-90"
              }`}
            >
              {sessionSubmitted ? "Submitted" : submitting ? "Submitting…" : "Submit Check-in"}
            </button>
          </div>
        </div>

        {(teacherLoadError || originalTeacher || substituteTeacher || extractedTeacherName) && (
          <div className="mb-4 grid gap-3 lg:grid-cols-2">
            {substituteTeacher && (
              <div className="rounded-2xl border border-terra/30 bg-terra-light px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-widest text-terra-dark">Substitute Teacher</p>
                <p className="mt-2 text-lg font-black text-ink">{substituteTeacher.name}</p>
                <div className="mt-1 space-y-0.5 text-xs text-ink-light">
                  <p>{substituteTeacher.email || "No email saved"}</p>
                  <p>{substituteTeacher.phone || "No phone saved"}</p>
                </div>
              </div>
            )}

            {(originalTeacher || extractedTeacherName || teacherLoadError) && (
              <div className={`rounded-2xl border px-4 py-4 ${substituteTeacher ? "border-cream-border bg-parchment" : "border-sky/30 bg-sky-light/60"}`}>
                <p className="text-xs font-bold uppercase tracking-widest text-ink-light">
                  {substituteTeacher ? "Original Teacher" : "Teacher"}
                </p>
                <p className="mt-2 text-lg font-black text-ink">
                  {displayedTeacherName}
                </p>
                <div className="mt-1 space-y-0.5 text-xs text-ink-light">
                  <p>{displayedTeacherEmail}</p>
                  <p>{displayedTeacherPhone}</p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mb-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-cream-deep">
            <div
              style={{ width: `${pct}%` }}
              className="h-full rounded-full bg-gradient-to-r from-sage to-[#6FBE9A] transition-all duration-500"
            />
          </div>
          <span className="min-w-[36px] text-xs font-bold text-sage-dark">{pct}%</span>
        </div>

        <div className="flex gap-2">
          {([
            { key: "present", label: "present", val: present, on: "bg-sage-light border-sage/40 text-sage-dark", off: "text-ink-light" },
            { key: "absent", label: "absent", val: absent, on: "bg-gold-light border-gold/40 text-gold", off: "text-ink-light" },
            { key: "unchecked", label: "unchecked", val: unchecked, on: "bg-cream-deep border-cream-border text-ink-mid", off: "text-ink-light" },
          ] as const).map((option) => (
            <button
              key={option.key}
              onClick={() => setFilter((current) => current === option.key ? "all" : option.key)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                filter === option.key ? `${option.on} border` : `border-transparent ${option.off} hover:bg-cream-deep`
              }`}
            >
              <strong className="mr-1 text-sm">{option.val}</strong>
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-b border-cream-border bg-parchment px-5 py-2.5">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-light">🔍</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search students…"
            className="input-warm py-2.5 pl-9 text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {students.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-semibold text-ink">No real students were found for this list.</p>
            <p className="mt-2 text-sm text-ink-light">
              The selected list/session exists, but the roster query returned zero persisted student rows. No demo students are substituted here.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-light">No students match “{search}”</p>
        ) : (
          <div className="min-w-[1080px]">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-20 bg-parchment shadow-sm">
                <tr className="border-b border-cream-border text-[11px] font-bold uppercase tracking-widest text-ink-light">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">First Last</th>
                  <th className="px-4 py-3">Age</th>
                  <th className="px-4 py-3">Allergies</th>
                  <th className="px-4 py-3">Pre-class Notes</th>
                  <th className="px-4 py-3">Post-class Notes</th>
                  <th className="sticky right-0 z-30 border-l border-cream-border bg-parchment px-4 py-3">Check-in</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((student, index) => {
                  const bouncing = bouncingId === student.id;
                  const customFieldEntries = getCustomFieldEntries(student.custom_data, list.custom_columns);
                  const guardianEntry = customFieldEntries.find((entry) => entry.key === "guardian_name");
                  const specialNeedsEntry = customFieldEntries.find((entry) => entry.key === "special_needs");
                  const age = getCustomText(student.custom_data, "age") ?? "—";
                  const allergies = getCustomText(student.custom_data, "allergies") ?? "—";
                  const preClassNotes = getCustomText(student.custom_data, "pickup_notes_pre")
                    ?? getCustomText(student.custom_data, "pickup_location")
                    ?? getCustomText(student.custom_data, "pickup_drop_location")
                    ?? "—";
                  const postClassNotes = getCustomText(student.custom_data, "pickup_notes_post")
                    ?? getCustomText(student.custom_data, "dropoff_location")
                    ?? "—";
                  const checkedAtLabel = formatTimestamp(student.checked_at);
                  const statusLabel = student.status === "present" ? "Checked in" : student.status === "absent" ? "Absent" : "Pending";
                  const rowTone = student.status === "present"
                    ? "bg-sage-light/40"
                    : student.status === "absent"
                      ? "bg-gold-light/40"
                      : "bg-white";

                  return (
                    <tr key={student.id} className={`border-b border-cream-border align-top ${rowTone}`}>
                      <td className="px-4 py-3 text-sm font-bold text-ink-light">{index + 1}</td>
                      <td className="px-4 py-3">
                        <div className="min-w-[220px]">
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-bold ${student.status === "absent" ? "text-ink/60 line-through" : "text-ink"}`}>
                              {student.first_name || student.last_name
                                ? `${student.first_name} ${student.last_name}`.trim()
                                : student.name}
                            </p>
                            <span className="rounded-md bg-cream-deep px-1.5 py-0.5 text-[10px] font-bold text-ink-light">
                              {student.uid}
                            </span>
                          </div>
                          <div className="mt-1 space-y-1 text-xs text-ink-light">
                            {guardianEntry && <p>Guardian: {guardianEntry.value}</p>}
                            {specialNeedsEntry && <p>Special Needs: {specialNeedsEntry.value}</p>}
                          </div>
                          <button
                            onClick={() => openEditStudentEditor(student)}
                            disabled={addStudentDisabled}
                            className="mt-2 rounded-lg bg-white/80 px-2.5 py-1 text-[11px] font-bold text-ink-light ring-1 ring-cream-border transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Edit student
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-ink">{age}</td>
                      <td className="px-4 py-3 text-sm text-ink">{allergies}</td>
                      <td className="px-4 py-3 text-sm text-ink">{preClassNotes}</td>
                      <td className="px-4 py-3 text-sm text-ink">{postClassNotes}</td>
                      <td className={`sticky right-0 z-10 border-l border-cream-border px-4 py-3 ${rowTone}`}>
                        <div className="min-w-[220px]">
                          <p className={`text-sm font-bold ${
                            student.status === "present"
                              ? "text-sage-dark"
                              : student.status === "absent"
                                ? "text-gold-dark"
                                : "text-ink"
                          }`}>{statusLabel}</p>
                          {checkedAtLabel && (
                            <p className="mt-1 text-xs text-ink-light">{checkedAtLabel}</p>
                          )}
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              onClick={() => markAbsent(student.id)}
                              disabled={interactionsDisabled}
                              className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                                student.status === "absent"
                                  ? "border-gold/60 bg-gold-light text-gold"
                                  : "border-cream-border bg-white text-cream-border hover:border-gold/40 hover:text-gold"
                              }`}
                            >
                              Absent
                            </button>
                            <button
                              onClick={() => toggle(student.id)}
                              disabled={interactionsDisabled}
                              className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
                                bouncing ? "animate-check" : ""
                              } ${student.status === "present"
                                ? "bg-sage text-white shadow-sage"
                                : "bg-cream-deep text-cream-border hover:bg-cream-border"
                              }`}
                            >
                              {student.status === "present" ? (
                                <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                                  <path d="M2 7L7 12L16 2" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              ) : (
                                <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                                  <path d="M2 6L6 10L14 2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-cream-border bg-white px-5 py-3.5">
        <p className="text-xs text-ink-light">
          {students.length === 0
            ? "No persisted students are available for this real list yet."
            : sessionSubmitted
              ? submittedAtLabel
                ? `This session was submitted in Supabase at ${submittedAtLabel}.${notificationSummary ? ` ${notificationSummary}.` : ""}`
                : "This session has already been submitted in Supabase."
              : submitting
                ? "Submitting real attendance and session state now…"
                : submitError
                  ? `Submit failed: ${submitError}`
              : unchecked > 0
                  ? `${unchecked} students still need to be marked before submitting the real attendance.`
                  : "Everyone is marked. Submit will persist the final attendance and session state to Supabase."}
        </p>
        <button
          onClick={submitCheckin}
          disabled={submitDisabled}
          className={`rounded-xl px-5 py-2.5 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
            submitDisabled ? "bg-cream-deep text-ink-light" : "bg-ink text-white hover:opacity-90"
          }`}
        >
          {sessionSubmitted ? "Submitted" : submitting ? "Submitting…" : "Submit Check-in"}
        </button>
      </div>

      {teacherEditorOpen && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget && !teacherSaving) {
              setTeacherEditorOpen(false);
            }
          }}
        >
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-warm-lg">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-black tracking-tight text-ink">Edit teacher assignment</h3>
                <p className="mt-1 text-sm text-ink-light">
                  Choose the original teacher for this list and optionally highlight a substitute teacher while keeping the original visible.
                </p>
              </div>
              <button
                onClick={() => !teacherSaving && setTeacherEditorOpen(false)}
                className="rounded-xl bg-cream-deep px-3 py-1.5 text-xs font-bold text-ink-light"
              >
                Close
              </button>
            </div>

            {teacherSaveError && (
              <div className="mb-4 rounded-2xl bg-blush-light px-4 py-3 text-sm text-blush">
                {teacherSaveError}
              </div>
            )}

            {teacherLoadError && (
              <div className="mb-4 rounded-2xl bg-gold-light px-4 py-3 text-sm text-gold-dark">
                {teacherLoadError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-light">Original Teacher</label>
                <select
                  value={teacherAssignment.originalTeacherId}
                  onChange={(event) => {
                    const nextOriginalTeacherId = event.target.value;
                    setTeacherAssignment((current) => ({
                      originalTeacherId: nextOriginalTeacherId,
                      substituteEnabled: nextOriginalTeacherId ? current.substituteEnabled : false,
                      substituteTeacherId: !nextOriginalTeacherId || nextOriginalTeacherId === current.substituteTeacherId ? "" : current.substituteTeacherId,
                    }));
                  }}
                  className="input-warm"
                  disabled={teacherSaving || teachers.length === 0}
                >
                  <option value="">{teachers.length === 0 ? "No teachers in directory yet" : "Select original teacher"}</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                  ))}
                </select>
              </div>

              <label className={`flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 ${teacherAssignment.originalTeacherId ? "border-terra/30 bg-terra-light/40" : "border-cream-border bg-white"}`}>
                <div>
                  <p className="text-sm font-bold text-ink">Use substitute teacher</p>
                  <p className="mt-1 text-xs text-ink-light">
                    Promote the substitute visually while retaining the original teacher as secondary context.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={teacherAssignment.substituteEnabled}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setTeacherAssignment((current) => ({
                      ...current,
                      substituteEnabled: checked,
                      substituteTeacherId: checked ? current.substituteTeacherId : "",
                    }));
                  }}
                  disabled={!teacherAssignment.originalTeacherId || teacherSaving}
                  className="mt-1 h-4 w-4 rounded border-cream-border text-terra focus:ring-terra"
                />
              </label>

              {teacherAssignment.substituteEnabled && (
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-light">Substitute Teacher</label>
                  <select
                    value={teacherAssignment.substituteTeacherId}
                    onChange={(event) => {
                      setTeacherAssignment((current) => ({ ...current, substituteTeacherId: event.target.value }));
                    }}
                    className="input-warm"
                    disabled={teacherSaving || teachers.length <= 1}
                  >
                    <option value="">{teachers.length <= 1 ? "Add another teacher record first" : "Select substitute teacher"}</option>
                    {teachers.filter((teacher) => teacher.id !== teacherAssignment.originalTeacherId).map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {!teacherAssignment.originalTeacherId && extractedTeacherName && (
                <div className="rounded-2xl bg-gold-light px-4 py-3 text-sm text-gold-dark">
                  Extracted teacher metadata is still <strong>{extractedTeacherName}</strong>. It has not been matched to a saved teacher record yet.
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={saveTeacherAssignment}
                disabled={teacherSaving}
                className="btn-primary flex-1 py-3 text-sm disabled:opacity-50"
              >
                {teacherSaving ? "Saving…" : "Save teacher assignment"}
              </button>
              <button
                onClick={() => setTeacherEditorOpen(false)}
                disabled={teacherSaving}
                className="btn-ghost px-5 py-3 text-sm disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {groupModal && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setGroupModal(false);
            }
          }}
        >
          <div className="w-full max-w-sm animate-pop-in rounded-3xl bg-white p-8 shadow-warm-lg">
            <div className="mb-4 text-4xl">👥</div>
            <h3 className="mb-2 font-display text-xl font-black tracking-tight text-ink">Group Check-in</h3>
            <p className="mb-5 text-sm leading-relaxed text-ink-light">
              Mark all <strong>{unchecked} unchecked</strong> students as Present in the local draft before you submit the real attendance.
            </p>
            <div className="mb-6 rounded-2xl bg-sage-light px-4 py-3 text-sm font-semibold text-sage-dark">
              {unchecked} students will be marked present
            </div>
            <div className="flex gap-3">
              <button onClick={doGroup} className="btn-sage flex-1 py-3 text-sm">Mark All Present</button>
              <button onClick={() => setGroupModal(false)} className="btn-ghost px-5 py-3 text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {addStudentOpen && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget && !addingStudent) {
              setAddStudentOpen(false);
              setEditingStudentId(null);
              setAddStudentForm(EMPTY_ADD_STUDENT_FORM);
            }
          }}
        >
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-warm-lg">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-black tracking-tight text-ink">{isEditingStudent ? "Edit student" : "Add student to this list"}</h3>
                <p className="mt-1 text-sm text-ink-light">
                  {isEditingStudent
                    ? "Update this student on the master list. Changes appear here immediately and carry into future classes."
                    : "Save a student directly onto this real list. Duplicate full names are blocked, and later uploads will only auto-merge matching names when the evidence agrees."}
                </p>
                {sessionSubmitted && (
                  <p className="mt-2 text-xs font-medium text-gold">
                    This session is already submitted. Roster edits still update the master list and future check-ins, but they do not change the submitted attendance.
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  if (!addingStudent) {
                    setAddStudentOpen(false);
                    setEditingStudentId(null);
                    setAddStudentForm(EMPTY_ADD_STUDENT_FORM);
                  }
                }}
                className="rounded-xl bg-cream-deep px-3 py-1.5 text-xs font-bold text-ink-light"
              >
                Close
              </button>
            </div>

            {addStudentError && (
              <div className="mb-4 rounded-2xl bg-blush-light px-4 py-3 text-xs font-medium text-blush">
                {addStudentError}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {([
                ["name", "Display Name"],
                ["firstName", "First Name"],
                ["lastName", "Last Name"],
                ["childSheetNumber", "Sheet #"],
                ["guardianName", "Guardian Name"],
                ["guardianPhone", "Guardian Phone"],
                ["guardianEmail", "Guardian Email"],
                ["shortCode", "Short Code"],
                ["pickupNotesPre", "Pre-class Notes"],
                ["pickupNotesPost", "Post-class Notes"],
                ["allergies", "Allergies"],
                ["specialNeeds", "Special Needs"],
                ["notes", "Notes"],
              ] as Array<[keyof AddStudentForm, string]>).map(([field, label]) => (
                <label key={field} className={`block ${field === "specialNeeds" || field === "notes" ? "md:col-span-2" : ""}`}>
                  <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-light">{label}</span>
                  {field === "specialNeeds" || field === "notes" || field === "pickupNotesPre" || field === "pickupNotesPost" || field === "allergies" ? (
                    <textarea
                      value={addStudentForm[field]}
                      onChange={(event) => setAddStudentForm((current) => ({ ...current, [field]: event.target.value }))}
                      rows={field === "allergies" ? 2 : 3}
                      className="input-warm min-h-[104px]"
                    />
                  ) : (
                    <input
                      value={addStudentForm[field]}
                      onChange={(event) => setAddStudentForm((current) => ({ ...current, [field]: event.target.value }))}
                      className="input-warm"
                    />
                  )}
                </label>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  if (!addingStudent) {
                    setAddStudentOpen(false);
                    setEditingStudentId(null);
                    setAddStudentForm(EMPTY_ADD_STUDENT_FORM);
                  }
                }}
                className="btn-ghost px-5 py-3 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={saveStudent}
                disabled={addingStudent}
                className="btn-primary px-5 py-3 text-sm disabled:opacity-50"
              >
                {addingStudent ? "Saving…" : isEditingStudent ? "Save changes" : "Save student"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CheckInPage() {
  return (
    <Suspense
      fallback={(
        <HonestState
          title="Loading real check-in data"
          description="Reading the check-in link and preparing the live session."
          tone="loading"
        />
      )}
    >
      <CheckInPageContent />
    </Suspense>
  );
}