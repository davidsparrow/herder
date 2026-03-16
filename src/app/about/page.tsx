import Link from "next/link";
import ContactFooter from "@/components/ContactFooter";
import BrandLockup from "@/components/BrandLockup";

export default function AboutPage() {
  const features = [
    { emoji: "📸", head: "Photo → Smart list", body: "Snap any paper roster. Gemini AI reads every name and builds your live check-in list instantly." },
    { emoji: "☑️", head: "Tap-to-check-in", body: "One tap marks a student present. QR codes make future sessions even faster." },
    { emoji: "🔁", head: "Recurring classes", body: "Set a schedule once — your list reappears every session with custom data intact." },
    { emoji: "📲", head: "Auto guardian alerts", body: "SMS or email fires automatically when check-in is submitted. Guardians always know. (Pro)" },
    { emoji: "🗂️", head: "Custom columns", body: "Allergies, pickup location, guardian phone — whatever your event needs, every session. (Standard+)" },
    { emoji: "📊", head: "Attendance history", body: "Every session archived. Filter, export, and prove attendance for billing." },
  ];

  return (
    <div className="min-h-screen bg-cream font-sans">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-cream/90 backdrop-blur-md border-b border-cream-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <BrandLockup href="/" />
          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-ink-light">
            <Link href="/about" className="text-ink transition-colors">About</Link>
            <a href="#features" className="hover:text-ink transition-colors">Features</a>
            <a href="#pricing" className="hover:text-ink transition-colors">Pricing</a>
          </div>
          <Link href="/auth/login" className="btn-primary text-sm px-5 py-2.5">
            Get started free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 grid md:grid-cols-2 gap-16 items-center">
        <div className="animate-float-up">
          <div className="inline-flex items-center gap-2 bg-terra-light border border-terra/30 rounded-full px-4 py-1.5 mb-8">
            <span className="w-2 h-2 rounded-full bg-terra inline-block" />
            <span className="text-xs font-black text-terra-dark tracking-widest uppercase">Free for teachers &amp; organizers</span>
          </div>
          <h1 className="font-display font-black text-5xl md:text-6xl text-ink leading-[1.06] tracking-tighter mb-6">
            The friendliest<br />
            <em className="text-terra not-italic">check-in app</em><br />
            you&apos;ll ever use.
          </h1>
          <p className="text-lg text-ink-light leading-relaxed mb-10 max-w-md">
            Snap a photo of any paper roster. Herder turns it into a smart, live check-in list with automated guardian notifications — in under 30 seconds.
          </p>
          <div className="flex items-center gap-4 flex-wrap">
            <Link href="/auth/login" className="btn-primary px-8 py-4 text-base">
              Open free demo →
            </Link>
            <span className="text-sm text-ink-light">No credit card needed</span>
          </div>
          <div className="mt-10 flex items-center gap-3">
            <div className="flex -space-x-2">
              {["#F4A261", "#A8DADC", "#8CB8D0", "#F9A875"].map((c, i) => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-cream" style={{ background: c }} />
              ))}
            </div>
            <p className="text-sm text-ink-light">
              <strong className="text-ink">1,200+ teachers</strong> already saving hours each week
            </p>
          </div>
        </div>

        {/* Hero mockup */}
        <div className="relative hidden md:block">
          <div className="card overflow-hidden">
            <div className="bg-parchment px-5 py-4 border-b border-cream-border flex justify-between items-center">
              <div>
                <p className="font-display font-black text-base text-ink">3rd Grade · Room 12</p>
                <p className="text-xs text-ink-light mt-0.5">Mon · Wed · Fri · 8:30 AM</p>
              </div>
              <span className="badge bg-sage-light text-sage-dark">8/12 ✓</span>
            </div>
            {[
              { name: "Abby Thornton", present: true, allergy: "Peanuts" },
              { name: "Ben Okafor", present: true, allergy: null },
              { name: "Chloe Reyes", present: false, allergy: "Dairy" },
              { name: "Dylan Park", present: true, allergy: null },
            ].map((s, i) => (
              <div key={i} className={`flex items-center gap-3 px-5 py-3.5 border-b border-cream-border ${s.present ? "bg-sage/5" : "bg-white"}`}>
                <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-xs font-black
                  ${s.present ? "bg-sage text-white shadow-sage" : "bg-cream-deep text-ink-light"}`}>
                  {s.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-ink">{s.name}</p>
                  {s.allergy && <p className="text-xs text-blush font-bold">⚠ {s.allergy}</p>}
                </div>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0
                  ${s.present ? "bg-sage shadow-sage" : "bg-cream-deep"}`}>
                  {s.present && (
                    <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                      <path d="M2 6L6 10L14 2" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </div>
            ))}
            <div className="px-5 py-4 bg-parchment flex justify-end">
              <div className="btn-sage px-5 py-2.5 text-sm cursor-default">Submit check-in →</div>
            </div>
          </div>
          {/* Floating pill */}
          <div className="absolute -bottom-5 -left-6 card px-4 py-3 flex items-center gap-3 shadow-warm-lg animate-pop-in">
            <div className="w-10 h-10 rounded-xl bg-sage-light flex items-center justify-center text-lg">📲</div>
            <div>
              <p className="text-xs font-bold text-ink">SMS sent to 8 guardians</p>
              <p className="text-xs text-ink-light">Arrival confirmed · just now</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-parchment border-y border-cream-border py-20">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="font-display font-black text-4xl text-ink text-center tracking-tight mb-16">
            From paper list to live check-in<br />in 3 steps
          </h2>
          <div className="grid md:grid-cols-3 gap-10">
            {[
              { n: "01", e: "📸", h: "Upload or snap", b: "Photo, spreadsheet, or paste. Gemini AI extracts every name and column automatically." },
              { n: "02", e: "🗂️", h: "Map & customize", b: "Confirm column mappings. Add allergies, pickup location — data that persists every session." },
              { n: "03", e: "✅", h: "Check in & notify", b: "Tap to mark students present. Submit when done — notifications fire automatically." },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <p className="text-xs font-black text-terra tracking-widest mb-3">{s.n}</p>
                <div className="text-5xl mb-4">{s.e}</div>
                <h3 className="font-display font-black text-xl text-ink mb-2">{s.h}</h3>
                <p className="text-sm text-ink-light leading-relaxed">{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="font-display font-black text-4xl text-ink text-center tracking-tight mb-4">Everything your class needs</h2>
        <p className="text-center text-ink-light mb-14 text-base">Built for teachers who want attendance done — without the mess.</p>
        <div className="grid md:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <div key={i} className="bg-parchment border border-cream-border rounded-3xl p-7 hover:bg-white hover:shadow-warm hover:-translate-y-1 transition-all duration-200 cursor-default">
              <div className="text-4xl mb-4">{f.emoji}</div>
              <h3 className="font-display font-bold text-lg text-ink mb-2">{f.head}</h3>
              <p className="text-sm text-ink-light leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-parchment border-y border-cream-border py-20">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="font-display font-black text-4xl text-ink text-center tracking-tight mb-14">Simple, honest pricing</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { tier: "🐑 Free", price: "$0/mo", features: ["3 lists total", "20 names / list", "Basic check-in", "Notifications (BETA only)"], cta: "Start free", highlight: false },
              { tier: "🐄 Standard", price: "$12/mo", features: ["Unlimited lists", "Unlimited names", "Custom columns", "QR code check-in", "Analytics"], cta: "Get Standard", highlight: false },
              { tier: "🦬 Pro", price: "$29/mo", features: ["Everything in Standard", "SMS & email notifications", "Guardian alerts", "Emergency broadcasts", "Priority support"], cta: "Get Pro", highlight: true },
            ].map((p, i) => (
              <div key={i} className={`rounded-3xl p-8 border ${p.highlight ? "bg-terra border-terra shadow-terra text-white" : "bg-white border-cream-border"}`}>
                <p className="font-display font-black text-xl mb-1">{p.tier}</p>
                <p className={`text-3xl font-black tracking-tight mb-6 ${p.highlight ? "text-white" : "text-ink"}`}>{p.price}</p>
                <ul className="space-y-2.5 mb-8">
                  {p.features.map((f, fi) => (
                    <li key={fi} className={`flex items-center gap-2.5 text-sm font-medium ${p.highlight ? "text-white/90" : "text-ink-mid"}`}>
                      <span className={p.highlight ? "text-white" : "text-sage"}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Link href="/auth/login" className={`block text-center font-bold rounded-2xl px-4 py-3 text-sm transition-all hover:-translate-y-0.5 ${p.highlight ? "bg-white text-terra" : "bg-terra text-white shadow-terra"}`}>
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-2xl mx-auto px-6 py-24 text-center">
        <h2 className="font-display font-black text-5xl text-ink tracking-tight mb-4">
          Ready to ditch<br />
          <em className="text-terra not-italic">the clipboard?</em>
        </h2>
        <p className="text-ink-light text-lg mb-10 leading-relaxed">
          Set up your first class in under 2 minutes. Free forever for individual teachers.
        </p>
        <Link href="/auth/login" className="btn-primary px-10 py-4 text-base inline-block">
          Create your free account
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-cream-border py-5 px-6 text-center text-sm text-ink-light">
        © 2026 herder &nbsp;·&nbsp;
        <Link href="/privacy" className="hover:text-ink transition-colors">privacy</Link>
        &nbsp;·&nbsp;
        <Link href="/terms" className="hover:text-ink transition-colors">terms</Link>
        &nbsp;·&nbsp;
        <ContactFooter />
      </footer>
    </div>
  );
}
