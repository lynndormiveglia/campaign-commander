import { useState, useEffect, Fragment } from "react";
import { useServerFn } from "@tanstack/react-start";
import { simulateCampaign, type SimulationResult } from "@/utils/simulate.functions";

type Comment = { id: number; user: string; text: string; type: "negative" | "neutral" };

const COMMENTS: Comment[] = [
  { id: 1, user: "@_realconsumer · 2m ago", text: '"This feels like greenwashing. Zero specifics, just vibes. 🙄"', type: "negative" },
  { id: 2, user: "@sustainableskeptic · 5m ago", text: '"Who is this even for? The vagueness is insulting."', type: "negative" },
  { id: 3, user: "@climate_watchdog · 11m ago", text: '"Another brand pretending to care without showing any proof."', type: "negative" },
  { id: 4, user: "@shoppingmaybe · 18m ago", text: '"What does \'most sustainable\' even mean? Compared to what?"', type: "neutral" },
  { id: 5, user: "@ethicswatch · 24m ago", text: '"No certifications. No data. Just marketing copy. Pass."', type: "negative" },
];

type Segment = {
  id: number; icon: string; iconBg: string; name: string;
  pct: number; level: "low" | "mid" | "high";
  reaction: string; fix: string;
};

const SEGMENT_META: Record<string, { icon: string; iconBg: string }> = {
  "Gen Z": { icon: "🧑‍💻", iconBg: "#FEF9C3" },
  "Parents": { icon: "👨‍👩‍👧", iconBg: "#E0F2FE" },
  "Sustainability Advocates": { icon: "🌿", iconBg: "#DCFCE7" },
};

const pctToLevel = (pct: number): Segment["level"] =>
  pct >= 60 ? "high" : pct >= 45 ? "mid" : "low";

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

const S = {
  blue: "#2563EB", blueLight: "#3B82F6", bluePale: "#EFF6FF",
  indigo: "#4F46E5", red: "#EF4444", redPale: "#FEF2F2",
  green: "#10B981", greenPale: "#ECFDF5", amber: "#F59E0B",
  g50: "#F8FAFC", g100: "#F1F5F9", g200: "#E2E8F0", g300: "#CBD5E1",
  g400: "#94A3B8", g500: "#64748B", g700: "#334155", g900: "#0F172A",
};

const fillColor = (level: Segment["level"]) =>
  level === "low" ? S.red : level === "mid" ? S.amber : S.green;

