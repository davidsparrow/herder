import Link from "next/link";
import ContactFooter from "@/components/ContactFooter";
import BrandLockup from "@/components/BrandLockup";

const SLOWER_SHEEP_CYCLE_MULTIPLIER = 1.75;

const sheepDuration = (seconds: number) => `${seconds * SLOWER_SHEEP_CYCLE_MULTIPLIER}s`;

// 12 sheep with staggered positions, durations, and animation variants
const SHEEP = [
  { left: "4%",  top: "8%",  anim: "wander-a", dur: sheepDuration(9),    delay: "0s"    },
  { left: "18%", top: "52%", anim: "wander-b", dur: sheepDuration(11.5), delay: "-2.5s" },
  { left: "36%", top: "22%", anim: "wander-c", dur: sheepDuration(8.5),  delay: "-1s"   },
  { left: "54%", top: "68%", anim: "wander-d", dur: sheepDuration(13),   delay: "-5s"   },
  { left: "72%", top: "32%", anim: "wander-a", dur: sheepDuration(10),   delay: "-3s"   },
  { left: "83%", top: "72%", anim: "wander-b", dur: sheepDuration(12),   delay: "-7s"   },
  { left: "11%", top: "80%", anim: "wander-c", dur: sheepDuration(9.5),  delay: "-4s"   },
  { left: "47%", top: "46%", anim: "wander-d", dur: sheepDuration(14),   delay: "-6s"   },
  { left: "29%", top: "78%", anim: "wander-a", dur: sheepDuration(11.5), delay: "-8s"   },
  { left: "67%", top: "14%", anim: "wander-b", dur: sheepDuration(8),    delay: "-1.5s" },
  { left: "89%", top: "50%", anim: "wander-c", dur: sheepDuration(15),   delay: "-9s"   },
  { left: "43%", top: "88%", anim: "wander-d", dur: sheepDuration(10.5), delay: "-3.5s" },
];

export default function HomePage() {
  return (
    <div className="home-page h-[100svh] bg-cream font-sans flex flex-col overflow-hidden">

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-cream/90 backdrop-blur-md border-b border-cream-border">
        <div className="max-w-5xl mx-auto px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between">
          <BrandLockup href="/" />
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

      {/* Main — give the splash more breathing room below the header */}
      <main className="relative z-20 flex-1 min-h-0 flex flex-col items-center px-4 pt-16 pb-16 sm:px-6 sm:pt-20 sm:pb-20 md:pt-[100px] md:pb-24">

        {/* Graphic */}
        <div className="relative z-30 flex w-full flex-1 min-h-0 items-start justify-center">
          <div className="relative w-[25rem] max-w-full sm:w-[32rem] md:w-[40rem] lg:w-[46rem]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/herder_splash3.png"
              alt="Herder"
              className="block w-full h-auto max-h-full object-contain"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[4.8%] left-[4.6%] h-[4.6%] w-[42%] rounded-full bg-cream"
            />
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="relative z-20 mt-6 flex w-full max-w-sm flex-col gap-3 sm:mt-8 sm:flex-row sm:gap-4 md:mt-10 md:max-w-[40rem] md:justify-center">
          <Link
            href="/auth/login"
            className="btn-primary flex-1 text-center text-base whitespace-nowrap px-6 py-3.5 sm:py-4 md:min-w-[18rem] md:px-8"
          >
            Start herding for free
          </Link>
          <Link
            href="/about"
            className="btn-ghost flex-1 text-center text-base whitespace-nowrap px-6 py-3.5 sm:py-4 md:min-w-[18rem] md:px-8"
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
              willChange: "transform",
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
