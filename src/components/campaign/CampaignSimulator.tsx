import { useState, useEffect, Fragment, useMemo, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  simulateCampaign,
  scorePersona,
  extractCampaignPlanFromText,
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
  { id: "shein",    badge: "SHEIN",           title: '"SHEIN Spring Drop is here."',         emoji: "🛍️", gradient: "linear-gradient(135deg,#F5F5F4,#E7E5E4)" },
  { id: "creator",  badge: "Creator Collab",  title: '"Styled by your favorite creators."',  emoji: "📱", gradient: "linear-gradient(135deg,#FAFAF9,#EDE9E3)" },
  { id: "basics",   badge: "Essentials",      title: '"Everyday looks under $20."',          emoji: "👕", gradient: "linear-gradient(135deg,#F0F0EE,#E2DFDA)" },
  { id: "beauty",   badge: "SHEGLAM",         title: '"Finish your fit with SHEGLAM."',      emoji: "💄", gradient: "linear-gradient(135deg,#F5F5F4,#E5E3DE)" },
  { id: "flash",    badge: "Flash Sale",      title: '"48-hour app-only flash deals."',      emoji: "⚡", gradient: "linear-gradient(135deg,#F0F0EE,#DDD9D2)" },
  { id: "fashion",  badge: "Fashion",         title: '"Wear it now. Post it tonight."',      emoji: "✨", gradient: "linear-gradient(135deg,#FAFAF9,#E7E5E4)" },
];

const FIELD_META: Record<FieldKey, { label: string; placeholder: string; multiline?: boolean; rows?: number }> = {
  name:           { label: "Campaign Name",   placeholder: "e.g. SHEIN Spring Micro-Drop 2026" },
  timeline:       { label: "Timeline",        placeholder: "e.g. Mar 18 → Apr 30, 2026" },
  keyMessage:     { label: "Key Message",     placeholder: "What's the single message shoppers should remember?", multiline: true, rows: 2 },
  hashtag:        { label: "Hashtag",         placeholder: "#SHEINStyleDrop" },
  slogan:         { label: "Slogan",          placeholder: "A tighter, punchier line." },
  targetAudience: { label: "Target Audience", placeholder: "e.g. Trend-driven Gen Z and young millennial shoppers in US/UK", multiline: true, rows: 2 },
  location:       { label: "Location / Markets", placeholder: "e.g. United States, UK, urban Tier-1 cities" },
  copy:           { label: "Campaign Details",   placeholder: "Provide detailed campaign context, copy, offers, channels, and claims audiences will see.", multiline: true, rows: 5 },
};
const FIELD_ORDER: FieldKey[] = ["name","timeline","keyMessage","hashtag","slogan","targetAudience","location","copy"];
const COUNTRY_OPTIONS = [
  "United States", "United Kingdom", "China", "Canada", "Australia", "Japan", "South Korea",
  "Singapore", "India", "Indonesia", "Malaysia", "Thailand", "Vietnam", "Philippines",
  "Germany", "France", "Italy", "Spain", "Netherlands", "Sweden", "Norway", "Denmark",
  "United Arab Emirates", "Saudi Arabia", "Mexico", "Brazil", "South Africa",
] as const;

const DEFAULT_PLAN: CampaignPlan = {
  name: "SHEIN Spring Micro-Drop 2026",
  timeline: "Mar 18 → Apr 30, 2026",
  keyMessage: "Trend-right outfits that move from cart to closet fast.",
  hashtag: "#SHEINStyleDrop",
  slogan: "New fits. Fast.",
  targetAudience: "Trend-driven Gen Z and young millennial shoppers in US/UK urban markets.",
  location: "United States",
  copy: "SHEIN's spring edit just dropped - statement looks, everyday basics, and creator picks at prices you can actually wear on repeat. Tap in before top styles sell out.",
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

const MIN_GENERATION_MS = 2000;
const waitMs = (ms: number) => new Promise<void>((resolve) => {
  if (typeof window === "undefined") {
    resolve();
    return;
  }
  window.setTimeout(resolve, ms);
});

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

function AiGenFeedback({
  feedbackKey,
  value,
  onPick,
  compact = false,
}: {
  feedbackKey: string;
  value: "like" | "dislike" | undefined;
  onPick: (key: string, choice: "like" | "dislike") => void;
  compact?: boolean;
}) {
  const btn = (choice: "like" | "dislike") => {
    const active = value === choice;
    return (
      <button
        type="button"
        aria-pressed={active}
        aria-label={choice === "like" ? "Helpful — like this AI output" : "Not helpful — dislike this AI output"}
        onClick={() => onPick(feedbackKey, choice)}
        style={{
          border: `1px solid ${active ? C.ink : C.line}`,
          background: active ? C.ink : C.surface,
          color: active ? C.accentInk : C.muted,
          borderRadius: 6,
          padding: compact ? "3px 8px" : "4px 10px",
          fontSize: compact ? 12 : 13,
          cursor: "pointer",
          fontFamily: F.body,
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        {choice === "like" ? "👍" : "👎"}
      </button>
    );
  };
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: compact ? 6 : 8, flexWrap: "wrap" }}>
      {!compact && (
        <span style={{ fontFamily: F.mono, fontSize: 9, color: C.faint, letterSpacing: ".07em", textTransform: "uppercase" }}>
          Helpful?
        </span>
      )}
      <div style={{ display: "inline-flex", gap: 6 }}>{btn("like")}{btn("dislike")}</div>
    </div>
  );
}

