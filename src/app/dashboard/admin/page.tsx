"use client";

import { useEffect, useMemo, useState } from "react";
import { PLANS, type PlanTier } from "@/lib/plans";
import { createClient } from "@/lib/supabase/client";
import type { Org } from "@/lib/types";

const TIERS: PlanTier[] = ["free", "standard", "pro"];

interface PlanOverride {
  maxLists: number | null;
  maxNamesPerList: number | null;
  customColumns: boolean;
  notifications: boolean;
}

const DEFAULT_OVERRIDES: Record<PlanTier, PlanOverride> = {
  free: { maxLists: 3, maxNamesPerList: 20, customColumns: false, notifications: true }, // MVP: Enabled for free
  standard: { maxLists: null, maxNamesPerList: null, customColumns: true, notifications: false },
  pro: { maxLists: null, maxNamesPerList: null, customColumns: true, notifications: true },
};

const GLOBAL_COLUMNS_INIT = [
  { id: "c1", name: "Guardian Phone", type: "phone", required: true },
  { id: "c2", name: "Allergies", type: "text", required: false },
  { id: "c3", name: "Pickup Location", type: "text", required: false },
  { id: "c4", name: "Notif. Channel", type: "select", required: false },
  { id: "c5", name: "Notif. Preference", type: "select", required: false },
];

const NOTIF_RULES_INIT = [
  { event: "Check-in submitted", recipients: "Admin + Teachers", channel: "Email", active: true },
  { event: "Student absent", recipients: "Guardian", channel: "SMS", active: true },
  { event: "Student checked in", recipients: "Guardian", channel: "SMS", active: true },
  { event: "Off-campus arrival", recipients: "Guardian + Admin", channel: "SMS", active: false },
  { event: "Emergency alert", recipients: "All", channel: "SMS+Email", active: true },
];

type AdminTab = "plan" | "columns" | "notifications" | "users";
type OrgSettingsForm = {
  name: string;
  phone: string;
  email: string;
};

const EMPTY_ORG_SETTINGS: OrgSettingsForm = {
  name: "",
  phone: "",
  email: "",
};

