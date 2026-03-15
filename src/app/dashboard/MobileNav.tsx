"use client";

import { useState } from "react";
import Link from "next/link";

const NAV = [
  { href: "/dashboard",         icon: "⊞", label: "Dashboard" },
  { href: "/dashboard/checkin", icon: "✓", label: "Check-in" },
  { href: "/dashboard/upload",  icon: "↑", label: "New List" },
  { href: "/dashboard/classes", icon: "☰", label: "Classes" },
  { href: "/dashboard/notify",  icon: "🔔", label: "Notifications" },
  { href: "/dashboard/admin",   icon: "⚙", label: "Admin" },
];

/**
 * Self-contained mobile nav — renders:
 *   1. A hamburger button (inline, md:hidden)
 *   2. A backdrop overlay (fixed, when open)
 *   3. A slide-in drawer (fixed left, when open)
 *
 * Place anywhere in the layout; the button appears inline
 * while backdrop + drawer are fixed-position overlays.
 */
export function MobileNav({
  planBadge,
  planName,
  signOutAction,
}: {
  planBadge: string;
  planName: string;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Hamburger button — inline, only visible on mobile */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="md:hidden w-9 h-9 flex flex-col items-center justify-center gap-[5px] rounded-xl
                   hover:bg-cream-deep transition-colors flex-shrink-0"
      >
        <span className="w-5 h-0.5 bg-ink-mid rounded-full" />
        <span className="w-5 h-0.5 bg-ink-mid rounded-full" />
        <span className="w-5 h-0.5 bg-ink-mid rounded-full" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-ink/30 backdrop-blur-sm z-40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-in drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-cream-border shadow-warm-lg
                    flex flex-col transition-transform duration-300 ease-out
                    ${open ? "translate-x-0" : "-translate-x-full"}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cream-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-terra flex items-center justify-center flex-shrink-0">
              <svg width="16" height="12" viewBox="0 0 18 14" fill="none">
                <path d="M2 7L7 12L16 2" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="font-display font-black text-lg text-ink tracking-tight">Herder</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="w-8 h-8 flex items-center justify-center rounded-xl text-ink-light
                       hover:bg-cream-deep transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
          {NAV.map(n => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold text-ink-mid
                         hover:bg-cream-deep hover:text-ink transition-all duration-150"
            >
              <span className="text-base w-5 text-center">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>

        {/* Drawer footer */}
        <div className="px-3 pb-5 pt-3 border-t border-cream-border flex flex-col gap-1">
          {/* Plan badge */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-terra-light mb-1">
            <span className="text-base">{planBadge}</span>
            <span className="text-xs font-bold text-terra-dark">{planName} Plan</span>
          </div>

          {/* Legal / contact links */}
          <div className="flex items-center gap-2 px-4 py-1 text-xs text-ink-light">
            <Link href="/privacy" onClick={() => setOpen(false)} className="hover:text-ink transition-colors">Privacy</Link>
            <span>·</span>
            <Link href="/terms" onClick={() => setOpen(false)} className="hover:text-ink transition-colors">Terms</Link>
            <span>·</span>
            <Link href="/contact" onClick={() => setOpen(false)} className="hover:text-ink transition-colors">Contact</Link>
          </div>

          {/* Sign out */}
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold
                         text-ink-light hover:bg-cream-deep hover:text-ink transition-all duration-150"
            >
              <span className="text-base w-5 text-center">←</span>
              Sign out
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
