"use client";

import { useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ContactModal({ open, onClose }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, notes }),
      });
      if (!res.ok) throw new Error("failed");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  };

  const handleClose = () => {
    setName("");
    setEmail("");
    setNotes("");
    setStatus("idle");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(30, 58, 92, 0.72)", backdropFilter: "blur(4px)" }}
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
        style={{ background: "#1E3A5C" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-7 pb-5">
          <h2 className="text-white font-display font-black text-2xl tracking-tight">Get in touch</h2>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {status === "success" ? (
          <div className="px-7 pb-10 pt-4 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-5">
              <svg width="32" height="26" viewBox="0 0 32 26" fill="none">
                <path d="M3 13L12 22L29 3" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-green-400 font-black text-2xl mb-2">Success!!</p>
            <p className="text-white/70 text-sm">We'll be in touch soon.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-7 pb-7 space-y-4">
            <div>
              <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-1.5">Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-2xl px-4 py-3 text-sm bg-white/10 text-white placeholder-white/30 border border-white/20 outline-none focus:border-white/50 focus:bg-white/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-2xl px-4 py-3 text-sm bg-white/10 text-white placeholder-white/30 border border-white/20 outline-none focus:border-white/50 focus:bg-white/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-1.5">Notes</label>
              <textarea
                required
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What's on your mind?"
                className="w-full rounded-2xl px-4 py-3 text-sm bg-white/10 text-white placeholder-white/30 border border-white/20 outline-none focus:border-white/50 focus:bg-white/15 transition-all resize-none"
              />
            </div>

            {status === "error" && (
              <p className="text-red-400 text-xs text-center">Something went wrong — please try again.</p>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full py-3.5 rounded-2xl font-bold text-sm transition-all"
              style={{
                background: status === "loading" ? "rgba(255,255,255,0.15)" : "#3B82F6",
                color: "white",
                opacity: status === "loading" ? 0.7 : 1,
              }}
            >
              {status === "loading" ? "Sending…" : "Send message"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