function cleanOptionalValue(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export default function AdminPage() {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<AdminTab>("plan");
  const [overrides, setOverrides] = useState(DEFAULT_OVERRIDES);
  const [columns, setColumns] = useState(GLOBAL_COLUMNS_INIT);
  const [rules, setRules] = useState(NOTIF_RULES_INIT);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrgSettingsForm>(EMPTY_ORG_SETTINGS);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [orgSaved, setOrgSaved] = useState(false);

  useEffect(() => {
    let active = true;

    const loadOrgSettings = async () => {
      setOrgLoading(true);
      setOrgError(null);

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

      const { data: org, error: loadOrgError } = await supabase
        .from("orgs")
        .select("id, name, phone, email")
        .eq("id", profile.org_id)
        .single() as { data: Pick<Org, "id" | "name" | "phone" | "email"> | null; error: any };

      if (!active) return;

      if (loadOrgError || !org) {
        setOrgError(loadOrgError?.message ?? "Could not load organization settings.");
        setOrgLoading(false);
        return;
      }

      setOrgId(org.id);
      setOrgSettings({
        name: org.name ?? "",
        phone: org.phone ?? "",
        email: org.email ?? "",
      });
      setOrgLoading(false);
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

  const TABS: { id: AdminTab; label: string }[] = [
    { id: "plan", label: "Plan Limits" },
    { id: "columns", label: "Custom Columns" },
    { id: "notifications", label: "Notification Rules" },
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
          <div className="space-y-5 max-w-3xl">
            <p className="text-sm text-ink-light leading-relaxed">
              These are the default limits for each plan tier. Override them here per-org (e.g. to give a school a custom allowance). Leave blank for unlimited.
            </p>
            {TIERS.map(tier => {
              const plan = PLANS[tier];
              const ov = overrides[tier];
              return (
                <div key={tier} className="card p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <span className="text-2xl">{plan.badge}</span>
                    <div>
                      <h2 className="font-display font-black text-lg text-ink">{plan.name}</h2>
                      <p className="text-xs text-ink-light">{plan.price}</p>
                    </div>
                    <span className="ml-auto badge bg-cream-deep text-ink-light">{plan.description.split(" ").slice(0, 4).join(" ")}…</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">
                        Max Lists
                      </label>
                      <input
                        type="number" min={1} placeholder="Unlimited"
                        value={ov.maxLists ?? ""}
                        onChange={e => setOverrides(p => ({
                          ...p,
                          [tier]: { ...p[tier], maxLists: e.target.value ? Number(e.target.value) : null }
                        }))}
                        className="input-warm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">
                        Max Names / List
                      </label>
                      <input
                        type="number" min={1} placeholder="Unlimited"
                        value={ov.maxNamesPerList ?? ""}
                        onChange={e => setOverrides(p => ({
                          ...p,
                          [tier]: { ...p[tier], maxNamesPerList: e.target.value ? Number(e.target.value) : null }
                        }))}
                        className="input-warm"
                      />
                    </div>
                  </div>

                  <div className="flex gap-6">
                    {[
                      { key: "customColumns" as const, label: "Custom Columns" },
                      { key: "notifications" as const, label: "Notifications" },
                    ].map(f => (
                      <label key={f.key} className="flex items-center gap-2.5 cursor-pointer">
                        <button
                          onClick={() => setOverrides(p => ({
                            ...p,
                            [tier]: { ...p[tier], [f.key]: !p[tier][f.key] }
                          }))}
                          className={`w-10 h-6 rounded-full relative transition-colors duration-200 ${ov[f.key] ? "bg-sage" : "bg-cream-border"
                            }`}
                        >
                          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${ov[f.key] ? "left-5" : "left-1"
                            }`} />
                        </button>
                        <span className="text-sm font-semibold text-ink-mid">{f.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Custom Columns tab ────────────────────────────────────────────── */}
        {tab === "columns" && (
          <div className="max-w-2xl space-y-4">
            <p className="text-sm text-ink-light">
              These columns appear on <strong>every</strong> check-in list in your organization (Standard + Pro). Teachers see them when uploading a new list.
            </p>
            <div className="card overflow-hidden">
              <div className="grid grid-cols-[1fr_100px_80px_80px] gap-3 px-5 py-3 bg-parchment border-b border-cream-border text-xs font-bold uppercase tracking-widest text-ink-light">
                <span>Column Name</span><span>Type</span><span>Required</span><span>Remove</span>
              </div>
              {columns.map((col, i) => (
                <div key={col.id} className="grid grid-cols-[1fr_100px_80px_80px] gap-3 px-5 py-3.5 border-b border-cream-border items-center last:border-0">
                  <input value={col.name} onChange={e => setColumns(c => c.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                    className="input-warm py-2 text-sm" />
                  <select value={col.type} onChange={e => setColumns(c => c.map((x, j) => j === i ? { ...x, type: e.target.value as "text" | "phone" | "select" | "boolean" } : x))}
                    className="input-warm py-2 text-sm">
                    {["text", "phone", "select", "boolean"].map(t => <option key={t}>{t}</option>)}
                  </select>
                  <div className="flex justify-center">
                    <button onClick={() => setColumns(c => c.map((x, j) => j === i ? { ...x, required: !x.required } : x))}
                      className={`w-10 h-6 rounded-full relative transition-colors ${col.required ? "bg-terra" : "bg-cream-border"}`}>
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${col.required ? "left-5" : "left-1"}`} />
                    </button>
                  </div>
                  <div className="flex justify-center">
                    <button onClick={() => setColumns(c => c.filter((_, j) => j !== i))}
                      className="w-8 h-8 rounded-xl bg-blush-light text-blush text-sm font-bold hover:bg-blush hover:text-white transition-colors">✕</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setColumns(c => [...c, { id: `c${Date.now()}`, name: "New Column", type: "text", required: false }])}
              className="btn-primary text-sm px-4 py-2.5">
              + Add Column
            </button>
          </div>
        )}

        {/* ── Notification Rules tab ────────────────────────────────────────── */}
        {tab === "notifications" && (
          <div className="max-w-2xl space-y-4">
            <div className="bg-terra-light border border-terra/30 rounded-2xl px-5 py-4 text-sm text-terra-dark">
              ℹ Notification rules fire on <strong>Free (BETA only) and Pro plans</strong>. Automated SMS + email are temporarily available for free users.
            </div>
            <div className="card overflow-hidden">
              <div className="grid grid-cols-[2fr_1.5fr_1fr_64px] gap-3 px-5 py-3 bg-parchment border-b border-cream-border text-xs font-bold uppercase tracking-widest text-ink-light">
                <span>Trigger</span><span>Recipients</span><span>Channel</span><span>Active</span>
              </div>
              {rules.map((r, i) => (
                <div key={i} className="grid grid-cols-[2fr_1.5fr_1fr_64px] gap-3 px-5 py-3.5 border-b border-cream-border items-center last:border-0">
                  <span className="text-sm font-medium text-ink">{r.event}</span>
                  <span className="badge bg-sky-light text-sky text-xs">{r.recipients}</span>
                  <span className="text-xs text-ink-light">{r.channel}</span>
                  <div className="flex justify-center">
                    <button onClick={() => setRules(rs => rs.map((x, j) => j === i ? { ...x, active: !x.active } : x))}
                      className={`w-10 h-6 rounded-full relative transition-colors ${r.active ? "bg-sage" : "bg-cream-border"}`}>
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${r.active ? "left-5" : "left-1"}`} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Users tab ─────────────────────────────────────────────────────── */}
        {tab === "users" && (
          <div className="max-w-2xl space-y-4">
            <div className="card overflow-hidden">
              {[
                { name: "Ms. Rivera", role: "admin", email: "rivera@school.edu", tier: "pro", absent: false },
                { name: "Mr. Johnson", role: "teacher", email: "johnson@school.edu", tier: "standard", absent: false },
                { name: "Ms. Chen", role: "teacher", email: "chen@school.edu", tier: "standard", absent: false },
                { name: "Coach Davis", role: "teacher", email: "davis@school.edu", tier: "free", absent: true },
              ].map((u, i, arr) => (
                <div key={i} className={`flex items-center gap-4 px-5 py-4 ${i < arr.length - 1 ? "border-b border-cream-border" : ""}`}>
                  <div className="w-10 h-10 rounded-2xl bg-cream-deep flex items-center justify-center text-sm font-black text-ink-light">
                    {u.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-ink">{u.name}</p>
                    <p className="text-xs text-ink-light">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${u.role === "admin" ? "bg-terra-light text-terra-dark" : "bg-sky-light text-sky"}`}>
                      {u.role}
                    </span>
                    <span className={`badge ${u.tier === "pro" ? "bg-terra-light text-terra-dark" :
                      u.tier === "standard" ? "bg-sky-light text-sky" : "bg-cream-deep text-ink-light"
                      }`}>{PLANS[u.tier as PlanTier].badge} {u.tier}</span>
                    {u.absent && <span className="badge bg-blush-light text-blush">Absent</span>}
                  </div>
                </div>
              ))}
            </div>
            <button className="btn-primary text-sm px-4 py-2.5">+ Invite user</button>
          </div>
        )}
      </div>
    </div>
  );
}
