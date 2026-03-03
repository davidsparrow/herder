import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { PLANS } from "@/lib/plans";
import type { Profile } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single() as { data: Profile | null };

  const plan = profile ? PLANS[profile.plan_tier] : PLANS.free;

  // Fetch list count for this org
  const { count: listCount } = await supabase
    .from("checkin_lists")
    .select("*", { count: "exact", head: true })
    .eq("org_id", profile?.org_id ?? "")
    .eq("archived", false);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const isFreeLimited = profile?.plan_tier === "free" && (listCount ?? 0) >= 3;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="font-display font-black text-2xl text-ink tracking-tight mb-1">
          {greeting()}{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""} 👋
        </h1>
        <p className="text-sm text-ink-light">
          {new Date().toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })}
        </p>
      </div>

      {/* Plan banner */}
      <div className={`rounded-2xl px-5 py-4 mb-6 flex items-center justify-between gap-4 ${
        profile?.plan_tier === "free" ? "bg-terra-light border border-terra/30" :
        profile?.plan_tier === "pro"  ? "bg-sage-light border border-sage/30" : "bg-sky-light border border-sky/30"
      }`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{plan.badge}</span>
          <div>
            <p className="text-sm font-bold text-ink">{plan.name} Plan</p>
            <p className="text-xs text-ink-light">{plan.description}</p>
          </div>
        </div>
        {profile?.plan_tier !== "pro" && (
          <Link href="/dashboard/admin" className="btn-primary text-xs px-4 py-2 flex-shrink-0">
            Upgrade →
          </Link>
        )}
      </div>

      {/* Free plan limit warning */}
      {isFreeLimited && (
        <div className="bg-blush-light border border-blush/30 rounded-2xl px-5 py-4 mb-6">
          <p className="text-sm font-bold text-blush mb-1">Free plan limit reached</p>
          <p className="text-xs text-blush/80">
            You've used all 3 list slots on the Free plan. Upgrade to Standard or Pro for unlimited lists.
          </p>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { icon:"✓",  label:"Check-in",    desc:"Start attendance",     href:"/dashboard/checkin", color:"bg-sage-light text-sage-dark"  },
          { icon:"↑",  label:"New List",    desc:"Upload a roster",      href:"/dashboard/upload",  color:"bg-terra-light text-terra-dark" },
          { icon:"☰",  label:"Classes",     desc:"All your lists",       href:"/dashboard/classes", color:"bg-sky-light text-sky"          },
          { icon:"⚙",  label:"Admin",       desc:"Settings & plans",     href:"/dashboard/admin",   color:"bg-cream-deep text-ink-mid"     },
        ].map(a => (
          <Link key={a.href} href={a.href}
            className="card p-5 hover:shadow-warm-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer">
            <div className={`w-10 h-10 rounded-2xl ${a.color} flex items-center justify-center text-lg mb-3 font-bold`}>
              {a.icon}
            </div>
            <p className="text-sm font-bold text-ink">{a.label}</p>
            <p className="text-xs text-ink-light mt-0.5">{a.desc}</p>
          </Link>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label:"Active Lists",       value: String(listCount ?? 0),    icon:"📋", color:"text-ink" },
          { label:"Students Today",     value:"41",   icon:"👥", color:"text-sage-dark" },
          { label:"Absent Today",       value:"7",    icon:"⚠️", color:"text-blush"    },
          { label:"Sessions This Month",value:"23",   icon:"📅", color:"text-terra"    },
        ].map(s => (
          <div key={s.label} className="card p-5">
            <div className="text-2xl mb-2">{s.icon}</div>
            <p className={`text-3xl font-black tracking-tight ${s.color}`}>{s.value}</p>
            <p className="text-xs text-ink-light mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Recent activity */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-ink-light mb-3">Recent Activity</p>
        <div className="card overflow-hidden">
          {[
            { icon:"📲", msg:"SMS sent to 5 guardians — absent students notified", time:"8:47 AM", bg:"bg-gold-light"  },
            { icon:"✅", msg:"3rd Grade Room 12 — check-in submitted (10/12 present)", time:"8:45 AM", bg:"bg-sage-light" },
            { icon:"📸", msg:"New list 'Spring Science Camp' created from photo", time:"Yesterday", bg:"bg-sky-light"  },
          ].map((a, i) => (
            <div key={i} className={`flex items-center gap-4 px-5 py-4 ${i < 2 ? "border-b border-cream-border" : ""}`}>
              <div className={`w-9 h-9 rounded-xl ${a.bg} flex items-center justify-center text-base flex-shrink-0`}>{a.icon}</div>
              <p className="flex-1 text-sm text-ink-mid">{a.msg}</p>
              <span className="text-xs text-ink-light flex-shrink-0">{a.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
