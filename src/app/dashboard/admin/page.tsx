"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Org, Teacher } from "@/lib/types";

type AdminTab = "plan" | "columns" | "notifications" | "teachers" | "users";
type OrgSettingsForm = {
  name: string;
  phone: string;
  email: string;
};

type TeacherForm = {
  name: string;
  email: string;
  phone: string;
};

type TeacherDirectoryRow = Pick<Teacher, "id" | "name" | "email" | "phone">;

const EMPTY_ORG_SETTINGS: OrgSettingsForm = {
  name: "",
  phone: "",
  email: "",
};

const EMPTY_TEACHER_FORM: TeacherForm = {
  name: "",
  email: "",
  phone: "",
};

function cleanOptionalValue(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function sortTeachers(rows: TeacherDirectoryRow[]) {
  return [...rows].sort((left, right) => left.name.localeCompare(right.name) || (left.email ?? "").localeCompare(right.email ?? ""));
}

function AdminUnavailableState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-2xl rounded-3xl border border-dashed border-cream-border bg-white p-6">
      <p className="text-xs font-bold uppercase tracking-widest text-ink-light">Unavailable for now</p>
      <h2 className="mt-2 font-display text-xl font-black tracking-tight text-ink">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-light">{description}</p>
    </div>
  );
}

export default function AdminPage() {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<AdminTab>("plan");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrgSettingsForm>(EMPTY_ORG_SETTINGS);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [orgSaved, setOrgSaved] = useState(false);
  const [teachers, setTeachers] = useState<TeacherDirectoryRow[]>([]);
  const [teacherForm, setTeacherForm] = useState<TeacherForm>(EMPTY_TEACHER_FORM);
  const [teacherLoading, setTeacherLoading] = useState(true);
  const [teacherSaving, setTeacherSaving] = useState(false);
  const [teacherError, setTeacherError] = useState<string | null>(null);
  const [teacherSaved, setTeacherSaved] = useState(false);
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadOrgSettings = async () => {
      setOrgLoading(true);
      setTeacherLoading(true);
      setOrgError(null);
      setTeacherError(null);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!active) return;

      if (userError || !user) {
        setOrgError(userError?.message ?? "Could not load your account.");
        setOrgLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();

      if (!active) return;

      if (profileError || !profile?.org_id) {
        setOrgError(profileError?.message ?? "Could not find your organization.");
        setOrgLoading(false);
        return;
      }

      const [{ data: org, error: loadOrgError }, { data: teacherRows, error: loadTeacherError }] = await Promise.all([
        supabase
          .from("orgs")
          .select("id, name, phone, email")
          .eq("id", profile.org_id)
          .single(),
        supabase
          .from("teachers")
          .select("id, name, email, phone")
          .order("name", { ascending: true }),
      ]) as [
        { data: Pick<Org, "id" | "name" | "phone" | "email"> | null; error: any },
        { data: TeacherDirectoryRow[] | null; error: any },
      ];

      if (!active) return;

      if (loadOrgError || !org) {
        setOrgError(loadOrgError?.message ?? "Could not load organization settings.");
        setOrgLoading(false);
        setTeacherLoading(false);
        return;
      }

      setOrgId(org.id);
      setOrgSettings({
        name: org.name ?? "",
        phone: org.phone ?? "",
        email: org.email ?? "",
      });

      if (loadTeacherError) {
        setTeacherError(loadTeacherError.message ?? "Could not load teacher directory.");
        setTeachers([]);
      } else {
        setTeachers(sortTeachers((teacherRows ?? []) as TeacherDirectoryRow[]));
      }

      setOrgLoading(false);
      setTeacherLoading(false);
    };

    void loadOrgSettings();

    return () => {
      active = false;
    };
  }, [supabase]);

  const saveOrgSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!orgId) {
      setOrgError("Could not determine your organization.");
      return;
    }

    const trimmedName = orgSettings.name.trim();
    if (!trimmedName) {
      setOrgError("Organization name is required.");
      return;
    }

    setOrgSaving(true);
    setOrgError(null);
    setOrgSaved(false);

    const phone = cleanOptionalValue(orgSettings.phone);
    const email = cleanOptionalValue(orgSettings.email);

    const { error } = await supabase
      .from("orgs")
      .update({ name: trimmedName, phone, email })
      .eq("id", orgId);

    if (error) {
      setOrgError(error.message);
      setOrgSaving(false);
      return;
    }

    setOrgSettings({ name: trimmedName, phone: phone ?? "", email: email ?? "" });
    setOrgSaved(true);
    setOrgSaving(false);
  };

  const resetTeacherForm = () => {
    setTeacherForm(EMPTY_TEACHER_FORM);
    setEditingTeacherId(null);
    setTeacherSaved(false);
  };

  const saveTeacher = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!orgId) {
      setTeacherError("Could not determine your organization.");
      return;
    }

    const trimmedName = teacherForm.name.trim();
    if (!trimmedName) {
      setTeacherError("Teacher name is required.");
      return;
    }

    setTeacherSaving(true);
    setTeacherError(null);
    setTeacherSaved(false);

    const payload = {
      name: trimmedName,
      email: cleanOptionalValue(teacherForm.email),
      phone: cleanOptionalValue(teacherForm.phone),
    };

    const query = editingTeacherId
      ? supabase
        .from("teachers")
        .update(payload)
        .eq("id", editingTeacherId)
        .eq("org_id", orgId)
      : supabase
        .from("teachers")
        .insert({ org_id: orgId, ...payload });

    const { data, error } = await query
      .select("id, name, email, phone")
      .single() as { data: TeacherDirectoryRow | null; error: any };

    if (error || !data) {
      setTeacherError(error?.message ?? "Could not save this teacher.");
      setTeacherSaving(false);
      return;
    }

    setTeachers((current) => {
      const withoutEdited = current.filter((teacher) => teacher.id !== data.id);
      return sortTeachers([...withoutEdited, data]);
    });
    setTeacherForm({ name: data.name, email: data.email ?? "", phone: data.phone ?? "" });
    setEditingTeacherId(data.id);
    setTeacherSaved(true);
    setTeacherSaving(false);
  };

  const startEditingTeacher = (teacher: TeacherDirectoryRow) => {
    setEditingTeacherId(teacher.id);
    setTeacherForm({
      name: teacher.name,
      email: teacher.email ?? "",
      phone: teacher.phone ?? "",
    });
    setTeacherError(null);
    setTeacherSaved(false);
    setTab("teachers");
  };

  const TABS: { id: AdminTab; label: string }[] = [
    { id: "plan", label: "Plan Limits" },
    { id: "columns", label: "Custom Columns" },
    { id: "notifications", label: "Notification Rules" },
    { id: "teachers", label: "Teachers" },
    { id: "users", label: "Users" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-cream-border px-6 py-4">
        <div className="mb-4">
          <h1 className="font-display font-black text-xl text-ink tracking-tight">Admin Settings</h1>
          <p className="text-xs text-ink-light mt-0.5">Update organization contact details for notifications and review global admin controls.</p>
        </div>
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t.id ? "bg-ink text-white" : "text-ink-light hover:bg-cream-deep hover:text-ink"
                }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mb-6">
          <form onSubmit={saveOrgSettings} className="card p-6 space-y-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="font-display font-black text-lg text-ink">Organization Settings</h2>
                <p className="text-sm text-ink-light max-w-2xl mt-1">
                  Save your organization name, phone, and email so admins and notification workflows have real contact details to use.
                </p>
              </div>
              <button
                type="submit"
                disabled={orgLoading || orgSaving}
                className={`btn-primary px-5 py-2.5 text-sm transition-all disabled:opacity-50 ${orgSaved ? "bg-sage shadow-sage" : ""}`}
              >
                {orgSaving ? "Saving…" : orgSaved ? "✓ Saved" : "Save organization"}
              </button>
            </div>

            {orgError && (
              <div className="rounded-2xl bg-blush-light px-4 py-3 text-sm text-blush">
                {orgError}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">
                  Organization Name
                </label>
                <input
                  value={orgSettings.name}
                  onChange={e => {
                    setOrgSaved(false);
                    setOrgSettings(current => ({ ...current, name: e.target.value }));
                  }}
                  placeholder="Lincoln Elementary"
                  className="input-warm"
                  disabled={orgLoading || orgSaving}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">
                  Organization Phone
                </label>
                <input
                  type="tel"
                  value={orgSettings.phone}
                  onChange={e => {
                    setOrgSaved(false);
                    setOrgSettings(current => ({ ...current, phone: e.target.value }));
                  }}
                  placeholder="(555) 123-4567"
                  className="input-warm"
                  disabled={orgLoading || orgSaving}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">
                  Organization Email
                </label>
                <input
                  type="email"
                  value={orgSettings.email}
                  onChange={e => {
                    setOrgSaved(false);
                    setOrgSettings(current => ({ ...current, email: e.target.value }));
                  }}
                  placeholder="frontdesk@school.edu"
                  className="input-warm"
                  disabled={orgLoading || orgSaving}
                />
              </div>
            </div>

            <p className="text-xs text-ink-light">
              {orgLoading ? "Loading organization settings…" : "These values are stored on your organization record and can be used by notification workflows."}
            </p>
          </form>
        </div>

        {/* ── Plan Limits tab ─────────────────────────────────────────────── */}
        {tab === "plan" && (
          <AdminUnavailableState
            title="Plan overrides are not wired to live org data yet"
            description="This screen no longer shows placeholder plan limits or fake per-tier overrides as if they were saved organization settings."
          />
        )}

        {/* ── Custom Columns tab ────────────────────────────────────────────── */}
        {tab === "columns" && (
          <AdminUnavailableState
            title="Global custom columns are not loaded from real settings here yet"
            description="Placeholder column rows have been removed from this authenticated screen until the admin column manager is backed by persisted organization data."
          />
        )}

        {/* ── Notification Rules tab ────────────────────────────────────────── */}
        {tab === "notifications" && (
          <AdminUnavailableState
            title="Notification rules are not backed by persisted org configuration yet"
            description="This page now avoids showing fabricated notification triggers, recipients, or active states as if they were your organization’s live rules."
          />
        )}

        {/* ── Teachers tab ─────────────────────────────────────────────────── */}
        {tab === "teachers" && (
          <div className="max-w-4xl space-y-5">
            <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="card overflow-hidden">
                <div className="border-b border-cream-border bg-parchment px-5 py-4">
                  <h2 className="font-display font-black text-lg text-ink">Teacher Directory</h2>
                  <p className="mt-1 text-sm text-ink-light">
                    These org-scoped teacher records power original-teacher and substitute-teacher selection on check-in lists.
                  </p>
                </div>

                {teacherError && (
                  <div className="mx-5 mt-5 rounded-2xl bg-blush-light px-4 py-3 text-sm text-blush">
                    {teacherError}
                  </div>
                )}

                <div className="p-5">
                  {teacherLoading ? (
                    <p className="text-sm text-ink-light">Loading teacher directory…</p>
                  ) : teachers.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-cream-border bg-white px-4 py-5 text-sm text-ink-light">
                      No teachers saved yet. Add your first teacher record to enable org-scoped teacher selection on lists.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {teachers.map((teacher) => (
                        <div key={teacher.id} className="flex items-start gap-4 rounded-2xl border border-cream-border bg-white px-4 py-4">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-light text-sm font-black text-sky">
                            {teacher.name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("") || "T"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-ink">{teacher.name}</p>
                            <div className="mt-1 space-y-0.5 text-xs text-ink-light">
                              <p>{teacher.email || "No email saved"}</p>
                              <p>{teacher.phone || "No phone saved"}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => startEditingTeacher(teacher)}
                            className="btn-ghost px-3 py-2 text-xs"
                          >
                            Edit
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <form onSubmit={saveTeacher} className="card p-6 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display font-black text-lg text-ink">
                      {editingTeacherId ? "Edit Teacher" : "Add Teacher"}
                    </h2>
                    <p className="mt-1 text-sm text-ink-light">
                      Save a name plus optional email and phone for directory-backed list assignment.
                    </p>
                  </div>
                  {editingTeacherId && (
                    <button type="button" onClick={resetTeacherForm} className="btn-ghost px-3 py-2 text-xs">
                      New record
                    </button>
                  )}
                </div>

                {teacherSaved && (
                  <div className="rounded-2xl bg-sage-light px-4 py-3 text-sm text-sage-dark">
                    Teacher directory saved.
                  </div>
                )}

                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-light">Teacher Name</span>
                    <input
                      value={teacherForm.name}
                      onChange={(event) => {
                        setTeacherSaved(false);
                        setTeacherForm((current) => ({ ...current, name: event.target.value }));
                      }}
                      placeholder="Ms. Rivera"
                      className="input-warm"
                      disabled={teacherSaving}
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-light">Email</span>
                    <input
                      type="email"
                      value={teacherForm.email}
                      onChange={(event) => {
                        setTeacherSaved(false);
                        setTeacherForm((current) => ({ ...current, email: event.target.value }));
                      }}
                      placeholder="teacher@school.edu"
                      className="input-warm"
                      disabled={teacherSaving}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-light">Phone</span>
                    <input
                      type="tel"
                      value={teacherForm.phone}
                      onChange={(event) => {
                        setTeacherSaved(false);
                        setTeacherForm((current) => ({ ...current, phone: event.target.value }));
                      }}
                      placeholder="(555) 123-4567"
                      className="input-warm"
                      disabled={teacherSaving}
                    />
                  </label>
                </div>

                <button type="submit" disabled={teacherSaving || teacherLoading} className="btn-primary px-5 py-3 text-sm disabled:opacity-50">
                  {teacherSaving ? "Saving…" : editingTeacherId ? "Save teacher" : "Add teacher"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── Users tab ─────────────────────────────────────────────────────── */}
        {tab === "users" && (
          <AdminUnavailableState
            title="The user directory is not connected to live profile data on this page yet"
            description="Placeholder staff rows and invite controls were removed so signed-in admins do not see fabricated users, roles, or status badges presented as real organization members."
          />
        )}
      </div>
    </div>
  );
}
