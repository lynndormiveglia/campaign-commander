import { createServerFn } from "@tanstack/react-start";

export type CampaignPlan = {
  name: string;
  timeline: string;
  keyMessage: string;
  hashtag: string;
  slogan: string;
  targetAudience: string;
  location: string;
  copy: string;
};

export type FieldKey = keyof CampaignPlan;

export type FieldFlag = {
  field: FieldKey;
  severity: "low" | "medium" | "high";
  issue: string;       // short label for the chip
  suggestion: string;  // detailed fix advice (for hover)
  fix: string;         // ready-to-paste replacement value
};

export type Persona = {
  name: string;       // realistic first + last name (e.g. "Zoe Chen")
  archetype: string;  // plain-English lifestyle / mindset descriptor
  age: string;        // generational range (e.g. "Gen Z (18–27)")
  job: string;        // realistic occupation
  traits: string[];   // 3 short adjectives
  sentiment: number;  // 0-100 positive
  quote: string;
};

/* Reference catalog (kept for internal use only — not surfaced to users). */
export const PERSONA_ANCHORS = {
  vals: [
    "Innovators","Thinkers","Achievers","Experiencers",
    "Believers","Strivers","Makers","Survivors",
  ],
  pew: [
    "Progressive Left","Establishment Liberals","Democratic Mainstays","Outsider Left",
    "Stressed Sideliners","Ambivalent Right","Populist Right","Faith and Flag Conservatives",
  ],
  generations: [
    "Gen Alpha","Gen Z","Millennials","Gen X","Boomers","Silent Generation",
  ],
} as const;

export type SimulationSegment = {
  name: string; // broad audience segment label (e.g. "Gen Z Fashion Lovers")
  sentimentPct: number;
  topReaction: string;
  fix: string;
};

export type SimulationInsights = {
  whatWorks: string[];           // 2–4 bullets
  whatDoesnt: string[];          // 2–4 bullets
  opportunities: string[];       // 2–3 bullets
  suggestedTweaks: string[];     // 2–4 bullets
  predictedPerformance: string;  // 1 short paragraph
};

export type SimulationResult = {
  segments: SimulationSegment[];
  personas: Persona[];
  tones: string[];
  risk: "LOW" | "MEDIUM" | "HIGH";
  riskScore: number; // 0-100, used for the meter needle
  riskRationale: string;
  flags: FieldFlag[];
  improvedCopy: string;
  insights: SimulationInsights;
};

export type SimulationResponse =
  | { ok: true; data: SimulationResult }
  | { ok: false; error: string };

