import { useState, useEffect, Fragment, useMemo, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  simulateCampaign,
  scorePersona,
  PERSONA_ANCHORS,
  type SimulationResult,
  type CampaignPlan,
  type FieldKey,
  type FieldFlag,
  type Persona,
  type PersonaAnchor,
} from "@/utils/simulate.functions";

/* ===========================================================
   ElevenLabs-inspired monochrome palette
   =========================================================== */
const C = {
  bg: "#FAFAF9",
  surface: "#FFFFFF",
  ink: "#0A0A0A",
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
   Sample campaigns (decorative auto-scrolling marquee)
   =========================================================== */
type SampleCampaign = { id: string; badge: string; title: string; emoji: string; gradient: string };
const SAMPLE_CAMPAIGNS: SampleCampaign[] = [
  { id: "sustain",  badge: "Sustainability",  title: '"Our Most Sustainable Product Yet."', emoji: "🌱", gradient: "linear-gradient(135deg,#F5F5F4,#E7E5E4)" },
  { id: "wellness", badge: "Wellness",        title: '"Feel Good. Inside and Out."',         emoji: "🧴", gradient: "linear-gradient(135deg,#FAFAF9,#EDE9E3)" },
  { id: "tech",     badge: "Product Launch",  title: '"Built for Builders."',                emoji: "⚙️", gradient: "linear-gradient(135deg,#F0F0EE,#E2DFDA)" },
  { id: "food",     badge: "Food & Bev",      title: '"Taste the Difference."',              emoji: "🍃", gradient: "linear-gradient(135deg,#F5F5F4,#E5E3DE)" },
  { id: "travel",   badge: "Travel",          title: '"Go Somewhere New."',                  emoji: "✈️", gradient: "linear-gradient(135deg,#F0F0EE,#DDD9D2)" },
  { id: "fashion",  badge: "Fashion",         title: '"Wear It Better."',                    emoji: "👜", gradient: "linear-gradient(135deg,#FAFAF9,#E7E5E4)" },
];

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

type Comment = { id: number; user: string; text: string; type: "negative" | "neutral" };
const COMMENTS: Comment[] = [
  { id: 1, user: "@_realconsumer · 2m ago", text: '"This feels like greenwashing. Zero specifics, just vibes. 🙄"', type: "negative" },
  { id: 2, user: "@sustainableskeptic · 5m ago", text: '"Who is this even for? The vagueness is insulting."', type: "negative" },
  { id: 3, user: "@climate_watchdog · 11m ago", text: '"Another brand pretending to care without showing any proof."', type: "negative" },
  { id: 4, user: "@shoppingmaybe · 18m ago", text: '"What does \'most sustainable\' even mean? Compared to what?"', type: "neutral" },
  { id: 5, user: "@ethicswatch · 24m ago", text: '"No certifications. No data. Just marketing copy. Pass."', type: "negative" },
];

/* ===========================================================
   Main component
   =========================================================== */
export default function CampaignSimulator() {
  const [screen, setScreen] = useState(1);
  const [chaos, setChaos] = useState(false);
  const [visibleComments, setVisibleComments] = useState<number[]>([]);

  const [plan, setPlan] = useState<CampaignPlan>(DEFAULT_PLAN);
  const [customPersonas, setCustomPersonas] = useState<Persona[]>([]);
  const [draftAnchor, setDraftAnchor] = useState<PersonaAnchor>({ vals: "", pew: "", generation: "", notes: "" });
  const [scoringPersona, setScoringPersona] = useState(false);
  const [personaError, setPersonaError] = useState<string | null>(null);

  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  const [appliedFixes, setAppliedFixes] = useState<Set<FieldKey>>(new Set());
  const [hoverFlag, setHoverFlag] = useState<FieldKey | null>(null);

  const countdown = useCountdown(23 * 3600 + 59 * 60);
  const simulateFn = useServerFn(simulateCampaign);
  const scorePersonaFn = useServerFn(scorePersona);

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
    setAppliedFixes(new Set());
    try {
      const response = await simulateFn({ data: { plan } });
      if (!response.ok) setSimError(response.error);
      else setSimResult(response.data);
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
    setAppliedFixes((prev) => new Set(prev).add(flag.field));
  };

  const draftAnchorReady =
    !!(draftAnchor.vals || draftAnchor.pew || draftAnchor.generation) && !!draftAnchor.notes.trim();

  const addCustomPersona = async () => {
    setPersonaError(null);
    setScoringPersona(true);
    try {
      const res = await scorePersonaFn({ data: { anchor: draftAnchor, copy: plan.copy } });
      if (!res.ok) {
        setPersonaError(res.error);
      } else {
        setCustomPersonas((prev) => [...prev, res.persona]);
        setDraftAnchor({ vals: "", pew: "", generation: "", notes: "" });
      }
    } catch (e) {
      console.error(e);
      setPersonaError("Couldn't analyze persona. Please try again.");
    } finally {
      setScoringPersona(false);
    }
  };

  const removeCustomPersona = (idx: number) =>
    setCustomPersonas((prev) => prev.filter((_, i) => i !== idx));

  const navSteps = ["Launch", "Crisis", "Simulate", "Focus Group", "Results"];

  return (
    <div style={{ fontFamily: F.body, background: C.bg, minHeight: "100vh", color: C.ink }}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes ciq-fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ciq-pulse { 0%,100%{opacity:1} 50%{opacity:.55} }
        @keyframes loadDot { 0%,80%,100%{opacity:.2;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }
        @keyframes ciq-marquee { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        .ciq .dot1{animation:loadDot 1.2s ease-in-out infinite}
        .ciq .dot2{animation:loadDot 1.2s ease-in-out .2s infinite}
        .ciq .dot3{animation:loadDot 1.2s ease-in-out .4s infinite}
        .ciq .fadeIn{animation:ciq-fadeIn .4s ease forwards}
        .ciq .pulseBadge{animation:ciq-pulse 1.4s ease-in-out infinite}
        .ciq input:focus, .ciq textarea:focus, .ciq select:focus{outline:none; border-color:${C.ink} !important; background:#fff}
        .ciq button{transition:all .15s ease}
        .ciq button:hover:not(:disabled){transform:translateY(-1px)}
        .marquee-track{display:flex;gap:14px;width:max-content;animation:ciq-marquee 40s linear infinite}
        .marquee-mask{mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
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
            SCREEN 1 — LAUNCH HERO (compact, no scroll)
           ===================================================== */}
        {screen === 1 && (
          <div style={{
            background: C.bg,
            height: "calc(100vh - 56px)",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}>
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              justifyContent: "center", alignItems: "center",
              padding: "20px 28px", textAlign: "center",
              maxWidth: 980, margin: "0 auto", width: "100%",
            }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                fontFamily: F.mono, fontSize: 11, fontWeight: 500, color: C.muted,
                background: C.surface, border: `1px solid ${C.line}`, borderRadius: 999,
                padding: "5px 12px", marginBottom: 18, letterSpacing: ".04em",
              }}>
                <span style={{ width: 6, height: 6, background: C.bad, borderRadius: "50%", display: "inline-block", animation: "blink 1.4s ease-in-out infinite" }} />
                LAUNCH WINDOW OPEN
              </div>
              <h1 style={{
                fontFamily: F.display, fontSize: "clamp(34px, 5vw, 56px)",
                fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.03em",
                marginBottom: 14,
              }}>
                Ship your campaign.<br />
                <span style={{ color: C.muted }}>Or stress-test it first.</span>
              </h1>
              <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.55, maxWidth: 540, margin: "0 auto 24px" }}>
                Your campaign is queued for 2.4M subscribers. One button sends it live — the other shows what happens if you don't.
              </p>

              <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <button onClick={launchCampaign} style={{
                  background: C.ink, color: C.accentInk, border: "none",
                  padding: "16px 40px", borderRadius: 10,
                  fontFamily: F.body, fontSize: 16, fontWeight: 600, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 12,
                  boxShadow: "0 8px 32px rgba(0,0,0,.18)",
                }}>
                  Launch Campaign Now
                  <span style={{ fontFamily: F.mono, fontSize: 13, opacity: .7 }}>→</span>
                </button>
                <button onClick={() => goTo(3)} style={{
                  background: "transparent", color: C.ink, border: "none",
                  padding: "4px 16px", fontFamily: F.body, fontSize: 14, fontWeight: 500,
                  cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 4, textDecorationColor: C.faint,
                }}>
                  or simulate first →
                </button>

                <div style={{
                  marginTop: 8, display: "inline-flex", alignItems: "center", gap: 12,
                  fontFamily: F.mono, fontSize: 12, color: C.muted,
                }}>
                  <span style={{ textTransform: "uppercase", letterSpacing: ".1em" }}>Auto-launch</span>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {countdown.map((val, i) => (
                      <Fragment key={i}>
                        {i > 0 && <span style={{ color: C.faint }}>:</span>}
                        <span style={{
                          background: C.surface, border: `1px solid ${C.line}`, borderRadius: 4,
                          padding: "3px 7px", color: C.ink, fontWeight: 600, minWidth: 28, textAlign: "center",
                        }}>{val}</span>
                      </Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Decorative auto-scroll marquee */}
            <div style={{ paddingBottom: 24 }}>
              <div style={{
                fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: ".15em",
                textTransform: "uppercase", textAlign: "center", marginBottom: 10,
              }}>
                In your queue
              </div>
              <div className="marquee-mask" style={{ overflow: "hidden" }}>
                <div className="marquee-track">
                  {[...SAMPLE_CAMPAIGNS, ...SAMPLE_CAMPAIGNS].map((c, i) => (
                    <div key={`${c.id}-${i}`} aria-hidden style={{
                      width: 240, flexShrink: 0,
                      background: C.surface, border: `1px solid ${C.line}`,
                      borderRadius: 12, overflow: "hidden",
                    }}>
                      <div style={{ height: 70, background: c.gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{c.emoji}</div>
                      <div style={{ padding: "10px 14px" }}>
                        <div style={{ fontFamily: F.mono, fontSize: 9, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>{c.badge}</div>
                        <div style={{ fontFamily: F.display, fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.3 }}>{c.title}</div>
                      </div>
                    </div>
                  ))}
                </div>
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
                    <div style={{ gridColumn: "span 2", background: "transparent", border: "1px solid rgba(255,255,255,.18)", borderRadius: 10, padding: 18 }}>
                      <div style={{ fontFamily: F.mono, fontSize: 10, color: "rgba(255,255,255,.45)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>Backlash Risk</div>
                      <span className="pulseBadge" style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        fontFamily: F.mono, color: "#fff", fontSize: 13, fontWeight: 600, letterSpacing: ".05em",
                        textDecoration: "underline", textDecorationColor: "#FCA5A5", textUnderlineOffset: 4,
                      }}>HIGH — ESCALATING</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
                    {COMMENTS.map((c) => (
                      <div key={c.id} style={{
                        background: "rgba(255,255,255,.04)",
                        borderLeft: `2px solid ${c.type === "neutral" ? "rgba(255,255,255,.25)" : "rgba(255,255,255,.45)"}`,
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
            SCREEN 2 — CRISIS (color minimized, underline-only red)
           ===================================================== */}
        {screen === 2 && (
          <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)" }}>
            <div style={{ maxWidth: 820, margin: "0 auto", padding: "80px 28px", textAlign: "center" }} className="fadeIn">
              <div style={{
                fontFamily: F.mono, fontSize: 11, fontWeight: 500, letterSpacing: ".15em",
                color: C.ink, marginBottom: 24,
                textDecoration: "underline", textDecorationColor: C.bad, textUnderlineOffset: 5, textDecorationThickness: 2,
                display: "inline-block",
              }}>MEDIA COVERAGE — 72 HOURS LATER</div>
              <div style={{
                background: C.surface, border: `1px solid ${C.line}`,
                borderRadius: 12, padding: "28px 32px", marginBottom: 48,
              }}>
                <div style={{
                  fontFamily: F.display, fontSize: 24, fontWeight: 600,
                  color: C.ink, letterSpacing: "-0.02em", lineHeight: 1.3,
                  textDecoration: "underline", textDecorationColor: C.bad,
                  textUnderlineOffset: 6, textDecorationThickness: 2,
                  display: "inline",
                }}>Brand Faces Backlash After Tone-Deaf Sustainability Campaign</div>
                <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, marginTop: 14, letterSpacing: ".05em" }}>— TechCrunch · The Guardian · AdAge & 47 others</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 52 }}>
                {[
                  { label: "PR Crisis Cost", val: "$2.3M", desc: "Agency response, retraction & ad pull" },
                  { label: "Brand Trust Drop", val: "−18%", desc: "Consumer trust score (YouGov)" },
                ].map((c) => (
                  <div key={c.label} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 24, textAlign: "left" }}>
                    <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>{c.label}</div>
                    <div style={{
                      fontFamily: F.display, fontSize: 40, fontWeight: 700,
                      color: C.ink, lineHeight: 1, letterSpacing: "-0.02em",
                      textDecoration: "underline", textDecorationColor: C.bad,
                      textUnderlineOffset: 6, textDecorationThickness: 3,
                      display: "inline-block",
                    }}>{c.val}</div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 10 }}>{c.desc}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => goTo(3)} style={primaryBtnStyle()}>What if we tested this first? →</button>
            </div>
          </div>
        )}

        {/* =====================================================
            SCREEN 3 — SIMULATE
           ===================================================== */}
        {screen === 3 && (
          <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 28px" }} className="fadeIn">
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".15em", marginBottom: 10 }}>● PRE-LAUNCH SIMULATOR</div>
                <h2 style={{ fontFamily: F.display, fontSize: 38, fontWeight: 700, marginBottom: 10, letterSpacing: "-0.02em" }}>Campaign Plan</h2>
                <p style={{ fontSize: 15, color: C.muted, maxWidth: 600 }}>
                  Fill in the details, then simulate the audience reaction. Predicted personas use the <strong style={{ color: C.ink }}>VALS</strong> framework. Add custom personas anchored to VALS, Pew, or generation.
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, alignItems: "start" }}>
                {/* LEFT — Form */}
                <CampaignFormCard
                  plan={plan}
                  updateField={updateField}
                  onSimulate={runSimulation}
                  simulating={simulating}
                  error={simError}
                  ctaLabel="Simulate Audience Reaction"
                  hasResult={!!simResult}
                  onSeeResults={() => goTo(5)}
                />

                {/* RIGHT — Personas */}
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                    <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>
                      VALS-Based Personas
                    </div>
                    <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 14 }}>
                      {simResult ? "Generated from your audience using Values & Lifestyles." : "Run a simulation to generate VALS personas."}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {(simResult?.personas ?? []).map((p, i) => (
                        <PersonaCard key={`ai-${i}`} persona={p} />
                      ))}
                      {!simResult && (
                        <div style={{
                          border: `1px dashed ${C.line}`, borderRadius: 10, padding: 16,
                          textAlign: "center", color: C.faint, fontSize: 12,
                        }}>
                          No personas yet.
                        </div>
                      )}
                      {customPersonas.map((p, i) => (
                        <PersonaCard key={`custom-${i}`} persona={p} onRemove={() => removeCustomPersona(i)} customBadge />
                      ))}
                    </div>
                  </div>

                  {/* Custom persona builder */}
                  <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                    <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>
                      Build a Custom Persona
                    </div>
                    <p style={{ fontSize: 11, color: C.faint, lineHeight: 1.5, marginBottom: 14 }}>
                      Anchor in VALS, Pew typology, and generational research.
                    </p>
                    <div style={{ display: "grid", gap: 10 }}>
                      <AnchorSelect label="VALS" value={draftAnchor.vals} options={PERSONA_ANCHORS.vals} onChange={(v) => setDraftAnchor((d) => ({ ...d, vals: v as PersonaAnchor["vals"] }))} />
                      <AnchorSelect label="Pew typology" value={draftAnchor.pew} options={PERSONA_ANCHORS.pew} onChange={(v) => setDraftAnchor((d) => ({ ...d, pew: v as PersonaAnchor["pew"] }))} />
                      <AnchorSelect label="Generation" value={draftAnchor.generation} options={PERSONA_ANCHORS.generations} onChange={(v) => setDraftAnchor((d) => ({ ...d, generation: v as PersonaAnchor["generation"] }))} />
                      <div>
                        <MiniLabel>Lifestyle / interests</MiniLabel>
                        <textarea
                          value={draftAnchor.notes}
                          onChange={(e) => setDraftAnchor((d) => ({ ...d, notes: e.target.value }))}
                          rows={2}
                          placeholder="e.g. Urban, fashion-conscious, distrusts greenwashing"
                          style={inputStyle(false)}
                        />
                      </div>
                      <button
                        onClick={addCustomPersona}
                        disabled={!draftAnchorReady || scoringPersona}
                        style={{
                          background: !draftAnchorReady || scoringPersona ? C.lineSoft : C.ink,
                          color: !draftAnchorReady || scoringPersona ? C.faint : C.accentInk,
                          border: "none", padding: "11px 16px", borderRadius: 8,
                          fontFamily: F.body, fontSize: 13, fontWeight: 600,
                          cursor: !draftAnchorReady || scoringPersona ? "default" : "pointer",
                          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                        }}>
                        {scoringPersona ? (
                          <>Analyzing <span className="dot1">●</span><span className="dot2">●</span><span className="dot3">●</span></>
                        ) : "+ Add persona & analyze"}
                      </button>
                      {personaError && (
                        <div style={{ fontFamily: F.mono, fontSize: 11, color: C.bad }}>⚠ {personaError}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Inline simulation results */}
              {simResult && (
                <div style={{ marginTop: 32, display: "grid", gap: 18 }} className="fadeIn">
                  <SectionHeader>Audience Sentiment</SectionHeader>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
                    {simResult.segments.map((seg) => (
                      <div key={seg.name} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
                        <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 8 }}>VALS Segment</div>
                        <div style={{ fontFamily: F.display, fontSize: 15, fontWeight: 600, marginBottom: 12, letterSpacing: "-0.01em" }}>{seg.name}</div>
                        <div style={{ height: 4, background: C.lineSoft, borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
                          <div style={{
                            height: "100%", width: `${seg.sentimentPct}%`,
                            background: seg.sentimentPct >= 60 ? C.good : seg.sentimentPct >= 40 ? C.warn : C.bad,
                          }} />
                        </div>
                        <div style={{ fontFamily: F.display, fontSize: 22, fontWeight: 700, marginBottom: 10, letterSpacing: "-0.01em" }}>{seg.sentimentPct}% positive</div>
                        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>"{seg.topReaction}"</div>
                      </div>
                    ))}
                  </div>

                  <SectionHeader>Emotional Tone Analysis</SectionHeader>
                  <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20, display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {simResult.tones.map((t) => (
                      <span key={t} style={{
                        fontFamily: F.mono, fontSize: 12, color: C.ink,
                        background: C.lineSoft, padding: "6px 12px", borderRadius: 999,
                        letterSpacing: ".04em",
                      }}>{t}</span>
                    ))}
                  </div>

                  <SectionHeader>Backlash Risk Meter</SectionHeader>
                  <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                      <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase" }}>{simResult.risk}</div>
                      <div style={{ fontFamily: F.display, fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>{simResult.riskScore}/100</div>
                    </div>
                    <RiskMeter score={simResult.riskScore} />
                    <p style={{ fontSize: 13, color: C.muted, marginTop: 14, lineHeight: 1.6 }}>{simResult.riskRationale}</p>
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <button onClick={() => goTo(4)} style={{ ...primaryBtnStyle(), background: C.surface, color: C.ink, border: `1px solid ${C.line}` }}>
                      Open Focus Group →
                    </button>
                    <button onClick={() => goTo(5)} style={primaryBtnStyle()}>
                      See how to improve →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =====================================================
            SCREEN 4 — FOCUS GROUP (live discussion view)
           ===================================================== */}
        {screen === 4 && (
          <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 28px" }} className="fadeIn">
              <div style={{ marginBottom: 30 }}>
                <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".15em", marginBottom: 10 }}>● SYNTHETIC FOCUS GROUP</div>
                <h2 style={{ fontFamily: F.display, fontSize: 38, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 10 }}>Round-table reactions.</h2>
                <p style={{ fontSize: 15, color: C.muted, maxWidth: 620 }}>
                  Hear each VALS segment respond in their own voice — followed by your custom personas.
                </p>
              </div>

              {!simResult ? (
                <EmptyState onAction={() => goTo(3)} />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "start" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {simResult.personas.map((p, i) => (
                      <FocusGroupRow key={`fg-${i}`} persona={p} side={i % 2 === 0 ? "left" : "right"} />
                    ))}
                    {customPersonas.map((p, i) => (
                      <FocusGroupRow key={`fg-c-${i}`} persona={p} side={i % 2 === 0 ? "right" : "left"} custom />
                    ))}
                  </div>
                  <aside style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22, position: "sticky", top: 76 }}>
                    <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>Session Summary</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <SummaryRow label="Participants" val={`${simResult.personas.length + customPersonas.length}`} />
                      <SummaryRow label="Avg sentiment" val={`${avgSentiment(simResult.personas, customPersonas)}%`} />
                      <SummaryRow label="Risk band" val={simResult.risk} />
                    </div>
                    <div style={{ borderTop: `1px solid ${C.lineSoft}`, marginTop: 16, paddingTop: 14 }}>
                      <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>Tone</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {simResult.tones.map((t) => (
                          <span key={t} style={{
                            fontFamily: F.mono, fontSize: 11, color: C.ink,
                            background: C.lineSoft, padding: "4px 10px", borderRadius: 999,
                          }}>{t}</span>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => goTo(5)} style={{ ...primaryBtnStyle(), width: "100%", marginTop: 18 }}>
                      Review & fix →
                    </button>
                  </aside>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =====================================================
            SCREEN 5 — RESULTS (form first, no risk meter)
           ===================================================== */}
        {screen === 5 && (
          <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 28px" }} className="fadeIn">
              <div style={{ marginBottom: 30 }}>
                <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".15em", marginBottom: 10 }}>● FOCUS-GROUP RESULTS</div>
                <h2 style={{ fontFamily: F.display, fontSize: 38, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 10 }}>
                  Here's how you can improve.
                </h2>
                <p style={{ fontSize: 15, color: C.muted, maxWidth: 620 }}>
                  Risky fields are flagged in your plan. Hover for the AI's suggestion, or one-click to apply the fix.
                </p>
              </div>

              {!simResult ? (
                <EmptyState onAction={() => goTo(3)} />
              ) : (
                <>
                  {/* Two-column form mirroring the Simulate page */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, alignItems: "start" }}>
                    {/* LEFT — flagged form */}
                    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 28 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                        <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase" }}>
                          Flagged fields · {simResult.flags.length}
                        </div>
                        <button onClick={runSimulation} disabled={simulating} style={{
                          background: C.ink, color: C.accentInk, border: "none",
                          padding: "9px 16px", borderRadius: 8,
                          fontFamily: F.body, fontSize: 12, fontWeight: 600,
                          cursor: simulating ? "default" : "pointer",
                        }}>{simulating ? "Re-running…" : "Re-simulate"}</button>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                        {FIELD_ORDER.map((k) => {
                          const flag = flagsByField.get(k);
                          const applied = appliedFixes.has(k);
                          const meta = FIELD_META[k];
                          const sev = flag?.severity ?? "low";
                          const isHover = hoverFlag === k;
                          const fullWidth = k === "copy" || k === "keyMessage" || k === "targetAudience";
                          return (
                            <div key={k}
                              onMouseEnter={() => flag && setHoverFlag(k)}
                              onMouseLeave={() => setHoverFlag(null)}
                              style={{
                                position: "relative",
                                gridColumn: fullWidth ? "1 / -1" : undefined,
                              }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 6 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase" }}>{meta.label}</span>
                                  {flag && (
                                    <span style={{
                                      fontFamily: F.mono, fontSize: 10, fontWeight: 600, letterSpacing: ".05em",
                                      color: C.ink,
                                      textDecoration: "underline", textDecorationColor: sevColor(sev),
                                      textUnderlineOffset: 3, textDecorationThickness: 2,
                                    }}>{flag.issue}</span>
                                  )}
                                  {applied && (
                                    <span style={{ fontFamily: F.mono, fontSize: 10, color: C.good, letterSpacing: ".05em" }}>✓ FIXED</span>
                                  )}
                                </div>
                                {flag && !applied && (
                                  <button onClick={() => applyFix(flag)} style={{
                                    background: C.ink, color: C.accentInk, border: "none",
                                    fontFamily: F.body, fontSize: 11, fontWeight: 600,
                                    padding: "5px 10px", borderRadius: 6, cursor: "pointer",
                                  }}>One-click fix</button>
                                )}
                              </div>
                              {meta.multiline ? (
                                <textarea
                                  value={plan[k]}
                                  onChange={(e) => updateField(k, e.target.value)}
                                  rows={meta.rows ?? 3}
                                  style={{
                                    ...inputStyle(false),
                                    background: "#fff",
                                    borderColor: flag ? sevColor(sev) : C.line,
                                  }}
                                />
                              ) : (
                                <input
                                  value={plan[k]}
                                  onChange={(e) => updateField(k, e.target.value)}
                                  style={{
                                    ...inputStyle(false),
                                    background: "#fff",
                                    borderColor: flag ? sevColor(sev) : C.line,
                                  }}
                                />
                              )}

                              {flag && isHover && (
                                <div style={{
                                  position: "absolute", left: 0, right: 0, top: "calc(100% + 6px)",
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

                    {/* RIGHT — VALS personas (mirroring Simulate page structure) */}
                    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                      <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 14 }}>
                        VALS Personas
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {simResult.personas.map((p, i) => <PersonaCard key={`r-${i}`} persona={p} />)}
                        {customPersonas.map((p, i) => <PersonaCard key={`r-c-${i}`} persona={p} customBadge />)}
                      </div>
                    </div>
                  </div>

                  {/* Comparison: before vs after */}
                  <div style={{ marginTop: 32 }}>
                    <SectionHeader>Before · After</SectionHeader>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}>
                      <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", background: C.surface }}>
                        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.lineSoft}`, fontFamily: F.mono, fontSize: 11, color: C.ink, letterSpacing: ".08em", textTransform: "uppercase", textDecoration: "underline", textDecorationColor: C.bad, textUnderlineOffset: 4 }}>Original</div>
                        <div style={{ padding: 20 }}>
                          <div style={{ fontSize: 14, color: C.ink2, lineHeight: 1.7, fontStyle: "italic", marginBottom: 18, paddingBottom: 18, borderBottom: `1px solid ${C.lineSoft}` }}>{DEFAULT_PLAN.copy}</div>
                          <Stat label="Engagement" val="1.2%" tone="bad" />
                          <Stat label="Sentiment" val="38% positive" tone="bad" />
                          <Stat label="Backlash Risk" val="HIGH" tone="bad" pill />
                        </div>
                      </div>
                      <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", background: C.surface }}>
                        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.lineSoft}`, fontFamily: F.mono, fontSize: 11, color: C.ink, letterSpacing: ".08em", textTransform: "uppercase", textDecoration: "underline", textDecorationColor: C.good, textUnderlineOffset: 4 }}>Optimized</div>
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
   Reusable: Campaign form card (used by Simulate)
   =========================================================== */
function CampaignFormCard({
  plan, updateField, onSimulate, simulating, error, ctaLabel, hasResult, onSeeResults,
}: {
  plan: CampaignPlan;
  updateField: (k: FieldKey, v: string) => void;
  onSimulate: () => void;
  simulating: boolean;
  error: string | null;
  ctaLabel: string;
  hasResult: boolean;
  onSeeResults: () => void;
}) {
  return (
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

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 22, flexWrap: "wrap" }}>
        <button onClick={onSimulate} disabled={simulating} style={{
          background: simulating ? C.faint : C.ink, color: C.accentInk,
          border: "none", padding: "13px 24px", borderRadius: 8,
          fontFamily: F.body, fontSize: 14, fontWeight: 600,
          cursor: simulating ? "default" : "pointer",
          display: "inline-flex", alignItems: "center", gap: 8,
        }}>
          {simulating ? (
            <>Running <span className="dot1">●</span><span className="dot2">●</span><span className="dot3">●</span></>
          ) : ctaLabel}
        </button>
        {hasResult && (
          <button onClick={onSeeResults} style={{
            background: "transparent", color: C.ink, border: `1px solid ${C.ink}`,
            padding: "12px 22px", borderRadius: 8,
            fontFamily: F.body, fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}>See improvements →</button>
        )}
      </div>

      {error && (
        <div style={{
          marginTop: 14, background: C.surface, border: `1px solid ${C.line}`,
          borderLeft: `3px solid ${C.bad}`,
          borderRadius: 8, padding: "12px 14px", fontFamily: F.mono,
          fontSize: 12, color: C.ink2,
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
        }}>
          <span>⚠ {error}</span>
          <button onClick={onSimulate} style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.ink, padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Retry</button>
        </div>
      )}
    </div>
  );
}

/* ===========================================================
   Sub-components
   =========================================================== */
function PersonaCard({ persona, onRemove, customBadge }: { persona: Persona; onRemove?: () => void; customBadge?: boolean }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 14, background: C.bg }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontFamily: F.display, fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>{persona.name}</div>
            {customBadge && (
              <span style={{ fontFamily: F.mono, fontSize: 9, color: C.muted, background: C.lineSoft, padding: "2px 6px", borderRadius: 4, letterSpacing: ".06em" }}>CUSTOM</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{persona.archetype} · {persona.age}</div>
        </div>
        {onRemove && (
          <button onClick={onRemove} style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontSize: 14, padding: 2 }}>✕</button>
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
      <div style={{ fontSize: 12, color: C.ink2, lineHeight: 1.5, fontStyle: "italic" }}>"{persona.quote}"</div>
    </div>
  );
}

function FocusGroupRow({ persona, side, custom }: { persona: Persona; side: "left" | "right"; custom?: boolean }) {
  const isLeft = side === "left";
  return (
    <div style={{ display: "flex", justifyContent: isLeft ? "flex-start" : "flex-end" }}>
      <div style={{
        maxWidth: "82%", display: "flex", gap: 12,
        flexDirection: isLeft ? "row" : "row-reverse",
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          background: C.ink, color: C.accentInk,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: F.display, fontWeight: 700, fontSize: 14, flexShrink: 0,
        }}>{persona.name.slice(0, 1).toUpperCase()}</div>
        <div>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 4,
            justifyContent: isLeft ? "flex-start" : "flex-end",
          }}>
            <span style={{ fontFamily: F.display, fontSize: 13, fontWeight: 600 }}>{persona.name}</span>
            <span style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".05em" }}>{persona.age}</span>
            {custom && <span style={{ fontFamily: F.mono, fontSize: 9, color: C.muted, background: C.lineSoft, padding: "1px 6px", borderRadius: 4 }}>CUSTOM</span>}
          </div>
          <div style={{
            background: C.surface, border: `1px solid ${C.line}`,
            borderRadius: 14, padding: "12px 16px",
            borderTopLeftRadius: isLeft ? 4 : 14,
            borderTopRightRadius: isLeft ? 14 : 4,
          }}>
            <div style={{ fontSize: 14, color: C.ink2, lineHeight: 1.55 }}>"{persona.quote}"</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
              <div style={{ flex: 1, height: 3, background: C.lineSoft, borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${persona.sentiment}%`,
                  background: persona.sentiment >= 60 ? C.good : persona.sentiment >= 40 ? C.warn : C.bad,
                }} />
              </div>
              <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".05em" }}>{persona.sentiment}%</div>
            </div>
            <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, marginTop: 6 }}>{persona.archetype}</div>
          </div>
        </div>
      </div>
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
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".08em" }}>
        <span>LOW</span><span>MEDIUM</span><span>HIGH</span>
      </div>
    </div>
  );
}

function Stat({ label, val, tone, pill }: { label: string; val: string; tone: "good" | "bad"; pill?: boolean }) {
  const color = tone === "good" ? C.good : C.bad;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <span style={{ fontSize: 13, color: C.muted }}>{label}</span>
      {pill ? (
        <span style={{
          fontFamily: F.mono, fontSize: 11, fontWeight: 600, letterSpacing: ".06em",
          color: C.ink, padding: "3px 0",
          textDecoration: "underline", textDecorationColor: color, textUnderlineOffset: 4, textDecorationThickness: 2,
        }}>{val}</span>
      ) : (
        <span style={{
          fontFamily: F.display, fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: "-0.01em",
          textDecoration: "underline", textDecorationColor: color, textUnderlineOffset: 4, textDecorationThickness: 2,
        }}>{val}</span>
      )}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".12em", textTransform: "uppercase" }}>
      {children}
    </div>
  );
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>
      {children}
    </div>
  );
}

function AnchorSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <MiniLabel>{label}</MiniLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", border: `1px solid ${C.line}`, background: C.bg,
          borderRadius: 8, padding: "10px 12px", fontFamily: F.body, fontSize: 13, color: C.ink,
          appearance: "none",
        }}>
        <option value="">Select…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function SummaryRow({ label, val }: { label: string; val: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
      <span style={{ fontFamily: F.display, fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>{val}</span>
    </div>
  );
}

function EmptyState({ onAction }: { onAction: () => void }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14,
      padding: 40, textAlign: "center",
    }}>
      <p style={{ color: C.muted, marginBottom: 16 }}>No simulation yet — run one to see results.</p>
      <button onClick={onAction} style={primaryBtnStyle()}>Go to simulator</button>
    </div>
  );
}

function avgSentiment(a: Persona[], b: Persona[]): number {
  const all = [...a, ...b];
  if (!all.length) return 0;
  return Math.round(all.reduce((s, p) => s + p.sentiment, 0) / all.length);
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
function primaryBtnStyle(): React.CSSProperties {
  return {
    background: C.ink, color: C.accentInk, border: "none",
    padding: "12px 22px", borderRadius: 8,
    fontFamily: F.body, fontSize: 14, fontWeight: 600, cursor: "pointer",
  };
}
