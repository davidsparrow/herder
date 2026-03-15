import Link from "next/link";
import ContactFooter from "@/components/ContactFooter";

// 12 sheep with staggered positions, durations, and animation variants
const SHEEP = [
  { left: "4%",  top: "8%",  anim: "wander-a", dur: "9s",    delay: "0s"    },
  { left: "18%", top: "52%", anim: "wander-b", dur: "11.5s", delay: "-2.5s" },
  { left: "36%", top: "22%", anim: "wander-c", dur: "8.5s",  delay: "-1s"   },
  { left: "54%", top: "68%", anim: "wander-d", dur: "13s",   delay: "-5s"   },
  { left: "72%", top: "32%", anim: "wander-a", dur: "10s",   delay: "-3s"   },
  { left: "83%", top: "72%", anim: "wander-b", dur: "12s",   delay: "-7s"   },
  { left: "11%", top: "80%", anim: "wander-c", dur: "9.5s",  delay: "-4s"   },
  { left: "47%", top: "46%", anim: "wander-d", dur: "14s",   delay: "-6s"   },
  { left: "29%", top: "78%", anim: "wander-a", dur: "11.5s", delay: "-8s"   },
  { left: "67%", top: "14%", anim: "wander-b", dur: "8s",    delay: "-1.5s" },
  { left: "89%", top: "50%", anim: "wander-c", dur: "15s",   delay: "-9s"   },
  { left: "43%", top: "88%", anim: "wander-d", dur: "10.5s", delay: "-3.5s" },
];

export default function HomePage() {
  return (
    <div className="home-page h-[100svh] bg-cream font-sans flex flex-col overflow-hidden">

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-cream/90 backdrop-blur-md border-b border-cream-border">
        <div className="max-w-5xl mx-auto px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-terra flex items-center justify-center">
              <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                <path d="M2 7L7 12L16 2" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="font-display font-black text-lg sm:text-xl text-ink tracking-tight">Herder</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-ink-light">
            <Link href="/about" className="hover:text-ink transition-colors">About</Link>
            <Link href="/about#features" className="hover:text-ink transition-colors">Features</Link>
            <Link href="/about#pricing" className="hover:text-ink transition-colors">Pricing</Link>
          </div>
          <Link href="/auth/login" className="btn-primary text-xs sm:text-sm px-4 sm:px-5 py-2 sm:py-2.5">
            Get started free
          </Link>
        </div>
      </nav>

      {/* Main — graphic stays large, but layout is packed tighter on mobile */}
      <main className="relative z-20 flex-1 min-h-0 flex flex-col items-center px-4 pt-1 pb-1 sm:px-6 sm:pt-2">

        {/* Graphic */}
        <div className="relative z-30 flex w-full flex-1 min-h-0 items-start justify-center -mt-3 sm:-mt-6 mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/herder-splash.png"
            alt="Herder"
            className="w-[21rem] md:w-[26rem] max-w-full h-auto max-h-full object-contain drop-shadow-xl"
          />
        </div>

        {/* CTA Buttons */}
        <div className="relative z-20 flex flex-col sm:flex-row gap-3 sm:gap-4 w-full max-w-sm pb-1">
          <Link
            href="/auth/login"
            className="btn-primary text-center py-3.5 sm:py-4 px-6 text-base flex-1"
          >
            Start herding for free
          </Link>
          <Link
            href="/about"
            className="btn-ghost text-center py-3.5 sm:py-4 px-6 text-base flex-1"
          >
            What is Herder?
          </Link>
        </div>
      </main>

      {/* Sheep field — covers lower ~55 vh, pointer-events-none so buttons stay clickable */}
      <div
        className="fixed bottom-0 inset-x-0 pointer-events-none overflow-hidden"
        style={{ height: "55vh", zIndex: 10 }}
        aria-hidden="true"
      >
        {SHEEP.map((s, i) => (
          <span
            key={i}
            className="absolute text-3xl select-none"
            style={{
              left: s.left,
              top: s.top,
              animation: `${s.anim} ${s.dur} ${s.delay} infinite ease-in-out`,
            }}
          >
            🐑
          </span>
        ))}
      </div>

      {/* Footer */}
      <footer
        className="relative border-t border-cream-border py-3 sm:py-5 px-4 sm:px-6 text-center text-xs sm:text-sm text-ink-light"
        style={{ zIndex: 50 }}
      >
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