const SYSTEM_PROMPT = `You are a senior brand strategist running a synthetic focus group for a marketing campaign. You may rely on standard consumer-segmentation thinking internally, but NEVER surface academic framework names (e.g. "VALS", "Pew typology", "Innovators", "Strivers", "Achievers", "Experiencers", "Believers", "Makers", "Survivors") in any user-facing output field. Use plain English consumers would recognize.

You will be given a structured campaign plan (name, timeline, key message, hashtag, slogan, target audience, location/markets, and the actual ad copy). Use the location/markets to ground regional and cultural assumptions. Critique it as if you had just shown it to three audience segments and aggregated their reactions. Be specific to the actual words — never generic feedback.

You MUST call the return_simulation tool. Rules:
- segments: EXACTLY three audience CATEGORIES (NOT individual people) most relevant to the target audience. Each name is a broad consumer category phrased like "Gen Z Fashion Lovers", "Eco-Curious Millennial Parents", "Skeptical Gen X Professionals" — combine generation, lifestyle and mindset into a plain-English label. sentimentPct is 0–100 integer. Vague/defensive copy scores low (10–40); specific, transparent, evidence-backed scores high (60–90). topReaction is an in-character quote (~140 chars). fix is one rewrite suggestion (~140 chars).
- personas: EXACTLY 3 realistic individual focus-group participants who together represent the target audience. Each persona should feel like a believable real person:
  • name: a realistic first + last name (e.g. "Zoe Chen", "Marcus Webb", "Priya Nair", "Devon Park"). NEVER use category labels.
  • archetype: a plain-English one-line lifestyle/mindset descriptor (e.g. "Status-driven young professional", "Pragmatic budget shopper", "Principled sustainability advocate"). Do NOT use any segmentation-framework terminology.
  • age: generational range like "Gen Z (18–27)" or "Millennials (29–44)".
  • job: a realistic occupation (e.g. "Grad Student", "Sustainability Consultant", "Creative Director").
  • traits: an array of EXACTLY 3 short adjectives describing personality (e.g. ["Practical","Vocal","Skeptical"]).
  • sentiment: 0–100 integer.
  • quote: ~120 chars in their personal voice reacting to the campaign copy. Make the three personas span clearly different sentiment levels (one supportive, one critical, one in-between) so the panel feels like a real focus group.
- tones: 2–4 short adjectives describing the copy's emotional tone.
- risk: LOW / MEDIUM / HIGH. riskScore 0–100 (0 safest, 100 most dangerous) — must agree with risk band: LOW 0–33, MEDIUM 34–66, HIGH 67–100.
- riskRationale: one sentence.
- flags: an array of any field-level problems in the plan. For each problem, set field to one of: name, timeline, keyMessage, hashtag, slogan, targetAudience, location, copy. severity low/medium/high. issue = short chip label (~6 words). suggestion = detailed fix advice for hover tooltip (~200 chars). fix = ready-to-paste replacement value for that field. Only flag fields that have real risks; skip fields that look fine. If the whole plan is safe, return an empty flags array.
- improvedCopy: a fully rewritten version of the campaign copy that addresses every flag.
- insights: an object summarizing the focus group's verdict in plain English. Treat each bullet as a short, high-signal observation (~140 chars max), not a full essay.
  • whatWorks: 2–4 bullet sentences highlighting what the campaign actually does well.
  • whatDoesnt: 2–4 bullet sentences identifying what falls flat or risks backlash.
  • opportunities: 2–3 bullet sentences with untapped angles or insights the campaign could lean into.
  • suggestedTweaks: 2–4 bullet sentences with specific, tactical changes (concrete edits, not generic advice).
  • predictedPerformance: a single short paragraph (~3 sentences) predicting how this campaign would actually perform once it ships — engagement quality, sentiment skew, likely community response.`;

