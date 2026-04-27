import { useState, useEffect, Fragment, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  simulateCampaign,
  scorePersona,
  type SimulationResult,
  type SimulationSegment,
  type SimulationInsights,
  type CampaignPlan,
  type FieldKey,
  type FieldFlag,
  type Persona,
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
   Sample campaigns (decorative manual carousel on the launch hero)
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

/* Descriptive sentiment bands — replaces raw percentages in the UI. */
function sentimentLabel(score: number): string {
  if (score >= 85) return "Enthusiastic";
  if (score >= 70) return "Engaged";
  if (score >= 55) return "Excited but skeptical";
  if (score >= 40) return "Cautiously curious";
  if (score >= 25) return "Skeptical";
  return "Hostile";
}
function sentimentColor(score: number): string {
  return score >= 60 ? C.good : score >= 40 ? C.warn : C.bad;
}

/* Plain-language risk descriptor — replaces the numeric score in the UI. */
function riskBlurb(risk: SimulationResult["risk"]): string {
  if (risk === "LOW") return "Likely safe to ship — minor tweaks at most.";
  if (risk === "MEDIUM") return "Some risk — review the flagged fields before launch.";
  return "High chance of backlash — rewrite before sending.";
}

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
  const [carouselIdx, setCarouselIdx] = useState(0);

  const [plan, setPlan] = useState<CampaignPlan>(DEFAULT_PLAN);
  const [customPersonas, setCustomPersonas] = useState<Persona[]>([]);
  const [draftDescription, setDraftDescription] = useState("");
  const [hintsOpen, setHintsOpen] = useState(false);
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

  const draftReady = draftDescription.trim().length >= 3;

  const addCustomPersona = async () => {
    setPersonaError(null);
    setScoringPersona(true);
    try {
      const res = await scorePersonaFn({ data: { description: draftDescription, copy: plan.copy } });
      if (!res.ok) {
        setPersonaError(res.error);
      } else {
        setCustomPersonas((prev) => [...prev, res.persona]);
        setDraftDescription("");
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

  const navSteps: { label: string; screen: number }[] = [
    { label: "Launch",      screen: 1 },
    { label: "Crisis",      screen: 2 },
    { label: "Simulate",    screen: 3 },
    { label: "Results",     screen: 5 },
    { label: "Focus Group", screen: 4 },
  ];

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
        .ciq input:focus, .ciq textarea:focus, .ciq select:focus{outline:none; border-color:${C.ink} !important; background:#fff}
        .ciq button{transition:all .15s ease}
        .ciq button:hover:not(:disabled){transform:translateY(-1px)}
        .ciq-carousel-track{display:flex;gap:14px;transition:transform .45s cubic-bezier(.22,.61,.36,1)}
        .ciq-carousel-mask{position:relative;overflow:hidden;padding:0 18px}
        .ciq-carousel-mask::before,.ciq-carousel-mask::after{content:"";position:absolute;top:0;bottom:0;width:80px;pointer-events:none;z-index:2}
        .ciq-carousel-mask::before{left:0;background:linear-gradient(90deg,${C.bg} 0%,${C.bg} 18%,rgba(250,250,249,0) 100%)}
        .ciq-carousel-mask::after{right:0;background:linear-gradient(270deg,${C.bg} 0%,${C.bg} 18%,rgba(250,250,249,0) 100%)}
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
            {navSteps.map(({ label, screen: s }) => (
              <button key={label} onClick={() => goTo(s)} style={{
                padding: "6px 14px", borderRadius: 6, border: "none",
                fontFamily: F.body, fontSize: 13, fontWeight: 500, cursor: "pointer",
                background: screen === s ? C.ink : "transparent",
                color: screen === s ? C.accentInk : C.muted,
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

            {/* Manual carousel (arrows + edge gradient fade) */}
            <div style={{ paddingBottom: 24 }}>
              <div style={{
                fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: ".15em",
                textTransform: "uppercase", textAlign: "center", marginBottom: 10,
              }}>
                In your queue
              </div>
              <CampaignCarousel
                items={SAMPLE_CAMPAIGNS}
                index={carouselIdx}
                onPrev={() => setCarouselIdx((i) => (i - 1 + SAMPLE_CAMPAIGNS.length) % SAMPLE_CAMPAIGNS.length)}
                onNext={() => setCarouselIdx((i) => (i + 1) % SAMPLE_CAMPAIGNS.length)}
              />
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
                        fontFamily: F.mono, color: "#FCA5A5", fontSize: 13, fontWeight: 700, letterSpacing: ".05em",
                      }}>HIGH — ESCALATING</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
                    {COMMENTS.map((c) => (
                      <div key={c.id} style={{
                        background: "rgba(255,255,255,.04)",
                        borderLeft: c.type === "negative"
                          ? `3px solid #FCA5A5`
                          : `2px solid rgba(255,255,255,.25)`,
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
            SCREEN 2 — CRISIS (underlines only on negative words)
           ===================================================== */}
        {screen === 2 && (
          <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)" }}>
            <div style={{ maxWidth: 820, margin: "0 auto", padding: "80px 28px", textAlign: "center" }} className="fadeIn">
              <div style={{
                fontFamily: F.mono, fontSize: 11, fontWeight: 500, letterSpacing: ".15em",
                color: C.muted, marginBottom: 24, display: "inline-block",
              }}>MEDIA COVERAGE — 72 HOURS LATER</div>
              <div style={{
                background: C.surface, border: `1px solid ${C.line}`,
                borderRadius: 12, padding: "28px 32px", marginBottom: 48,
              }}>
                <div style={{
                  fontFamily: F.display, fontSize: 24, fontWeight: 600,
                  color: C.ink, letterSpacing: "-0.02em", lineHeight: 1.3,
                }}>
                  Brand Faces <NegWord>Backlash</NegWord> After <NegWord>Tone-Deaf</NegWord> Sustainability Campaign
                </div>
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
                      color: C.bad, lineHeight: 1, letterSpacing: "-0.02em",
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
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 28px 40px" }} className="fadeIn">
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".15em", marginBottom: 6 }}>● PRE-LAUNCH SIMULATOR</div>
                <h2 style={{ fontFamily: F.display, fontSize: 30, fontWeight: 700, marginBottom: 6, letterSpacing: "-0.02em" }}>Campaign Plan</h2>
                <p style={{ fontSize: 14, color: C.muted, maxWidth: 640, lineHeight: 1.5, margin: 0 }}>
                  Fill in the details, then simulate the audience reaction. The simulator surfaces broad audience segments most likely to engage — and you can add your own custom panelists below.
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
                />

                {/* RIGHT — Audience segments + custom personas */}
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                    <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>
                      Audience Segments
                    </div>
                    <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 14 }}>
                      {simResult
                        ? "Three broad audience groups most likely to react to your campaign."
                        : "Run a simulation to surface the audience segments most affected by your copy."}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {(simResult?.segments ?? []).map((s, i) => (
                        <SegmentCard key={`seg-${i}`} segment={s} />
                      ))}
                      {!simResult && (
                        <div style={{
                          border: `1px dashed ${C.line}`, borderRadius: 10, padding: 16,
                          textAlign: "center", color: C.faint, fontSize: 12,
                        }}>
                          No segments yet.
                        </div>
                      )}
                    </div>
                  </div>

                  {customPersonas.length > 0 && (
                    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                      <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 14 }}>
                        Your Custom Panelists
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {customPersonas.map((p, i) => (
                          <PersonaCard key={`custom-${i}`} persona={p} onRemove={() => removeCustomPersona(i)} customBadge />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Custom persona builder */}
                  <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase" }}>
                        Build a Custom Persona
                      </div>
                      <button
                        onClick={() => setHintsOpen((v) => !v)}
                        aria-expanded={hintsOpen}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          background: hintsOpen ? C.ink : "transparent",
                          color: hintsOpen ? C.accentInk : C.muted,
                          border: `1px solid ${hintsOpen ? C.ink : C.line}`,
                          borderRadius: 999, padding: "3px 10px",
                          fontFamily: F.mono, fontSize: 10, fontWeight: 600,
                          letterSpacing: ".05em", cursor: "pointer",
                        }}>
                        <span style={{
                          width: 14, height: 14, borderRadius: "50%",
                          background: hintsOpen ? "rgba(255,255,255,.18)" : C.lineSoft,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 700,
                        }}>?</span>
                        {hintsOpen ? "HIDE HINTS" : "HINTS"}
                      </button>
                    </div>
                    <p style={{ fontSize: 11, color: C.faint, lineHeight: 1.5, marginBottom: 12 }}>
                      Describe a synthetic panelist in your own words — they'll be added to your panel just like the AI-generated ones.
                    </p>

                    {hintsOpen && <PersonaHintPanel />}

                    <div style={{ display: "grid", gap: 10 }}>
                      <textarea
                        value={draftDescription}
                        onChange={(e) => setDraftDescription(e.target.value)}
                        rows={5}
                        placeholder="e.g. Mid-30s urban renter, sustainability-minded but price-sensitive, watches a lot of YouTube, doesn't trust greenwashing claims."
                        style={inputStyle(false)}
                      />
                      <button
                        onClick={addCustomPersona}
                        disabled={!draftReady || scoringPersona}
                        style={{
                          background: !draftReady || scoringPersona ? C.lineSoft : C.ink,
                          color: !draftReady || scoringPersona ? C.faint : C.accentInk,
                          border: "none", padding: "11px 16px", borderRadius: 8,
                          fontFamily: F.body, fontSize: 13, fontWeight: 600,
                          cursor: !draftReady || scoringPersona ? "default" : "pointer",
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

              {/* Inline simulation results — compact stacking */}
              {simResult && (
                <div style={{ marginTop: 24, display: "grid", gap: 12 }} className="fadeIn">
                  {/* Risk meter — top, compact card with tones inline */}
                  <div style={{
                    background: C.surface, border: `1px solid ${C.line}`,
                    borderRadius: 12, padding: "14px 18px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
                      <div style={{ flexShrink: 0, maxWidth: 260 }}>
                        <div style={{ fontFamily: F.mono, fontSize: 9, color: C.muted, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 2 }}>
                          Backlash Risk
                        </div>
                        <div style={{
                          fontFamily: F.display, fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em",
                          color: simResult.risk === "LOW" ? C.good : simResult.risk === "MEDIUM" ? C.warn : C.bad,
                          lineHeight: 1.1,
                        }}>
                          {simResult.risk}
                        </div>
                        <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.45 }}>
                          {riskBlurb(simResult.risk)}
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <RiskMeter score={simResult.riskScore} compact />
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.lineSoft}` }}>
                      <p style={{ flex: 1, minWidth: 220, fontSize: 12, color: C.muted, lineHeight: 1.55, margin: 0 }}>
                        {simResult.riskRationale}
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {simResult.tones.map((t) => (
                          <span key={t} style={{
                            fontFamily: F.mono, fontSize: 11, color: C.ink,
                            background: C.lineSoft, padding: "3px 9px", borderRadius: 999,
                            letterSpacing: ".03em",
                          }}>{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Audience Sentiment — compact 3-up grid */}
                  <SectionHeader>Audience Sentiment</SectionHeader>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                    {simResult.segments.map((seg) => {
                      const tone = sentimentColor(seg.sentimentPct);
                      return (
                        <div key={seg.name} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px" }}>
                          <div style={{ fontFamily: F.display, fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 8, lineHeight: 1.25 }}>{seg.name}</div>
                          <div style={{ height: 3, background: C.lineSoft, borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
                            <div style={{ height: "100%", width: `${seg.sentimentPct}%`, background: tone }} />
                          </div>
                          <div style={{
                            fontFamily: F.mono, fontSize: 11, fontWeight: 600, color: tone,
                            letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 6,
                          }}>{sentimentLabel(seg.sentimentPct)}</div>
                          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45, fontStyle: "italic" }}>"{seg.topReaction}"</div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
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
            SCREEN 4 — FOCUS GROUP (real persona discussion)
           ===================================================== */}
        {screen === 4 && (
          <FocusGroupScreen
            simResult={simResult}
            customPersonas={customPersonas}
            onGoSimulate={() => goTo(3)}
            onGoResults={() => goTo(5)}
          />
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

                    {/* RIGHT — Audience segments (mirroring Simulate page structure) */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                        <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 14 }}>
                          Audience Segments
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {simResult.segments.map((s, i) => <SegmentCard key={`r-seg-${i}`} segment={s} />)}
                        </div>
                      </div>
                      {customPersonas.length > 0 && (
                        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                          <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 14 }}>
                            Your Custom Panelists
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {customPersonas.map((p, i) => <PersonaCard key={`r-c-${i}`} persona={p} customBadge />)}
                          </div>
                        </div>
                      )}
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

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
                    <button onClick={() => goTo(4)} style={primaryBtnStyle()}>
                      See your focus group →
                    </button>
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
  plan, updateField, onSimulate, simulating, error, ctaLabel,
}: {
  plan: CampaignPlan;
  updateField: (k: FieldKey, v: string) => void;
  onSimulate: () => void;
  simulating: boolean;
  error: string | null;
  ctaLabel: string;
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
function NegWord({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      color: C.bad,
      textDecoration: "underline",
      textDecorationColor: C.bad,
      textUnderlineOffset: 5,
      textDecorationThickness: 2,
    }}>{children}</span>
  );
}

function CampaignCarousel({
  items, index, onPrev, onNext,
}: {
  items: SampleCampaign[];
  index: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const CARD_W = 240;
  const GAP = 14;
  const STEP = CARD_W + GAP;
  const arrowBtn: React.CSSProperties = {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    width: 38, height: 38, borderRadius: "50%",
    background: C.surface, border: `1px solid ${C.line}`,
    color: C.ink, fontFamily: F.mono, fontSize: 16, fontWeight: 600,
    cursor: "pointer", zIndex: 3,
    boxShadow: "0 4px 14px rgba(0,0,0,.06)",
    display: "flex", alignItems: "center", justifyContent: "center",
  };
  return (
    <div style={{ position: "relative", maxWidth: 980, margin: "0 auto" }}>
      <button aria-label="Previous campaign" onClick={onPrev} style={{ ...arrowBtn, left: 6 }}>‹</button>
      <button aria-label="Next campaign" onClick={onNext} style={{ ...arrowBtn, right: 6 }}>›</button>
      <div className="ciq-carousel-mask">
        <div
          className="ciq-carousel-track"
          style={{ transform: `translateX(calc(50% - ${CARD_W / 2}px - ${index * STEP}px))` }}
        >
          {items.map((c, i) => {
            const active = i === index;
            return (
              <div key={c.id} aria-hidden={!active} style={{
                width: CARD_W, flexShrink: 0,
                background: C.surface, border: `1px solid ${C.line}`,
                borderRadius: 12, overflow: "hidden",
                opacity: active ? 1 : 0.55,
                transform: active ? "scale(1)" : "scale(0.95)",
                transition: "opacity .35s ease, transform .35s ease",
              }}>
                <div style={{ height: 70, background: c.gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{c.emoji}</div>
                <div style={{ padding: "10px 14px" }}>
                  <div style={{ fontFamily: F.mono, fontSize: 9, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>{c.badge}</div>
                  <div style={{ fontFamily: F.display, fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.3 }}>{c.title}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 12 }}>
        {items.map((_, i) => (
          <span key={i} aria-hidden style={{
            width: i === index ? 18 : 6, height: 6, borderRadius: 3,
            background: i === index ? C.ink : C.line,
            transition: "all .3s ease",
          }} />
        ))}
      </div>
    </div>
  );
}

function SegmentCard({ segment }: { segment: SimulationSegment }) {
  const tone = sentimentColor(segment.sentimentPct);
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 14, background: C.bg }}>
      <div style={{ fontFamily: F.mono, fontSize: 9, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>
        Audience Segment
      </div>
      <div style={{ fontFamily: F.display, fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 10 }}>
        {segment.name}
      </div>
      <div style={{ height: 3, background: C.lineSoft, borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
        <div style={{ height: "100%", width: `${segment.sentimentPct}%`, background: tone }} />
      </div>
      <div style={{
        display: "inline-block",
        fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: tone,
        letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 8,
      }}>
        {sentimentLabel(segment.sentimentPct)}
      </div>
      <div style={{ fontSize: 12, color: C.ink2, lineHeight: 1.5, fontStyle: "italic" }}>
        "{segment.topReaction}"
      </div>
    </div>
  );
}

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
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
            {persona.age}{persona.job ? ` · ${persona.job}` : ""}
          </div>
          <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, marginTop: 4, letterSpacing: ".02em" }}>{persona.archetype}</div>
        </div>
        {onRemove && (
          <button onClick={onRemove} style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontSize: 14, padding: 2 }}>✕</button>
        )}
      </div>
      <div style={{ height: 3, background: C.lineSoft, borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
        <div style={{
          height: "100%", width: `${persona.sentiment}%`,
          background: sentimentColor(persona.sentiment),
        }} />
      </div>
      <div style={{
        fontFamily: F.mono, fontSize: 10, fontWeight: 600,
        color: sentimentColor(persona.sentiment),
        letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 6,
      }}>
        {sentimentLabel(persona.sentiment)}
      </div>
      <div style={{ fontSize: 12, color: C.ink2, lineHeight: 1.5, fontStyle: "italic" }}>"{persona.quote}"</div>
    </div>
  );
}

function FocusGroupScreen({
  simResult, customPersonas, onGoSimulate, onGoResults,
}: {
  simResult: SimulationResult | null;
  customPersonas: Persona[];
  onGoSimulate: () => void;
  onGoResults: () => void;
}) {
  const [tab, setTab] = useState<"conclusion" | "personas" | "transcript">("conclusion");

  const allPersonas: Array<{ persona: Persona; custom: boolean }> = useMemo(() => [
    ...(simResult?.personas ?? []).map((p) => ({ persona: p, custom: false })),
    ...customPersonas.map((p) => ({ persona: p, custom: true })),
  ], [simResult, customPersonas]);

  const transcript = useMemo(() => buildTranscript(allPersonas.map((x) => x.persona)), [allPersonas]);
  const avg = simResult ? avgSentiment(simResult.personas, customPersonas) : 0;

  return (
    <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 28px" }} className="fadeIn">
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".15em", marginBottom: 10 }}>● SYNTHETIC FOCUS GROUP</div>
          <h2 style={{ fontFamily: F.display, fontSize: 38, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 10 }}>Round-table reactions.</h2>
          <p style={{ fontSize: 15, color: C.muted, maxWidth: 620 }}>
            Meet your panel. Each participant is a realistic individual built from your audience — they react in their own voice and challenge each other.
          </p>
        </div>

        {!simResult ? (
          <EmptyState onAction={onGoSimulate} />
        ) : (
          <>
            {/* Summary bar */}
            <div style={{
              background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14,
              padding: "16px 22px", marginBottom: 18,
              display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
            }}>
              <div style={{ display: "flex", gap: 28, flexShrink: 0 }}>
                <SummaryStat label="Mood" val={sentimentLabel(avg)} tone={avg >= 60 ? "good" : avg >= 40 ? "warn" : "bad"} />
                <SummaryStat label="Participants" val={`${allPersonas.length}`} />
                <SummaryStat label="Exchanges" val={`${transcript.length}`} />
                <SummaryStat label="Risk band" val={simResult.risk} tone={simResult.risk === "LOW" ? "good" : simResult.risk === "MEDIUM" ? "warn" : "bad"} />
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {simResult.tones.map((t) => (
                  <span key={t} style={{
                    fontFamily: F.mono, fontSize: 11, color: C.ink,
                    background: C.lineSoft, padding: "4px 10px", borderRadius: 999,
                  }}>{t}</span>
                ))}
              </div>
              <button onClick={onGoResults} style={primaryBtnStyle()}>Review & fix →</button>
            </div>

            {/* Tabs */}
            <div style={{
              display: "inline-flex", gap: 4, marginBottom: 18,
              background: C.lineSoft, borderRadius: 10, padding: 4,
            }}>
              {([
                ["conclusion", "Conclusion"],
                ["personas",   "Personas"],
                ["transcript", "Transcript"],
              ] as const).map(([v, l]) => (
                <button key={v} onClick={() => setTab(v)} style={{
                  padding: "7px 16px", borderRadius: 7, border: "none",
                  fontFamily: F.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  background: tab === v ? C.surface : "transparent",
                  color: tab === v ? C.ink : C.muted,
                  boxShadow: tab === v ? "0 1px 3px rgba(0,0,0,.06)" : "none",
                }}>{l}</button>
              ))}
            </div>

            {tab === "conclusion" && (
              <ConclusionTab
                insights={simResult.insights}
                avg={avg}
                risk={simResult.risk}
              />
            )}

            {tab === "transcript" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 20, alignItems: "start" }}>
                <div style={{
                  background: C.surface, border: `1px solid ${C.line}`,
                  borderRadius: 14, padding: 26,
                }}>
                  <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 22 }}>
                    Focus Group Discussion
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {transcript.map((line, i) => {
                      if (line.type === "moderator") {
                        return (
                          <div key={i} style={{ display: "flex", justifyContent: "center" }}>
                            <div style={{
                              background: C.bg, border: `1px dashed ${C.line}`, borderRadius: 10,
                              padding: "8px 14px", fontFamily: F.mono, fontSize: 11,
                              color: C.muted, fontStyle: "italic", maxWidth: "70%", textAlign: "center",
                              letterSpacing: ".02em",
                            }}>📋 {line.text}</div>
                          </div>
                        );
                      }
                      const idx = allPersonas.findIndex((x) => x.persona.name === line.speaker);
                      const persona = idx >= 0 ? allPersonas[idx].persona : null;
                      const isLeft = idx % 2 === 0;
                      const initials = (line.speaker.split(" ").map((s) => s[0]).join("") || "?").slice(0, 2).toUpperCase();
                      return (
                        <div key={i} style={{
                          display: "flex", flexDirection: "column",
                          alignItems: isLeft ? "flex-start" : "flex-end", gap: 4,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{
                              width: 24, height: 24, borderRadius: 6,
                              background: avatarBg(idx), color: C.ink,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontFamily: F.display, fontSize: 10, fontWeight: 700, letterSpacing: ".02em",
                            }}>{initials}</div>
                            <span style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: C.ink, letterSpacing: ".05em", textTransform: "uppercase" }}>{line.speaker}</span>
                            {persona && (
                              <span style={{ fontFamily: F.mono, fontSize: 10, color: C.faint }}>· {persona.job || persona.age}</span>
                            )}
                          </div>
                          <div style={{
                            padding: "12px 16px",
                            borderRadius: isLeft ? "4px 14px 14px 14px" : "14px 4px 14px 14px",
                            fontSize: 14, lineHeight: 1.6, maxWidth: "82%",
                            background: isLeft ? C.surface : C.ink,
                            color: isLeft ? C.ink : C.accentInk,
                            border: isLeft ? `1px solid ${C.line}` : "none",
                          }}>{line.text}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <aside style={{ position: "sticky", top: 76 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>Panel</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {allPersonas.map(({ persona, custom }, i) => {
                      const tone = persona.sentiment >= 60 ? C.good : persona.sentiment >= 40 ? C.warn : C.bad;
                      const initials = (persona.name.split(" ").map((s) => s[0]).join("") || "?").slice(0, 2).toUpperCase();
                      return (
                        <div key={`panel-${i}`} style={{
                          background: C.surface, border: `1px solid ${C.line}`,
                          borderRadius: 10, padding: "10px 12px",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: 7,
                              background: avatarBg(i), color: C.ink,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontFamily: F.display, fontSize: 11, fontWeight: 700,
                            }}>{initials}</div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontFamily: F.display, fontSize: 12, fontWeight: 700, letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: 6 }}>
                                {persona.name.split(" ")[0]}
                                {custom && <span style={{ fontFamily: F.mono, fontSize: 8, color: C.muted, background: C.lineSoft, padding: "1px 5px", borderRadius: 3 }}>CUSTOM</span>}
                              </div>
                              <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint }}>{persona.age?.replace(/\s*\(.+?\)/, "")} · {persona.job || "—"}</div>
                            </div>
                          </div>
                          <div style={{ height: 4, background: C.lineSoft, borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${persona.sentiment}%`, background: tone, borderRadius: 2 }} />
                          </div>
                          <div style={{ fontFamily: F.mono, fontSize: 10, color: tone, fontWeight: 600, marginTop: 4, letterSpacing: ".04em" }}>
                            {sentimentLabel(persona.sentiment)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </aside>
              </div>
            )}

            {tab === "personas" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                {allPersonas.map(({ persona, custom }, i) => (
                  <FocusPersonaCard key={`fp-${i}`} persona={persona} custom={custom} index={i} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ConclusionTab({
  insights, avg, risk,
}: {
  insights: SimulationInsights;
  avg: number;
  risk: SimulationResult["risk"];
}) {
  const sentLabel = sentimentLabel(avg);
  const sentColor = sentimentColor(avg);
  const empty =
    insights.whatWorks.length === 0 &&
    insights.whatDoesnt.length === 0 &&
    insights.opportunities.length === 0 &&
    insights.suggestedTweaks.length === 0 &&
    !insights.predictedPerformance;

  if (empty) {
    return (
      <div style={{
        background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14,
        padding: 28, textAlign: "center",
      }}>
        <p style={{ color: C.muted, lineHeight: 1.5, margin: 0 }}>
          No conclusion was generated for this run. Re-simulate to produce updated insights.
        </p>
      </div>
    );
  }

  const sections: { title: string; items: string[]; tone: string; toneSoft: string; border: string }[] = [
    { title: "What Works",       items: insights.whatWorks,       tone: C.good, toneSoft: C.goodSoft, border: "#A7F3D0" },
    { title: "What Doesn't",     items: insights.whatDoesnt,      tone: C.bad,  toneSoft: C.badSoft,  border: "#FECACA" },
    { title: "Opportunities",    items: insights.opportunities,   tone: C.ink,  toneSoft: C.lineSoft, border: C.line },
    { title: "Suggested Tweaks", items: insights.suggestedTweaks, tone: C.warn, toneSoft: C.warnSoft, border: "#FDE68A" },
  ];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {sections.map((s) => (
          <div key={s.title} style={{
            background: s.toneSoft, border: `1px solid ${s.border}`,
            borderRadius: 12, padding: 18,
          }}>
            <div style={{
              fontFamily: F.mono, fontSize: 11, fontWeight: 700,
              color: s.tone, letterSpacing: ".06em", textTransform: "uppercase",
              marginBottom: 12,
            }}>
              {s.title}
            </div>
            {s.items.length === 0 ? (
              <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>Nothing to flag here.</div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {s.items.map((item, i) => (
                  <li key={i} style={{ display: "flex", gap: 8, fontSize: 13, lineHeight: 1.55, color: C.ink }}>
                    <span style={{ color: s.tone, fontWeight: 700, flexShrink: 0 }}>→</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {insights.predictedPerformance && (
        <div style={{
          background: C.surface, border: `1px solid ${C.line}`,
          borderRadius: 12, padding: 22,
        }}>
          <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: C.ink, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 10 }}>
            Predicted Performance
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: C.ink2, margin: "0 0 16px", fontStyle: "italic" }}>
            {insights.predictedPerformance}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 18, paddingTop: 14, borderTop: `1px solid ${C.lineSoft}`, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: F.mono, fontSize: 9, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>
                Overall Mood
              </div>
              <div style={{ fontFamily: F.display, fontSize: 18, fontWeight: 700, color: sentColor, letterSpacing: "-0.01em" }}>
                {sentLabel}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: F.mono, fontSize: 9, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>
                Backlash Risk
              </div>
              <div style={{
                fontFamily: F.display, fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em",
                color: risk === "LOW" ? C.good : risk === "MEDIUM" ? C.warn : C.bad,
              }}>
                {risk}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ height: 6, background: C.lineSoft, borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 3,
                  background: `linear-gradient(90deg, ${C.bad}, ${C.warn}, ${C.good})`,
                  width: `${Math.max(4, avg)}%`,
                  transition: "width .8s ease",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".06em" }}>
                <span>CRITICAL</span><span>NEUTRAL</span><span>POSITIVE</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FocusPersonaCard({ persona, custom, index }: { persona: Persona; custom: boolean; index: number }) {
  const tone = sentimentColor(persona.sentiment);
  const toneSoft = persona.sentiment >= 60 ? C.goodSoft : persona.sentiment >= 40 ? C.warnSoft : C.badSoft;
  const label = sentimentLabel(persona.sentiment);
  const initials = (persona.name.split(" ").map((s) => s[0]).join("") || "?").slice(0, 2).toUpperCase();
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.line}`,
      borderRadius: 14, padding: 20, position: "relative", overflow: "hidden",
    }}>
      <span style={{
        position: "absolute", top: 16, right: 16,
        padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
        background: toneSoft, color: tone, fontFamily: F.mono, letterSpacing: ".04em",
      }}>{label}</span>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14, paddingRight: 96 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: avatarBg(index), color: C.ink,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: F.display, fontSize: 16, fontWeight: 700,
          flexShrink: 0,
        }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: F.display, fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {persona.name}
            {custom && <span style={{ fontFamily: F.mono, fontSize: 9, color: C.muted, background: C.lineSoft, padding: "2px 6px", borderRadius: 4 }}>CUSTOM</span>}
          </div>
          <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, marginTop: 2, lineHeight: 1.5 }}>
            {persona.age}{persona.job ? ` · ${persona.job}` : ""}
          </div>
        </div>
      </div>
      <p style={{ fontSize: 13, color: C.ink2, lineHeight: 1.6, marginBottom: 12, fontStyle: "italic" }}>
        "{persona.quote}"
      </p>
      {persona.traits && persona.traits.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
          {persona.traits.map((t) => (
            <span key={t} style={{
              padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600,
              background: C.lineSoft, color: C.ink2, fontFamily: F.mono, letterSpacing: ".03em",
            }}>{t}</span>
          ))}
        </div>
      )}
      <div>
        <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 4 }}>Archetype</div>
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.55 }}>{persona.archetype}</p>
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".07em", textTransform: "uppercase" }}>Sentiment</span>
          <span style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: tone, letterSpacing: ".04em" }}>{label}</span>
        </div>
        <div style={{ height: 6, background: C.lineSoft, borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", background: tone, width: `${persona.sentiment}%`, borderRadius: 3 }} />
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ label, val, tone }: { label: string; val: string; tone?: "good" | "warn" | "bad" }) {
  const color = tone === "good" ? C.good : tone === "warn" ? C.warn : tone === "bad" ? C.bad : C.ink;
  const isPhrase = val.includes(" ");
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: F.mono, fontSize: 9, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{
        fontFamily: F.display,
        fontSize: isPhrase ? 16 : 22,
        fontWeight: 700, color, letterSpacing: "-0.01em", lineHeight: 1.15,
        whiteSpace: "nowrap",
      }}>{val}</div>
    </div>
  );
}

const AVATAR_BG_COLORS = ["#FCE7F3", "#DBEAFE", "#DCFCE7", "#FEF3C7", "#EDE9FE", "#FFE4E6"];
function avatarBg(i: number) {
  return AVATAR_BG_COLORS[((i % AVATAR_BG_COLORS.length) + AVATAR_BG_COLORS.length) % AVATAR_BG_COLORS.length];
}

type TranscriptLine =
  | { type: "moderator"; speaker: "Moderator"; text: string }
  | { type: "persona"; speaker: string; text: string };

function buildTranscript(personas: Persona[]): TranscriptLine[] {
  if (personas.length === 0) return [];
  const lines: TranscriptLine[] = [];
  lines.push({
    type: "moderator", speaker: "Moderator",
    text: "Thanks everyone for joining. Take a moment to react to the campaign. First impressions only.",
  });
  personas.forEach((p) => {
    lines.push({ type: "persona", speaker: p.name, text: p.quote });
  });

  const sorted = [...personas].sort((a, b) => b.sentiment - a.sentiment);
  const positive = sorted[0];
  const negative = sorted[sorted.length - 1];
  const middle = sorted[Math.floor(sorted.length / 2)];

  if (negative && positive && negative.name !== positive.name) {
    lines.push({
      type: "moderator", speaker: "Moderator",
      text: `${negative.name.split(" ")[0]} — you're more critical here. What's the core objection?`,
    });
    lines.push({
      type: "persona", speaker: negative.name,
      text: `${followUpCritical(negative)}`,
    });
    lines.push({
      type: "persona", speaker: positive.name,
      text: `${followUpSupportive(positive, negative)}`,
    });
    if (middle && middle.name !== negative.name && middle.name !== positive.name) {
      lines.push({
        type: "persona", speaker: middle.name,
        text: `${followUpMiddle(middle)}`,
      });
    }
  }

  lines.push({
    type: "moderator", speaker: "Moderator",
    text: "Last question — what would actually make this campaign better for you?",
  });
  personas.forEach((p) => {
    lines.push({ type: "persona", speaker: p.name, text: closingSuggestion(p) });
  });

  return lines;
}

function followUpCritical(p: Persona): string {
  const trait = p.traits?.[0]?.toLowerCase();
  if (trait) return `Honestly, as someone who's pretty ${trait}, this just doesn't earn my trust. The copy feels designed around me, not for me.`;
  return "Honestly, this doesn't earn my trust. The copy feels designed around me, not for me. There's nothing concrete underneath.";
}
function followUpSupportive(p: Persona, opp: Persona): string {
  return `I hear you, ${opp.name.split(" ")[0]}, but I think you're being a bit harsh? It's not perfect, but it gives me something to actually engage with.`;
}
function followUpMiddle(p: Persona): string {
  return `I'm somewhere in the middle. There's a version of this I'd respect — but right now it's trying to do too many things at once.`;
}
function closingSuggestion(p: Persona): string {
  if (p.sentiment >= 60) return "Just keep it specific. Show, don't tell. Less hype, more proof — and I'm in.";
  if (p.sentiment >= 40) return "Pick a lane. Either commit to a clear message or back it up with real evidence — the middle ground reads as empty.";
  return "Drop the marketing-speak entirely. Show data, sources, real customers — anything that signals you actually mean it.";
}

function RiskMeter({ score, compact = false }: { score: number; compact?: boolean }) {
  const clamped = Math.max(0, Math.min(100, score));
  const padTop = compact ? 6 : 12;
  const padBottom = compact ? 12 : 18;
  const tickHeight = compact ? 16 : 22;
  return (
    <div style={{ position: "relative", paddingTop: padTop, paddingBottom: padBottom }}>
      <div style={{
        height: compact ? 6 : 8, borderRadius: 4, overflow: "hidden",
        background: `linear-gradient(90deg, ${C.good} 0%, ${C.good} 33%, ${C.warn} 33%, ${C.warn} 66%, ${C.bad} 66%, ${C.bad} 100%)`,
      }} />
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: padTop - (compact ? 4 : 6),
          left: `${clamped}%`,
          transform: "translateX(-50%)",
          width: 2, height: tickHeight,
          background: C.ink, borderRadius: 1,
          boxShadow: "0 0 0 3px #fff",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: compact ? 4 : 8, fontFamily: F.mono, fontSize: 9, color: C.muted, letterSpacing: ".08em" }}>
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

function PersonaHintPanel() {
  const groups: { label: string; items: string }[] = [
    { label: "Who they are", items: "age range, generation (Gen Z, Millennials, Gen X, Boomers), location, income bracket, occupation" },
    { label: "What they care about", items: "values, beliefs, political leanings, concerns, what they distrust or feel loyal to" },
    { label: "How they live", items: "hobbies, media habits, brands they buy, how they shop, social-media platforms" },
    { label: "Mindset", items: "trend-driven, deal-driven, security-driven, principle-driven, status-conscious, eco-conscious, etc." },
  ];
  return (
    <div style={{
      background: C.bg, border: `1px solid ${C.line}`,
      borderRadius: 10, padding: 12, marginBottom: 12,
    }}>
      <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>
        What's useful to mention
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {groups.map((g) => (
          <div key={g.label} style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10 }}>
            <div style={{ fontFamily: F.mono, fontSize: 10, color: C.ink, fontWeight: 600, letterSpacing: ".04em" }}>
              {g.label}
            </div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
              {g.items}
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.5, marginTop: 10, fontStyle: "italic" }}>
        You don't need to cover all of these — even a one-line vibe works. The AI will fill in the rest.
      </div>
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
