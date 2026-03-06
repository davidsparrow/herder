"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function OnboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/auth/login"); return; }

    // Update profile name
    const { error: profileUpdateError } = await supabase.from("profiles").update({ full_name: name }).eq("id", user.id);
    console.log("[onboard] profile update:", { userId: user.id, profileUpdateError });

    // Update org name
    const { data: profile, error: profileFetchError } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
    console.log("[onboard] profile fetch for org_id:", { profile, profileFetchError });
    if (profile?.org_id) {
      const { error: orgUpdateError } = await supabase.from("orgs").update({ name: orgName || name + "'s Org" }).eq("id", profile.org_id);
      console.log("[onboard] org update:", { orgId: profile.org_id, orgUpdateError });
    }

    router.push("/dashboard/upload");
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-4">
      <div className="text-5xl mb-6">🐑</div>
      <div className="card p-8 w-full max-w-md animate-float-up">
        <h1 className="font-display font-black text-2xl text-ink tracking-tight mb-2">Welcome to Herder!</h1>
        <p className="text-sm text-ink-light mb-7">
          You're on the <strong className="text-terra">Free plan</strong> — let's get your account set up in 30 seconds.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">Your Name</label>
            <input value={name} onChange={e => setName(e.target.value)} required
              placeholder="Ms. Rivera" className="input-warm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">School / Organization</label>
            <input value={orgName} onChange={e => setOrgName(e.target.value)}
              placeholder="Lincoln Elementary" className="input-warm" />
          </div>

          <div className="bg-terra-light rounded-2xl px-4 py-3 text-xs text-terra-dark">
            🐑 Free plan: up to 3 lists · 20 names each · Upgrade anytime
          </div>

          <button type="submit" disabled={!name || saving}
            className="btn-primary w-full py-3 text-sm disabled:opacity-50">
            {saving ? "Setting up…" : "Let's go → Upload my first list"}
          </button>
        </form>
      </div>
    </div>
  );
}
