"use client";

export const dynamic = "force-dynamic";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

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

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("password");

  const sendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSent(true);
  };

  const signInWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    window.location.href = "/dashboard";
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSuccess("Account created! Check your email to confirm, or just sign in with your password now.");
  };

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-4">
      <Link href="/" className="flex items-center gap-2.5 mb-10">
        <div className="w-10 h-10 rounded-2xl bg-terra flex items-center justify-center">
          <svg width="20" height="16" viewBox="0 0 18 14" fill="none">
            <path d="M2 7L7 12L16 2" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span className="font-display font-black text-2xl text-ink tracking-tight">Herder</span>
      </Link>

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
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@school.edu" className="input-warm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">Password</label>
                  <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" className="input-warm" />
                </div>
                <button type="submit" disabled={loading || !email || !password}
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
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@school.edu" className="input-warm" />
                </div>
                <button type="submit" disabled={loading || !email}
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
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@school.edu" className="input-warm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">Password</label>
                  <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="min. 6 characters" className="input-warm" />
                </div>
                <button type="submit" disabled={loading || !email || !password}
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