export const simulateCampaign = createServerFn({ method: "POST" })
  .inputValidator((data: { plan: CampaignPlan }) => {
    if (!data || typeof data !== "object" || !data.plan) {
      throw new Error("plan is required");
    }
    const p = data.plan;
    const fields: FieldKey[] = ["name","timeline","keyMessage","hashtag","slogan","targetAudience","location","copy"];
    const clean = {} as CampaignPlan;
    for (const f of fields) {
      const v = typeof p[f] === "string" ? p[f].trim() : "";
      if (v.length > 1000) throw new Error(`${f} is too long.`);
      clean[f] = v;
    }
    if (clean.copy.length < 5) throw new Error("Campaign copy is too short.");
    return { plan: clean };
  })
  .handler(async ({ data }): Promise<SimulationResponse> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "AI is not configured. Please try again later." };
    }

    const userMsg = `Campaign plan to simulate:

Name: ${data.plan.name || "(blank)"}
Timeline: ${data.plan.timeline || "(blank)"}
Key Message: ${data.plan.keyMessage || "(blank)"}
Hashtag: ${data.plan.hashtag || "(blank)"}
Slogan: ${data.plan.slogan || "(blank)"}
Target Audience: ${data.plan.targetAudience || "(blank)"}
Location / Markets: ${data.plan.location || "(blank)"}

Campaign Copy:
${data.plan.copy}`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMsg },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_simulation",
                description: "Return the simulated audience reaction.",
                parameters: {
                  type: "object",
                  properties: {
                    segments: {
                      type: "array", minItems: 3, maxItems: 3,
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          sentimentPct: { type: "integer", minimum: 0, maximum: 100 },
                          topReaction: { type: "string" },
                          fix: { type: "string" },
                        },
                        required: ["name", "sentimentPct", "topReaction", "fix"],
                        additionalProperties: false,
                      },
                    },
                    personas: {
                      type: "array", minItems: 3, maxItems: 3,
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          archetype: { type: "string" },
                          age: { type: "string" },
                          job: { type: "string" },
                          traits: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
                          sentiment: { type: "integer", minimum: 0, maximum: 100 },
                          quote: { type: "string" },
                        },
                        required: ["name", "archetype", "age", "job", "traits", "sentiment", "quote"],
                        additionalProperties: false,
                      },
                    },
                    tones: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
                    risk: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
                    riskScore: { type: "integer", minimum: 0, maximum: 100 },
                    riskRationale: { type: "string" },
                    flags: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          field: { type: "string", enum: ["name","timeline","keyMessage","hashtag","slogan","targetAudience","location","copy"] },
                          severity: { type: "string", enum: ["low","medium","high"] },
                          issue: { type: "string" },
                          suggestion: { type: "string" },
                          fix: { type: "string" },
                        },
                        required: ["field","severity","issue","suggestion","fix"],
                        additionalProperties: false,
                      },
                    },
                    improvedCopy: { type: "string" },
                    insights: {
                      type: "object",
                      properties: {
                        whatWorks:            { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
                        whatDoesnt:           { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
                        opportunities:        { type: "array", minItems: 2, maxItems: 3, items: { type: "string" } },
                        suggestedTweaks:      { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
                        predictedPerformance: { type: "string" },
                      },
                      required: ["whatWorks","whatDoesnt","opportunities","suggestedTweaks","predictedPerformance"],
                      additionalProperties: false,
                    },
                  },
                  required: ["segments","personas","tones","risk","riskScore","riskRationale","flags","improvedCopy","insights"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "return_simulation" } },
        }),
      });

      if (!res.ok) {
        if (res.status === 429) return { ok: false, error: "Too many simulations right now — try again in a moment." };
        if (res.status === 402) return { ok: false, error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." };
        const body = await res.text().catch(() => "");
        console.error("AI gateway error", res.status, body);
        return { ok: false, error: "Couldn't reach the simulator. Please try again." };
      }

      const json = await res.json();
      const argsStr = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!argsStr) {
        console.error("AI gateway: no tool call", JSON.stringify(json).slice(0, 500));
        return { ok: false, error: "The simulator returned an unexpected response. Try again." };
      }

      let parsed: SimulationResult;
      try { parsed = JSON.parse(argsStr); }
      catch { return { ok: false, error: "The simulator returned malformed data. Try again." }; }

      const sortedSegments = (parsed.segments ?? []).slice(0, 3);
      if (sortedSegments.length !== 3) return { ok: false, error: "Incomplete segments. Try again." };

      const cleanedPersonas: Persona[] = (parsed.personas ?? []).slice(0, 3).map((p) => ({
        name: p.name ?? "",
        archetype: p.archetype ?? "",
        age: p.age ?? "",
        job: (p as Persona).job ?? "",
        traits: Array.isArray((p as Persona).traits) ? (p as Persona).traits.slice(0, 3) : [],
        sentiment: Math.max(0, Math.min(100, p.sentiment ?? 50)),
        quote: p.quote ?? "",
      }));

      const rawInsights = (parsed as { insights?: Partial<SimulationInsights> }).insights ?? {};
      const cleanedInsights: SimulationInsights = {
        whatWorks:            Array.isArray(rawInsights.whatWorks)       ? rawInsights.whatWorks.slice(0, 4)       : [],
        whatDoesnt:           Array.isArray(rawInsights.whatDoesnt)      ? rawInsights.whatDoesnt.slice(0, 4)      : [],
        opportunities:        Array.isArray(rawInsights.opportunities)   ? rawInsights.opportunities.slice(0, 3)   : [],
        suggestedTweaks:      Array.isArray(rawInsights.suggestedTweaks) ? rawInsights.suggestedTweaks.slice(0, 4) : [],
        predictedPerformance: typeof rawInsights.predictedPerformance === "string" ? rawInsights.predictedPerformance : "",
      };

      return {
        ok: true,
        data: {
          segments: sortedSegments,
          personas: cleanedPersonas,
          tones: parsed.tones.slice(0, 4),
          risk: parsed.risk,
          riskScore: Math.max(0, Math.min(100, parsed.riskScore)),
          riskRationale: parsed.riskRationale,
          flags: parsed.flags ?? [],
          improvedCopy: parsed.improvedCopy ?? "",
          insights: cleanedInsights,
        },
      };
    } catch (e) {
      console.error("simulateCampaign failed:", e);
      return { ok: false, error: "Network error. Please try again." };
    }
  });