export default function CampaignSimulator() {
  const [screen, setScreen] = useState(1);
  const [chaos, setChaos] = useState(false);
  const [visibleComments, setVisibleComments] = useState<number[]>([]);
  const [simulating, setSimulating] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showSegments, setShowSegments] = useState<number[]>([]);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showNextBtn, setShowNextBtn] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [campaignText, setCampaignText] = useState(
    '"Our Most Sustainable Product Yet." — We\'re committed to a greener future. Shop our newest collection and join the movement.'
  );
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

  const runSimulation = async () => {
    setSimulating(true);
    setShowResults(false);
    setShowSegments([]);
    setShowAnalysis(false);
    setShowNextBtn(false);
    setSimError(null);

    try {
      const response = await simulateFn({ data: { campaignText } });
      if (!response.ok) {
        setSimError(response.error);
        setSimulating(false);
        return;
      }
      setSimResult(response.data);
      setSimulating(false);
      setShowResults(true);
      response.data.segments.forEach((_, i) => {
        setTimeout(() => setShowSegments((prev) => [...prev, i]), 100 + i * 160);
      });
      setTimeout(() => setShowAnalysis(true), 600);
      setTimeout(() => setShowNextBtn(true), 1000);
    } catch (e) {
      console.error(e);
      setSimError("Something went wrong. Please try again.");
      setSimulating(false);
    }
  };

  const navSteps = ["Launch", "Crisis", "Simulate", "Results"];

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: S.g50, minHeight: "100vh", color: S.g900 }}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes ciq-fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ciq-pulse { 0%,100%{opacity:1} 50%{opacity:.6} }
        @keyframes loadDot { 0%,80%,100%{opacity:.2;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }
        .ciq .dot1{animation:loadDot 1.2s ease-in-out infinite}
        .ciq .dot2{animation:loadDot 1.2s ease-in-out .2s infinite}
        .ciq .dot3{animation:loadDot 1.2s ease-in-out .4s infinite}
        .ciq .fadeIn{animation:ciq-fadeIn .4s ease forwards}
        .ciq .pulseBadge{animation:ciq-pulse 1.4s ease-in-out infinite}
        .ciq textarea:focus{outline:none; border-color:${S.blue} !important}
        .ciq button{transition:all .2s}
        .ciq button:hover:not(:disabled){filter:brightness(1.05)}
      `}</style>

      <div className="ciq">
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(255,255,255,0.93)", backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${S.g200}`,
        padding: "0 28px", height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ fontFamily: "Syne, sans-serif", fontSize: 17, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
          CampaignIQ
          <span style={{ background: S.blue, color: "#fff", padding: "2px 8px", borderRadius: 5, fontSize: 12 }}>DEMO</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {navSteps.map((label, i) => (
            <button key={label} onClick={() => goTo(i + 1)} style={{
              padding: "5px 14px", borderRadius: 20, border: "none",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
              background: screen === i + 1 ? S.blue : "transparent",
              color: screen === i + 1 ? "#fff" : S.g400,
            }}>{label}</button>
          ))}
        </div>
      </nav>

      <div style={{ paddingTop: 56 }}>

        {screen === 1 && (
          <div style={{ background: "#fff", minHeight: "calc(100vh - 56px)" }}>
            <div style={{ maxWidth: 1060, margin: "0 auto", padding: "48px 28px", display: "grid", gridTemplateColumns: "1fr 400px", gap: 36, alignItems: "start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: S.blue, marginBottom: 12 }}>
                  <span style={{ width: 6, height: 6, background: S.blue, borderRadius: "50%", display: "inline-block", animation: "blink 1.4s ease-in-out infinite" }} />
                  Campaign Preview
                </div>
                <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: 40, fontWeight: 800, lineHeight: 1.1, marginBottom: 10 }}>Ready to go live?</h1>
                <p style={{ fontSize: 15, color: S.g500, lineHeight: 1.6, marginBottom: 32 }}>Your campaign has been approved. Review the final creative before launching to 2.4M subscribers.</p>

                <div style={{ border: `1.5px solid ${S.g200}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,.06)" }}>
                  <div style={{ height: 240, background: "linear-gradient(135deg,#E0F2FE,#DBEAFE,#E0E7FF)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(45deg,rgba(37,99,235,.04) 0px,rgba(37,99,235,.04) 1px,transparent 1px,transparent 24px)" }} />
                    <div style={{ textAlign: "center", zIndex: 1 }}>
                      <div style={{ width: 60, height: 60, background: "rgba(255,255,255,.7)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", fontSize: 26, backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.8)" }}>🌱</div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: S.g500 }}>Product Image Placeholder</div>
                    </div>
                  </div>
                  <div style={{ padding: 24 }}>
                    <span style={{ display: "inline-block", fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: S.green, background: S.greenPale, borderRadius: 4, padding: "3px 8px", marginBottom: 12 }}>Sustainability Campaign</span>
                    <div style={{ fontFamily: "Syne, sans-serif", fontSize: 21, fontWeight: 700, lineHeight: 1.3, marginBottom: 8 }}>"Our Most Sustainable Product Yet."</div>
                    <div style={{ fontSize: 14, color: S.g500, marginBottom: 20, lineHeight: 1.6 }}>We're committed to a greener future. Shop our newest collection and join the movement.</div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button style={{ background: S.g900, color: "#fff", border: "none", padding: "11px 26px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Buy Now</button>
                      <button style={{ background: S.g100, border: "none", padding: "11px 14px", borderRadius: 8, fontSize: 14, cursor: "pointer", color: S.g500 }}>↗ Share</button>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ background: S.g900, borderRadius: 16, padding: 28, color: "#fff", textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.45)", marginBottom: 20 }}>Scheduled Launch</div>
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", gap: 10, marginBottom: 24 }}>
                    {countdown.map((val, i) => (
                      <Fragment key={i}>
                        {i > 0 && <div style={{ fontFamily: "Syne, sans-serif", fontSize: 36, fontWeight: 800, color: "rgba(255,255,255,.25)", marginTop: 6 }}>:</div>}
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontFamily: "Syne, sans-serif", fontSize: 40, fontWeight: 800, background: "rgba(255,255,255,.08)", borderRadius: 10, padding: "7px 11px", minWidth: 60, lineHeight: 1 }}>{val}</div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)", marginTop: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>{["hours","min","sec"][i]}</div>
                        </div>
                      </Fragment>
                    ))}
                  </div>
                  <button onClick={launchCampaign} style={{
                    width: "100%", background: S.blue, color: "#fff", border: "none",
                    padding: 16, borderRadius: 12, fontFamily: "Syne, sans-serif",
                    fontSize: 17, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}>Launch Campaign →</button>
                </div>
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "14px 16px", display: "flex", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>⚠️</span>
                  <div style={{ fontSize: 13, color: "#92400E", lineHeight: 1.5 }}><strong>No pre-testing detected.</strong> This campaign has not been simulated against audience segments. Launch at your own risk.</div>
                </div>
              </div>
            </div>

            {chaos && (
              <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(15,23,42,.96)", overflowY: "auto", animation: "ciq-fadeIn .3s ease" }}>
                <div style={{ maxWidth: 720, margin: "0 auto", padding: "52px 24px" }}>
                  <div style={{ textAlign: "center", marginBottom: 36 }}>
                    <div style={{ fontFamily: "Syne, sans-serif", fontSize: 32, fontWeight: 800, color: "#fff", marginBottom: 8 }}>🔴 Campaign is Live</div>
                    <div style={{ fontSize: 14, color: "rgba(255,255,255,.45)" }}>Real-time reaction feed — first 4 hours</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                    {[
                      { label: "Engagement Rate", val: "1.2%", color: "#FCA5A5" },
                      { label: "Sentiment Score", val: "38% positive", color: "#FCD34D" },
                    ].map((s) => (
                      <div key={s.label} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: 20 }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>{s.label}</div>
                        <div style={{ fontFamily: "Syne, sans-serif", fontSize: 28, fontWeight: 800, color: s.color }}>{s.val}</div>
                      </div>
                    ))}
                    <div style={{ gridColumn: "span 2", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Backlash Risk</div>
                      <span className="pulseBadge" style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        background: "rgba(239,68,68,.2)", border: "1px solid rgba(239,68,68,.4)",
                        color: "#FCA5A5", fontSize: 13, fontWeight: 600,
                        padding: "6px 14px", borderRadius: 6,
                      }}>● HIGH — Escalating</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                    {COMMENTS.map((c) => (
                      <div key={c.id} style={{
                        background: "rgba(255,255,255,.05)",
                        borderLeft: `3px solid ${c.type === "neutral" ? S.amber : S.red}`,
                        borderRadius: "0 10px 10px 0", padding: "14px 16px",
                        transition: "all .4s",
                        opacity: visibleComments.includes(c.id) ? 1 : 0,
                        transform: visibleComments.includes(c.id) ? "translateX(0)" : "translateX(-20px)",
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.4)", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>{c.user}</div>
                        <div style={{ fontSize: 14, color: "rgba(255,255,255,.85)", lineHeight: 1.5 }}>{c.text}</div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => goTo(2)} style={{
                    width: "100%", background: "#fff", color: S.g900,
                    border: "none", padding: 16, borderRadius: 12,
                    fontFamily: "Syne, sans-serif", fontSize: 16, fontWeight: 700, cursor: "pointer",
                  }}>See the Cost of This Mistake →</button>
                </div>
              </div>
            )}
          </div>
        )}

        {screen === 2 && (
          <div style={{ background: "#fff", minHeight: "calc(100vh - 56px)" }}>
            <div style={{ maxWidth: 820, margin: "0 auto", padding: "64px 28px", textAlign: "center" }} className="fadeIn">
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: S.red, marginBottom: 20 }}>📰 Media Coverage — 72 Hours Later</div>
              <div style={{ background: S.redPale, border: "1px solid #FECACA", borderRadius: 12, padding: "28px 32px", marginBottom: 48, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -14, left: 14, fontSize: 90, color: "#FECACA", fontFamily: "Georgia, serif", lineHeight: 1, userSelect: "none" }}>"</div>
                <div style={{ fontFamily: "Syne, sans-serif", fontSize: 22, fontWeight: 700, color: S.red, position: "relative", zIndex: 1 }}>Brand Faces Backlash After Tone-Deaf Sustainability Campaign</div>
                <div style={{ fontSize: 12, color: S.g400, marginTop: 8 }}>— TechCrunch, The Guardian, AdAge & 47 others</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 52 }}>
                {[
                  { icon: "💸", label: "Estimated PR Crisis Cost", val: "$2.3M", desc: "Agency response, retraction spend & ad pull" },
                  { icon: "📉", label: "Brand Trust Drop", val: "−18%", desc: "Consumer trust score (YouGov, post-campaign)" },
                ].map((c) => (
                  <div key={c.label} style={{ border: `1.5px solid ${S.g200}`, borderRadius: 16, padding: "28px 22px", textAlign: "left", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: S.red }} />
                    <div style={{ fontSize: 28, marginBottom: 16 }}>{c.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: S.g400, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>{c.label}</div>
                    <div style={{ fontFamily: "Syne, sans-serif", fontSize: 40, fontWeight: 800, color: S.red, lineHeight: 1 }}>{c.val}</div>
                    <div style={{ fontSize: 13, color: S.g400, marginTop: 8 }}>{c.desc}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => goTo(3)} style={{
                background: S.g900, color: "#fff", border: "none",
                padding: "17px 36px", borderRadius: 12,
                fontFamily: "Syne, sans-serif", fontSize: 16, fontWeight: 700, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 10,
              }}>✦ What if we tested this first?</button>
            </div>
          </div>
        )}

        {screen === 3 && (
          <div style={{ background: S.g50, minHeight: "calc(100vh - 56px)" }}>
            <div style={{ maxWidth: 1020, margin: "0 auto", padding: "48px 28px" }} className="fadeIn">
              <div style={{ marginBottom: 36 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: S.blue, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, background: S.blue, borderRadius: "50%", display: "inline-block", animation: "blink 1.4s ease-in-out infinite" }} />
                  AI Pre-Testing Engine
                </div>
                <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: 34, fontWeight: 800, marginBottom: 8 }}>Simulate Before You Launch</h2>
                <p style={{ fontSize: 15, color: S.g500 }}>Paste your campaign copy below. Our engine stress-tests it across real audience segments in seconds.</p>
              </div>

              <div style={{ background: "#fff", border: `1.5px solid ${S.g200}`, borderRadius: 16, padding: 28, marginBottom: 24, boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: S.g700, marginBottom: 10, textTransform: "uppercase", letterSpacing: ".07em" }}>Campaign Copy</div>
                <textarea
                  value={campaignText}
                  onChange={(e) => setCampaignText(e.target.value)}
                  rows={4}
                  style={{
                    width: "100%", border: `1.5px solid ${S.g200}`, borderRadius: 10,
                    padding: "13px 15px", fontFamily: "DM Sans, sans-serif",
                    fontSize: 15, color: S.g900, lineHeight: 1.6, resize: "none",
                    background: S.g50,
                  }}
                />
                <button onClick={runSimulation} disabled={simulating} style={{
                  marginTop: 14, background: simulating ? S.g400 : S.blue, color: "#fff",
                  border: "none", padding: "13px 26px", borderRadius: 10,
                  fontFamily: "DM Sans, sans-serif", fontSize: 15, fontWeight: 600,
                  cursor: simulating ? "default" : "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  {simulating ? (
                    <>Simulating <span className="dot1" style={{ display: "inline-block" }}>●</span><span className="dot2" style={{ display: "inline-block" }}>●</span><span className="dot3" style={{ display: "inline-block" }}>●</span></>
                  ) : "⚡ Simulate Audience Reaction"}
                </button>
              </div>

              {showResults && (
                <div className="fadeIn">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 20 }}>
                    {SEGMENTS.map((seg, i) => (
                      <div key={seg.id} style={{
                        background: "#fff", border: `1.5px solid ${S.g200}`, borderRadius: 14, padding: 22,
                        opacity: showSegments.includes(i) ? 1 : 0,
                        transform: showSegments.includes(i) ? "translateY(0)" : "translateY(16px)",
                        transition: "all .4s",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: seg.iconBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{seg.icon}</div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{seg.name}</div>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 500, color: S.g400, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>Sentiment</div>
                        <div style={{ height: 6, background: S.g100, borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
                          <div style={{ height: "100%", borderRadius: 4, background: fillColor(seg.level), width: `${seg.pct}%`, transition: "width 1s ease" }} />
                        </div>
                        <div style={{ fontFamily: "Syne, sans-serif", fontSize: 22, fontWeight: 800, marginBottom: 14 }}>{seg.pct}% positive</div>
                        <div style={{ background: S.g50, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: S.g700, marginBottom: 10, lineHeight: 1.5 }}>⚡ <strong>Top Reaction:</strong> {seg.reaction}</div>
                        <div style={{ background: S.bluePale, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: S.blue, fontWeight: 500, lineHeight: 1.5 }}>→ {seg.fix}</div>
                      </div>
                    ))}
                  </div>

                  {showAnalysis && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }} className="fadeIn">
                      <div style={{ background: "#fff", border: `1.5px solid ${S.g200}`, borderRadius: 14, padding: 22 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: S.g500, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 16 }}>Emotional Tone Analysis</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                          {[
                            { label: "Optimistic", color: "#92400E", bg: "#FFFBEB" },
                            { label: "Defensive", color: "#991B1B", bg: "#FEF2F2" },
                            { label: "Corporate", color: S.g700, bg: S.g100 },
                            { label: "Vague", color: "#991B1B", bg: "#FEF2F2" },
                          ].map((t) => (
                            <span key={t.label} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, background: t.bg, color: t.color }}>{t.label}</span>
                          ))}
                        </div>
                        <p style={{ fontSize: 13, color: S.g500, lineHeight: 1.6 }}>Your tone skews corporate and defensive. It's likely to trigger skepticism rather than inspire action.</p>
                      </div>
                      <div style={{ background: "#fff", border: `1.5px solid ${S.g200}`, borderRadius: 14, padding: 22 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: S.g500, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 16 }}>Backlash Risk Meter</div>
                        <div style={{ height: 10, background: S.g100, borderRadius: 6, overflow: "hidden", marginBottom: 10 }}>
                          <div style={{ height: "100%", background: `linear-gradient(90deg,${S.green},${S.amber},${S.red})`, width: "100%", borderRadius: 6 }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: S.g400, fontWeight: 500 }}>
                          <span>Low</span><span>Medium</span><span>High</span>
                        </div>
                        <div style={{ fontFamily: "Syne, sans-serif", fontSize: 20, fontWeight: 800, color: S.red, marginTop: 14 }}>⬤ HIGH RISK</div>
                        <p style={{ fontSize: 13, color: S.g500, marginTop: 10, lineHeight: 1.6 }}>Apply the suggested fixes to drop risk from HIGH → MEDIUM or lower.</p>
                      </div>
                    </div>
                  )}

                  {showNextBtn && (
                    <button onClick={() => goTo(4)} className="fadeIn" style={{
                      background: S.blue, color: "#fff", border: "none",
                      padding: "15px 30px", borderRadius: 12,
                      fontFamily: "Syne, sans-serif", fontSize: 16, fontWeight: 700, cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: 8,
                    }}>See the Improved Campaign ✦</button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {screen === 4 && (
          <div style={{ background: "#fff", minHeight: "calc(100vh - 56px)" }}>
            <div style={{ maxWidth: 1020, margin: "0 auto", padding: "48px 28px" }} className="fadeIn">
              <div style={{ textAlign: "center", marginBottom: 36 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: S.blue, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, background: S.blue, borderRadius: "50%", display: "inline-block" }} />
                  After AI Optimization
                </div>
                <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: 34, fontWeight: 800, marginBottom: 8 }}>Your Revised Campaign</h2>
                <p style={{ fontSize: 15, color: S.g500 }}>Updated copy with verified claims, transparent sourcing, and segment-tuned language.</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 36 }}>
                {[
                  {
                    header: "✕ Before — Original Copy",
                    headerBg: S.redPale, headerColor: S.red, borderColor: "#FECACA",
                    copy: '"Our Most Sustainable Product Yet." — We\'re committed to a greener future. Shop our newest collection and join the movement.',
                    stats: [
                      { label: "Engagement Rate", val: "1.2%", color: S.red },
                      { label: "Sentiment", val: "38% positive", color: S.red },
                    ],
                    riskLabel: "HIGH", riskBg: "#FEE2E2", riskColor: S.red,
                  },
                  {
                    header: "✓ After — Optimized Copy",
                    headerBg: S.greenPale, headerColor: S.green, borderColor: "#A7F3D0",
                    copy: '"Built with 87% verified recycled materials, certified by XYZ Institute. Our sourcing is fully transparent — see the breakdown below. Because \'sustainable\' should mean something."',
                    stats: [
                      { label: "Engagement Rate", val: "4.8%", color: S.green },
                      { label: "Sentiment", val: "76% positive", color: S.green },
                    ],
                    riskLabel: "LOW", riskBg: S.greenPale, riskColor: S.green,
                  },
                ].map((c) => (
                  <div key={c.header} style={{ border: `1.5px solid ${c.borderColor}`, borderRadius: 16, overflow: "hidden" }}>
                    <div style={{ padding: "15px 22px", background: c.headerBg, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", color: c.headerColor }}>{c.header}</div>
                    <div style={{ padding: 22, background: "#fff" }}>
                      <div style={{ fontSize: 14, color: S.g700, lineHeight: 1.7, fontStyle: "italic", marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${S.g100}` }}>{c.copy}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {c.stats.map((s) => (
                          <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 13, color: S.g500 }}>{s.label}</span>
                            <span style={{ fontFamily: "Syne, sans-serif", fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}</span>
                          </div>
                        ))}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 13, color: S.g500 }}>Backlash Risk</span>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 20, letterSpacing: ".06em", textTransform: "uppercase", background: c.riskBg, color: c.riskColor }}>{c.riskLabel}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                background: S.g900, borderRadius: 20, padding: "64px 32px", textAlign: "center",
                position: "relative", overflow: "hidden",
              }}>
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 30% 50%,rgba(37,99,235,.28) 0%,transparent 60%),radial-gradient(ellipse at 70% 50%,rgba(79,70,229,.2) 0%,transparent 60%)" }} />
                <div style={{ fontFamily: "Syne, sans-serif", fontSize: 52, fontWeight: 800, color: "#fff", lineHeight: 1.1, marginBottom: 14, position: "relative", zIndex: 1 }}>
                  Don't guess.<br /><span style={{ color: S.blueLight }}>Simulate.</span>
                </div>
                <div style={{ fontSize: 16, color: "rgba(255,255,255,.5)", marginBottom: 36, position: "relative", zIndex: 1 }}>
                  CampaignIQ pre-tests your message across 20+ audience segments before a single dollar is spent.
                </div>
                <button onClick={() => goTo(1)} style={{
                  background: S.blue, color: "#fff", border: "none",
                  padding: "15px 40px", borderRadius: 12,
                  fontFamily: "Syne, sans-serif", fontSize: 16, fontWeight: 700,
                  cursor: "pointer", position: "relative", zIndex: 1,
                }}>Start Over →</button>
              </div>
            </div>
          </div>
        )}

      </div>
      </div>
    </div>
  );
}
