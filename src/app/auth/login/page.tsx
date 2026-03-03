"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [mode, setMode]         = useState<"magic" | "oauth">("magic");

  const sendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

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

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 mb-10">
        <div className="w-10 h-10 rounded-2xl bg-terra flex items-center justify-center">
          <svg width="20" height="16" viewBox="0 0 18 14" fill="none">
            <path d="M2 7L7 12L16 2" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
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
            <p className="text-sm text-ink-light mb-7">New here? Your free account is created automatically.</p>

            {/* Magic link form */}
            <form onSubmit={sendMagicLink} className="space-y-4 mb-5">
              <div>
                <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">
                  Email address
                </label>
                <input
                  type="email" required value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@school.edu"
                  className="input-warm"
                />
              </div>
              {error && (
                <div className="bg-blush-light text-blush text-sm font-medium rounded-2xl px-4 py-3">
                  {error}
                </div>
              )}
              <button type="submit" disabled={loading || !email}
                className="btn-primary w-full py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? "Sending…" : "Send magic link →"}
              </button>
            </form>

            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-cream-border" />
              <span className="text-xs text-ink-light font-medium">or</span>
              <div className="flex-1 h-px bg-cream-border" />
            </div>

            {/* Google OAuth */}
            <button onClick={signInWithGoogle}
              className="btn-ghost w-full py-3 text-sm flex items-center justify-center gap-2.5">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

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
