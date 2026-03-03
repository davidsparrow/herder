"use client";

import { useState } from "react";

const MOCK_STUDENTS = [
  { id:"CW001", name:"Abby Thornton",  age:9,  guardian:"Lisa Thornton",   phone:"415-555-0101", allergy:"Peanuts",   status:null as "present"|"absent"|null },
  { id:"CW002", name:"Ben Okafor",     age:8,  guardian:"James Okafor",    phone:"415-555-0102", allergy:null,        status:null as "present"|"absent"|null },
  { id:"CW003", name:"Chloe Reyes",    age:10, guardian:"Maria Reyes",     phone:"415-555-0103", allergy:"Dairy",     status:null as "present"|"absent"|null },
  { id:"CW004", name:"Dylan Park",     age:9,  guardian:"Sue Park",        phone:"415-555-0104", allergy:null,        status:null as "present"|"absent"|null },
  { id:"CW005", name:"Emma Vasquez",   age:8,  guardian:"Roberto Vasquez", phone:"415-555-0105", allergy:"Tree Nuts", status:null as "present"|"absent"|null },
  { id:"CW006", name:"Felix Nguyen",   age:10, guardian:"Lan Nguyen",      phone:"415-555-0106", allergy:null,        status:null as "present"|"absent"|null },
  { id:"CW007", name:"Grace Kim",      age:9,  guardian:"David Kim",       phone:"415-555-0107", allergy:"Gluten",    status:null as "present"|"absent"|null },
  { id:"CW008", name:"Henry Castro",   age:8,  guardian:"Ana Castro",      phone:"415-555-0108", allergy:null,        status:null as "present"|"absent"|null },
  { id:"CW009", name:"Isla Bennett",   age:10, guardian:"Tom Bennett",     phone:"415-555-0109", allergy:"Shellfish", status:null as "present"|"absent"|null },
  { id:"CW010", name:"Jaxon Morris",   age:9,  guardian:"Karen Morris",    phone:"415-555-0110", allergy:null,        status:null as "present"|"absent"|null },
  { id:"CW011", name:"Kayla Torres",   age:8,  guardian:"Diana Torres",    phone:"415-555-0111", allergy:null,        status:null as "present"|"absent"|null },
  { id:"CW012", name:"Liam Walsh",     age:10, guardian:"Fiona Walsh",     phone:"415-555-0112", allergy:"Eggs",      status:null as "present"|"absent"|null },
];

type FilterKey = "all" | "present" | "absent" | "unchecked";

