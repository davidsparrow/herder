"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSignedInIdentity } from "@/lib/user-identity";

type AuthUser = {
  email?: string | null;
  user_metadata?: { full_name?: string | null } | null;
} | null;

export default function OnboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser>(null);
  const [identityReady, setIdentityReady] = useState(false);

  useEffect(() => {
    let active = true;

    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      setAuthUser(user);
      setIdentityReady(true);
    };

    void loadUser();

    return () => {
      active = false;
    };
  }, [supabase]);

  const identity = getSignedInIdentity(null, authUser);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data: profile, error: profileUpdateError } = await supabase
        .from("profiles")
        .update({ full_name: name })
        .eq("id", user.id)
        .select("org_id")
        .single();

      console.log("[onboard] profile update:", { userId: user.id, profile, profileUpdateError });

      if (profileUpdateError || !profile?.org_id) {
        setError(profileUpdateError?.message ?? "Could not save your profile.");
        return;
      }

      const { error: orgUpdateError } = await supabase
        .from("orgs")
        .update({ name: orgName || `${name}'s Org` })
        .eq("id", profile.org_id);

      console.log("[onboard] org update:", { orgId: profile.org_id, orgUpdateError });

      if (orgUpdateError) {
        setError(orgUpdateError.message);
        return;
      }

      router.push("/dashboard/upload");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-4">
      <div className="mb-4 w-full max-w-md animate-float-up">
        <div className="flex items-center gap-3 rounded-2xl border border-cream-border bg-white px-4 py-3 shadow-warm">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-terra to-[#F0924A] flex items-center justify-center text-white text-sm font-black">
            {identityReady ? identity.initials : "…"}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-terra-dark">Signed in</p>
            <p className="truncate text-sm font-semibold text-ink">
              {identityReady ? identity.label : "Loading your account…"}
            </p>
          </div>
        </div>
      </div>
      <div className="text-5xl mb-6">🐑</div>
      <div className="card p-8 w-full max-w-md animate-float-up">
        <h1 className="font-display font-black text-2xl text-ink tracking-tight mb-2">Welcome to Herder!</h1>
        <p className="text-sm text-ink-light mb-7">
          You’re on the <strong className="text-terra">Free plan</strong> — let’s get your account set up in 30 seconds.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-blush-light text-blush text-sm rounded-2xl px-4 py-3">
              {error}
            </div>
          )}

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
