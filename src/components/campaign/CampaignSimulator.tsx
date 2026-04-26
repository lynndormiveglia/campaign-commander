import { useState, useEffect, Fragment, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  simulateCampaign,
  type SimulationResult,
  type CampaignPlan,
  type FieldKey,
  type FieldFlag,
  type Persona,
} from "@/utils/simulate.functions";

/* ===========================================================
   ElevenLabs-inspired monochrome palette
   =========================================================== */
const C = {
  bg: "#FAFAF9",         // off-white canvas
  surface: "#FFFFFF",
  ink: "#0A0A0A",        // near-black for type
  ink2: "#171717",
  muted: "#737373",
  faint: "#A3A3A3",
  line: "#E7E5E4",
  lineSoft: "#F5F5F4",
  chipBg: "#F5F5F4",
  accent: "#0A0A0A",
  accentInk: "#FFFFFF",
  good: "#16A34A",
  goodSoft: "#F0FDF4",
  warn: "#D97706",
  warnSoft: "#FFFBEB",
  bad: "#DC2626",
  badSoft: "#FEF2F2",
};

const F = {
  body: "'Poppins', system-ui, sans-serif",
  display: "'Space Grotesk', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
};

/* ===========================================================
   Sample campaign cards (carousel on the launch hero)
   =========================================================== */
type SampleCampaign = {
  id: string;
  badge: string;
  title: string;
  body: string;
  emoji: string;
  gradient: string;
};

const SAMPLE_CAMPAIGNS: SampleCampaign[] = [
  {
    id: "sustain",
    badge: "Sustainability",
    title: '"Our Most Sustainable Product Yet."',
    body: "We're committed to a greener future. Shop our newest collection and join the movement.",
    emoji: "🌱",
    gradient: "linear-gradient(135deg,#F5F5F4,#E7E5E4)",
  },
  {
    id: "wellness",
    badge: "Wellness",
    title: '"Feel Good. Inside and Out."',
    body: "Clinically-tested, dermatologist-approved formulas. Real results from real people.",
    emoji: "🧴",
    gradient: "linear-gradient(135deg,#FAFAF9,#EDE9E3)",
  },
  {
    id: "tech",
    badge: "Product Launch",
    title: '"Built for Builders."',
    body: "Faster than yesterday. Quieter than ever. Designed for the people doing the work.",
    emoji: "⚙️",
    gradient: "linear-gradient(135deg,#F0F0EE,#E2DFDA)",
  },
];

/* ===========================================================
   Field metadata
   =========================================================== */
const FIELD_META: Record<FieldKey, { label: string; placeholder: string; multiline?: boolean; rows?: number }> = {
  name:           { label: "Campaign Name",   placeholder: "e.g. Greener Fall Drop 2026" },
  timeline:       { label: "Timeline",        placeholder: "e.g. Mar 18 → Apr 30, 2026" },
  keyMessage:     { label: "Key Message",     placeholder: "What's the single thing you want them to remember?", multiline: true, rows: 2 },
  hashtag:        { label: "Hashtag",         placeholder: "#GreenerTogether" },
  slogan:         { label: "Slogan",          placeholder: "A tighter, punchier line." },
  targetAudience: { label: "Target Audience", placeholder: "e.g. Eco-curious millennials & Gen Z, US/EU urban", multiline: true, rows: 2 },
  copy:           { label: "Campaign Copy",   placeholder: "The actual ad copy that audiences will see.", multiline: true, rows: 5 },
};

const FIELD_ORDER: FieldKey[] = ["name","timeline","keyMessage","hashtag","slogan","targetAudience","copy"];

const DEFAULT_PLAN: CampaignPlan = {
  name: "Greener Fall Drop 2026",
  timeline: "Mar 18 → Apr 30, 2026",
  keyMessage: "Our most sustainable product yet — proof inside.",
  hashtag: "#GreenerTogether",
  slogan: "Sustainable. Finally.",
  targetAudience: "Eco-conscious Gen Z & millennial shoppers in US/EU urban areas.",
  copy: '"Our Most Sustainable Product Yet." — We\'re committed to a greener future. Shop our newest collection and join the movement.',
};

/* ===========================================================
   Hooks & helpers
   =========================================================== */
function useCountdown(start: number) {
  const [secs, setSecs] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0"));
}

const sevColor = (sev: FieldFlag["severity"]) =>
  sev === "high" ? C.bad : sev === "medium" ? C.warn : C.muted;
const sevSoft  = (sev: FieldFlag["severity"]) =>
  sev === "high" ? C.badSoft : sev === "medium" ? C.warnSoft : C.lineSoft;

