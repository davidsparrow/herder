"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

const DAY_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const MAPPING_OPTIONS = ["Name","Guardian Phone","Guardian Email","Age (calculate)","Allergies","Pickup Location","Drop-off Location","Special Needs","Notes","(Ignore)"];

type Step = 0 | 1 | 2 | 3;

interface DetectedCol {
  header: string;
  sample_values: string[];
  suggested_mapping: string;
  confidence: number;
}

interface ExtractResult {
  names: string[];
  detected_columns: DetectedCol[];
}

export default function UploadPage() {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep]         = useState<Step>(0);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const [extracted, setExtracted] = useState<ExtractResult | null>(null);
  const [mappings, setMappings]   = useState<string[]>([]);
  const [className, setClassName] = useState("");
  const [days, setDays]           = useState([true, false, true, false, true, false, false]);
  const [time, setTime]           = useState("08:30");

  // ── Upload handler ──────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "PLAN_LIMIT") {
          setError(json.error + " 👉 Upgrade your plan in Admin settings.");
        } else {
          setError(json.error ?? "Upload failed.");
        }
        setLoading(false);
        return;
      }
      const data: ExtractResult = json.data;
      setExtracted(data);
      setMappings(data.detected_columns.map(c => c.suggested_mapping));
      setStep(1);
    } catch (e) {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  const handleTextPaste = async (text: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); setLoading(false); return; }
      setExtracted(json.data);
      setMappings(json.data.detected_columns.map((c: DetectedCol) => c.suggested_mapping));
      setStep(1);
    } catch { setError("Upload failed."); }
    setLoading(false);
  };

  const confColor = (n: number) => n >= 88 ? "text-sage-dark bg-sage-light" : n >= 70 ? "text-gold bg-gold-light" : "text-blush bg-blush-light";

  const steps = ["Upload","Map Columns","Schedule","Done"];

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto">
      {/* Step dots */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`rounded-full transition-all duration-300 ${
              i === step ? "w-7 h-2.5 bg-terra" : i < step ? "w-2.5 h-2.5 bg-sage" : "w-2.5 h-2.5 bg-cream-border"
            }`} />
            {i < steps.length - 1 && <div className={`w-5 h-0.5 rounded ${i < step ? "bg-sage" : "bg-cream-border"}`} />}
          </div>
        ))}
        <span className="ml-2 text-xs font-bold text-ink-light">{steps[step]}</span>
      </div>

      {/* ── Step 0: Upload ───────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="animate-float-up">
          <h2 className="font-display font-black text-2xl text-ink tracking-tight mb-2">Upload your roster</h2>
          <p className="text-sm text-ink-light mb-7 leading-relaxed">
            Snap a photo, drag in a spreadsheet, or paste names. Gemini AI will extract everything.
          </p>

          {error && (
            <div className="bg-blush-light text-blush text-sm rounded-2xl px-4 py-3 mb-4">{error}</div>
          )}

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-14 text-center cursor-pointer transition-all mb-4
              ${dragging ? "border-terra bg-terra-light" : "border-cream-border bg-parchment hover:border-terra hover:bg-terra-light/30"}`}>
            <input ref={fileRef} type="file" className="hidden"
              accept="image/*,application/pdf,.csv,.xlsx,.xls,.txt"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {loading ? (
              <div className="text-ink-light text-sm">
                <div className="text-4xl mb-3 animate-spin">⏳</div>
                Extracting names with Gemini AI…
              </div>
            ) : (
              <>
                <div className="text-5xl mb-3">📄</div>
                <p className="font-bold text-ink mb-1">Drop your file here</p>
                <p className="text-xs text-ink-light">PDF · Excel · CSV · JPG · PNG</p>
                <div className="mt-5">
                  <span className="btn-primary px-5 py-2 text-sm inline-block">Browse files</span>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { emoji: "📸", title: "Snap a photo",  desc: "Point your camera at a paper list" },
              { emoji: "📋", title: "Paste names",   desc: "Type or paste one name per line" },
            ].map(o => (
              <button key={o.title} onClick={() => {
                if (o.title === "Paste names") {
                  const t = window.prompt("Paste your list (one name per line):");
                  if (t) handleTextPaste(t);
                } else {
                  fileRef.current?.click();
                }
              }}
                className="bg-white border border-cream-border rounded-2xl p-5 cursor-pointer flex items-center gap-4
                           hover:border-terra hover:shadow-warm transition-all text-left">
                <span className="text-3xl">{o.emoji}</span>
                <div>
                  <p className="text-sm font-bold text-ink">{o.title}</p>
                  <p className="text-xs text-ink-light">{o.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 1: Map columns ──────────────────────────────────────────── */}
      {step === 1 && extracted && (
        <div className="animate-float-up">
          <h2 className="font-display font-black text-2xl text-ink tracking-tight mb-2">Map your columns</h2>
          <p className="text-sm text-ink-light mb-6 leading-relaxed">
            We found <strong>{extracted.names.length} names</strong> and these columns. Confirm or reassign each one.
          </p>

          <div className="card overflow-hidden mb-5">
            <div className="grid grid-cols-[1fr_24px_1fr_72px] gap-3 px-5 py-3 bg-parchment border-b border-cream-border text-xs font-bold uppercase tracking-widest text-ink-light">
              <span>In your file</span><span /><span>Maps to</span><span>Match</span>
            </div>
            {extracted.detected_columns.map((col, i) => (
              <div key={i} className="grid grid-cols-[1fr_24px_1fr_72px] gap-3 px-5 py-3.5 border-b border-cream-border last:border-0 items-center">
                <span className="text-sm font-semibold text-ink">{col.header}</span>
                <span className="text-terra text-center">→</span>
                <select value={mappings[i] ?? col.suggested_mapping}
                  onChange={e => setMappings(m => m.map((v, j) => j === i ? e.target.value : v))}
                  className="input-warm py-2 text-sm">
                  {MAPPING_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
                <div className="pl-2">
                  <span className={`text-xs font-bold rounded-lg px-2 py-1 ${confColor(col.confidence)}`}>
                    {col.confidence}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-terra-light border border-terra/30 rounded-2xl px-5 py-3.5 text-sm text-terra-dark mb-6">
            💡 <strong>Admin tip:</strong> Custom columns you've defined in Admin → Custom Columns will also appear automatically.
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="btn-primary px-6 py-3 text-sm">Looks good →</button>
            <button onClick={() => setStep(0)} className="btn-ghost px-5 py-3 text-sm">← Back</button>
          </div>
        </div>
      )}

      {/* ── Step 2: Schedule ─────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="animate-float-up space-y-5">
          <h2 className="font-display font-black text-2xl text-ink tracking-tight mb-2">Set your schedule</h2>
          <p className="text-sm text-ink-light leading-relaxed">
            Herder auto-duplicates this list for every session — student data and custom columns persist.
          </p>

          <div>
            <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">Class / Event Name</label>
            <input value={className} onChange={e => setClassName(e.target.value)}
              placeholder="e.g. 3rd Grade · Room 12"
              className="input-warm" />
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-3">Recurring Days</label>
            <div className="flex gap-2">
              {DAY_LABELS.map((d, i) => (
                <button key={d} onClick={() => setDays(ds => ds.map((v, j) => j === i ? !v : v))}
                  className={`w-12 h-12 rounded-2xl font-black text-xs transition-all duration-200
                    ${days[i] ? "bg-terra-light border-2 border-terra text-terra scale-105 shadow-terra/30 shadow-md" : "bg-white border border-cream-border text-ink-light hover:border-terra/50"}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-light uppercase tracking-widest mb-2">Start Time</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              className="input-warm w-40" />
          </div>

          {days.some(Boolean) && (
            <div className="bg-sage-light border border-sage/30 rounded-2xl px-5 py-4">
              <p className="text-xs font-bold text-sage-dark mb-1">📅 Recurring schedule</p>
              <p className="text-sm text-sage-dark">
                {DAY_LABELS.filter((_, i) => days[i]).join(" · ")} at {time || "—"}
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(3)} disabled={!className}
              className="btn-primary px-6 py-3 text-sm disabled:opacity-50">
              Create check-in list →
            </button>
            <button onClick={() => setStep(1)} className="btn-ghost px-5 py-3 text-sm">← Back</button>
          </div>
        </div>
      )}

      {/* ── Step 3: Done ─────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="animate-float-up text-center py-8">
          <div className="text-6xl mb-5">✅</div>
          <h2 className="font-display font-black text-3xl text-ink tracking-tight mb-3">{className} is ready!</h2>
          <p className="text-sm text-ink-light mb-8 leading-relaxed">
            {extracted?.names.length ?? 0} students imported · {extracted?.detected_columns.length ?? 0} columns mapped
            <br />Recurring {DAY_LABELS.filter((_, i) => days[i]).join(" · ")} at {time}
          </p>

          <div className="bg-terra-light rounded-2xl p-5 text-left mb-8 max-w-sm mx-auto">
            <p className="text-xs font-bold text-terra-dark mb-3">What happens next</p>
            {[
              "Each student gets a UID + QR code",
              "Custom columns persist every session",
              "Submit check-in to trigger notifications",
            ].map((t, i) => (
              <div key={i} className="flex gap-2.5 mb-2 last:mb-0">
                <span className="text-terra font-black">→</span>
                <span className="text-sm text-ink-mid">{t}</span>
              </div>
            ))}
          </div>

          <button onClick={() => router.push("/dashboard/checkin")}
            className="btn-primary px-10 py-4 text-base">
            Open Check-in Screen →
          </button>
        </div>
      )}
    </div>
  );
}
