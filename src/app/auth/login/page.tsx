"use client";

export const dynamic = "force-dynamic";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import BrandLockup from "@/components/BrandLockup";

function AuthErrorBanner() {
  const searchParams = useSearchParams();
  const authError = searchParams.get("error");
  const authDetail = searchParams.get("detail");
  if (!authError) return null;
  return (
    <div className="bg-blush-light text-blush text-sm font-medium rounded-2xl px-4 py-3">
      <strong>Sign-in failed.</strong>{authDetail ? ` ${authDetail}` : " Please try again or request a new link."}
    </div>
  );
}

type Mode = "magic" | "password" | "signup";
const DEBUG_STORAGE_KEY = "herder_auth_debug";

export default function LoginPage() {
  const supabase = useMemo(() => createClient(), []);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("password");
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [clientSessionStatus, setClientSessionStatus] = useState("Checking client session…");
  const [clientUserStatus, setClientUserStatus] = useState("Checking client user…");

  const appendDebug = (message: string) => {
    const line = `${new Date().toLocaleTimeString()} — ${message}`;
    setDebugLog(prev => {
      const next = [...prev, line].slice(-12);
      window.sessionStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const clearDebug = () => {
    window.sessionStorage.removeItem(DEBUG_STORAGE_KEY);
    setDebugLog([]);
  };

  const syncCredentialState = useCallback((source: string) => {
    const nextEmail = emailInputRef.current?.value ?? "";
    const nextPassword = passwordInputRef.current?.value ?? "";

    setEmail((current) => current === nextEmail ? current : nextEmail);
    setPassword((current) => current === nextPassword ? current : nextPassword);

    if (nextEmail || nextPassword) {
      appendDebug(`Credential fields synced from ${source} (email: ${nextEmail ? "yes" : "no"}, password: ${nextPassword ? "yes" : "no"})`);
    }

    return { nextEmail, nextPassword };
  }, []);

  const getCredentialValues = useCallback((source: string) => {
    const { nextEmail, nextPassword } = syncCredentialState(source);
    return {
      email: nextEmail.trim(),
      password: nextPassword,
    };
  }, [syncCredentialState]);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(DEBUG_STORAGE_KEY);
    let nextLog: string[] = [];

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) nextLog = parsed.filter((item): item is string => typeof item === "string");
      } catch {
        window.sessionStorage.removeItem(DEBUG_STORAGE_KEY);
      }
    }

    const params = new URLSearchParams(window.location.search);
    const authDebug = params.get("auth_debug");
    const from = params.get("from");
    const detail = params.get("auth_detail");
    if (authDebug) {
      nextLog = [
        ...nextLog,
        `Server redirect reason: ${authDebug}${from ? ` (from ${from})` : ""}${detail ? ` — ${detail}` : ""}`,
      ].slice(-12);
      window.sessionStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(nextLog));
    }

    setDebugLog(nextLog);

    const autofillSyncTimers = [0, 150, 500, 1200].map((delay) => window.setTimeout(() => {
      syncCredentialState(`autofill-check-${delay}ms`);
    }, delay));

    const loadClientAuthState = async () => {
      const [{ data: sessionData, error: sessionError }, { data: userData, error: userError }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser(),
      ]);

      setClientSessionStatus(
        sessionError
          ? `error: ${sessionError.message}`
          : sessionData.session
            ? "present"
            : "missing"
      );
      setClientUserStatus(
        userError
          ? `error: ${userError.message}`
          : userData.user
            ? `present (${userData.user.id.slice(0, 8)}…)`
            : "missing"
      );
    };

    void loadClientAuthState();

    return () => {
      autofillSyncTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [supabase, syncCredentialState]);

  const sendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const { email: currentEmail } = getCredentialValues("magic-submit");
    if (!currentEmail) {
      setError("Please enter your email address.");
      return;
    }
    setLoading(true); setError(null);
    appendDebug("Magic link sign-in started");
    const { error } = await supabase.auth.signInWithOtp({
      email: currentEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });
    setLoading(false);
    if (error) {
      appendDebug(`Magic link error: ${error.message}`);
      setError(error.message);
      return;
    }
    appendDebug("Magic link email sent successfully");
    setSent(true);
  };

  // Exchange tokens server-side so the middleware can read the session cookie
  const serverSetSession = async (access_token: string, refresh_token: string) => {
    const response = await fetch("/api/auth/set-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token, refresh_token }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error ?? `set-session failed with status ${response.status}`);
    }

    return payload;
  };

  const signInWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const { email: currentEmail, password: currentPassword } = getCredentialValues("password-submit");
    if (!currentEmail || !currentPassword) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true); setError(null);
    appendDebug("Password sign-in started");
    const { data, error } = await supabase.auth.signInWithPassword({ email: currentEmail, password: currentPassword });
    if (error) {
      appendDebug(`Password sign-in error: ${error.message}`);
      setLoading(false);
      setError(error.message);
      return;
    }
    appendDebug(`Password sign-in returned user: ${data.user?.id?.slice(0, 8) ?? "none"}`);
    appendDebug(`Password sign-in returned session: ${data.session ? "yes" : "no"}`);
    if (data.session) {
      try {
        await serverSetSession(data.session.access_token, data.session.refresh_token);
        appendDebug("Server session cookie write succeeded");
      } catch (sessionError) {
        const message = sessionError instanceof Error ? sessionError.message : "Unknown session exchange error";
        appendDebug(`Server session cookie write failed: ${message}`);
        setLoading(false);
        setError(message);
        return;
      }
    }
    appendDebug("Redirecting browser to /dashboard");
    window.location.href = "/dashboard";
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const { email: currentEmail, password: currentPassword } = getCredentialValues("signup-submit");
    if (!currentEmail || !currentPassword) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true); setError(null);
    appendDebug("Create account started");
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email: currentEmail, password: currentPassword });
    if (signUpError) {
      appendDebug(`Create account error: ${signUpError.message}`);
      setLoading(false);
      setError(signUpError.message);
      return;
    }
    appendDebug(`Create account returned user: ${signUpData.user?.id?.slice(0, 8) ?? "none"}`);

    // If no session from signup (email confirm ON), immediately sign in
    let session = signUpData?.session;
    if (!session) {
      appendDebug("Signup returned no session; attempting password sign-in fallback");
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email: currentEmail, password: currentPassword });
      if (signInError) {
        appendDebug(`Fallback password sign-in error: ${signInError.message}`);
        setLoading(false);
        setError(signInError.message);
        return;
      }
      session = signInData?.session ?? null;
    }

    appendDebug(`Final signup session available: ${session ? "yes" : "no"}`);

    if (session) {
      try {
        await serverSetSession(session.access_token, session.refresh_token);
        appendDebug("Server session cookie write succeeded after signup");
      } catch (sessionError) {
        const message = sessionError instanceof Error ? sessionError.message : "Unknown session exchange error";
        appendDebug(`Server session cookie write failed after signup: ${message}`);
        setLoading(false);
        setError(message);
        return;
      }
    }

    // Trigger in DB auto-creates org + profile
    appendDebug("Redirecting browser to /onboard");
    window.location.href = "/onboard";
  };

  const signInWithGoogle = async () => {
    appendDebug("Google OAuth redirect started");
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const canSubmitPassword = Boolean(email.trim() && password);
  const canSubmitMagicLink = Boolean(email.trim());

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-4">
      <BrandLockup href="/" className="mb-10" />

      <div className="card p-8 w-full max-w-md animate-float-up">
        {sent ? (
          <div className="text-center py-4">
            <div className="text-5xl mb-5">📬</div>
            <h2 className="font-display font-black text-2xl text-ink mb-3 tracking-tight">Check your inbox</h2>
            <p className="text-sm text-ink-light leading-relaxed mb-6">
              We sent a sign-in link to <strong className="text-ink">{email}</strong>.<br />
              It expires in 10 minutes.
            </p>
            <button onClick={() => { setSent(false); setEmail(""); }}
              className="text-sm text-terra font-semibold hover:underline">
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <h1 className="font-display font-black text-2xl text-ink mb-1 tracking-tight">Sign in to Herder</h1>
            <p className="text-sm text-ink-light mb-6">New here? Your free account is created automatically.</p>

            {/* Mode tabs */}
            <div className="flex gap-1 bg-parchment rounded-2xl p-1 mb-6">
              {([["password", "Password"], ["magic", "Magic Link"], ["signup", "Create Account"]] as [Mode, string][]).map(([m, label]) => (
                <button key={m} onClick={() => { setMode(m); setError(null); }}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${mode === m ? "bg-white shadow text-ink" : "text-ink-light hover:text-ink"}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Google OAuth */}
            <button onClick={signInWithGoogle}
              className="btn-ghost w-full py-3 text-sm flex items-center justify-center gap-2.5 mb-4">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
                <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
              </svg>
              Continue with Google
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-cream-border" />
              <span className="text-xs text-ink-light font-medium">or</span>
              <div className="flex-1 h-px bg-cream-border" />
            </div>

            {/* Auth error from callback */}
            <Suspense><AuthErrorBanner /></Suspense>

            <div className="bg-white border border-sky/30 rounded-2xl px-4 py-3 mb-4 text-xs text-ink-light space-y-2">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-ink text-sm">Auth debug</strong>
                <button type="button" onClick={clearDebug} className="text-terra font-semibold hover:underline">
                  Clear
                </button>
              </div>
              <div>Client session: <span className="text-ink font-semibold">{clientSessionStatus}</span></div>
              <div>Client user: <span className="text-ink font-semibold">{clientUserStatus}</span></div>
              <div>
                <div className="text-ink font-semibold mb-1">Recent auth events</div>
                {debugLog.length ? (
                  <ul className="space-y-1 list-disc pl-4">
                    {debugLog.map((line, index) => (
                      <li key={`${index}-${line}`}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No debug events yet.</p>
                )}
              </div>
            </div>

            {success && (
              <div className="bg-sage-light text-sage-dark text-sm font-medium rounded-2xl px-4 py-3 mb-4">
                {success}
              </div>
            )}
            {error && (
              <div className="bg-blush-light text-blush text-sm font-medium rounded-2xl px-4 py-3 mb-4">
                {error}
              </div>
            )}

            {/* Password sign-in */}
            {mode === "password" && (
              <form onSubmit={signInWithPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">Email</label>
                  <input ref={emailInputRef} name="email" autoComplete="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} onInput={() => syncCredentialState("email-input")}
                    placeholder="you@school.edu" className="input-warm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">Password</label>
                  <input ref={passwordInputRef} name="password" autoComplete="current-password" type="password" required value={password} onChange={e => setPassword(e.target.value)} onInput={() => syncCredentialState("password-input")}
                    placeholder="••••••••" className="input-warm" />
                </div>
                <button type="submit" disabled={loading || !canSubmitPassword}
                  className="btn-primary w-full py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? "Signing in…" : "Sign in →"}
                </button>
              </form>
            )}

            {/* Magic link */}
            {mode === "magic" && (
              <form onSubmit={sendMagicLink} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">Email</label>
                  <input ref={emailInputRef} name="email" autoComplete="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} onInput={() => syncCredentialState("email-input")}
                    placeholder="you@school.edu" className="input-warm" />
                </div>
                <button type="submit" disabled={loading || !canSubmitMagicLink}
                  className="btn-primary w-full py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? "Sending…" : "Send magic link →"}
                </button>
              </form>
            )}

            {/* Sign up */}
            {mode === "signup" && (
              <form onSubmit={signUp} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">Email</label>
                  <input ref={emailInputRef} name="email" autoComplete="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} onInput={() => syncCredentialState("email-input")}
                    placeholder="you@school.edu" className="input-warm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">Password</label>
                  <input ref={passwordInputRef} name="new-password" autoComplete="new-password" type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} onInput={() => syncCredentialState("password-input")}
                    placeholder="min. 6 characters" className="input-warm" />
                </div>
                <button type="submit" disabled={loading || !canSubmitPassword}
                  className="btn-primary w-full py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? "Creating account…" : "Create account →"}
                </button>
              </form>
            )}

            <p className="text-xs text-center text-ink-light mt-5 leading-relaxed">
              By signing in, you agree to our{" "}
              <a href="#" className="text-terra hover:underline">Terms</a> and{" "}
              <a href="#" className="text-terra hover:underline">Privacy Policy</a>.
            </p>
          </>
        )}
      </div>

      <p className="text-xs text-ink-light mt-8">
        New accounts start on the <strong>Free plan</strong> — no credit card needed.
      </p>
    </div>
  );
}