type Comment = { id: number; user: string; text: string; type: "negative" | "neutral" };
const COMMENTS: Comment[] = [
  { id: 1, user: "@_realconsumer · 2m ago", text: '"This feels like greenwashing. Zero specifics, just vibes. 🙄"', type: "negative" },
  { id: 2, user: "@sustainableskeptic · 5m ago", text: '"Who is this even for? The vagueness is insulting."', type: "negative" },
  { id: 3, user: "@climate_watchdog · 11m ago", text: '"Another brand pretending to care without showing any proof."', type: "negative" },
  { id: 4, user: "@shoppingmaybe · 18m ago", text: '"What does \'most sustainable\' even mean? Compared to what?"', type: "neutral" },
  { id: 5, user: "@ethicswatch · 24m ago", text: '"No certifications. No data. Just marketing copy. Pass."', type: "negative" },
];

const SEGMENT_META: Record<string, { icon: string }> = {
  "Gen Z": { icon: "◐" },
  "Parents": { icon: "◑" },
  "Sustainability Advocates": { icon: "◒" },
};

/* ===========================================================
   Main component
   =========================================================== */
export default function CampaignSimulator() {
  const [screen, setScreen] = useState(1);
  const [chaos, setChaos] = useState(false);
  const [visibleComments, setVisibleComments] = useState<number[]>([]);
  const [carouselIdx, setCarouselIdx] = useState(0);

  const [plan, setPlan] = useState<CampaignPlan>(DEFAULT_PLAN);
  const [customPersonas, setCustomPersonas] = useState<Persona[]>([]);

  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  // Results-page interactivity
  const [appliedFixes, setAppliedFixes] = useState<Set<FieldKey>>(new Set());
  const [hoverFlag, setHoverFlag] = useState<FieldKey | null>(null);

  const countdown = useCountdown(23 * 3600 + 59 * 60);
  const simulateFn = useServerFn(simulateCampaign);

  const goTo = (n: number) => {
    setScreen(n);
    setChaos(false);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };

  const launchCampaign = () => {
    setChaos(true);
    setVisibleComments([]);
    COMMENTS.forEach((c, i) => {
      setTimeout(() => setVisibleComments((prev) => [...prev, c.id]), 400 + i * 650);
    });
  };

  const updateField = (k: FieldKey, v: string) => setPlan((p) => ({ ...p, [k]: v }));

  const runSimulation = async () => {
    setSimulating(true);
    setSimError(null);
    setSimResult(null);
    setAppliedFixes(new Set());
    try {
      const response = await simulateFn({ data: { plan } });
      if (!response.ok) {
        setSimError(response.error);
      } else {
        setSimResult(response.data);
      }
    } catch (e) {
      console.error(e);
      setSimError("Something went wrong. Please try again.");
    } finally {
      setSimulating(false);
    }
  };

  const flagsByField = useMemo(() => {
    const map = new Map<FieldKey, FieldFlag>();
    simResult?.flags.forEach((f) => map.set(f.field, f));
    return map;
  }, [simResult]);

  const applyFix = (flag: FieldFlag) => {
    setPlan((p) => ({ ...p, [flag.field]: flag.fix }));
    setAppliedFixes((prev) => {
      const next = new Set(prev);
      next.add(flag.field);
      return next;
    });
  };

  const addCustomPersona = () => {
    setCustomPersonas((prev) => [
      ...prev,
      { name: "Custom persona", archetype: "Describe them…", age: "—", sentiment: 50, quote: "What might they say?" },
    ]);
  };

  const updateCustomPersona = (idx: number, patch: Partial<Persona>) => {
    setCustomPersonas((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };
  const removeCustomPersona = (idx: number) => {
    setCustomPersonas((prev) => prev.filter((_, i) => i !== idx));
  };

  const navSteps = ["Launch", "Crisis", "Simulate", "Results"];
  const sample = SAMPLE_CAMPAIGNS[carouselIdx];

  return (
    <div style={{ fontFamily: F.body, background: C.bg, minHeight: "100vh", color: C.ink }}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes ciq-fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ciq-pulse { 0%,100%{opacity:1} 50%{opacity:.55} }
        @keyframes loadDot { 0%,80%,100%{opacity:.2;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }
        .ciq .dot1{animation:loadDot 1.2s ease-in-out infinite}
        .ciq .dot2{animation:loadDot 1.2s ease-in-out .2s infinite}
        .ciq .dot3{animation:loadDot 1.2s ease-in-out .4s infinite}
        .ciq .fadeIn{animation:ciq-fadeIn .4s ease forwards}
        .ciq .pulseBadge{animation:ciq-pulse 1.4s ease-in-out infinite}
        .ciq input:focus, .ciq textarea:focus{outline:none; border-color:${C.ink} !important; background:#fff}
        .ciq button{transition:all .15s ease}
        .ciq button:hover:not(:disabled){transform:translateY(-1px)}
        .ciq .field-row{transition:background .2s ease, border-color .2s ease}
      `}</style>

      <div className="ciq">
        {/* ============== TOP NAV ============== */}
        <nav style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
          background: "rgba(250,250,249,0.85)", backdropFilter: "blur(14px)",
          borderBottom: `1px solid ${C.line}`,
          padding: "0 28px", height: 56,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ fontFamily: F.display, fontSize: 17, fontWeight: 700, display: "flex", alignItems: "center", gap: 10, letterSpacing: "-0.01em" }}>
            <span style={{ width: 18, height: 18, background: C.ink, borderRadius: 4, display: "inline-block" }} />
            CampaignIQ
            <span style={{ fontFamily: F.mono, background: C.lineSoft, color: C.muted, padding: "2px 7px", borderRadius: 4, fontSize: 10, letterSpacing: ".05em" }}>DEMO</span>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {navSteps.map((label, i) => (
              <button key={label} onClick={() => goTo(i + 1)} style={{
                padding: "6px 14px", borderRadius: 6, border: "none",
                fontFamily: F.body, fontSize: 13, fontWeight: 500, cursor: "pointer",
                background: screen === i + 1 ? C.ink : "transparent",
                color: screen === i + 1 ? C.accentInk : C.muted,
              }}>{label}</button>
            ))}
          </div>
        </nav>

        <div style={{ paddingTop: 56 }}>

        {/* =====================================================
            SCREEN 1 — LAUNCH HERO
           ===================================================== */}
        {screen === 1 && (
          <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)" }}>
            {/* Hero */}
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 28px 48px", textAlign: "center" }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                fontFamily: F.mono, fontSize: 11, fontWeight: 500, color: C.muted,
                background: C.surface, border: `1px solid ${C.line}`, borderRadius: 999,
                padding: "5px 12px", marginBottom: 28, letterSpacing: ".04em",
              }}>
                <span style={{ width: 6, height: 6, background: C.bad, borderRadius: "50%", display: "inline-block", animation: "blink 1.4s ease-in-out infinite" }} />
                LAUNCH WINDOW OPEN
              </div>
              <h1 style={{
                fontFamily: F.display, fontSize: "clamp(40px, 6vw, 68px)",
                fontWeight: 700, lineHeight: 1.04, letterSpacing: "-0.03em",
                marginBottom: 18,
              }}>
                Ship your campaign.<br />
                <span style={{ color: C.muted }}>Or stress-test it first.</span>
              </h1>
              <p style={{ fontSize: 17, color: C.muted, lineHeight: 1.6, maxWidth: 560, margin: "0 auto 40px" }}>
                Your campaign is queued for 2.4M subscribers. One button sends it live — the other shows you what happens if you don't.
              </p>

              {/* Hero CTA cluster */}
              <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                <button onClick={launchCampaign} style={{
                  background: C.ink, color: C.accentInk, border: "none",
                  padding: "18px 44px", borderRadius: 10,
                  fontFamily: F.body, fontSize: 16, fontWeight: 600, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 12,
                  boxShadow: "0 8px 32px rgba(0,0,0,.18)",
                }}>
                  Launch Campaign Now
                  <span style={{ fontFamily: F.mono, fontSize: 13, opacity: .7 }}>→</span>
                </button>
                <button onClick={() => goTo(3)} style={{
                  background: "transparent", color: C.ink, border: "none",
                  padding: "8px 16px", fontFamily: F.body, fontSize: 14, fontWeight: 500,
                  cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 4, textDecorationColor: C.faint,
                }}>
                  or simulate first →
                </button>

                {/* Countdown */}
                <div style={{
                  marginTop: 22, display: "inline-flex", alignItems: "center", gap: 14,
                  fontFamily: F.mono, fontSize: 13, color: C.muted,
                }}>
                  <span style={{ textTransform: "uppercase", letterSpacing: ".1em" }}>Auto-launch</span>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {countdown.map((val, i) => (
                      <Fragment key={i}>
                        {i > 0 && <span style={{ color: C.faint }}>:</span>}
                        <span style={{
                          background: C.surface, border: `1px solid ${C.line}`, borderRadius: 4,
                          padding: "4px 8px", color: C.ink, fontWeight: 600, minWidth: 32, textAlign: "center",
                        }}>{val}</span>
                      </Fragment>
                    ))}
                  </div>
                </div>
              </div>

              {/* Risk banner */}
              <div style={{
                maxWidth: 560, margin: "32px auto 0",
                background: C.warnSoft, border: `1px solid #FCD34D`,
                borderRadius: 8, padding: "12px 16px",
                display: "flex", gap: 10, alignItems: "center", textAlign: "left",
                fontFamily: F.mono, fontSize: 12, color: "#92400E",
              }}>
                <span>⚠</span>
                <span><strong>NO PRE-TESTING DETECTED</strong> — launching blind to 2.4M subscribers.</span>
              </div>
            </div>

            {/* Sample-campaigns carousel */}
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 28px 80px" }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
                marginBottom: 18, gap: 16,
              }}>
                <div>
                  <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>
                    Queued · {SAMPLE_CAMPAIGNS.length} campaigns
                  </div>
                  <h3 style={{ fontFamily: F.display, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>
                    Sample creative in your queue
                  </h3>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setCarouselIdx((i) => (i - 1 + SAMPLE_CAMPAIGNS.length) % SAMPLE_CAMPAIGNS.length)}
                    style={carouselBtnStyle()}>←</button>
                  <button onClick={() => setCarouselIdx((i) => (i + 1) % SAMPLE_CAMPAIGNS.length)}
                    style={carouselBtnStyle()}>→</button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
                {SAMPLE_CAMPAIGNS.map((c, i) => {
                  const active = i === carouselIdx;
                  return (
                    <button key={c.id} onClick={() => setCarouselIdx(i)} style={{
                      textAlign: "left", cursor: "pointer", padding: 0,
                      background: C.surface,
                      border: `1px solid ${active ? C.ink : C.line}`,
                      borderRadius: 12, overflow: "hidden",
                      transform: active ? "translateY(-2px)" : "none",
                      boxShadow: active ? "0 12px 32px rgba(0,0,0,.08)" : "none",
                    }}>
                      <div style={{ height: 120, background: c.gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
                        {c.emoji}
                      </div>
                      <div style={{ padding: 16 }}>
                        <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 8 }}>{c.badge}</div>
                        <div style={{ fontFamily: F.display, fontSize: 15, fontWeight: 600, marginBottom: 6, letterSpacing: "-0.01em", lineHeight: 1.3 }}>{c.title}</div>
                        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{c.body}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected campaign detail */}
              <div style={{
                marginTop: 24, background: C.surface, border: `1px solid ${C.line}`,
                borderRadius: 12, padding: 28,
                display: "grid", gridTemplateColumns: "1fr 280px", gap: 28, alignItems: "center",
              }}>
                <div>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>
                    Now previewing — {sample.badge}
                  </div>
                  <div style={{ fontFamily: F.display, fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 8 }}>{sample.title}</div>
                  <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>{sample.body}</div>
                </div>
                <div style={{
                  height: 140, borderRadius: 10, background: sample.gradient,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 48, border: `1px solid ${C.line}`,
                }}>{sample.emoji}</div>
              </div>
            </div>

            {/* Crisis overlay */}
            {chaos && (
              <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(10,10,10,.97)", overflowY: "auto", animation: "ciq-fadeIn .3s ease" }}>
                <div style={{ maxWidth: 720, margin: "0 auto", padding: "52px 24px" }}>
                  <div style={{ textAlign: "center", marginBottom: 36 }}>
                    <div style={{ fontFamily: F.mono, fontSize: 11, color: "rgba(255,255,255,.45)", letterSpacing: ".15em", marginBottom: 12 }}>● LIVE FEED</div>
                    <div style={{ fontFamily: F.display, fontSize: 32, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>Campaign is live.</div>
                    <div style={{ fontSize: 14, color: "rgba(255,255,255,.5)", marginTop: 6 }}>Real-time reaction feed — first 4 hours</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
                    {[
                      { label: "Engagement Rate", val: "1.2%" },
                      { label: "Sentiment Score", val: "38% positive" },
                    ].map((s) => (
                      <div key={s.label} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, padding: 18 }}>
                        <div style={{ fontFamily: F.mono, fontSize: 10, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>{s.label}</div>
                        <div style={{ fontFamily: F.display, fontSize: 26, fontWeight: 700, color: "#fff" }}>{s.val}</div>
                      </div>
                    ))}
                    <div style={{ gridColumn: "span 2", background: "rgba(220,38,38,.1)", border: "1px solid rgba(220,38,38,.3)", borderRadius: 10, padding: 18 }}>
                      <div style={{ fontFamily: F.mono, fontSize: 10, color: "rgba(255,255,255,.45)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>Backlash Risk</div>
                      <span className="pulseBadge" style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        fontFamily: F.mono, color: "#FCA5A5", fontSize: 13, fontWeight: 600, letterSpacing: ".05em",
                      }}>● HIGH — ESCALATING</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
                    {COMMENTS.map((c) => (
                      <div key={c.id} style={{
                        background: "rgba(255,255,255,.04)",
                        borderLeft: `2px solid ${c.type === "neutral" ? C.warn : C.bad}`,
                        borderRadius: "0 8px 8px 0", padding: "12px 14px",
                        transition: "all .4s",
                        opacity: visibleComments.includes(c.id) ? 1 : 0,
                        transform: visibleComments.includes(c.id) ? "translateX(0)" : "translateX(-16px)",
                      }}>
                        <div style={{ fontFamily: F.mono, fontSize: 10, color: "rgba(255,255,255,.45)", marginBottom: 4, letterSpacing: ".05em" }}>{c.user}</div>
                        <div style={{ fontSize: 14, color: "rgba(255,255,255,.85)", lineHeight: 1.5 }}>{c.text}</div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => goTo(2)} style={{
                    width: "100%", background: "#fff", color: C.ink, border: "none",
                    padding: 16, borderRadius: 10, fontFamily: F.body, fontSize: 15, fontWeight: 600, cursor: "pointer",
                  }}>See the cost of this mistake →</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================
            SCREEN 2 — CRISIS
           ===================================================== */}
        {screen === 2 && (
          <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)" }}>
            <div style={{ maxWidth: 820, margin: "0 auto", padding: "80px 28px", textAlign: "center" }} className="fadeIn">
              <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 500, letterSpacing: ".15em", color: C.bad, marginBottom: 24 }}>● MEDIA COVERAGE — 72 HOURS LATER</div>
              <div style={{ background: C.badSoft, border: `1px solid #FECACA`, borderRadius: 12, padding: "28px 32px", marginBottom: 48 }}>
                <div style={{ fontFamily: F.display, fontSize: 24, fontWeight: 600, color: C.bad, letterSpacing: "-0.02em", lineHeight: 1.3 }}>Brand Faces Backlash After Tone-Deaf Sustainability Campaign</div>
                <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, marginTop: 10, letterSpacing: ".05em" }}>— TechCrunch · The Guardian · AdAge & 47 others</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 52 }}>
                {[
                  { label: "PR Crisis Cost", val: "$2.3M", desc: "Agency response, retraction & ad pull" },
                  { label: "Brand Trust Drop", val: "−18%", desc: "Consumer trust score (YouGov)" },
                ].map((c) => (
                  <div key={c.label} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 24, textAlign: "left" }}>
                    <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>{c.label}</div>
                    <div style={{ fontFamily: F.display, fontSize: 40, fontWeight: 700, color: C.bad, lineHeight: 1, letterSpacing: "-0.02em" }}>{c.val}</div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 10 }}>{c.desc}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => goTo(3)} style={{
                background: C.ink, color: C.accentInk, border: "none",
                padding: "16px 32px", borderRadius: 10,
                fontFamily: F.body, fontSize: 15, fontWeight: 600, cursor: "pointer",
              }}>What if we tested this first? →</button>
            </div>
          </div>
        )}

        {/* =====================================================
            SCREEN 3 — SIMULATE (DETAILED FORM)
           ===================================================== */}
        {screen === 3 && (
          <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)" }}>
            <div style={{ maxWidth: 1080, margin: "0 auto", padding: "56px 28px" }} className="fadeIn">
              <div style={{ marginBottom: 36 }}>
                <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".15em", marginBottom: 10 }}>● PRE-LAUNCH SIMULATOR</div>
                <h2 style={{ fontFamily: F.display, fontSize: 38, fontWeight: 700, marginBottom: 10, letterSpacing: "-0.02em" }}>Campaign Plan</h2>
                <p style={{ fontSize: 15, color: C.muted, maxWidth: 560 }}>
                  Fill in the details. The AI pre-check evaluates your <strong style={{ color: C.ink }}>copy</strong> in real time. Predicted personas update once you run a focus group.
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 24, alignItems: "start" }}>
                {/* LEFT — Form */}
                <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 28 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 20 }}>
                    Detailed Campaign Plan
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    {FIELD_ORDER.map((k) => {
                      const meta = FIELD_META[k];
                      const isCopy = k === "copy";
                      const fullWidth = isCopy || k === "keyMessage" || k === "targetAudience";
                      return (
                        <div key={k} style={{ gridColumn: fullWidth ? "1 / -1" : undefined }}>
                          <label style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".1em",
                            textTransform: "uppercase", marginBottom: 6,
                          }}>
                            <span>{meta.label}</span>
                            {isCopy && (
                              <span style={{
                                fontFamily: F.mono, fontSize: 9, color: C.ink,
                                background: C.lineSoft, padding: "2px 6px", borderRadius: 4, letterSpacing: ".08em",
                              }}>AI PRE-CHECK ON</span>
                            )}
                          </label>
                          {meta.multiline ? (
                            <textarea
                              value={plan[k]}
                              onChange={(e) => updateField(k, e.target.value)}
                              placeholder={meta.placeholder}
                              rows={meta.rows ?? 3}
                              style={inputStyle(isCopy)}
                            />
                          ) : (
                            <input
                              value={plan[k]}
                              onChange={(e) => updateField(k, e.target.value)}
                              placeholder={meta.placeholder}
                              style={inputStyle(false)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 22 }}>
                    <button onClick={runSimulation} disabled={simulating} style={{
                      background: simulating ? C.faint : C.ink, color: C.accentInk,
                      border: "none", padding: "13px 24px", borderRadius: 8,
                      fontFamily: F.body, fontSize: 14, fontWeight: 600,
                      cursor: simulating ? "default" : "pointer",
                      display: "inline-flex", alignItems: "center", gap: 8,
                    }}>
                      {simulating ? (
                        <>Running focus group <span className="dot1">●</span><span className="dot2">●</span><span className="dot3">●</span></>
                      ) : "Run Focus Group"}
                    </button>
                    {simResult && (
                      <button onClick={() => goTo(4)} style={{
                        background: "transparent", color: C.ink, border: `1px solid ${C.ink}`,
                        padding: "12px 22px", borderRadius: 8,
                        fontFamily: F.body, fontSize: 14, fontWeight: 600, cursor: "pointer",
                      }}>See how you can improve →</button>
                    )}
                  </div>

                  {simError && (
                    <div style={{
                      marginTop: 14, background: C.badSoft, border: `1px solid #FECACA`,
                      borderRadius: 8, padding: "12px 14px", fontFamily: F.mono,
                      fontSize: 12, color: "#991B1B",
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                    }}>
                      <span>⚠ {simError}</span>
                      <button onClick={runSimulation} style={{ background: "#fff", border: `1px solid #FECACA`, color: C.bad, padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Retry</button>
                    </div>
                  )}
                </div>

                {/* RIGHT — Personas */}
                <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase" }}>
                      AI-Predicted Personas
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 16 }}>
                    {simResult ? "Generated from your target audience." : "Run a focus group to generate personas, or add your own below."}
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {(simResult?.personas ?? []).map((p, i) => (
                      <PersonaCard key={`ai-${i}`} persona={p} editable={false} />
                    ))}
                    {customPersonas.map((p, i) => (
                      <PersonaCard
                        key={`custom-${i}`}
                        persona={p}
                        editable
                        onChange={(patch) => updateCustomPersona(i, patch)}
                        onRemove={() => removeCustomPersona(i)}
                      />
                    ))}
                    {!simResult && customPersonas.length === 0 && (
                      <div style={{
                        border: `1px dashed ${C.line}`, borderRadius: 10, padding: 18,
                        textAlign: "center", color: C.faint, fontSize: 12,
                      }}>
                        No personas yet.
                      </div>
                    )}
                  </div>

                  <button onClick={addCustomPersona} style={{
                    width: "100%", marginTop: 14,
                    background: "transparent", color: C.ink,
                    border: `1px dashed ${C.line}`, borderRadius: 8,
                    padding: "10px 14px", fontFamily: F.body, fontSize: 13, fontWeight: 500, cursor: "pointer",
                  }}>+ Add custom persona</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
            SCREEN 4 — RESULTS
           ===================================================== */}
        {screen === 4 && (
          <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)" }}>
            <div style={{ maxWidth: 1080, margin: "0 auto", padding: "56px 28px" }} className="fadeIn">
              <div style={{ marginBottom: 30 }}>
                <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".15em", marginBottom: 10 }}>● FOCUS-GROUP RESULTS</div>
                <h2 style={{ fontFamily: F.display, fontSize: 38, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 10 }}>
                  Here's how you can improve.
                </h2>
                <p style={{ fontSize: 15, color: C.muted, maxWidth: 620 }}>
                  Risky fields are flagged below. Hover for the AI's suggestion, or one-click to apply the fix.
                </p>
              </div>

              {!simResult ? (
                <div style={{
                  background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14,
                  padding: 40, textAlign: "center",
                }}>
                  <p style={{ color: C.muted, marginBottom: 16 }}>No simulation yet — run a focus group to see results.</p>
                  <button onClick={() => goTo(3)} style={primaryBtnStyle()}>Go to simulator</button>
                </div>
              ) : (
                <>
                  {/* Risk meter (scale with marker) */}
                  <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 24, marginBottom: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                      <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase" }}>
                        Backlash Risk Meter
                      </div>
                      <div style={{
                        fontFamily: F.display, fontSize: 18, fontWeight: 700,
                        color: simResult.risk === "HIGH" ? C.bad : simResult.risk === "MEDIUM" ? C.warn : C.good,
                        letterSpacing: "-0.01em",
                      }}>{simResult.risk} · {simResult.riskScore}/100</div>
                    </div>
                    <RiskMeter score={simResult.riskScore} />
                    <p style={{ fontSize: 13, color: C.muted, marginTop: 14, lineHeight: 1.6 }}>{simResult.riskRationale}</p>
                  </div>

                  {/* Form with flagged fields */}
                  <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 28, marginBottom: 28 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                      <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase" }}>
                        Flagged fields · {simResult.flags.length}
                      </div>
                      <button onClick={runSimulation} disabled={simulating} style={{
                        background: C.ink, color: C.accentInk, border: "none",
                        padding: "10px 18px", borderRadius: 8,
                        fontFamily: F.body, fontSize: 13, fontWeight: 600,
                        cursor: simulating ? "default" : "pointer",
                      }}>{simulating ? "Re-running…" : "Run Focus Group"}</button>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {FIELD_ORDER.map((k) => {
                        const flag = flagsByField.get(k);
                        const applied = appliedFixes.has(k);
                        const meta = FIELD_META[k];
                        const sev = flag?.severity ?? "low";
                        const isHover = hoverFlag === k;
                        return (
                          <div key={k} className="field-row"
                            onMouseEnter={() => flag && setHoverFlag(k)}
                            onMouseLeave={() => setHoverFlag(null)}
                            style={{
                              position: "relative",
                              border: `1px solid ${flag ? sevColor(sev) + "55" : C.line}`,
                              background: flag ? sevSoft(sev) : C.surface,
                              borderRadius: 10, padding: "12px 14px",
                            }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 6 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase" }}>{meta.label}</span>
                                {flag && (
                                  <span style={{
                                    fontFamily: F.mono, fontSize: 10, fontWeight: 600, letterSpacing: ".05em",
                                    color: sevColor(sev),
                                    background: "#fff", border: `1px solid ${sevColor(sev)}55`,
                                    padding: "2px 8px", borderRadius: 999,
                                  }}>● {flag.issue}</span>
                                )}
                                {applied && (
                                  <span style={{ fontFamily: F.mono, fontSize: 10, color: C.good, letterSpacing: ".05em" }}>✓ FIXED</span>
                                )}
                              </div>
                              {flag && !applied && (
                                <button onClick={() => applyFix(flag)} style={{
                                  background: C.ink, color: C.accentInk, border: "none",
                                  fontFamily: F.body, fontSize: 12, fontWeight: 600,
                                  padding: "6px 12px", borderRadius: 6, cursor: "pointer",
                                }}>One-click fix</button>
                              )}
                            </div>
                            {meta.multiline ? (
                              <textarea
                                value={plan[k]}
                                onChange={(e) => updateField(k, e.target.value)}
                                rows={meta.rows ?? 3}
                                style={{ ...inputStyle(false), background: "#fff" }}
                              />
                            ) : (
                              <input
                                value={plan[k]}
                                onChange={(e) => updateField(k, e.target.value)}
                                style={{ ...inputStyle(false), background: "#fff" }}
                              />
                            )}

                            {/* Hover tooltip with detailed AI suggestion */}
                            {flag && isHover && (
                              <div style={{
                                position: "absolute", left: 14, right: 14, top: "calc(100% + 6px)",
                                background: C.ink, color: C.accentInk,
                                borderRadius: 10, padding: 14, zIndex: 50,
                                boxShadow: "0 12px 32px rgba(0,0,0,.18)",
                              }}>
                                <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: ".1em", color: "rgba(255,255,255,.55)", marginBottom: 6, textTransform: "uppercase" }}>AI Suggestion</div>
                                <div style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 10 }}>{flag.suggestion}</div>
                                <div style={{
                                  fontFamily: F.mono, fontSize: 11, color: "rgba(255,255,255,.7)",
                                  background: "rgba(255,255,255,.06)", padding: "8px 10px",
                                  borderRadius: 6, lineHeight: 1.5,
                                }}>→ {flag.fix}</div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Comparison: before vs after */}
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 14 }}>
                      Before · After
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", background: C.surface }}>
                        <div style={{ padding: "12px 18px", background: C.badSoft, fontFamily: F.mono, fontSize: 11, color: C.bad, letterSpacing: ".08em", textTransform: "uppercase" }}>✕ Original</div>
                        <div style={{ padding: 20 }}>
                          <div style={{ fontSize: 14, color: C.ink2, lineHeight: 1.7, fontStyle: "italic", marginBottom: 18, paddingBottom: 18, borderBottom: `1px solid ${C.lineSoft}` }}>{DEFAULT_PLAN.copy}</div>
                          <Stat label="Engagement" val="1.2%" tone="bad" />
                          <Stat label="Sentiment" val="38% positive" tone="bad" />
                          <Stat label="Backlash Risk" val="HIGH" tone="bad" pill />
                        </div>
                      </div>
                      <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", background: C.surface }}>
                        <div style={{ padding: "12px 18px", background: C.goodSoft, fontFamily: F.mono, fontSize: 11, color: C.good, letterSpacing: ".08em", textTransform: "uppercase" }}>✓ Optimized</div>
                        <div style={{ padding: 20 }}>
                          <div style={{ fontSize: 14, color: C.ink2, lineHeight: 1.7, fontStyle: "italic", marginBottom: 18, paddingBottom: 18, borderBottom: `1px solid ${C.lineSoft}` }}>
                            {simResult.improvedCopy || plan.copy}
                          </div>
                          <Stat label="Engagement" val="4.8%" tone="good" />
                          <Stat label="Sentiment" val="76% positive" tone="good" />
                          <Stat label="Backlash Risk" val="LOW" tone="good" pill />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Segment cards */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
                    {simResult.segments.map((seg) => {
                      const meta = SEGMENT_META[seg.name] ?? { icon: "○" };
                      return (
                        <div key={seg.name} style={{
                          background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                            <span style={{ fontSize: 18, color: C.ink }}>{meta.icon}</span>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{seg.name}</span>
                          </div>
                          <div style={{ height: 4, background: C.lineSoft, borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
                            <div style={{ height: "100%", width: `${seg.sentimentPct}%`, background: seg.sentimentPct >= 60 ? C.good : seg.sentimentPct >= 40 ? C.warn : C.bad }} />
                          </div>
                          <div style={{ fontFamily: F.display, fontSize: 22, fontWeight: 700, marginBottom: 10, letterSpacing: "-0.01em" }}>{seg.sentimentPct}% positive</div>
                          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>"{seg.topReaction}"</div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   Sub-components
   =========================================================== */
function PersonaCard({
  persona, editable, onChange, onRemove,
}: {
  persona: Persona;
  editable: boolean;
  onChange?: (patch: Partial<Persona>) => void;
  onRemove?: () => void;
}) {
  return (
    <div style={{
      border: `1px solid ${C.line}`, borderRadius: 10, padding: 14, background: C.bg,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          {editable ? (
            <input
              value={persona.name}
              onChange={(e) => onChange?.({ name: e.target.value })}
              style={{ ...miniInput(), fontWeight: 600 }}
            />
          ) : (
            <div style={{ fontFamily: F.display, fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>{persona.name}</div>
          )}
          {editable ? (
            <input
              value={persona.archetype}
              onChange={(e) => onChange?.({ archetype: e.target.value })}
              style={{ ...miniInput(), color: C.muted, marginTop: 4 }}
            />
          ) : (
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{persona.archetype} · age {persona.age}</div>
          )}
        </div>
        {editable && onRemove && (
          <button onClick={onRemove} style={{
            background: "transparent", border: "none", color: C.faint,
            cursor: "pointer", fontSize: 14, padding: 2,
          }}>✕</button>
        )}
      </div>
      <div style={{ height: 3, background: C.lineSoft, borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
        <div style={{
          height: "100%", width: `${persona.sentiment}%`,
          background: persona.sentiment >= 60 ? C.good : persona.sentiment >= 40 ? C.warn : C.bad,
        }} />
      </div>
      <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".05em", marginBottom: 6 }}>
        SENTIMENT {persona.sentiment}%
      </div>
      {editable ? (
        <textarea
          value={persona.quote}
          onChange={(e) => onChange?.({ quote: e.target.value })}
          rows={2}
          style={{ ...miniInput(), fontStyle: "italic" }}
        />
      ) : (
        <div style={{ fontSize: 12, color: C.ink2, lineHeight: 1.5, fontStyle: "italic" }}>"{persona.quote}"</div>
      )}
    </div>
  );
}

function RiskMeter({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div style={{ position: "relative", paddingTop: 18, paddingBottom: 22 }}>
      <div style={{
        height: 8, borderRadius: 4, overflow: "hidden",
        background: `linear-gradient(90deg, ${C.good} 0%, ${C.good} 33%, ${C.warn} 33%, ${C.warn} 66%, ${C.bad} 66%, ${C.bad} 100%)`,
      }} />
      {/* Marker */}
      <div style={{
        position: "absolute", top: 6, left: `${clamped}%`,
        transform: "translateX(-50%)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
      }}>
        <div style={{
          fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: C.ink,
          background: "#fff", border: `1px solid ${C.ink}`, borderRadius: 4,
          padding: "1px 6px", letterSpacing: ".05em",
        }}>{clamped}</div>
        <div style={{ width: 2, height: 22, background: C.ink, borderRadius: 1 }} />
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between",
        marginTop: 8, fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".08em",
      }}>
        <span>LOW</span><span>MEDIUM</span><span>HIGH</span>
      </div>
    </div>
  );
}

function Stat({ label, val, tone, pill }: { label: string; val: string; tone: "good" | "bad"; pill?: boolean }) {
  const color = tone === "good" ? C.good : C.bad;
  const bg = tone === "good" ? C.goodSoft : C.badSoft;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <span style={{ fontSize: 13, color: C.muted }}>{label}</span>
      {pill ? (
        <span style={{
          fontFamily: F.mono, fontSize: 11, fontWeight: 600, letterSpacing: ".06em",
          background: bg, color, padding: "3px 10px", borderRadius: 999,
        }}>{val}</span>
      ) : (
        <span style={{ fontFamily: F.display, fontSize: 16, fontWeight: 700, color, letterSpacing: "-0.01em" }}>{val}</span>
      )}
    </div>
  );
}

/* ===========================================================
   Style helpers
   =========================================================== */
function inputStyle(highlight: boolean): React.CSSProperties {
  return {
    width: "100%",
    border: `1px solid ${highlight ? C.ink : C.line}`,
    background: highlight ? "#FFFFFF" : C.bg,
    borderRadius: 8,
    padding: "10px 12px",
    fontFamily: F.body,
    fontSize: 14,
    color: C.ink,
    lineHeight: 1.5,
    resize: "vertical",
  };
}
function miniInput(): React.CSSProperties {
  return {
    width: "100%", border: `1px solid ${C.line}`, background: "#fff",
    borderRadius: 6, padding: "5px 8px",
    fontFamily: F.body, fontSize: 12, color: C.ink, lineHeight: 1.4, resize: "vertical",
  };
}
function carouselBtnStyle(): React.CSSProperties {
  return {
    width: 32, height: 32, borderRadius: 8,
    background: C.surface, border: `1px solid ${C.line}`,
    color: C.ink, fontSize: 14, cursor: "pointer",
  };
}
function primaryBtnStyle(): React.CSSProperties {
  return {
    background: C.ink, color: C.accentInk, border: "none",
    padding: "12px 22px", borderRadius: 8,
    fontFamily: F.body, fontSize: 14, fontWeight: 600, cursor: "pointer",
  };
}