type Comment = { id: number; user: string; text: string; type: "negative" | "neutral" | "positive" };
const COMMENTS: Comment[] = [
  { id: 1, user: "@fitchecklane · 2m ago", text: '"SHEIN post again but no sizing proof on real bodies? Not buying the hype."', type: "negative" },
  { id: 2, user: "@closetcritic · 5m ago", text: '"This sounds like every fast-fashion ad ever. What is actually different here?"', type: "negative" },
  { id: 3, user: "@stylewatchhub · 11m ago", text: '"If quality is improved, say it clearly. Right now this reads like generic promo fluff."', type: "negative" },
  { id: 4, user: "@shoppingmaybe · 18m ago", text: '"Cute pieces, but I need fit + fabric details before I check out."', type: "neutral" },
  { id: 5, user: "@outfitdiaryamy · 26m ago", text: '"Okay these picks are actually fire for the price. Saved three looks already. ✨"', type: "positive" },
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
  const [recentlyDeletedPersonas, setRecentlyDeletedPersonas] = useState<Array<{ persona: Persona; index: number }>>([]);
  const deleteUndoTimeoutRef = useRef<number | null>(null);
  const [draftDescription, setDraftDescription] = useState("");
  const [scoringPersona, setScoringPersona] = useState(false);
  const [personaError, setPersonaError] = useState<string | null>(null);

  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [importingPlan, setImportingPlan] = useState(false);
  const [importPlanError, setImportPlanError] = useState<string | null>(null);

  const [appliedFixes, setAppliedFixes] = useState<Set<FieldKey>>(new Set());
  const [originalValues, setOriginalValues] = useState<Map<FieldKey, string>>(new Map());
  const [hoverFlag, setHoverFlag] = useState<FieldKey | null>(null);
  const [aiGenFeedback, setAiGenFeedback] = useState<Record<string, "like" | "dislike">>({});

  const countdown = useCountdown(23 * 3600 + 59 * 60);
  const simulateFn = useServerFn(simulateCampaign);
  const scorePersonaFn = useServerFn(scorePersona);
  const extractPlanFn = useServerFn(extractCampaignPlanFromText);

  useEffect(() => {
    return () => {
      if (deleteUndoTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(deleteUndoTimeoutRef.current);
      }
    };
  }, []);

  const goTo = (n: number) => {
    setScreen(n);
    setChaos(false);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };

  const pickAiGenFeedback = (key: string, choice: "like" | "dislike") => {
    setAiGenFeedback((prev) => {
      if (prev[key] === choice) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: choice };
    });
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
    // NOTE: deliberately keep `appliedFixes` and `originalValues` across re-simulates.
    // Once the user has accepted a one-click fix for a field, that field is locked-in
    // — re-simulating shouldn't surface a new AI suggestion for it. The user can still
    // hit Undo to release the lock and let the next sim flag it again.
    try {
      const [response] = await Promise.all([
        simulateFn({ data: { plan } }),
        waitMs(MIN_GENERATION_MS),
      ]);
      if (!response.ok) setSimError(response.error);
      else {
        setAiGenFeedback({});
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
    simResult?.flags.forEach((f) => {
      // Once the user has accepted a one-click fix for this field, ignore any
      // new AI flag for it — the field is considered locked-in until they undo.
      if (appliedFixes.has(f.field)) return;
      map.set(f.field, f);
    });
    return map;
  }, [simResult, appliedFixes]);

  const applyFix = (flag: FieldFlag) => {
    setOriginalValues((prev) => {
      if (prev.has(flag.field)) return prev;
      const next = new Map(prev);
      next.set(flag.field, plan[flag.field]);
      return next;
    });
    setPlan((p) => ({ ...p, [flag.field]: flag.fix }));
    setAppliedFixes((prev) => new Set(prev).add(flag.field));
    setHoverFlag(null);
  };

  const undoFix = (field: FieldKey) => {
    const original = originalValues.get(field);
    if (original !== undefined) {
      setPlan((p) => ({ ...p, [field]: original }));
    }
    setOriginalValues((prev) => {
      const next = new Map(prev);
      next.delete(field);
      return next;
    });
    setAppliedFixes((prev) => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  };

  const draftReady = draftDescription.trim().length >= 3;

  const addCustomPersona = async () => {
    setPersonaError(null);
    setScoringPersona(true);
    try {
      const [res] = await Promise.all([
        scorePersonaFn({ data: { description: draftDescription, copy: plan.copy } }),
        waitMs(MIN_GENERATION_MS),
      ]);
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

  const importCampaignPlanFile = async (file: File) => {
    setImportPlanError(null);
    const name = file.name.toLowerCase();
    const allowedExt = [".txt", ".md", ".csv", ".json", ".tsv", ".log", ".xlsx"];
    const isAllowed = allowedExt.some((ext) => name.endsWith(ext));
    if (!isAllowed) {
      setImportPlanError("Unsupported file type. Upload .txt, .md, .csv, .json, .tsv, .log, or .xlsx.");
      return;
    }

    setImportingPlan(true);
    try {
      let raw = "";
      if (name.endsWith(".xlsx")) {
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        raw = workbook.SheetNames.map((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet);
          return `Sheet: ${sheetName}\n${csv}`.trim();
        }).join("\n\n");
      } else {
        raw = await file.text();
      }
      if (!raw.trim()) {
        setImportPlanError("Uploaded file is empty.");
        return;
      }
      const [res] = await Promise.all([
        extractPlanFn({ data: { sourceText: raw, fileName: file.name } }),
        waitMs(MIN_GENERATION_MS),
      ]);
      if (!res.ok) {
        setImportPlanError(res.error);
        return;
      }
      const next = res.plan;
      setPlan((prev) => ({
        name: next.name || prev.name,
        timeline: next.timeline || prev.timeline,
        keyMessage: next.keyMessage || prev.keyMessage,
        hashtag: next.hashtag || prev.hashtag,
        slogan: next.slogan || prev.slogan,
        targetAudience: next.targetAudience || prev.targetAudience,
        location: next.location || prev.location,
        copy: next.copy || prev.copy,
      }));
    } catch (e) {
      console.error(e);
      setImportPlanError("Couldn't read or analyze this file.");
    } finally {
      setImportingPlan(false);
    }
  };

  const removeCustomPersona = (idx: number) => {
    setCustomPersonas((prev) => {
      const persona = prev[idx];
      if (!persona) return prev;
      setRecentlyDeletedPersonas((stack) => [...stack, { persona, index: idx }]);
      return prev.filter((_, i) => i !== idx);
    });
    if (deleteUndoTimeoutRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(deleteUndoTimeoutRef.current);
    }
    if (typeof window !== "undefined") {
      deleteUndoTimeoutRef.current = window.setTimeout(() => {
        setRecentlyDeletedPersonas([]);
        deleteUndoTimeoutRef.current = null;
      }, 6000);
    }
  };

  const undoRemoveCustomPersona = () => {
    if (!recentlyDeletedPersonas.length) return;
    const last = recentlyDeletedPersonas[recentlyDeletedPersonas.length - 1];
    const { persona, index } = last;
    setCustomPersonas((prev) => {
      const next = [...prev];
      const clamped = Math.max(0, Math.min(index, next.length));
      next.splice(clamped, 0, persona);
      return next;
    });
    let remainingDeletes = 0;
    setRecentlyDeletedPersonas((stack) => {
      const next = stack.slice(0, -1);
      remainingDeletes = next.length;
      return next;
    });

    if (deleteUndoTimeoutRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(deleteUndoTimeoutRef.current);
    }
    if (typeof window !== "undefined" && remainingDeletes > 0) {
      deleteUndoTimeoutRef.current = window.setTimeout(() => {
        setRecentlyDeletedPersonas([]);
        deleteUndoTimeoutRef.current = null;
      }, 6000);
    } else {
      deleteUndoTimeoutRef.current = null;
    }
  };

  const navSteps: { label: string; screen: number }[] = [
    { label: "Launch",      screen: 1 },
    { label: "Crisis",      screen: 2 },
    { label: "Simulate",    screen: 3 },
    { label: "Results",     screen: 5 },
    { label: "Focus Group", screen: 4 },
    { label: "About",       screen: 6 },
  ];
  const hasHighlyRiskyScore = !!simResult && (
    simResult.riskScore < 60 || simResult.segments.some((segment) => segment.sentimentPct < 60)
  );

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
        @keyframes ciq-spin { to { transform: rotate(360deg); } }
        @keyframes ciq-shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
        .ciq .aiSpin{
          display:inline-block; width:12px; height:12px; border-radius:999px;
          border:1.5px solid currentColor; border-top-color:transparent;
          animation:ciq-spin .7s linear infinite; vertical-align:-2px;
        }
        .ciq .aiBar{
          height:2px; width:100%; border-radius:999px; overflow:hidden;
          background:linear-gradient(90deg, transparent, rgba(0,0,0,.18), transparent);
          background-size:400px 100%; animation:ciq-shimmer 1.2s linear infinite;
        }
        .ciq input:focus, .ciq textarea:focus, .ciq select:focus{outline:none; border-color:${C.ink} !important; background:#fff}
        .ciq button{transition:all .15s ease}
        .ciq button:hover:not(:disabled){transform:translateY(-1px)}
        .ciq .rigourSlider{
          -webkit-appearance:none; appearance:none; height:8px; border-radius:999px; outline:none;
          background:#E7E5E4;
          transition:background .18s ease;
        }
        .ciq .rigourSlider::-webkit-slider-thumb{
          -webkit-appearance:none; appearance:none; width:18px; height:18px; border-radius:999px;
          background:#FFFFFF; border:2px solid #111827; box-shadow:0 2px 8px rgba(0,0,0,.18);
          transition:transform .15s ease, box-shadow .15s ease;
        }
        .ciq .rigourSlider:active::-webkit-slider-thumb{
          transform:scale(1.06);
          box-shadow:0 4px 12px rgba(0,0,0,.22);
        }
        .ciq .rigourSlider::-moz-range-track{
          height:8px; border-radius:999px; background:#E7E5E4;
        }
        .ciq .rigourSlider::-moz-range-progress{
          height:8px; border-radius:999px; background:#111827;
        }
        .ciq .rigourSlider::-moz-range-thumb{
          width:18px; height:18px; border-radius:999px;
          background:#FFFFFF; border:2px solid #111827; box-shadow:0 2px 8px rgba(0,0,0,.18);
        }
        .ciq .clickablePersonaCard{transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease}
        .ciq .clickablePersonaCard:hover{
          transform:translateY(-2px);
          box-shadow:0 12px 24px rgba(15,23,42,.1);
          border-color:#94A3B8 !important;
        }
        .ciq-carousel-track{display:flex;gap:14px;transition:transform .45s cubic-bezier(.22,.61,.36,1)}
        .ciq-carousel-mask{position:relative;overflow:hidden;padding:0 18px}
        .ciq-carousel-mask::before,.ciq-carousel-mask::after{content:"";position:absolute;top:0;bottom:0;width:80px;pointer-events:none;z-index:2}
        .ciq-carousel-mask::before{left:0;background:linear-gradient(90deg,${C.bg} 0%,${C.bg} 18%,rgba(250,250,249,0) 100%)}
        .ciq-carousel-mask::after{right:0;background:linear-gradient(270deg,${C.bg} 0%,${C.bg} 18%,rgba(250,250,249,0) 100%)}
        .ciq .whyMattersGrid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .ciq .aboutMetricsGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .ciq .trustBandGrid{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:0}
        @media (max-width: 860px){
          .ciq .whyMattersGrid{grid-template-columns:1fr}
          .ciq .aboutMetricsGrid{grid-template-columns:1fr 1fr}
          .ciq .trustBandGrid{grid-template-columns:1fr 1fr}
          .ciq .trustBandItem{border-right:none !important}
        }
        @media (max-width: 560px){
          .ciq .aboutMetricsGrid{grid-template-columns:1fr}
          .ciq .trustBandGrid{grid-template-columns:1fr}
          .ciq .trustBandItem{border-right:none !important;border-top:1px solid ${C.line}}
          .ciq .trustBandItem:first-child{border-top:none}
        }
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
                  ...progressBtnStyle(),
                  padding: "16px 40px",
                  fontSize: 16,
                  borderRadius: 10,
                  gap: 12,
                }}>
                  Launch Campaign Now
                  <span style={{ fontFamily: F.mono, fontSize: 13, opacity: .7 }}>→</span>
                </button>
                <button onClick={() => goTo(3)} style={{
                  background: "transparent", color: C.ink, border: "none",
                  padding: "4px 16px", fontFamily: F.body, fontSize: 14, fontWeight: 500,
                  cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 4, textDecorationColor: C.faint,
                }}>
                  Or Simulate First →
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
                Your Campaign History
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
                        <div style={{ fontFamily: F.display, fontSize: 26, fontWeight: 700, color: "#FCA5A5" }}>{s.val}</div>
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
                        borderLeft:
                          c.type === "negative" ? `3px solid #FCA5A5`
                          : c.type === "positive" ? `3px solid #86EFAC`
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
                    ...progressBtnStyle(),
                    width: "100%",
                    padding: 16,
                    borderRadius: 10,
                    fontSize: 15,
                  }}>See The Cost Of This Mistake →</button>
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
              <button onClick={() => goTo(3)} style={progressBtnStyle()}>What if we tested this first? →</button>
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
                {/* LEFT — Form + (after sim) risk meter + CTA */}
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <CampaignFormCard
                    plan={plan}
                    updateField={updateField}
                    onSimulate={runSimulation}
                    simulating={simulating}
                    error={simError}
                    importingPlan={importingPlan}
                    importError={importPlanError}
                    onImportFile={importCampaignPlanFile}
                    ctaLabel="Run Overall Campaign Check"
                  />

                  {simResult && (
                    <div className="fadeIn" style={{
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
                            color: hasHighlyRiskyScore ? C.bad : (simResult.risk === "LOW" ? C.good : simResult.risk === "MEDIUM" ? C.warn : C.bad),
                            lineHeight: 1.1,
                          }}>
                            {hasHighlyRiskyScore ? "HIGHLY RISKY" : simResult.risk}
                          </div>
                          <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.45 }}>
                            {riskBlurb(simResult.risk)}
                          </div>
                        </div>
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <RiskMeter score={simResult.riskScore} compact />
                        </div>
                      </div>
                      {hasHighlyRiskyScore && (
                        <div style={{
                          marginTop: 10,
                          background: C.badSoft,
                          border: `1px solid ${C.bad}`,
                          borderRadius: 8,
                          padding: "8px 10px",
                          fontFamily: F.mono,
                          fontSize: 11,
                          letterSpacing: ".04em",
                          color: C.bad,
                          textTransform: "uppercase",
                        }}>
                          Notification: Campaign marked as highly risky (score below 60%).
                        </div>
                      )}
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.lineSoft}` }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
                          <p style={{ flex: 1, minWidth: 220, fontSize: 12, color: C.muted, lineHeight: 1.55, margin: 0 }}>
                            {simResult.riskRationale}
                          </p>
                          <AiGenFeedback
                            feedbackKey="sim:risk-rationale"
                            value={aiGenFeedback["sim:risk-rationale"]}
                            onPick={pickAiGenFeedback}
                          />
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
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
                  )}

                  {simResult && (
                    <div className="fadeIn" style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button onClick={() => goTo(5)} style={progressBtnStyle()}>
                        See How To Improve →
                      </button>
                    </div>
                  )}
                </div>

                {/* RIGHT — Overall plan check + custom personas */}
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                    <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>
                      Overall Campaign Risk Brief
                    </div>
                    <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 14 }}>
                      {simResult
                        ? "AI-generated open-ended diagnosis of the most sensitive failure points in this campaign plan."
                        : "Run a simulation to generate an overall campaign risk brief."}
                    </p>
                    {simResult ? (
                      <div style={{ display: "grid", gap: 10 }}>
                        <div style={{ background: C.bg, border: `1px solid ${C.lineSoft}`, borderRadius: 10, padding: 12 }}>
                          <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>
                            Summary
                          </div>
                          <div style={{ fontSize: 12, color: C.ink2, lineHeight: 1.55 }}>
                            {simResult.overallCheck?.summary || "No summary available yet."}
                          </div>
                          <div style={{ borderTop: `1px solid ${C.lineSoft}`, marginTop: 10, paddingTop: 8, display: "flex", justifyContent: "flex-end" }}>
                            <AiGenFeedback
                              feedbackKey="sim:overall-summary"
                              value={aiGenFeedback["sim:overall-summary"]}
                              onPick={pickAiGenFeedback}
                            />
                          </div>
                        </div>
                        <BriefListSection
                          title="Top Sensitive Risks"
                          items={simResult.overallCheck?.topSensitiveRisks || []}
                          feedbackKey="sim:brief-top-risks"
                          feedbackValue={aiGenFeedback["sim:brief-top-risks"]}
                          onFeedbackPick={pickAiGenFeedback}
                        />
                        <BriefListSection
                          title="Failure Scenarios"
                          items={simResult.overallCheck?.failureScenarios || []}
                          feedbackKey="sim:brief-failure"
                          feedbackValue={aiGenFeedback["sim:brief-failure"]}
                          onFeedbackPick={pickAiGenFeedback}
                        />
                        <BriefListSection
                          title="Recommended Guardrails"
                          items={simResult.overallCheck?.recommendedGuardrails || []}
                          feedbackKey="sim:brief-guardrails"
                          feedbackValue={aiGenFeedback["sim:brief-guardrails"]}
                          onFeedbackPick={pickAiGenFeedback}
                        />
                        <div
                          style={{
                            borderTop: `1px solid ${C.lineSoft}`,
                            paddingTop: 10,
                            background:
                              simResult.risk === "HIGH"
                                ? C.badSoft
                                : simResult.risk === "MEDIUM"
                                  ? C.warnSoft
                                  : C.goodSoft,
                            border: `1px solid ${
                              simResult.risk === "HIGH"
                                ? "#FECACA"
                                : simResult.risk === "MEDIUM"
                                  ? "#FDE68A"
                                  : "#BBF7D0"
                            }`,
                            borderLeft: `4px solid ${
                              simResult.risk === "HIGH"
                                ? C.bad
                                : simResult.risk === "MEDIUM"
                                  ? C.warn
                                  : C.good
                            }`,
                            borderRadius: 10,
                            padding: 12,
                          }}
                        >
                          <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>
                            Overall Verdict
                          </div>
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              marginBottom: 8,
                              padding: "2px 8px",
                              borderRadius: 999,
                              fontFamily: F.mono,
                              fontSize: 10,
                              letterSpacing: ".06em",
                              textTransform: "uppercase",
                              fontWeight: 700,
                              color:
                                simResult.risk === "HIGH"
                                  ? C.bad
                                  : simResult.risk === "MEDIUM"
                                    ? C.warn
                                    : C.good,
                              background: C.surface,
                              border: `1px solid ${C.line}`,
                            }}
                          >
                            {simResult.risk} Priority
                          </div>
                          <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.6, fontWeight: 600 }}>
                            {simResult.overallCheck?.overallVerdict || "No final verdict available yet."}
                          </div>
                          <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                            <AiGenFeedback
                              feedbackKey="sim:overall-verdict"
                              value={aiGenFeedback["sim:overall-verdict"]}
                              onPick={pickAiGenFeedback}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        border: `1px dashed ${C.line}`, borderRadius: 10, padding: 16,
                        textAlign: "center", color: C.faint, fontSize: 12,
                      }}>
                        No overall analysis yet.
                      </div>
                    )}
                  </div>

                  {customPersonas.length > 0 && (
                    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                      <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 14 }}>
                        Your Custom Panelists
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {customPersonas.map((p, i) => (
                          <PersonaCard
                            key={`custom-${i}`}
                            persona={p}
                            onRemove={() => removeCustomPersona(i)}
                            customBadge
                            aiFeedbackKey={`sim:custom-persona:${i}`}
                            aiFeedback={aiGenFeedback[`sim:custom-persona:${i}`]}
                            onAiFeedbackPick={pickAiGenFeedback}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </div>

            </div>
          </div>
        )}

        {/* =====================================================
            SCREEN 4 — FOCUS GROUP (real persona discussion)
           ===================================================== */}
        {screen === 4 && (
          <FocusGroupScreen
            plan={plan}
            simResult={simResult}
            customPersonas={customPersonas}
            onRemoveCustom={removeCustomPersona}
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
                <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".15em", marginBottom: 10 }}>● AI-SUGGESTED REVISIONS</div>
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
                    {/* LEFT — flagged form + Before·After + CTA */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 28 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                        <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase" }}>
                          Flagged fields · {flagsByField.size}
                        </div>
                        <button onClick={runSimulation} disabled={simulating} style={{
                          background: C.ink, color: C.accentInk, border: "none",
                          padding: "9px 16px", borderRadius: 8,
                          fontFamily: F.body, fontSize: 12, fontWeight: 600,
                          cursor: simulating ? "default" : "pointer",
                        }}>{simulating ? (<><span className="aiSpin" style={{ width: 10, height: 10 }} /> Re-running AI…</>) : "Re-simulate"}</button>
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
                              onMouseEnter={() => flag && !applied && !simulating && setHoverFlag(k)}
                              onMouseLeave={() => setHoverFlag(null)}
                              style={{
                                position: "relative",
                                gridColumn: fullWidth ? "1 / -1" : undefined,
                              }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 6 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase" }}>{meta.label}</span>
                                  {flag && !applied && (
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
                                  <button onClick={() => applyFix(flag)} disabled={simulating} style={{
                                    background: simulating ? C.faint : C.ink, color: C.accentInk, border: "none",
                                    fontFamily: F.body, fontSize: 11, fontWeight: 600,
                                    padding: "5px 10px", borderRadius: 6,
                                    cursor: simulating ? "not-allowed" : "pointer",
                                    opacity: simulating ? 0.7 : 1,
                                  }}>One-click fix</button>
                                )}
                                {applied && (
                                  <button onClick={() => undoFix(k)} disabled={simulating} style={{
                                    background: "transparent", color: C.muted, border: `1px solid ${C.line}`,
                                    fontFamily: F.body, fontSize: 11, fontWeight: 600,
                                    padding: "4px 10px", borderRadius: 6,
                                    cursor: simulating ? "not-allowed" : "pointer",
                                    opacity: simulating ? 0.5 : 1,
                                    display: "inline-flex", alignItems: "center", gap: 4,
                                  }}>
                                    <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>↶</span> Undo
                                  </button>
                                )}
                              </div>
                              {meta.multiline ? (
                                <textarea
                                  value={plan[k]}
                                  onChange={(e) => updateField(k, e.target.value)}
                                  rows={meta.rows ?? 3}
                                  readOnly={simulating}
                                  style={{
                                    ...inputStyle(false),
                                    background: "#fff",
                                    borderColor: applied ? C.line : flag ? sevColor(sev) : C.line,
                                    opacity: simulating ? 0.7 : 1,
                                  }}
                                />
                              ) : (
                                <input
                                  value={plan[k]}
                                  onChange={(e) => updateField(k, e.target.value)}
                                  readOnly={simulating}
                                  style={{
                                    ...inputStyle(false),
                                    background: "#fff",
                                    borderColor: applied ? C.line : flag ? sevColor(sev) : C.line,
                                    opacity: simulating ? 0.7 : 1,
                                  }}
                                />
                              )}

                              {flag && isHover && !applied && !simulating && (
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

                    {/* Before · After comparison — flexed below flagged fields */}
                    <div>
                      <SectionHeader>Before · After</SectionHeader>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}>
                        <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", background: C.surface }}>
                          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.lineSoft}`, fontFamily: F.mono, fontSize: 11, color: C.ink, letterSpacing: ".08em", textTransform: "uppercase", textDecoration: "underline", textDecorationColor: C.bad, textUnderlineOffset: 4 }}>Original</div>
                          <div style={{ padding: 16 }}>
                            <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.6, fontStyle: "italic", marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.lineSoft}` }}>{DEFAULT_PLAN.copy}</div>
                            <Stat label="Engagement" val="1.2%" tone="bad" />
                            <Stat label="Sentiment" val="38% positive" tone="bad" />
                            <Stat label="Backlash Risk" val="HIGH" tone="bad" pill />
                          </div>
                        </div>
                        <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", background: C.surface }}>
                          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.lineSoft}`, fontFamily: F.mono, fontSize: 11, color: C.ink, letterSpacing: ".08em", textTransform: "uppercase", textDecoration: "underline", textDecorationColor: C.good, textUnderlineOffset: 4 }}>Optimized</div>
                          <div style={{ padding: 16 }}>
                            <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.6, fontStyle: "italic", marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.lineSoft}` }}>
                              {simResult.improvedCopy || plan.copy}
                            </div>
                            <Stat label="Engagement" val="4.8%" tone="good" />
                            <Stat label="Sentiment" val="76% positive" tone="good" />
                            <Stat label="Backlash Risk" val="LOW" tone="good" pill />
                            <div style={{ borderTop: `1px solid ${C.lineSoft}`, marginTop: 12, paddingTop: 10, display: "flex", justifyContent: "flex-end" }}>
                              <AiGenFeedback
                                feedbackKey="results:improved-copy"
                                value={aiGenFeedback["results:improved-copy"]}
                                onPick={pickAiGenFeedback}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button onClick={() => goTo(4)} style={progressBtnStyle()}>
                        Start Focus Group Test →
                      </button>
                    </div>
                    </div>

                    {/* RIGHT — Audience segments (mirroring Simulate page structure) */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                        <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 14 }}>
                          Audience Segments
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {simResult.segments.map((s, i) => (
                            <SegmentCard
                              key={`r-seg-${i}`}
                              segment={s}
                              aiFeedbackKey={`results:segment:${i}`}
                              aiFeedback={aiGenFeedback[`results:segment:${i}`]}
                              onAiFeedbackPick={pickAiGenFeedback}
                            />
                          ))}
                        </div>
                      </div>
                      {customPersonas.length > 0 && (
                        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                          <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 14 }}>
                            Your Custom Panelists
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {customPersonas.map((p, i) => (
                              <PersonaCard
                                key={`r-c-${i}`}
                                persona={p}
                                onRemove={() => removeCustomPersona(i)}
                                customBadge
                                aiFeedbackKey={`results:custom-persona:${i}`}
                                aiFeedback={aiGenFeedback[`results:custom-persona:${i}`]}
                                onAiFeedbackPick={pickAiGenFeedback}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                        <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>
                          Add Custom Persona
                        </div>
                        <p style={{ fontSize: 11, color: C.faint, lineHeight: 1.5, marginBottom: 12 }}>
                          Add another audience tag directly from results — it will also appear in Focus Group setup.
                        </p>
                        <div style={{ display: "grid", gap: 10 }}>
                          <textarea
                            value={draftDescription}
                            onChange={(e) => setDraftDescription(e.target.value)}
                            rows={3}
                            placeholder="e.g. Young suburban families, value-first shoppers, highly skeptical of broad sustainability claims."
                            style={inputStyle(false)}
                          />
                          <button
                            onClick={addCustomPersona}
                            disabled={!draftReady || scoringPersona}
                            style={{
                              background: !draftReady || scoringPersona ? C.lineSoft : C.ink,
                              color: !draftReady || scoringPersona ? C.faint : C.accentInk,
                              border: "none", padding: "10px 14px", borderRadius: 8,
                              fontFamily: F.body, fontSize: 13, fontWeight: 600,
                              cursor: !draftReady || scoringPersona ? "default" : "pointer",
                              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                            }}>
                            {scoringPersona ? (
                              <><span className="aiSpin" /> Analyzing with AI…</>
                            ) : "+ Add persona"}
                          </button>
                          {personaError && (
                            <div style={{ fontFamily: F.mono, fontSize: 11, color: C.bad }}>⚠ {personaError}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* =====================================================
            SCREEN 6 — ABOUT / WHY THIS MATTERS
           ===================================================== */}
        {screen === 61 && (
          <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)" }}>
            <div style={{ maxWidth: 1080, margin: "0 auto", padding: "56px 28px" }} className="fadeIn">
              <div style={{ marginBottom: 26 }}>
                <div style={{ fontFamily: F.mono, fontSize: 11, color: C.ink2, letterSpacing: ".15em", marginBottom: 10, textTransform: "uppercase" }}>
                  ● THE STRATEGIC CASE
                </div>
                <h2 style={{ fontFamily: F.display, fontSize: 38, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 10 }}>
                  Why This Matters
                </h2>
                <p style={{ fontSize: 15, color: C.muted, maxWidth: 620, lineHeight: 1.55, margin: 0 }}>
                  The market opportunity behind the demo.
                </p>
              </div>

              <div className="whyMattersGrid" style={{ marginBottom: 18 }}>
                <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>
                    Who it's for
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                    <span style={{ fontFamily: F.body, fontSize: 12, color: C.ink2, background: C.lineSoft, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 10px" }}>
                      Brand Marketing Teams
                    </span>
                    <span style={{ fontFamily: F.body, fontSize: 12, color: C.ink2, background: C.lineSoft, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 10px" }}>
                      PR & Communications Agencies
                    </span>
                  </div>
                  <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, margin: 0 }}>
                    Traditional focus groups are essential for understanding whether a message resonates - but they're expensive, slow, and difficult to organize. Teams are forced to choose between costly research and fast decision-making. CampaignIQ removes that tradeoff with instant audience simulation, so teams can validate, refine, and launch with confidence.
                  </p>
                </div>

                <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>
                    How it makes money
                  </div>
                  <div style={{ fontFamily: F.display, fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 14 }}>
                    Self-serve SaaS
                  </div>
                  <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 8, alignItems: "start" }}>
                      <span style={{ fontSize: 12, color: C.muted, lineHeight: "18px" }}>◦</span>
                      <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>Free tier - Limited simulations, single audience segment</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 8, alignItems: "start" }}>
                      <span style={{ fontSize: 12, color: C.muted, lineHeight: "18px" }}>◦</span>
                      <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>Pro ($49/mo) - Advanced segmentation, custom audiences, expanded analytics</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 8, alignItems: "start" }}>
                      <span style={{ fontSize: 12, color: C.muted, lineHeight: "18px" }}>◦</span>
                      <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>Enterprise - Custom modeling, SSO, dedicated success manager</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
                    Comparable category positioning to Qualtrics and Kantar, but AI-native.
                  </div>
                </div>

                <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>
                    How we're different
                  </div>
                  <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, margin: "0 0 12px" }}>
                    Survey platforms and social-listening tools rely on real respondents - slower, more expensive, and limited in predictive capability. We model behavior before the campaign goes live.
                  </p>
                  <div style={{ display: "grid", gap: 8 }}>
                    {[
                      "Simulates behavioral and emotional reactions from real-campaign patterns",
                      "Instant iteration across unlimited campaign variations",
                      "Models group dynamics, not just individual responses",
                      "Designed for creative teams, not researchers",
                    ].map((item) => (
                      <div key={item} style={{ display: "grid", gridTemplateColumns: "16px 1fr", gap: 8, alignItems: "start" }}>
                        <span style={{ color: C.good, fontSize: 12, lineHeight: "18px" }}>✓</span>
                        <span style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>
                    Roadmap
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: 10, alignItems: "start" }}>
                      <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".05em", textTransform: "uppercase" }}>Q3 2026</div>
                      <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.55 }}><strong>Vertical models</strong> Tailored simulations for Fashion, Travel, and CPG</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: 10, alignItems: "start" }}>
                      <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".05em", textTransform: "uppercase" }}>Q4 2026</div>
                      <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.55 }}><strong>Influencer campaign simulation</strong> Predict performance, audience reach, and revenue impact</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: 10, alignItems: "start" }}>
                      <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".05em", textTransform: "uppercase" }}>2027</div>
                      <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.55 }}><strong>Ad platform integrations</strong> Meta Ads and Google Ads pre-launch simulation directly inside the campaign builder</div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: C.lineSoft,
                  borderTop: `1px solid ${C.line}`,
                  borderRadius: 12,
                  minHeight: 80,
                  padding: "16px 14px",
                }}
              >
                <div className="trustBandGrid">
                  {[
                    "AI-generated audiences - clearly labeled, never real people",
                    "Predictive, not prescriptive - supports human judgment, doesn't replace it",
                    "No personal data required - anonymized inputs only",
                    "Bias-aware modeling - diverse, representative audience design",
                  ].map((item, idx) => (
                    <div
                      key={item}
                      className="trustBandItem"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 12px",
                        borderRight: idx < 3 ? `1px solid ${C.line}` : "none",
                      }}
                    >
                      <span style={{ fontSize: 12, color: C.muted }}>•</span>
                      <span style={{ fontSize: 12, color: C.muted, lineHeight: 1.4 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
            SCREEN 6B — ABOUT / HOW IT WORKS
           ===================================================== */}
        {screen === 6 && (
          <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)" }}>
            <div style={{ maxWidth: 1080, margin: "0 auto", padding: "56px 28px" }} className="fadeIn">
              <div style={{ marginBottom: 26 }}>
                <div style={{ fontFamily: F.mono, fontSize: 11, color: "#2563EB", letterSpacing: ".15em", marginBottom: 10, textTransform: "uppercase" }}>
                  HOW CAMPAIGNIQ WORKS
                </div>
                <h2 style={{ fontFamily: F.display, fontSize: 38, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 10 }}>
                  From campaign brief to synthetic audience insight
                </h2>
                <p style={{ fontSize: 15, color: C.muted, maxWidth: 620, lineHeight: 1.55, margin: 0 }}>
                  CampaignIQ combines structured audience inputs with staged language-model generation to simulate likely audience reactions before launch.
                </p>
              </div>

              <div className="whyMattersGrid">
                <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>
                    Inputs
                  </div>
                  <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                    {["Campaign brief", "Simulation settings", "Audience demographics", "Psychographics"].map((item) => (
                      <div key={item} style={{ display: "grid", gridTemplateColumns: "14px 1fr", gap: 8, alignItems: "start" }}>
                        <span style={{ fontSize: 11, color: C.muted, lineHeight: "18px" }}>•</span>
                        <span style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.62, margin: 0 }}>
                    These inputs define who is in the room, how they think, and how the simulation should run.
                  </p>
                </div>

                <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>
                    AI Pipeline
                  </div>
                  <div style={{ display: "grid", gap: 12, marginBottom: 12 }}>
                    {[
                      ["1.", "Campaign insight extraction", "Summarize what resonates, what feels off, and what should be revised."],
                      ["2.", "Persona generation", "Create synthetic audience members based on selected traits."],
                      ["3.", "Group discussion simulation", "Generate reactions, agreements, disagreements, and objections."],
                    ].map(([num, title, copy]) => (
                      <div key={num} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 10, alignItems: "start" }}>
                        <div style={{ fontFamily: F.mono, fontSize: 11, color: C.ink2, marginTop: 1 }}>{num}</div>
                        <div>
                          <div style={{ fontSize: 13, color: C.ink2, fontWeight: 600, marginBottom: 2 }}>{title}</div>
                          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{copy}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.62, margin: 0 }}>
                    The system first creates personas, then simulates discussion, and finally turns that discussion into structured feedback.
                  </p>
                </div>

                <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>
                    Technical Theory
                  </div>
                  <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                    {[
                      "LLM + structured text parsing and data wrangling",
                      "Structured prompting",
                      "Prompt-chained generation across tabs (instead of one-click all-at-once generation)",
                      "Social-science segmentation frameworks (VALS, Pew typologies, and generation cohorts)",
                    ].map((item) => (
                      <div key={item} style={{ display: "grid", gridTemplateColumns: "14px 1fr", gap: 8, alignItems: "start" }}>
                        <span style={{ fontSize: 11, color: C.muted, lineHeight: "18px" }}>•</span>
                        <span style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.62, margin: 0 }}>
                    Breaking the task into stages helps make outputs more grounded, consistent, and easier to interpret.
                  </p>
                </div>

                <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>
                    Build Stack
                  </div>
                  <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                    {[
                      "Vibe coding tools",
                      "Front-end interface",
                      "AI API / model service",
                      "Rapid prototyping workflow",
                    ].map((item) => (
                      <div key={item} style={{ display: "grid", gridTemplateColumns: "14px 1fr", gap: 8, alignItems: "start" }}>
                        <span style={{ fontSize: 11, color: C.muted, lineHeight: "18px" }}>•</span>
                        <span style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.62, margin: 0 }}>
                    We used AI-assisted prototyping tools to build and iterate on the interface quickly while focusing on the core simulation experience.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
            SCREEN 6BB — ABOUT / WHY THIS MATTERS
           ===================================================== */}
        {screen === 6 && (
          <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)" }}>
            <div style={{ maxWidth: 1080, margin: "0 auto", padding: "56px 28px" }} className="fadeIn">
              <div style={{ marginBottom: 26 }}>
                <div style={{ fontFamily: F.mono, fontSize: 11, color: C.ink2, letterSpacing: ".15em", marginBottom: 10, textTransform: "uppercase" }}>
                  ● THE STRATEGIC CASE
                </div>
                <h2 style={{ fontFamily: F.display, fontSize: 38, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 10 }}>
                  Why This Matters
                </h2>
                <p style={{ fontSize: 15, color: C.muted, maxWidth: 620, lineHeight: 1.55, margin: 0 }}>
                  The market opportunity behind the demo.
                </p>
              </div>

              <div className="whyMattersGrid" style={{ marginBottom: 18 }}>
                <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>
                    Who it's for
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                    <span style={{ fontFamily: F.body, fontSize: 12, color: C.ink2, background: C.lineSoft, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 10px" }}>
                      Brand Marketing Teams
                    </span>
                    <span style={{ fontFamily: F.body, fontSize: 12, color: C.ink2, background: C.lineSoft, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 10px" }}>
                      PR & Communications Agencies
                    </span>
                  </div>
                  <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, margin: 0 }}>
                    Traditional focus groups are essential for understanding whether a message resonates - but they're expensive, slow, and difficult to organize. Teams are forced to choose between costly research and fast decision-making. CampaignIQ removes that tradeoff with instant audience simulation, so teams can validate, refine, and launch with confidence.
                  </p>
                </div>

                <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>
                    How it makes money
                  </div>
                  <div style={{ fontFamily: F.display, fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 14 }}>
                    Self-serve SaaS
                  </div>
                  <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 8, alignItems: "start" }}>
                      <span style={{ fontSize: 12, color: C.muted, lineHeight: "18px" }}>◦</span>
                      <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>Free tier - Limited simulations, single audience segment</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 8, alignItems: "start" }}>
                      <span style={{ fontSize: 12, color: C.muted, lineHeight: "18px" }}>◦</span>
                      <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>Pro ($49/mo) - Advanced segmentation, custom audiences, expanded analytics</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 8, alignItems: "start" }}>
                      <span style={{ fontSize: 12, color: C.muted, lineHeight: "18px" }}>◦</span>
                      <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>Enterprise - Custom modeling, SSO, dedicated success manager</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
                    Comparable category positioning to Qualtrics and Kantar, but AI-native.
                  </div>
                </div>

                <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>
                    How we're different
                  </div>
                  <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, margin: "0 0 12px" }}>
                    Survey platforms and social-listening tools rely on real respondents - slower, more expensive, and limited in predictive capability. We model behavior before the campaign goes live.
                  </p>
                  <div style={{ display: "grid", gap: 8 }}>
                    {[
                      "Simulates behavioral and emotional reactions from real-campaign patterns",
                      "Instant iteration across unlimited campaign variations",
                      "Models group dynamics, not just individual responses",
                      "Designed for creative teams, not researchers",
                    ].map((item) => (
                      <div key={item} style={{ display: "grid", gridTemplateColumns: "16px 1fr", gap: 8, alignItems: "start" }}>
                        <span style={{ color: C.good, fontSize: 12, lineHeight: "18px" }}>✓</span>
                        <span style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>
                    Roadmap
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: 10, alignItems: "start" }}>
                      <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".05em", textTransform: "uppercase" }}>Q3 2026</div>
                      <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.55 }}><strong>Vertical models</strong> Tailored simulations for Fashion, Travel, and CPG</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: 10, alignItems: "start" }}>
                      <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".05em", textTransform: "uppercase" }}>Q4 2026</div>
                      <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.55 }}><strong>Influencer campaign simulation</strong> Predict performance, audience reach, and revenue impact</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: 10, alignItems: "start" }}>
                      <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".05em", textTransform: "uppercase" }}>2027</div>
                      <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.55 }}><strong>Ad platform integrations</strong> Meta Ads and Google Ads pre-launch simulation directly inside the campaign builder</div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: C.lineSoft,
                  borderTop: `1px solid ${C.line}`,
                  borderRadius: 12,
                  minHeight: 80,
                  padding: "16px 14px",
                }}
              >
                <div className="trustBandGrid">
                  {[
                    "AI-generated audiences - clearly labeled, never real people",
                    "Predictive, not prescriptive - supports human judgment, doesn't replace it",
                    "No personal data required - anonymized inputs only",
                    "Bias-aware modeling - diverse, representative audience design",
                  ].map((item, idx) => (
                    <div
                      key={item}
                      className="trustBandItem"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 12px",
                        borderRight: idx < 3 ? `1px solid ${C.line}` : "none",
                      }}
                    >
                      <span style={{ fontSize: 12, color: C.muted }}>•</span>
                      <span style={{ fontSize: 12, color: C.muted, lineHeight: 1.4 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
            SCREEN 6C — ABOUT / RISKS & GUARDRAILS
           ===================================================== */}
        {screen === 6 && (
          <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)" }}>
            <div style={{ maxWidth: 1080, margin: "0 auto", padding: "56px 28px" }} className="fadeIn">
              <div style={{ marginBottom: 26 }}>
                <div style={{ fontFamily: F.mono, fontSize: 11, color: "#F59E0B", letterSpacing: ".15em", marginBottom: 10, textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span className="pulseBadge">●</span> HONEST LIMITATIONS
                </div>
                <h2 style={{ fontFamily: F.display, fontSize: 38, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 10 }}>
                  Risks & Guardrails
                </h2>
                <p style={{ fontSize: 15, color: C.muted, maxWidth: 620, lineHeight: 1.55, margin: 0 }}>
                  Where the system breaks, and how we contain it.
                </p>
              </div>

              <div className="whyMattersGrid">
                <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderLeft: "4px solid #F59E0B", borderRadius: 14, padding: 22 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>
                    Failure case - live
                  </div>
                  <div style={{ fontFamily: F.display, fontSize: 25, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 10 }}>
                    We tried to break it. Here's what happened.
                  </div>
                  <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.62, margin: "0 0 12px" }}>
                    We fed CampaignIQ a deliberately ambiguous campaign for a controversial product category. Here's the unedited output:
                  </p>
                  <div style={{ background: C.lineSoft, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, marginBottom: 10 }}>
                    <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 5 }}>Input copy</div>
                    <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>"Our new product is here. It's better than the rest. Buy now."</div>
                  </div>
                  <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "92px 100px 1fr", gap: 10, padding: "8px 10px", background: C.lineSoft, borderBottom: `1px solid ${C.line}`, fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase" }}>
                      <div>Segment</div><div>Sentiment</div><div>Issue</div>
                    </div>
                    {[
                      ["Gen Z", "71% positive", "Hallucinated specifics - invented \"sustainability claims\" not in copy"],
                      ["Parents", "68% positive", "Over-confident - vague copy shouldn't produce confident predictions"],
                      ["Professionals", "64% positive", "Bias toward generic positivity when input lacks signal"],
                    ].map(([segment, score, issue]) => (
                      <div key={segment} style={{ display: "grid", gridTemplateColumns: "92px 100px 1fr", gap: 10, padding: "8px 10px", borderBottom: `1px solid ${C.line}` }}>
                        <div style={{ fontSize: 13, color: C.ink2 }}>{segment}</div>
                        <div style={{ fontSize: 13, color: C.ink2 }}>{score}</div>
                        <div style={{ fontSize: 13, color: "#EF4444", lineHeight: 1.45 }}>{issue}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "#FFFBEB", border: "1px solid #F59E0B", borderRadius: 9, padding: "9px 10px", fontSize: 13, color: "#92400E", lineHeight: 1.5 }}>
                    What this tells us: When given low-signal input, the model defaults to generic optimism rather than flagging insufficient information. This is a known failure mode we're actively working on.
                  </div>
                </div>

                <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>
                    Safeguards in place
                  </div>
                  <div style={{ fontFamily: F.display, fontSize: 25, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 12 }}>
                    Four layers of protection
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {[
                      ["🛡️", "Input validation", "Minimum-length check, content moderation API, profanity and harmful-content filters before any input reaches the model."],
                      ["📉", "Confidence thresholds", "If model confidence falls below 60%, the system returns \"insufficient signal\" instead of fabricated metrics."],
                      ["👥", "Human-in-the-loop", "Enterprise tier includes optional human review of edge-case simulations before they're delivered to customers."],
                      ["🔁", "Fallback responses", "For ambiguous or out-of-domain inputs, the system surfaces a \"needs human review\" message rather than guessing."],
                    ].map(([icon, title, copy]) => (
                      <div key={title} style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 10, alignItems: "start", opacity: title === "Fallback responses" ? 0.6 : 1 }}>
                        <div style={{ fontSize: 14, lineHeight: "20px" }}>{icon}</div>
                        <div>
                          <div style={{ fontSize: 13, color: C.ink2, fontWeight: 600, marginBottom: 2 }}>{title}</div>
                          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.48 }}>{copy}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>
                    What users know
                  </div>
                  <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.62, margin: "0 0 10px" }}>
                    Users always know they're interacting with AI-generated audiences. Predictions are clearly labeled as predictive and directional - never presented as ground truth.
                  </p>
                  <div style={{ display: "grid", gap: 7, marginBottom: 10 }}>
                    {[
                      "Every output is labeled \"AI simulation, not real participants\"",
                      "Confidence scores shown alongside every prediction",
                      "No personal data required to run a simulation",
                      "All inputs anonymized; no campaign content retained after session",
                    ].map((item) => (
                      <div key={item} style={{ display: "grid", gridTemplateColumns: "16px 1fr", gap: 8, alignItems: "start" }}>
                        <span style={{ color: C.good, fontSize: 12, lineHeight: "18px" }}>✓</span>
                        <span style={{ fontSize: 13, color: C.ink2, lineHeight: 1.45 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.45 }}>
                    Our north star: a user should never be surprised by where the data came from or how it was generated.
                  </div>
                </div>

                <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>
                    How we'd measure quality
                  </div>
                  <div style={{ fontFamily: F.display, fontSize: 25, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 12 }}>
                    Three loops, always running
                  </div>
                  <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                    {[
                      ["01", "Backtesting", "Run new model versions against the 120-campaign historical benchmark. Track sentiment correlation and backlash-detection accuracy over time."],
                      ["02", "User feedback loop", "Every simulation includes a thumbs-up / thumbs-down - flagged outputs feed back into our evaluation set within 24 hours."],
                      ["03", "Adversarial red-teaming", "Quarterly stress tests with deliberately ambiguous, biased, or out-of-distribution inputs. Failures trigger guardrail updates before the next release."],
                    ].map(([num, title, copy]) => (
                      <div key={num} style={{ display: "grid", gridTemplateColumns: "30px 1fr", gap: 10, alignItems: "start" }}>
                        <div style={{ width: 30, height: 20, borderRadius: 999, background: C.lineSoft, color: C.ink2, fontFamily: F.mono, fontSize: 10, letterSpacing: ".06em", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {num}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, color: C.ink2, fontWeight: 600, marginBottom: 2 }}>{title}</div>
                          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.48 }}>{copy}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "#EFF6FF", border: "1px solid #2563EB", borderRadius: 9, padding: "9px 10px", fontSize: 13, color: "#1E3A8A", lineHeight: 1.5 }}>
                    At scale, we'd add: differential privacy auditing, third-party bias evaluation, and a public model card updated with each release.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {recentlyDeletedPersonas.length > 0 && (
          <div style={{
            position: "fixed", right: 20, bottom: 18, zIndex: 1220,
            background: C.surface, border: `1px solid ${C.line}`,
            borderRadius: 10, padding: "10px 12px",
            display: "flex", alignItems: "center", gap: 10,
            boxShadow: "0 10px 30px rgba(0,0,0,.12)",
          }}>
            <span style={{ fontSize: 12, color: C.muted }}>
              Removed custom persona{recentlyDeletedPersonas.length > 1 ? ` (${recentlyDeletedPersonas.length} pending)` : ""}
            </span>
            <button
              onClick={undoRemoveCustomPersona}
              style={{
                background: C.ink, color: C.accentInk, border: "none",
                borderRadius: 6, padding: "5px 10px",
                fontFamily: F.body, fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              Undo
            </button>
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
  plan, updateField, onSimulate, simulating, error, ctaLabel, importingPlan, importError, onImportFile,
}: {
  plan: CampaignPlan;
  updateField: (k: FieldKey, v: string) => void;
  onSimulate: () => void;
  simulating: boolean;
  error: string | null;
  ctaLabel: string;
  importingPlan: boolean;
  importError: string | null;
  onImportFile: (file: File) => Promise<void>;
}) {
  const [copyHintOpen, setCopyHintOpen] = useState(false);
  const uploadInputId = "campaign-plan-upload-input";
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase" }}>
          Detailed Campaign Plan
        </div>
        <label
          htmlFor={uploadInputId}
          title={importingPlan ? "Analyzing file..." : "Upload file to autofill"}
          aria-label={importingPlan ? "Analyzing file..." : "Upload file to autofill"}
          style={{
            background: C.bg, border: `1px solid ${C.line}`, color: C.ink,
            borderRadius: 8, width: 32, height: 32,
            fontFamily: F.body, fontSize: 14, fontWeight: 700,
            cursor: importingPlan ? "default" : "pointer",
            opacity: importingPlan ? 0.6 : 1,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {importingPlan ? <span className="aiSpin" style={{ borderColor: C.ink, borderTopColor: "transparent" }} /> : "+"}
        </label>
        <input
          id={uploadInputId}
          type="file"
          accept=".txt,.md,.csv,.json,.tsv,.log,.xlsx,text/plain,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await onImportFile(file);
            e.currentTarget.value = "";
          }}
          disabled={importingPlan}
          style={{ display: "none" }}
        />
      </div>
      <div style={{ fontSize: 11, color: C.faint, marginBottom: 16 }}>
        Upload campaign notes/briefs (.txt/.md/.csv/.json/.tsv/.log/.xlsx) and AI will extract fields automatically.
      </div>
      {importError && (
        <div style={{
          marginBottom: 14, background: C.surface, border: `1px solid ${C.line}`,
          borderLeft: `3px solid ${C.bad}`, borderRadius: 8, padding: "9px 11px",
          color: C.bad, fontSize: 12, lineHeight: 1.45,
        }}>
          {importError}
        </div>
      )}
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
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {meta.label}
                  {k === "copy" && (
                    <button
                      type="button"
                      onClick={() => setCopyHintOpen((v) => !v)}
                      aria-label="Campaign details guidance"
                      style={{
                        width: 16, height: 16, borderRadius: 999,
                        border: `1px solid ${C.line}`, background: C.bg, color: C.muted,
                        fontFamily: F.mono, fontSize: 10, lineHeight: 1, cursor: "pointer",
                        display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0,
                      }}
                    >
                      i
                    </button>
                  )}
                </span>
              </label>
              {k === "copy" && copyHintOpen && (
                <div style={{
                  marginBottom: 8, fontSize: 11, lineHeight: 1.45, color: C.faint,
                  background: C.bg, border: `1px solid ${C.lineSoft}`, borderRadius: 8, padding: "8px 10px",
                }}>
                  More campaign detail gives the simulator stronger context and usually produces more accurate analysis and better revision suggestions.
                </div>
              )}
              {meta.multiline ? (
                <textarea
                  value={plan[k]}
                  onChange={(e) => updateField(k, e.target.value)}
                  placeholder={meta.placeholder}
                  rows={meta.rows ?? 3}
                  style={inputStyle(isCopy)}
                />
              ) : k === "location" ? (
                <select
                  value={plan[k]}
                  onChange={(e) => updateField(k, e.target.value)}
                  style={inputStyle(false)}
                >
                  {!COUNTRY_OPTIONS.includes(plan[k] as (typeof COUNTRY_OPTIONS)[number]) && plan[k] && (
                    <option value={plan[k]}>{plan[k]}</option>
                  )}
                  {COUNTRY_OPTIONS.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
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
            <><span className="aiSpin" /> Running AI simulation…</>
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

function SegmentCard({
  segment,
  aiFeedbackKey,
  aiFeedback,
  onAiFeedbackPick,
}: {
  segment: SimulationSegment;
  aiFeedbackKey?: string;
  aiFeedback?: "like" | "dislike";
  onAiFeedbackPick?: (key: string, choice: "like" | "dislike") => void;
}) {
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
      {aiFeedbackKey && onAiFeedbackPick && (
        <div style={{ borderTop: `1px solid ${C.lineSoft}`, marginTop: 10, paddingTop: 8, display: "flex", justifyContent: "flex-end" }}>
          <AiGenFeedback feedbackKey={aiFeedbackKey} value={aiFeedback} onPick={onAiFeedbackPick} />
        </div>
      )}
    </div>
  );
}

function PersonaCard({
  persona, onRemove, customBadge, aiFeedbackKey, aiFeedback, onAiFeedbackPick,
}: {
  persona: Persona;
  onRemove?: () => void;
  customBadge?: boolean;
  aiFeedbackKey?: string;
  aiFeedback?: "like" | "dislike";
  onAiFeedbackPick?: (key: string, choice: "like" | "dislike") => void;
}) {
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
            {persona.age}
            {persona.gender ? ` · ${persona.gender}` : ""}
            {persona.religion ? ` · ${persona.religion}` : ""}
            {persona.job ? ` · ${persona.job}` : ""}
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
      {aiFeedbackKey && onAiFeedbackPick && (
        <div style={{ borderTop: `1px solid ${C.lineSoft}`, marginTop: 10, paddingTop: 8, display: "flex", justifyContent: "flex-end" }}>
          <AiGenFeedback feedbackKey={aiFeedbackKey} value={aiFeedback} onPick={onAiFeedbackPick} />
        </div>
      )}
    </div>
  );
}

function FocusGroupScreen({
  plan, simResult, customPersonas, onRemoveCustom, onGoSimulate, onGoResults,
}: {
  plan: CampaignPlan;
  simResult: SimulationResult | null;
  customPersonas: Persona[];
  onRemoveCustom: (idx: number) => void;
  onGoSimulate: () => void;
  onGoResults: () => void;
}) {
  type PersonaGroup = {
    id: string;
    label: string;
    summary: string;
    traits: string[];
    baseSentiment: number;
    count: number;
    custom: boolean;
    sourceCustomIdx: number;
  };
  type GeneratedEntry = { persona: Persona; custom: boolean; customIdx: number };

  const [phase, setPhase] = useState<"setup" | "results">("setup");
  const [tab, setTab] = useState<"conclusion" | "personas" | "transcript">("conclusion");
  const [feedbackDepth, setFeedbackDepth] = useState<"quick" | "in-depth">("in-depth");
  const [audienceDiversity, setAudienceDiversity] = useState<"low" | "medium" | "high">("high");
  const [critiqueRigour, setCritiqueRigour] = useState(6);
  const [generatingFocusGroup, setGeneratingFocusGroup] = useState(false);
  const [infoOpen, setInfoOpen] = useState<null | "diversity" | "rigour" | "depth">(null);
  const [groups, setGroups] = useState<PersonaGroup[]>([]);
  const [generatedPanel, setGeneratedPanel] = useState<GeneratedEntry[]>([]);

  const [showAddGroup, setShowAddGroup] = useState(false);
  const [groupHintsOpen, setGroupHintsOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [groupSummaryDraft, setGroupSummaryDraft] = useState("");
  const [groupTraitsDraft, setGroupTraitsDraft] = useState("");
  const [exportPreviewOpen, setExportPreviewOpen] = useState(false);
  const [exportMarkdown, setExportMarkdown] = useState("");
  const exportPreviewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [snapshotPreviewOpen, setSnapshotPreviewOpen] = useState(false);
  const [snapshotJson, setSnapshotJson] = useState("");
  const [fgAiFeedback, setFgAiFeedback] = useState<Record<string, "like" | "dislike">>({});
  const [recentlyDeletedGroup, setRecentlyDeletedGroup] = useState<{ group: PersonaGroup; index: number } | null>(null);
  const groupUndoTimeoutRef = useRef<number | null>(null);

  const pickFgAiFeedback = (key: string, choice: "like" | "dislike") => {
    setFgAiFeedback((prev) => {
      if (prev[key] === choice) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: choice };
    });
  };

  const baseGroups = useMemo<PersonaGroup[]>(() => {
    if (!simResult) return [];
    const fromSegments = simResult.segments.map((s, i) => ({
      id: `seg-${i}-${s.name}`,
      label: s.name,
      summary: s.topReaction,
      traits: [sentimentLabel(s.sentimentPct), "Opinionated", "Socially vocal"],
      baseSentiment: s.sentimentPct,
      count: 2,
      custom: false,
      sourceCustomIdx: -1,
    }));
    const fromCustom = customPersonas.map((p, i) => ({
      id: `custom-${i}-${p.name}`,
      label: p.name,
      summary: p.quote,
      traits: p.traits?.length ? p.traits : ["Targeted", "Specific", "Niche"],
      baseSentiment: p.sentiment,
      count: 1,
      custom: true,
      sourceCustomIdx: i,
    }));
    return [...fromSegments, ...fromCustom];
  }, [simResult, customPersonas]);

  const applyParticipantCap = (list: PersonaGroup[]) => {
    let remaining = MAX_FOCUS_GROUP_PARTICIPANTS;
    return list.map((g) => {
      const next = Math.max(0, Math.min(g.count, remaining));
      remaining -= next;
      return { ...g, count: next };
    });
  };

  useEffect(() => {
    if (!simResult) {
      setGroups([]);
      setGeneratedPanel([]);
      return;
    }
    setGroups((prev) => {
      const prevMap = new Map(prev.map((g) => [g.id, g]));
      const merged = baseGroups.map((g) => {
        const p = prevMap.get(g.id);
        return p ? { ...g, count: p.count } : g;
      });
      return applyParticipantCap(merged);
    });
  }, [baseGroups, simResult]);

  useEffect(() => {
    if (feedbackDepth === "quick" && tab === "transcript") {
      setTab("conclusion");
    }
  }, [feedbackDepth, tab]);

  useEffect(() => {
    return () => {
      if (groupUndoTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(groupUndoTimeoutRef.current);
      }
    };
  }, []);

  const transcript = useMemo(() => {
    if (feedbackDepth === "quick") return [];
    return buildTranscript(generatedPanel.map((x) => x.persona));
  }, [generatedPanel, feedbackDepth]);
  const tabOptions: Array<["conclusion" | "personas" | "transcript", string]> = [
    ["conclusion", "Conclusion"],
    ["personas", "Personas"],
    ...(feedbackDepth === "in-depth" ? ([["transcript", "Transcript"]] as Array<["transcript", string]>) : []),
  ];
  const avg = generatedPanel.length
    ? Math.round(generatedPanel.reduce((s, x) => s + x.persona.sentiment, 0) / generatedPanel.length)
    : simResult
      ? avgSentiment(simResult.personas, customPersonas)
      : 0;
  const totalParticipants = groups.reduce((sum, g) => sum + g.count, 0);
  const MAX_FOCUS_GROUP_PARTICIPANTS = 8;
  const canAddMoreParticipants = totalParticipants < MAX_FOCUS_GROUP_PARTICIPANTS;
  const activeGroup = activeGroupId ? groups.find((g) => g.id === activeGroupId) ?? null : null;

  const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
  const harshnessDelta = (5 - critiqueRigour) * 2;
  const diversityRange = audienceDiversity === "high" ? 18 : audienceDiversity === "medium" ? 10 : 5;
  const firstNames = ["Avery", "Jordan", "Maya", "Noah", "Zoe", "Liam", "Priya", "Marcus", "Elena", "Owen", "Devon", "Riley"];
  const lastNames = ["Chen", "Patel", "Webb", "Park", "Reyes", "Nair", "Hughes", "Kim", "Lopez", "Grant", "Shaw", "Bennett"];
  const quoteOpeners = [
    "From my perspective,",
    "Honestly,",
    "As a buyer,",
    "If I'm in the target audience,",
    "My immediate reaction is",
  ];

  const updateGroupCount = (id: string, next: number) => {
    setGroups((prev) => {
      const target = prev.find((g) => g.id === id);
      if (!target) return prev;
      const others = prev.reduce((s, g) => (g.id === id ? s : s + g.count), 0);
      const maxAllowedForGroup = Math.max(0, Math.min(6, MAX_FOCUS_GROUP_PARTICIPANTS - others));
      const clamped = Math.max(0, Math.min(maxAllowedForGroup, next));
      return prev.map((g) => (g.id === id ? { ...g, count: clamped } : g));
    });
  };

  const addCustomGroup = () => {
    if (!canAddMoreParticipants) return;
    const name = groupNameDraft.trim();
    const summary = groupSummaryDraft.trim();
    if (!name) return;
    const parsedTraits = groupTraitsDraft
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 3);
    setGroups((prev) => [...prev, {
      id: `manual-${Date.now()}`,
      label: name,
      summary: summary || "Custom audience group added by user.",
      traits: parsedTraits.length ? parsedTraits : ["Niche", "Specific", "Opinionated"],
      baseSentiment: 50,
      count: Math.min(1, MAX_FOCUS_GROUP_PARTICIPANTS - totalParticipants),
      custom: true,
      sourceCustomIdx: -1,
    }]);
    setGroupNameDraft("");
    setGroupSummaryDraft("");
    setGroupTraitsDraft("");
    setShowAddGroup(false);
  };

  const closeAddGroupModal = () => {
    setShowAddGroup(false);
    setGroupHintsOpen(false);
    setGroupNameDraft("");
    setGroupSummaryDraft("");
    setGroupTraitsDraft("");
  };

  const removeAudienceGroup = (id: string) => {
    setGroups((prev) => {
      const idx = prev.findIndex((g) => g.id === id);
      if (idx < 0) return prev;
      const removed = prev[idx];
      const next = prev.filter((g) => g.id !== id);
      setRecentlyDeletedGroup({ group: removed, index: idx });
      if (groupUndoTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(groupUndoTimeoutRef.current);
      }
      if (typeof window !== "undefined") {
        groupUndoTimeoutRef.current = window.setTimeout(() => {
          setRecentlyDeletedGroup(null);
          groupUndoTimeoutRef.current = null;
        }, 6000);
      }
      if (activeGroupId === id) setActiveGroupId(null);
      return next;
    });
  };

  const undoRemoveAudienceGroup = () => {
    if (!recentlyDeletedGroup) return;
    const { group, index } = recentlyDeletedGroup;
    setGroups((prev) => {
      const next = prev.slice();
      const insertAt = Math.max(0, Math.min(index, next.length));
      next.splice(insertAt, 0, group);
      return next;
    });
    setRecentlyDeletedGroup(null);
    if (groupUndoTimeoutRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(groupUndoTimeoutRef.current);
      groupUndoTimeoutRef.current = null;
    }
  };

  const buildGroupParticipantPreview = (group: PersonaGroup) => {
    const total = Math.max(1, group.count);
    const rows: Array<{
      name: string;
      sentiment: number;
      concern: string;
      channel: string;
      ageRange: string;
      gender: string;
      location: string;
      incomeLevel: string;
      education: string;
      occupation: string;
      valsStyle: string;
      brandAffinities: string;
      interests: string[];
      values: string[];
      personalityTraits: string[];
      mediaHabits: string[];
    }> = [];
    const concerns = [
      "Needs clearer proof points",
      "Wants practical value, not broad claims",
      "Cares about tone and brand credibility",
      "Sensitive to price-performance tradeoffs",
      "Quick to call out inauthentic messaging",
    ];
    const channels = ["TikTok", "Instagram", "YouTube", "Reddit", "X / Twitter"];
    const valsProfiles = ["Achiever-like", "Experiencer-like", "Thinker-like", "Striver-like", "Believer-like"];
    const incomes = ["$30k–$60k", "$60k–$90k", "$90k–$140k", "$140k+"];
    const educations = ["High school", "Undergrad", "Graduate", "Mixed"];
    const occupations = ["Students & creators", "Young professionals", "Parents & managers", "Service & gig workers"];
    const locations = ["United States", "US + UK", "US + Canada", "Urban Tier-1 cities"];
    const interestsPool = ["Fashion", "Social Media", "Sustainability", "Budget shopping", "Pop culture", "Tech", "Wellness"];
    const valuesPool = ["Authenticity", "Convenience", "Value", "Trust", "Status", "Practicality", "Sustainability"];
    const personalityPool = ["Skeptical", "Trend-driven", "Practical", "Vocal", "Analytical", "Price-sensitive"];
    const mediaPool = ["TikTok", "Instagram", "YouTube", "Reddit", "X / Twitter", "Podcasts"];
    const affinitiesPool = ["ZARA", "H&M", "Depop", "Vinted", "Amazon", "Target", "Patagonia", "Uniqlo"];

    const pick = (pool: string[], start: number, count: number) =>
      Array.from({ length: count }, (_, i) => pool[(start + i) % pool.length]);

    for (let i = 0; i < total; i += 1) {
      const variance = ((i + 1) * 7) % (diversityRange * 2 + 1) - diversityRange;
      const sentiment = clamp(Math.round(group.baseSentiment + harshnessDelta + variance));
      const name = `${firstNames[(i + group.label.length) % firstNames.length]} ${lastNames[(i + group.label.length * 2) % lastNames.length]}`;
      const seed = i + group.label.length;
      rows.push({
        name,
        sentiment,
        concern: concerns[(i + group.traits.length) % concerns.length],
        channel: channels[(i + group.label.length) % channels.length],
        ageRange: seed % 3 === 0 ? "18–24" : seed % 3 === 1 ? "25–34" : "35–44",
        gender: ["Female", "Male", "Non-binary"][seed % 3],
        location: locations[seed % locations.length],
        incomeLevel: incomes[seed % incomes.length],
        education: educations[seed % educations.length],
        occupation: occupations[seed % occupations.length],
        valsStyle: valsProfiles[seed % valsProfiles.length],
        brandAffinities: pick(affinitiesPool, seed, 4).join(", "),
        interests: pick(interestsPool, seed, 4),
        values: pick(valuesPool, seed + 1, 3),
        personalityTraits: pick(personalityPool, seed + 2, 3),
        mediaHabits: pick(mediaPool, seed + 3, 4),
      });
    }
    return rows;
  };

  const runFocusGroupAnalysis = () => {
    if (generatingFocusGroup) return;
    setFgAiFeedback({});
    setGeneratingFocusGroup(true);
    const complete = () => {
      const generated: GeneratedEntry[] = [];
      let seed = 0;
      groups.forEach((g, groupIdx) => {
        for (let i = 0; i < g.count; i += 1) {
          seed += 1;
          const variance = ((groupIdx + 1) * 7 + (i + 2) * 5 + seed * 3) % (diversityRange * 2 + 1) - diversityRange;
          const sentiment = clamp(Math.round(g.baseSentiment + harshnessDelta + variance));
          const fname = firstNames[(groupIdx * 3 + i + seed) % firstNames.length];
          const lname = lastNames[(groupIdx * 5 + i + seed) % lastNames.length];
          const quote = `${quoteOpeners[(groupIdx + i + seed) % quoteOpeners.length]} ${g.summary.replace(/^"+|"+$/g, "")}`.slice(0, 155);
          generated.push({
            persona: {
              name: `${fname} ${lname}`,
              archetype: `${g.label} participant`,
              age: sentiment >= 65 ? "Gen Z / Millennials" : sentiment >= 40 ? "Mixed adult audience" : "Mixed audience, skeptical segment",
            gender: i % 3 === 0 ? "Female" : i % 3 === 1 ? "Male" : "Non-binary",
            religion: i % 4 === 0 ? "Not specified" : i % 4 === 1 ? "Christian" : i % 4 === 2 ? "Muslim" : "Hindu",
              job: g.label,
              traits: g.traits.slice(0, 3),
              sentiment,
              quote,
            },
            custom: g.custom,
            customIdx: g.sourceCustomIdx,
          });
        }
      });
      setGeneratedPanel(generated);
      setTab("conclusion");
      setPhase("results");
      setGeneratingFocusGroup(false);
    };
    if (typeof window === "undefined") complete();
    else window.setTimeout(complete, MIN_GENERATION_MS);
  };

  const upgradeToInDepthDiscussion = () => {
    if (feedbackDepth === "in-depth" || generatingFocusGroup) return;
    setFgAiFeedback({});
    setGeneratingFocusGroup(true);
    const complete = () => {
      setFeedbackDepth("in-depth");
      setTab("transcript");
      setGeneratingFocusGroup(false);
    };
    if (typeof window === "undefined") complete();
    else window.setTimeout(complete, MIN_GENERATION_MS);
  };

  const exportFocusGroupAnalysis = () => {
    if (!simResult || phase !== "results") return;
    const lines: string[] = [];
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");

    lines.push("# Focus Group Analysis");
    lines.push("");
    lines.push(`Generated: ${now.toLocaleString()}`);
    lines.push("");
    lines.push("## Configuration");
    lines.push(`- Feedback depth: ${feedbackDepth === "in-depth" ? "In-depth discussion" : "Quick reactions"}`);
    lines.push(`- Audience diversity: ${audienceDiversity}`);
    lines.push(`- Critique rigour: ${critiqueRigour}/10`);
    lines.push("");

    lines.push("## Persona Groups");
    groups.forEach((g, i) => {
      lines.push(`${i + 1}. **${g.label}**`);
      lines.push(`   - Participants: ${g.count}`);
      lines.push(`   - Traits: ${g.traits.join(", ") || "—"}`);
      lines.push(`   - Summary: ${g.summary}`);
    });
    lines.push("");

    lines.push("## Summary");
    lines.push(`- Mood: ${sentimentLabel(avg)}`);
    lines.push(`- Participants generated: ${generatedPanel.length}`);
    lines.push(`- Exchanges: ${feedbackDepth === "in-depth" ? transcript.length : 0}`);
    lines.push(`- Risk band: ${simResult.risk}`);
    lines.push(`- Tones: ${simResult.tones.join(", ")}`);
    lines.push("");

    lines.push("## Conclusion");
    const pushSection = (title: string, items: string[]) => {
      if (!items.length) return;
      lines.push(`### ${title}`);
      items.forEach((x) => lines.push(`- ${x}`));
      lines.push("");
    };
    pushSection("What Works", simResult.insights.whatWorks);
    pushSection("What Doesn't", simResult.insights.whatDoesnt);
    pushSection("Opportunities", simResult.insights.opportunities);
    pushSection("Suggested Tweaks", simResult.insights.suggestedTweaks);
    if (simResult.insights.predictedPerformance) {
      lines.push("### Predicted Performance");
      lines.push(simResult.insights.predictedPerformance);
      lines.push("");
    }

    lines.push("## Personas");
    generatedPanel.forEach(({ persona, custom }, i) => {
      lines.push(`### ${i + 1}. ${persona.name}${custom ? " (custom group)" : ""}`);
      lines.push(`- Archetype: ${persona.archetype}`);
      lines.push(`- Age: ${persona.age}`);
      lines.push(`- Gender: ${persona.gender || "Not specified"}`);
      lines.push(`- Religion: ${persona.religion || "Not specified"}`);
      lines.push(`- Group / Job: ${persona.job || "—"}`);
      lines.push(`- Traits: ${persona.traits.join(", ") || "—"}`);
      lines.push(`- Sentiment: ${persona.sentiment} (${sentimentLabel(persona.sentiment)})`);
      lines.push(`- Quote: "${persona.quote}"`);
      lines.push("");
    });

    if (feedbackDepth === "in-depth" && transcript.length > 0) {
      lines.push("## Transcript");
      transcript.forEach((line, i) => {
        lines.push(`${i + 1}. ${line.speaker}: ${line.text}`);
      });
      lines.push("");
    }

    const content = lines.join("\n");
    setExportMarkdown(content);
    setExportPreviewOpen(true);
  };

  const saveFocusGroupSnapshot = () => {
    if (!simResult || phase !== "results") return;
    const now = new Date();
    const payload = {
      savedAt: now.toISOString(),
      campaignPlan: plan,
      focusGroupConfig: {
        feedbackDepth,
        audienceDiversity,
        critiqueRigour,
        totalParticipants,
      },
      personaGroups: groups.map((g) => ({
        id: g.id,
        label: g.label,
        summary: g.summary,
        traits: g.traits,
        participants: g.count,
        custom: g.custom,
      })),
      simulation: {
        risk: simResult.risk,
        riskScore: simResult.riskScore,
        riskRationale: simResult.riskRationale,
        tones: simResult.tones,
        flags: simResult.flags,
        improvedCopy: simResult.improvedCopy,
        insights: simResult.insights,
      },
      generatedPanel: generatedPanel.map((entry) => ({
        custom: entry.custom,
        persona: entry.persona,
      })),
      transcript: feedbackDepth === "in-depth" ? transcript : [],
    };
    setSnapshotJson(JSON.stringify(payload, null, 2));
    setSnapshotPreviewOpen(true);
  };

  const downloadFocusGroupSnapshot = () => {
    if (!snapshotJson) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const blob = new Blob([snapshotJson], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `focus-group-snapshot_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadFocusGroupMarkdown = () => {
    if (!exportMarkdown) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const blob = new Blob([exportMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `focus-group-analysis_${stamp}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportPreviewHtml = useMemo(() => {
    const escaped = exportMarkdown
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Focus Group Report Preview</title>
  <style>
    body{margin:0;padding:32px;font-family:Inter,Arial,sans-serif;color:#111;background:#fff}
    .paper{max-width:860px;margin:0 auto}
    h1{font-size:28px;margin:0 0 16px}
    p.meta{color:#666;font-size:12px;margin:0 0 18px}
    pre{white-space:pre-wrap;word-break:break-word;line-height:1.55;font-size:13px;background:#fafafa;border:1px solid #e5e5e5;border-radius:10px;padding:16px}
  </style>
</head>
<body>
  <div class="paper">
    <h1>Focus Group PDF Preview</h1>
    <p class="meta">Use browser Print → Save as PDF to export this report as PDF.</p>
    <pre>${escaped}</pre>
  </div>
</body>
</html>`;
  }, [exportMarkdown]);

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
            {phase === "setup" && (
              <div style={{ display: "grid", gap: 18, marginBottom: 20 }}>
                <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
                    <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase" }}>
                      Persona Group Setup
                    </div>
                    <div style={{ fontFamily: F.display, fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", color: C.ink }}>
                      {totalParticipants} / {MAX_FOCUS_GROUP_PARTICIPANTS} participants
                    </div>
                  </div>
                  {!canAddMoreParticipants && (
                    <div style={{
                      marginBottom: 12,
                      fontFamily: F.mono, fontSize: 10, color: C.warn,
                      letterSpacing: ".06em", textTransform: "uppercase",
                    }}>
                      Participant cap reached (max {MAX_FOCUS_GROUP_PARTICIPANTS})
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
                    {groups.map((g) => (
                      <div
                        key={g.id}
                        onClick={() => setActiveGroupId(g.id)}
                        className="clickablePersonaCard"
                        style={{
                          background: g.custom ? "#FAFAFF" : C.bg,
                          border: `1px solid ${g.custom ? "#C7D2FE" : C.line}`,
                          borderLeft: `4px solid ${g.custom ? "#818CF8" : "#94A3B8"}`,
                          borderRadius: 12, padding: 14,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ fontFamily: F.display, fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 6 }}>{g.label}</div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeAudienceGroup(g.id);
                            }}
                            aria-label={`Remove ${g.label}`}
                            style={{
                              background: "transparent", border: "none", color: C.faint, cursor: "pointer",
                              fontSize: 14, padding: 2, lineHeight: 1, flexShrink: 0,
                            }}
                          >
                            ✕
                          </button>
                        </div>
                        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 8, fontStyle: "italic" }}>"{g.summary}"</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                          {g.traits.slice(0, 3).map((t) => (
                            <span key={t} style={{ padding: "2px 8px", borderRadius: 999, fontFamily: F.mono, fontSize: 10, background: C.lineSoft, color: C.ink2 }}>{t}</span>
                          ))}
                        </div>
                        <div style={{ borderTop: `1px solid ${C.lineSoft}`, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em" }}>Participants</span>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <button onClick={(e) => { e.stopPropagation(); updateGroupCount(g.id, g.count - 1); }} style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${C.line}`, background: "#fff", cursor: "pointer" }}>−</button>
                            <span style={{ minWidth: 16, textAlign: "center", fontFamily: F.mono, fontSize: 12, fontWeight: 700 }}>{g.count}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); updateGroupCount(g.id, g.count + 1); }}
                              disabled={totalParticipants >= MAX_FOCUS_GROUP_PARTICIPANTS}
                              style={{
                                width: 22, height: 22, borderRadius: 6, border: `1px solid ${C.line}`,
                                background: "#fff",
                                cursor: totalParticipants >= MAX_FOCUS_GROUP_PARTICIPANTS ? "not-allowed" : "pointer",
                                opacity: totalParticipants >= MAX_FOCUS_GROUP_PARTICIPANTS ? 0.45 : 1,
                              }}>+</button>
                          </div>
                        </div>
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}
                        >
                          <AiGenFeedback
                            feedbackKey={`fg:setup-group:${g.id}`}
                            value={fgAiFeedback[`fg:setup-group:${g.id}`]}
                            onPick={pickFgAiFeedback}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={() => setShowAddGroup(true)}
                      disabled={!canAddMoreParticipants}
                      style={{
                        width: "100%", border: `1px dashed ${C.line}`, background: C.bg, color: C.ink,
                        borderRadius: 10, padding: "14px 12px", fontFamily: F.body, fontSize: 14, fontWeight: 600,
                        cursor: !canAddMoreParticipants ? "not-allowed" : "pointer",
                        opacity: !canAddMoreParticipants ? 0.45 : 1,
                      }}
                    >
                      + Add custom audience group
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 14 }}>
                  <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 10 }}>
                      Campaign Summary Sheet
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <SummaryCell label="Name" value={plan.name} />
                      <SummaryCell label="Timeline" value={plan.timeline} />
                      <SummaryCell label="Target Audience" value={plan.targetAudience} />
                      <SummaryCell label="Location / Markets" value={plan.location} />
                      <SummaryCell label="Key Message" value={plan.keyMessage} />
                      <SummaryCell label="Slogan / Hashtag" value={`${plan.slogan} · ${plan.hashtag}`} />
                    </div>
                  </div>

                  <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 12 }}>
                      Focus Group Settings
                    </div>
                    <div style={{ display: "grid", gap: 12 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <span style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase" }}>Audience Diversity</span>
                          <InfoDot onClick={() => setInfoOpen((p) => (p === "diversity" ? null : "diversity"))} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                          {(["low", "medium", "high"] as const).map((v) => (
                            <button key={v} onClick={() => setAudienceDiversity(v)} style={{
                              padding: "8px 0", borderRadius: 8, cursor: "pointer",
                              border: `1px solid ${audienceDiversity === v ? C.ink : C.line}`,
                              background: audienceDiversity === v ? C.ink : "transparent",
                              color: audienceDiversity === v ? C.accentInk : C.muted, fontWeight: 600,
                            }}>{v[0].toUpperCase() + v.slice(1)}</button>
                          ))}
                        </div>
                        {infoOpen === "diversity" && (
                          <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.45 }}>
                            Controls how different participants are, even inside the same persona group.
                          </div>
                        )}
                      </div>

                      <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase" }}>Critique Rigour</span>
                            <InfoDot onClick={() => setInfoOpen((p) => (p === "rigour" ? null : "rigour"))} />
                          </div>
                          <span style={{ fontFamily: F.display, fontSize: 16, fontWeight: 700, color: C.ink }}>{critiqueRigour}/10</span>
                        </div>
                        <input
                          className="rigourSlider"
                          type="range"
                          min={1}
                          max={10}
                          step={1}
                          value={critiqueRigour}
                          onInput={(e) => setCritiqueRigour(Number((e.target as HTMLInputElement).value))}
                          onChange={(e) => setCritiqueRigour(Number(e.target.value))}
                          style={{
                            width: "100%",
                            background: `linear-gradient(90deg, #111827 0%, #111827 ${Math.max(2, ((critiqueRigour - 1) / 9) * 100)}%, #E7E5E4 ${Math.max(2, ((critiqueRigour - 1) / 9) * 100)}%, #E7E5E4 100%)`,
                          }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.faint, marginTop: 3 }}>
                          <span>Supportive</span>
                          <span>Harsh</span>
                        </div>
                        {infoOpen === "rigour" && (
                          <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.45 }}>
                            Sets how tough the panel is when critiquing the campaign. Higher numbers mean stricter criticism.
                          </div>
                        )}
                      </div>

                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <span style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase" }}>Feedback Depth</span>
                          <InfoDot onClick={() => setInfoOpen((p) => (p === "depth" ? null : "depth"))} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          {([
                            ["quick", "Quick reactions"],
                            ["in-depth", "In-depth discussion"],
                          ] as const).map(([v, label]) => (
                            <button key={v} onClick={() => setFeedbackDepth(v)} style={{
                              padding: "8px 0", borderRadius: 8, cursor: "pointer",
                              border: `1px solid ${feedbackDepth === v ? C.ink : C.line}`,
                              background: feedbackDepth === v ? C.ink : "transparent",
                              color: feedbackDepth === v ? C.accentInk : C.muted, fontWeight: 600,
                            }}>{label}</button>
                          ))}
                        </div>
                        {infoOpen === "depth" && (
                          <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.45 }}>
                            In-depth enables Transcript tab. Quick keeps Conclusion + Personas only.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={runFocusGroupAnalysis}
                    disabled={generatingFocusGroup}
                    style={{
                      ...progressBtnStyle(),
                      padding: "12px 20px",
                      opacity: generatingFocusGroup ? 0.7 : 1,
                      cursor: generatingFocusGroup ? "default" : "pointer",
                    }}
                  >
                    {generatingFocusGroup
                      ? <><span className="aiSpin" /> Generating focus group…</>
                      : "Run Focus Group Analysis →"}
                  </button>
                </div>
              </div>
            )}

            {phase === "setup" && showAddGroup && (
              <div
                onClick={closeAddGroupModal}
                style={{
                  position: "fixed", inset: 0, zIndex: 1230,
                  background: "rgba(10,10,10,.45)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: 20,
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: "min(720px, 100%)",
                    background: C.surface, border: `1px solid ${C.line}`,
                    borderRadius: 14, padding: 22, display: "grid", gap: 10,
                    boxShadow: "0 20px 60px rgba(0,0,0,.2)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase" }}>
                      Add Custom Audience Group
                    </div>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <button
                        onClick={() => setGroupHintsOpen((v) => !v)}
                        aria-expanded={groupHintsOpen}
                        aria-label={groupHintsOpen ? "Hide hints" : "Show hints"}
                        title={groupHintsOpen ? "Hide hints" : "Show hints"}
                        style={{
                          display: "inline-flex", alignItems: "center",
                          background: groupHintsOpen ? C.ink : "transparent",
                          color: groupHintsOpen ? C.accentInk : C.muted,
                          border: `1px solid ${groupHintsOpen ? C.ink : C.line}`,
                          borderRadius: 999, padding: "3px",
                          fontFamily: F.mono, fontSize: 10, fontWeight: 600,
                          letterSpacing: ".05em", cursor: "pointer",
                        }}
                      >
                        <span style={{
                          width: 14, height: 14, borderRadius: "50%",
                          background: groupHintsOpen ? "rgba(255,255,255,.18)" : C.lineSoft,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 700,
                        }}>?</span>
                      </button>
                      <button onClick={closeAddGroupModal} style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontSize: 16 }}>✕</button>
                    </div>
                  </div>
                  {groupHintsOpen && <AudienceGroupHintPanel />}
                  <input value={groupNameDraft} onChange={(e) => setGroupNameDraft(e.target.value)} placeholder="Group name (e.g. Price-sensitive Gen Z commuters)" style={inputStyle(false)} />
                  <textarea value={groupSummaryDraft} onChange={(e) => setGroupSummaryDraft(e.target.value)} rows={3} placeholder="How this group typically reacts..." style={inputStyle(false)} />
                  <input value={groupTraitsDraft} onChange={(e) => setGroupTraitsDraft(e.target.value)} placeholder="Traits (comma separated, e.g. vocal, skeptical, trend-aware)" style={inputStyle(false)} />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={closeAddGroupModal} style={{ background: "transparent", border: `1px solid ${C.line}`, color: C.muted, borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>Cancel</button>
                    <button onClick={addCustomGroup} style={{ background: C.ink, color: C.accentInk, border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 600 }}>Add group</button>
                  </div>
                </div>
              </div>
            )}

            {phase === "setup" && activeGroup && (
              <div
                onClick={() => setActiveGroupId(null)}
                style={{
                  position: "fixed", inset: 0, zIndex: 1230,
                  background: "rgba(10,10,10,.45)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: 20,
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: "min(860px, 100%)",
                    background: C.surface, border: `1px solid ${C.line}`,
                    borderRadius: 14, padding: 22,
                    boxShadow: "0 20px 60px rgba(0,0,0,.2)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>
                        Participant Details
                      </div>
                      <div style={{ fontFamily: F.display, fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em" }}>{activeGroup.label}</div>
                      <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.5, maxWidth: 620 }}>
                        {activeGroup.summary}
                      </div>
                    </div>
                    <button onClick={() => setActiveGroupId(null)} style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontSize: 16 }}>✕</button>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                    {activeGroup.traits.map((t) => (
                      <span key={t} style={{ padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: C.lineSoft, color: C.ink2, fontFamily: F.mono }}>
                        {t}
                      </span>
                    ))}
                  </div>

                  <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 8 }}>
                      <span>Diversity</span><span>Rigour</span><span>Participants</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, fontSize: 13, color: C.ink }}>
                      <span>{audienceDiversity[0].toUpperCase() + audienceDiversity.slice(1)}</span>
                      <span>{critiqueRigour}/10</span>
                      <span>{activeGroup.count}</span>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                    {buildGroupParticipantPreview(activeGroup).map((p, i) => {
                      const tone = sentimentColor(p.sentiment);
                      return (
                        <div key={`${p.name}-${i}`} style={{ background: C.bg, border: `1px solid ${tone}55`, borderRadius: 10, padding: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <div style={{ fontFamily: F.display, fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                            <span style={{ fontFamily: F.mono, fontSize: 10, color: tone, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" }}>
                              {sentimentLabel(p.sentiment)}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 10 }}>{p.concern}</div>

                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <div>
                              <div style={{ fontFamily: F.mono, fontSize: 9, color: C.muted, letterSpacing: ".09em", textTransform: "uppercase", marginBottom: 6 }}>Demographics</div>
                              <div style={{ fontSize: 11, color: C.ink2, lineHeight: 1.55 }}>
                                <div><strong>Age:</strong> {p.ageRange}</div>
                                <div><strong>Gender:</strong> {p.gender}</div>
                                <div><strong>Location:</strong> {p.location}</div>
                                <div><strong>Income:</strong> {p.incomeLevel}</div>
                                <div><strong>Education:</strong> {p.education}</div>
                                <div><strong>Occupation:</strong> {p.occupation}</div>
                              </div>
                            </div>
                            <div>
                              <div style={{ fontFamily: F.mono, fontSize: 9, color: C.muted, letterSpacing: ".09em", textTransform: "uppercase", marginBottom: 6 }}>Psychographics</div>
                              <div style={{ display: "grid", gap: 6 }}>
                                <DetailChipRow label="Interests" items={p.interests} />
                                <DetailChipRow label="Values" items={p.values} />
                                <DetailChipRow label="Personality" items={p.personalityTraits} />
                                <DetailChipRow label="Media" items={p.mediaHabits} />
                              </div>
                            </div>
                          </div>

                          <div style={{ borderTop: `1px solid ${C.lineSoft}`, marginTop: 10, paddingTop: 8, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                            <div><strong>VALS style:</strong> {p.valsStyle}</div>
                            <div><strong>Brand affinities:</strong> {p.brandAffinities}</div>
                            <div><strong>Main channel:</strong> {p.channel}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {phase === "setup" && recentlyDeletedGroup && (
              <div style={{
                position: "fixed", right: 20, bottom: 18, zIndex: 1240,
                background: C.surface, border: `1px solid ${C.line}`,
                borderRadius: 10, padding: "10px 12px",
                display: "flex", alignItems: "center", gap: 10,
                boxShadow: "0 10px 30px rgba(0,0,0,.12)",
              }}>
                <span style={{ fontSize: 12, color: C.muted }}>
                  Removed audience group
                </span>
                <button
                  onClick={undoRemoveAudienceGroup}
                  style={{
                    background: C.ink, color: C.accentInk, border: "none",
                    borderRadius: 6, padding: "5px 10px",
                    fontFamily: F.body, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Undo
                </button>
              </div>
            )}

            {phase === "results" && (
              <>
            {/* Summary bar */}
            <div style={{
              background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14,
              padding: "16px 22px", marginBottom: 18,
              display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
            }}>
              <div style={{ display: "flex", gap: 28, flexShrink: 0 }}>
                <SummaryStat label="Mood" val={sentimentLabel(avg)} tone={avg >= 60 ? "good" : avg >= 40 ? "warn" : "bad"} />
                <SummaryStat label="Participants" val={`${generatedPanel.length}/${MAX_FOCUS_GROUP_PARTICIPANTS}`} />
                <SummaryStat label="Exchanges" val={feedbackDepth === "in-depth" ? `${transcript.length}` : "—"} />
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
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {feedbackDepth === "quick" && (
                  <button
                    onClick={upgradeToInDepthDiscussion}
                    disabled={generatingFocusGroup}
                    style={{
                      background: C.surface, color: C.ink, border: `1px solid ${C.line}`,
                      padding: "11px 14px", borderRadius: 8,
                      fontFamily: F.body, fontSize: 13, fontWeight: 600,
                      cursor: generatingFocusGroup ? "default" : "pointer",
                      opacity: generatingFocusGroup ? 0.65 : 1,
                    }}
                  >
                    {generatingFocusGroup
                      ? <><span className="aiSpin" /> Generating in-depth…</>
                      : "🔁 In-Depth Discussion"}
                  </button>
                )}
                <button
                  onClick={saveFocusGroupSnapshot}
                  style={{
                    background: C.surface, color: C.ink, border: `1px solid ${C.line}`,
                    padding: "11px 14px", borderRadius: 8,
                    fontFamily: F.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  💾 Save Snapshot
                </button>
                <button
                  onClick={exportFocusGroupAnalysis}
                  style={{
                    background: C.surface, color: C.ink, border: `1px solid ${C.line}`,
                    padding: "11px 14px", borderRadius: 8,
                    fontFamily: F.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  📄 Export Results
                </button>
                <button onClick={onGoResults} style={progressBtnStyle()}>➡️ Review & Fix</button>
              </div>
            </div>

            {/* Tabs */}
            <div style={{
              display: "inline-flex", gap: 4, marginBottom: 18,
              background: C.lineSoft, borderRadius: 10, padding: 4,
            }}>
              {tabOptions.map(([v, l]) => (
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
                aiFeedback={fgAiFeedback}
                onAiFeedbackPick={pickFgAiFeedback}
              />
            )}

            {feedbackDepth === "in-depth" && tab === "transcript" && (
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
                          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                            <div style={{
                              background: C.bg, border: `1px dashed ${C.line}`, borderRadius: 10,
                              padding: "8px 14px", fontFamily: F.mono, fontSize: 11,
                              color: C.muted, fontStyle: "italic", maxWidth: "70%", textAlign: "center",
                              letterSpacing: ".02em",
                            }}>📋 {line.text}</div>
                            <AiGenFeedback
                              compact
                              feedbackKey={`fg:transcript-mod:${i}`}
                              value={fgAiFeedback[`fg:transcript-mod:${i}`]}
                              onPick={pickFgAiFeedback}
                            />
                          </div>
                        );
                      }
                      const idx = generatedPanel.findIndex((x) => x.persona.name === line.speaker);
                      const persona = idx >= 0 ? generatedPanel[idx].persona : null;
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
                              <span style={{ fontFamily: F.mono, fontSize: 10, color: C.faint }}>· {persona.job || persona.age} · {persona.gender || "Not specified"}</span>
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
                          <div style={{ alignSelf: isLeft ? "flex-start" : "flex-end", maxWidth: "82%" }}>
                            <AiGenFeedback
                              compact
                              feedbackKey={`fg:transcript:${i}`}
                              value={fgAiFeedback[`fg:transcript:${i}`]}
                              onPick={pickFgAiFeedback}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <aside style={{ position: "sticky", top: 76 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>Panel</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {generatedPanel.map(({ persona, custom }, i) => {
                      const tone = persona.sentiment >= 60 ? C.good : persona.sentiment >= 40 ? C.warn : C.bad;
                      const initials = (persona.name.split(" ").map((s) => s[0]).join("") || "?").slice(0, 2).toUpperCase();
                      return (
                        <div key={`panel-${i}`} style={{
                          background: C.surface, border: `1px solid ${C.line}`,
                          borderRadius: 10, padding: "10px 12px",
                        }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: 7,
                              background: avatarBg(i), color: C.ink,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontFamily: F.display, fontSize: 11, fontWeight: 700,
                              flexShrink: 0,
                            }}>{initials}</div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{
                                fontFamily: F.display, fontSize: 12, fontWeight: 700, letterSpacing: "-0.01em",
                                display: "flex", alignItems: "center", gap: 6,
                                lineHeight: 1.2, flexWrap: "wrap",
                              }}>
                                <span>{custom ? persona.name : persona.name.split(" ")[0]}</span>
                                {custom && <span style={{ fontFamily: F.mono, fontSize: 8, color: C.muted, background: C.lineSoft, padding: "1px 5px", borderRadius: 3 }}>CUSTOM</span>}
                              </div>
                              <div style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, marginTop: 2 }}>
                                {custom
                                  ? (persona.job || persona.age?.replace(/\s*\(.+?\)/, "") || "Audience")
                                  : `${persona.age?.replace(/\s*\(.+?\)/, "")} · ${persona.gender || "Not specified"} · ${persona.job || "—"}`}
                              </div>
                            </div>
                          </div>
                          <div style={{ height: 4, background: C.lineSoft, borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${persona.sentiment}%`, background: tone, borderRadius: 2 }} />
                          </div>
                          <div style={{ fontFamily: F.mono, fontSize: 10, color: tone, fontWeight: 600, marginTop: 4, letterSpacing: ".04em" }}>
                            {sentimentLabel(persona.sentiment)}
                          </div>
                          <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                            <AiGenFeedback
                              compact
                              feedbackKey={`fg:panel:${i}`}
                              value={fgAiFeedback[`fg:panel:${i}`]}
                              onPick={pickFgAiFeedback}
                            />
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
                {generatedPanel.map(({ persona, custom }, i) => (
                  <FocusPersonaCard
                    key={`fp-${i}`}
                    persona={persona}
                    custom={custom}
                    index={i}
                    aiFeedbackKey={`fg:persona:${i}`}
                    aiFeedback={fgAiFeedback[`fg:persona:${i}`]}
                    onAiFeedbackPick={pickFgAiFeedback}
                  />
                ))}
              </div>
            )}
              </>
            )}

            {exportPreviewOpen && (
              <div
                onClick={() => setExportPreviewOpen(false)}
                style={{
                  position: "fixed", inset: 0, zIndex: 1260,
                  background: "rgba(10,10,10,.5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: 20,
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: "min(980px, 100%)", height: "min(90vh, 820px)",
                    background: C.surface, border: `1px solid ${C.line}`,
                    borderRadius: 14, display: "grid", gridTemplateRows: "auto 1fr",
                    boxShadow: "0 20px 60px rgba(0,0,0,.25)",
                  }}
                >
                  <div style={{ padding: 14, borderBottom: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase" }}>
                      PDF Report Preview
                    </div>
                    <div style={{ display: "inline-flex", gap: 8 }}>
                      <button
                        onClick={downloadFocusGroupMarkdown}
                        style={{ background: C.surface, border: `1px solid ${C.line}`, color: C.ink, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                      >
                        Download .md
                      </button>
                      <button
                        onClick={() => exportPreviewFrameRef.current?.contentWindow?.print()}
                        style={{ ...progressBtnStyle(), padding: "8px 12px", fontSize: 12 }}
                      >
                        Print / Save PDF
                      </button>
                      <button onClick={() => setExportPreviewOpen(false)} style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontSize: 16 }}>✕</button>
                    </div>
                  </div>
                  <iframe
                    ref={exportPreviewFrameRef}
                    title="Focus Group PDF Preview"
                    srcDoc={exportPreviewHtml}
                    style={{ border: "none", width: "100%", height: "100%", borderRadius: "0 0 14px 14px", background: "#fff" }}
                  />
                </div>
              </div>
            )}

            {snapshotPreviewOpen && (
              <div
                onClick={() => setSnapshotPreviewOpen(false)}
                style={{
                  position: "fixed", inset: 0, zIndex: 1270,
                  background: "rgba(10,10,10,.5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: 20,
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: "min(980px, 100%)", height: "min(90vh, 820px)",
                    background: C.surface, border: `1px solid ${C.line}`,
                    borderRadius: 14, display: "grid", gridTemplateRows: "auto 1fr",
                    boxShadow: "0 20px 60px rgba(0,0,0,.25)",
                  }}
                >
                  <div style={{ padding: 14, borderBottom: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase" }}>
                      Save Snapshot Preview
                    </div>
                    <div style={{ display: "inline-flex", gap: 8 }}>
                      <button
                        onClick={downloadFocusGroupSnapshot}
                        style={{ ...progressBtnStyle(), padding: "8px 12px", fontSize: 12 }}
                      >
                        Download JSON
                      </button>
                      <button onClick={() => setSnapshotPreviewOpen(false)} style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontSize: 16 }}>✕</button>
                    </div>
                  </div>
                  <pre style={{
                    margin: 0, padding: 16, overflow: "auto",
                    background: "#fff", color: C.ink2, fontSize: 12, lineHeight: 1.5,
                    fontFamily: F.mono,
                  }}>
                    {snapshotJson}
                  </pre>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const CONCLUSION_FEEDBACK_KEYS: Record<string, string> = {
  "What Works": "fg:conclusion:whatworks",
  "What Doesn't": "fg:conclusion:whatdoesnt",
  "Opportunities": "fg:conclusion:opportunities",
  "Suggested Tweaks": "fg:conclusion:tweaks",
};

function ConclusionTab({
  insights, avg, risk, aiFeedback, onAiFeedbackPick,
}: {
  insights: SimulationInsights;
  avg: number;
  risk: SimulationResult["risk"];
  aiFeedback?: Record<string, "like" | "dislike">;
  onAiFeedbackPick?: (key: string, choice: "like" | "dislike") => void;
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
        {sections.map((s) => {
          const fbKey = CONCLUSION_FEEDBACK_KEYS[s.title];
          return (
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
              {fbKey && onAiFeedbackPick && (
                <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                  <AiGenFeedback feedbackKey={fbKey} value={aiFeedback?.[fbKey]} onPick={onAiFeedbackPick} />
                </div>
              )}
            </div>
          );
        })}
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
          {onAiFeedbackPick && (
            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
              <AiGenFeedback
                feedbackKey="fg:conclusion:predicted"
                value={aiFeedback?.["fg:conclusion:predicted"]}
                onPick={onAiFeedbackPick}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FocusPersonaCard({
  persona, custom, index, onRemove, aiFeedbackKey, aiFeedback, onAiFeedbackPick,
}: {
  persona: Persona;
  custom: boolean;
  index: number;
  onRemove?: () => void;
  aiFeedbackKey?: string;
  aiFeedback?: "like" | "dislike";
  onAiFeedbackPick?: (key: string, choice: "like" | "dislike") => void;
}) {
  const tone = sentimentColor(persona.sentiment);
  const label = sentimentLabel(persona.sentiment);
  const initials = (persona.name.split(" ").map((s) => s[0]).join("") || "?").slice(0, 2).toUpperCase();
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.line}`,
      borderRadius: 14, padding: 20, position: "relative", overflow: "hidden",
    }}>
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${persona.name}`}
          style={{
            position: "absolute", top: 14, right: 14,
            width: 24, height: 24, borderRadius: 6,
            background: "transparent", border: `1px solid ${C.line}`,
            color: C.faint, cursor: "pointer", fontSize: 13, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
      )}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14, paddingRight: onRemove ? 36 : 0 }}>
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
            {persona.age}
            {persona.gender ? ` · ${persona.gender}` : ""}
            {persona.religion ? ` · ${persona.religion}` : ""}
            {persona.job ? ` · ${persona.job}` : ""}
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
      {aiFeedbackKey && onAiFeedbackPick && (
        <div style={{ borderTop: `1px solid ${C.lineSoft}`, marginTop: 14, paddingTop: 10, display: "flex", justifyContent: "flex-end" }}>
          <AiGenFeedback feedbackKey={aiFeedbackKey} value={aiFeedback} onPick={onAiFeedbackPick} />
        </div>
      )}
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

function DetailChipRow({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div style={{ fontFamily: F.mono, fontSize: 9, color: C.faint, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {items.slice(0, 4).map((item) => (
          <span key={item} style={{ padding: "2px 7px", borderRadius: 999, fontFamily: F.mono, fontSize: 9, color: C.ink2, background: C.lineSoft }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function InfoDot({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Show info"
      style={{
        width: 16, height: 16, borderRadius: 999,
        border: `1px solid ${C.line}`, background: C.bg, color: C.muted,
        fontFamily: F.mono, fontSize: 10, lineHeight: 1,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", padding: 0,
      }}
    >
      i
    </button>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.lineSoft}`, borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontFamily: F.mono, fontSize: 9, color: C.faint, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: C.ink2, lineHeight: 1.4 }}>
        {value || "—"}
      </div>
    </div>
  );
}

function BriefListSection({
  title, items, feedbackKey, feedbackValue, onFeedbackPick,
}: {
  title: string;
  items: string[];
  feedbackKey?: string;
  feedbackValue?: "like" | "dislike";
  onFeedbackPick?: (key: string, choice: "like" | "dislike") => void;
}) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.lineSoft}`, borderRadius: 10, padding: 12 }}>
      <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>
        {title}
      </div>
      {items.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
          {items.map((item, i) => (
            <li key={`${title}-${i}`} style={{ fontSize: 12, color: C.ink2, lineHeight: 1.5 }}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ fontSize: 12, color: C.faint }}>
          No items provided.
        </div>
      )}
      {feedbackKey && onFeedbackPick && (
        <div style={{ borderTop: `1px solid ${C.lineSoft}`, marginTop: 10, paddingTop: 8, display: "flex", justifyContent: "flex-end" }}>
          <AiGenFeedback feedbackKey={feedbackKey} value={feedbackValue} onPick={onFeedbackPick} />
        </div>
      )}
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
  const sorted = [...personas].sort((a, b) => b.sentiment - a.sentiment);
  const positive = sorted[0];
  const negative = sorted[sorted.length - 1];
  const middle = sorted[Math.floor(sorted.length / 2)];

  const introPrompts = [
    "Quick opener: what is your immediate reaction to this campaign?",
    "First pass only: what lands for you, and what feels off?",
    "Before overthinking, what's your gut reaction to this campaign message?",
  ];
  const bridgePrompts = [
    "Let's pressure-test this. What's the biggest friction point for real shoppers?",
    "Now challenge each other: where do you disagree on this campaign?",
    "Zoom into execution: what is one thing this campaign still fails to prove?",
  ];
  const closingPrompts = [
    "Final round: one specific change that would raise your confidence.",
    "Before we wrap: what exact edit would make this campaign work better?",
    "Last call: if the team changes one thing tomorrow, what should it be?",
  ];

  const uniqueIntro = Array.from(new Set(personas.map((p) => p.quote.trim()))).filter(Boolean);
  const rotate = <T,>(arr: T[], start: number) => arr.map((_, i) => arr[(start + i) % arr.length]);
  const speakingOrder = rotate(personas, Math.max(0, (personas[0]?.name.length ?? 0) % personas.length));

  lines.push({
    type: "moderator",
    speaker: "Moderator",
    text: introPrompts[(personas.length + (positive?.name.length ?? 0)) % introPrompts.length],
  });

  speakingOrder.forEach((p, i) => {
    const first = p.name.split(" ")[0];
    const quote = uniqueIntro[i % Math.max(1, uniqueIntro.length)] || p.quote;
    const leadIns = [
      `${first}:`,
      `${first}, jumping in after that:`,
      `${first}, my read is:`,
      `${first}, building on that:`,
    ];
    const leadIn = leadIns[(p.name.length + i + Math.round(p.sentiment)) % leadIns.length];
    lines.push({ type: "persona", speaker: p.name, text: `${leadIn} ${quote}` });
  });

  if (negative && positive && negative.name !== positive.name) {
    lines.push({
      type: "moderator",
      speaker: "Moderator",
      text: bridgePrompts[(negative.name.length + positive.name.length) % bridgePrompts.length],
    });
    lines.push({ type: "persona", speaker: negative.name, text: followUpCritical(negative) });
    lines.push({ type: "persona", speaker: positive.name, text: followUpSupportive(positive, negative) });
    if (middle && middle.name !== negative.name && middle.name !== positive.name) {
      lines.push({ type: "persona", speaker: middle.name, text: followUpMiddle(middle, negative, positive) });
    }
  }

  lines.push({
    type: "moderator",
    speaker: "Moderator",
    text: closingPrompts[(personas.length + (middle?.name.length ?? 0)) % closingPrompts.length],
  });
  const usedClosingBySpeaker = new Map<string, Set<number>>();
  speakingOrder.forEach((p, i) => {
    const used = usedClosingBySpeaker.get(p.name) ?? new Set<number>();
    const text = closingSuggestion(p, i, used);
    usedClosingBySpeaker.set(p.name, used);
    lines.push({ type: "persona", speaker: p.name, text });
  });
  return dedupeTranscriptLines(lines);
}

function followUpCritical(p: Persona): string {
  const trait = p.traits?.[0]?.toLowerCase();
  if (trait) return `Honestly, as someone who's pretty ${trait}, this just doesn't earn my trust. The copy feels designed around me, not for me.`;
  return "Honestly, this doesn't earn my trust. The copy feels designed around me, not for me. There's nothing concrete underneath.";
}
function followUpSupportive(p: Persona, opp: Persona): string {
  const first = opp.name.split(" ")[0];
  return `I get that, ${first}, but I don't think it's all noise. There is a usable core here; they just need sharper proof and less slogan energy.`;
}
function followUpMiddle(p: Persona, negative: Persona, positive: Persona): string {
  const neg = negative.name.split(" ")[0];
  const pos = positive.name.split(" ")[0];
  return `I can see both sides - ${neg}'s trust issue is real, and ${pos} is right that the idea has potential. It needs tighter focus and cleaner evidence.`;
}
function closingSuggestion(p: Persona, turnIdx = 0, used?: Set<number>): string {
  const optionsHigh = [
    "Keep the vibe, but anchor it with one concrete proof point and one clear CTA.",
    "This is close - just swap broad claims for specifics and I'd confidently share it.",
    "Don't over-polish it; keep the voice, add receipts, and this becomes compelling.",
    "This could work fast if they open with one measurable claim and one direct action.",
    "The core is strong; tighten the wording and make the proof impossible to miss.",
  ];
  const optionsMid = [
    "Narrow the message to one promise and back it with visible evidence.",
    "Right now it's split between hype and reassurance - pick one lead message and commit.",
    "Simplify the copy and make the value proposition explicit within the first line.",
    "Trim this down to one clear value statement and remove the extra noise.",
    "Lead with the buyer benefit first, then support it with one specific proof point.",
  ];
  const optionsLow = [
    "Cut the marketing filler and show concrete proof, numbers, or credible references.",
    "Rebuild this around transparency first - what is true, verifiable, and useful to the buyer?",
    "If they want trust, they need specifics: claims, constraints, and real examples.",
    "This needs hard specifics, not vibe language - evidence has to come first.",
    "Right now it sounds generic. Add sources, constraints, and concrete details.",
  ];
  const pool = p.sentiment >= 60 ? optionsHigh : p.sentiment >= 40 ? optionsMid : optionsLow;
  const start = (p.name.length + Math.round(p.sentiment) + turnIdx * 3) % pool.length;
  for (let i = 0; i < pool.length; i += 1) {
    const idx = (start + i) % pool.length;
    if (!used?.has(idx)) {
      used?.add(idx);
      return pool[idx];
    }
  }
  return pool[start];
}

function dedupeTranscriptLines(lines: TranscriptLine[]): TranscriptLine[] {
  const seen = new Set<string>();
  const seenTrigrams = new Set<string>();
  const suffixes = [
    "From a shopper perspective.",
    "That's where credibility shifts.",
    "That would change my decision.",
    "Otherwise it still feels vague.",
    "That's the practical blocker for me.",
    "Without that, this still sounds recycled.",
  ];
  return lines.map((line, i) => {
    if (line.type === "moderator") return line;
    const normalized = line.text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const trigrams = tokens.length >= 3
      ? Array.from({ length: tokens.length - 2 }, (_, t) => `${tokens[t]} ${tokens[t + 1]} ${tokens[t + 2]}`)
      : [normalized];
    const hasNearDuplicate = trigrams.some((t) => seenTrigrams.has(t));
    if (!seen.has(normalized) && !hasNearDuplicate) {
      seen.add(normalized);
      trigrams.forEach((t) => seenTrigrams.add(t));
      return line;
    }
    const prefix = [
      "Another angle:",
      "To make that concrete:",
      "From the buyer side:",
      "If I simplify it:",
    ][i % 4];
    const suffix = suffixes[i % suffixes.length];
    const revised = `${prefix} ${line.text.replace(/\.$/, "")}. ${suffix}`;
    const revisedNorm = revised.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const revisedTokens = revisedNorm.split(/\s+/).filter(Boolean);
    const revisedTrigrams = revisedTokens.length >= 3
      ? Array.from({ length: revisedTokens.length - 2 }, (_, t) => `${revisedTokens[t]} ${revisedTokens[t + 1]} ${revisedTokens[t + 2]}`)
      : [revisedNorm];
    seen.add(revisedNorm);
    revisedTrigrams.forEach((t) => seenTrigrams.add(t));
    return { ...line, text: revised };
  });
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

function AudienceGroupHintPanel() {
  return (
    <div style={{
      border: `1px dashed ${C.line}`,
      borderRadius: 10,
      background: C.bg,
      padding: "10px 12px",
      marginBottom: 2,
    }}>
      <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 6 }}>
        What to include
      </div>
      <div style={{ display: "grid", gap: 6, fontSize: 12, color: C.ink2, lineHeight: 1.45 }}>
        <div><strong>Group name:</strong> generation + mindset + context (e.g. "Price-sensitive Gen Z commuters").</div>
        <div><strong>Summary:</strong> how they react to claims, tone, pricing, and trust signals.</div>
        <div><strong>Traits:</strong> 3 short descriptors, comma-separated (e.g. skeptical, vocal, practical).</div>
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
      <button onClick={onAction} style={progressBtnStyle()}>Go To Simulator</button>
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

function progressBtnStyle(): React.CSSProperties {
  return {
    background: "linear-gradient(135deg, #0A0A0A 0%, #1F2937 100%)",
    color: C.accentInk,
    border: "1px solid #111827",
    padding: "12px 22px",
    borderRadius: 8,
    fontFamily: F.body,
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: ".01em",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    boxShadow: "0 8px 20px rgba(15,23,42,.22)",
  };
}