/* ===========================================================
   Custom persona scoring — free-form audience description
   =========================================================== */
export type PersonaScoreResponse =
  | { ok: true; persona: Persona }
  | { ok: false; error: string };

const PERSONA_SYSTEM = `You are a consumer-research analyst. Given a free-form description of a target audience and the campaign copy, produce a synthetic AUDIENCE TAG (a broad consumer group, NOT a single named individual) that captures who the marketer described.

NEVER surface academic framework names (e.g. "VALS", "Pew typology", "Innovators", "Strivers", "Achievers") in any output field — use plain English a marketer would recognize.

You MUST call the return_persona tool with:
- name: a broad audience-tag label, NOT a person's first/last name. Examples: "Eco-Critical Gen Z Shoppers", "Pragmatic Millennial Parents", "Status-Driven Suburban Strivers", "Skeptical Gen X Professionals". Build it from generation + lifestyle + mindset cues you infer from the description.
- archetype: a plain-English one-line lifestyle/mindset descriptor for this group (e.g. "Principled sustainability advocates", "Budget-driven seasonal shoppers"). No framework jargon.
- age: generational range like "Millennials (29–44)" (inferred from description).
- job: a representative lifestyle/occupation phrase for this group (e.g. "Students & young creatives", "Corporate parents", "Service workers"). If it doesn't apply, return an empty string.
- traits: an array of EXACTLY 3 short adjectives describing this group's collective personality (e.g. ["Vocal","Skeptical","Trend-driven"]).
- sentiment: integer 0–100 (the group's predicted positive sentiment toward the campaign copy).
- quote: ~120 chars in this group's collective voice reacting to the copy. Phrase it as if a representative member of the group is speaking ("we" or first-person plural is fine).`;

export const scorePersona = createServerFn({ method: "POST" })
  .inputValidator((data: { description: string; copy: string }) => {
    if (!data) throw new Error("description is required");
    const description = String(data.description ?? "").trim();
    if (description.length < 3) throw new Error("Persona description is too short.");
    return {
      description: description.slice(0, 1000),
      copy: String(data.copy ?? "").trim().slice(0, 2000),
    };
  })
  .handler(async ({ data }): Promise<PersonaScoreResponse> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false, error: "AI is not configured. Please try again later." };

    const userMsg = `Persona description (free-form, written by the marketer):
${data.description}

Campaign copy to react to:
${data.copy || "(no copy provided)"}`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: PERSONA_SYSTEM },
            { role: "user", content: userMsg },
          ],
          tools: [{
            type: "function",
            function: {
              name: "return_persona",
              description: "Return the synthetic persona reaction.",
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  archetype: { type: "string" },
                  age: { type: "string" },
                  job: { type: "string" },
                  traits: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
                  sentiment: { type: "integer", minimum: 0, maximum: 100 },
                  quote: { type: "string" },
                },
                required: ["name","archetype","age","job","traits","sentiment","quote"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "return_persona" } },
        }),
      });
      if (!res.ok) {
        if (res.status === 429) return { ok: false, error: "Too many requests — try again in a moment." };
        if (res.status === 402) return { ok: false, error: "AI credits exhausted." };
        return { ok: false, error: "Couldn't reach the analyzer. Please try again." };
      }
      const json = await res.json();
      const argsStr = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!argsStr) return { ok: false, error: "Unexpected response. Try again." };
      const raw = JSON.parse(argsStr) as Partial<Persona>;
      const persona: Persona = {
        name: raw.name ?? "",
        archetype: raw.archetype ?? "",
        age: raw.age ?? "",
        job: raw.job ?? "",
        traits: Array.isArray(raw.traits) ? raw.traits.slice(0, 3) : [],
        sentiment: Math.max(0, Math.min(100, raw.sentiment ?? 50)),
        quote: raw.quote ?? "",
      };
      return { ok: true, persona };
    } catch (e) {
      console.error("scorePersona failed:", e);
      return { ok: false, error: "Network error. Please try again." };
    }
  });