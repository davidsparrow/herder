import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PLANS } from "@/lib/plans";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/dashboard",         icon: "⊞", label: "Dashboard" },
  { href: "/dashboard/checkin", icon: "✓", label: "Check-in" },
  { href: "/dashboard/upload",  icon: "↑", label: "New List" },
  { href: "/dashboard/classes", icon: "☰", label: "Classes" },
  { href: "/dashboard/notify",  icon: "🔔", label: "Notifications" },
  { href: "/dashboard/admin",   icon: "⚙", label: "Admin" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single() as { data: Profile | null };

  const plan = profile ? PLANS[profile.plan_tier] : PLANS.free;

  const signOut = async () => {
    "use server";
    const sb = createClient();
    await sb.auth.signOut();
    redirect("/auth/login");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-cream font-sans">
      {/* Sidebar */}
      <aside className="w-16 bg-white border-r border-cream-border flex flex-col items-center py-4 gap-1 shadow-warm z-10 flex-shrink-0">
        {/* Logo */}
        <div className="w-9 h-9 rounded-xl bg-terra flex items-center justify-center mb-5">
          <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
            <path d="M2 7L7 12L16 2" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {NAV.map(n => (
          <Link key={n.href} href={n.href} title={n.label}
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg text-ink-light
                       hover:bg-cream-deep hover:text-ink-mid transition-all duration-150">
            {n.icon}
          </Link>
        ))}

        <div className="flex-1" />

        {/* Plan badge */}
        <div title={plan.name} className="w-11 h-11 rounded-2xl bg-terra-light flex items-center justify-center text-base cursor-default">
          {plan.badge}
        </div>

        {/* Sign out */}
        <form action={signOut}>
          <button type="submit" title="Sign out"
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-base text-ink-light hover:bg-cream-deep hover:text-ink transition-all">
            ←
          </button>
        </form>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-cream-border flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="badge bg-cream-deep text-ink-light">Spring 2026</span>
            <span className="badge bg-sage-light text-sage-dark">● Live</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-ink-light">
              {profile?.full_name ?? profile?.email ?? ""}
            </span>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-terra to-[#F0924A] flex items-center justify-center text-white text-xs font-black">
              {(profile?.full_name ?? profile?.email ?? "?")[0].toUpperCase()}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