export default function CheckInPage() {
  const [students, setStudents]     = useState(MOCK_STUDENTS.map(s => ({ ...s })));
  const [search, setSearch]         = useState("");
  const [filter, setFilter]         = useState<FilterKey>("all");
  const [groupModal, setGroupModal] = useState(false);
  const [submitModal, setSubmitModal] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [bouncingId, setBouncingId] = useState<string | null>(null);

  const toggle = (id: string) => {
    setBouncingId(id);
    setTimeout(() => setBouncingId(null), 350);
    setStudents(p => p.map(s => s.id === id
      ? { ...s, status: s.status === "present" ? null : "present" } : s));
  };

  const markAbsent = (id: string) => setStudents(p => p.map(s => s.id === id
    ? { ...s, status: s.status === "absent" ? null : "absent" } : s));

  const present   = students.filter(s => s.status === "present").length;
  const absent    = students.filter(s => s.status === "absent").length;
  const unchecked = students.filter(s => s.status === null).length;
  const pct       = Math.round((present / students.length) * 100);

  const filtered = students
    .filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    .filter(s => {
      if (filter === "present")   return s.status === "present";
      if (filter === "absent")    return s.status === "absent";
      if (filter === "unchecked") return s.status === null;
      return true;
    });

  const doGroup = () => {
    setStudents(p => p.map(s => ({ ...s, status: s.status === null ? "present" : s.status })));
    setGroupModal(false);
  };

  const doSubmit = async () => {
    setSubmitModal(false);
    // In production: POST /api/lists/submit with session_id + attendance
    setSubmitted(true);
  };

  if (submitted) return (
    <div className="flex flex-col items-center justify-center h-full bg-cream px-8 text-center">
      <div className="text-7xl mb-5">🎉</div>
      <h2 className="font-display font-black text-3xl text-ink tracking-tight mb-3">All done!</h2>
      <p className="text-ink-light mb-8">{present} present · {absent} absent</p>
      <div className="flex gap-3 flex-wrap justify-center mb-10">
        <div className="bg-sage-light text-sage-dark rounded-2xl px-5 py-3 text-sm font-bold">
          ✅ {present} arrival notifications queued
        </div>
        {absent > 0 && (
          <div className="bg-gold-light text-gold rounded-2xl px-5 py-3 text-sm font-bold">
            📲 {absent} absence alerts queued
          </div>
        )}
      </div>
      <button onClick={() => { setStudents(MOCK_STUDENTS.map(s=>({...s}))); setSubmitted(false); }}
        className="btn-ghost px-6 py-3 text-sm">← Reset demo</button>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-cream-border px-5 py-4 shadow-warm">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h2 className="font-display font-black text-xl text-ink tracking-tight">3rd Grade · Room 12</h2>
              <span className="badge bg-gold-light text-gold text-xs">In Progress</span>
            </div>
            <p className="text-xs text-ink-light">Mon · Wed · Fri · 8:30 AM · 12 students</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setGroupModal(true)}
              className="btn-ghost px-3.5 py-2 text-xs">Group ✓</button>
            <button
              onClick={() => unchecked === 0 ? setSubmitModal(true) : null}
              disabled={unchecked > 0}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                unchecked === 0 ? "btn-sage" : "bg-cream-deep text-ink-light cursor-not-allowed"
              }`}>
              {unchecked > 0 ? `${unchecked} left` : "Submit →"}
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-2 bg-cream-deep rounded-full overflow-hidden">
            <div style={{ width: `${pct}%` }}
              className="h-full bg-gradient-to-r from-sage to-[#6FBE9A] rounded-full transition-all duration-500" />
          </div>
          <span className="text-xs font-bold text-sage-dark min-w-[36px]">{pct}%</span>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {([
            { key:"present",   label:"present",   val:present,   on:"bg-sage-light border-sage/40 text-sage-dark",   off:"text-ink-light" },
            { key:"absent",    label:"absent",    val:absent,    on:"bg-gold-light border-gold/40 text-gold",          off:"text-ink-light" },
            { key:"unchecked", label:"unchecked", val:unchecked, on:"bg-cream-deep border-cream-border text-ink-mid",  off:"text-ink-light" },
          ] as const).map(f => (
            <button key={f.key}
              onClick={() => setFilter(fl => fl === f.key ? "all" : f.key)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                filter === f.key ? f.on + " border" : "border-transparent " + f.off + " hover:bg-cream-deep"
              }`}>
              <strong className="text-sm mr-1">{f.val}</strong>{f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="px-5 py-2.5 bg-parchment border-b border-cream-border">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-light">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search students…"
            className="input-warm pl-9 py-2.5 text-sm" />
        </div>
      </div>

      {/* Student list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-center text-ink-light text-sm py-12">No students match "{search}"</p>
        )}
        {filtered.map((s) => {
          const initials = s.name.split(" ").map(n => n[0]).join("");
          const bouncing = bouncingId === s.id;
          return (
            <div key={s.id}
              className={`flex items-center gap-3.5 px-5 py-3.5 border-b border-cream-border transition-colors duration-200 ${
                s.status === "present" ? "bg-sage/5" : s.status === "absent" ? "bg-gold/5" : "bg-white"
              }`}>
              {/* Avatar */}
              <div className={`w-10 h-10 rounded-2xl flex-shrink-0 flex items-center justify-center text-xs font-black transition-all ${
                s.status === "present" ? "bg-sage text-white shadow-sage" :
                s.status === "absent"  ? "bg-gold text-white" : "bg-cream-deep text-ink-light"
              }`}>{initials}</div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold transition-all ${
                  s.status === "absent" ? "line-through opacity-50 text-ink" : "text-ink"
                }`}>{s.name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-ink-light">{s.guardian}</span>
                  {s.allergy && (
                    <span className="text-xs font-bold text-blush bg-blush-light rounded-md px-1.5 py-0.5">
                      ⚠ {s.allergy}
                    </span>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                <button onClick={() => markAbsent(s.id)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                    s.status === "absent"
                      ? "bg-gold-light border-gold/60 text-gold"
                      : "border-cream-border text-cream-border hover:border-gold/40 hover:text-gold"
                  }`}>Absent</button>

                <button onClick={() => toggle(s.id)}
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 ${
                    bouncing ? "animate-check" : ""
                  } ${s.status === "present"
                    ? "bg-sage shadow-sage text-white"
                    : "bg-cream-deep text-cream-border hover:bg-cream-border"
                  }`}>
                  {s.status === "present" ? (
                    <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                      <path d="M2 7L7 12L16 2" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                      <path d="M2 6L6 10L14 2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom bar */}
      <div className="bg-white border-t border-cream-border px-5 py-3.5 flex items-center justify-between">
        <p className="text-xs text-ink-light">
          {unchecked > 0 ? `${unchecked} students still need to be marked` : "✨ Everyone accounted for — ready to submit!"}
        </p>
        <button onClick={() => unchecked === 0 && setSubmitModal(true)} disabled={unchecked > 0}
          className={`px-5 py-2.5 text-sm font-bold rounded-xl transition-all ${
            unchecked === 0 ? "btn-sage" : "bg-cream-deep text-ink-light cursor-not-allowed"
          }`}>
          Submit Check-in
        </button>
      </div>

      {/* Group modal */}
      {groupModal && (
        <div className="absolute inset-0 z-50 bg-ink/30 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setGroupModal(false); }}>
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-warm-lg animate-pop-in">
            <div className="text-4xl mb-4">👥</div>
            <h3 className="font-display font-black text-xl text-ink mb-2 tracking-tight">Group Check-in</h3>
            <p className="text-sm text-ink-light leading-relaxed mb-5">
              Mark all <strong>{unchecked} unchecked</strong> students as Present — perfect for returning from a field trip. You can still uncheck anyone.
            </p>
            <div className="bg-sage-light rounded-2xl px-4 py-3 mb-6 text-sm font-semibold text-sage-dark">
              {unchecked} students will be marked present
            </div>
            <div className="flex gap-3">
              <button onClick={doGroup} className="btn-sage flex-1 py-3 text-sm">Mark All Present</button>
              <button onClick={() => setGroupModal(false)} className="btn-ghost px-5 py-3 text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Submit confirm */}
      {submitModal && (
        <div className="absolute inset-0 z-50 bg-ink/30 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setSubmitModal(false); }}>
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-warm-lg animate-pop-in">
            <div className="text-4xl mb-4">📋</div>
            <h3 className="font-display font-black text-xl text-ink mb-2 tracking-tight">Submit this check-in?</h3>
            <p className="text-sm text-ink-light leading-relaxed mb-5">
              This finalizes today's attendance and queues automated notifications.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-sage-light rounded-2xl p-4 text-center">
                <p className="text-2xl font-black text-sage-dark">{present}</p>
                <p className="text-xs text-sage-dark mt-1">present</p>
              </div>
              <div className="bg-gold-light rounded-2xl p-4 text-center">
                <p className="text-2xl font-black text-gold">{absent}</p>
                <p className="text-xs text-gold mt-1">absent</p>
              </div>
            </div>
            <div className="bg-terra-light rounded-2xl px-4 py-3 mb-6 text-xs font-medium text-terra-dark">
              📲 {absent} absence + {present} arrival notifications will be queued (Pro plan)
            </div>
            <div className="flex gap-3">
              <button onClick={doSubmit} className="btn-sage flex-1 py-3 text-sm">Confirm &amp; Submit</button>
              <button onClick={() => setSubmitModal(false)} className="btn-ghost px-5 py-3 text-sm">Back</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
