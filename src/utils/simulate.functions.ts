import { createServerFn } from "@tanstack/react-start";

export type CampaignPlan = {
  name: string;
  timeline: string;
  keyMessage: string;
  hashtag: string;
  slogan: string;
  targetAudience: string;
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
  name: string;
  archetype: string;
  age: string;
  sentiment: number; // 0-100 positive
  quote: string;
};

export type SimulationSegment = {
  name: "Gen Z" | "Parents" | "Sustainability Advocates";
  sentimentPct: number;
  topReaction: string;
  fix: string;
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
};

export type SimulationResponse =
  | { ok: true; data: SimulationResult }
  | { ok: false; error: string };

const SYSTEM_PROMPT = `You are a senior brand strategist running a synthetic focus group for a marketing campaign.

You will be given a structured campaign plan (name, timeline, key message, hashtag, slogan, target audience, and the actual ad copy). Critique it as if you had just shown it to three audience segments and aggregated their reactions. Be specific to the actual words — never generic feedback.

You MUST call the return_simulation tool. Rules:
- segments: EXACTLY three, in order, with names "Gen Z", "Parents", "Sustainability Advocates". sentimentPct is 0–100 integer. Vague/defensive copy scores low (10–40); specific, transparent, evidence-backed scores high (60–90). topReaction is an in-character quote (~140 chars). fix is one rewrite suggestion (~140 chars).
- personas: 3 invented but realistic individual personas drawn from the target audience. Each has name, archetype (e.g. "Eco-skeptical millennial"), age (range like "28–34"), sentiment 0–100, and quote (~120 chars in their voice).
- tones: 2–4 short adjectives describing the copy's emotional tone.
- risk: LOW / MEDIUM / HIGH. riskScore 0–100 (0 safest, 100 most dangerous) — must agree with risk band: LOW 0–33, MEDIUM 34–66, HIGH 67–100.
- riskRationale: one sentence.
- flags: an array of any field-level problems in the plan. For each problem, set field to one of: name, timeline, keyMessage, hashtag, slogan, targetAudience, copy. severity low/medium/high. issue = short chip label (~6 words). suggestion = detailed fix advice for hover tooltip (~200 chars). fix = ready-to-paste replacement value for that field. Only flag fields that have real risks; skip fields that look fine. If the whole plan is safe, return an empty flags array.
- improvedCopy: a fully rewritten version of the campaign copy that addresses every flag.`;

export const simulateCampaign = createServerFn({ method: "POST" })
  .inputValidator((data: { plan: CampaignPlan }) => {
    if (!data || typeof data !== "object" || !data.plan) {
      throw new Error("plan is required");
    }
    const p = data.plan;
    const fields: FieldKey[] = ["name","timeline","keyMessage","hashtag","slogan","targetAudience","copy"];
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
                          name: { type: "string", enum: ["Gen Z", "Parents", "Sustainability Advocates"] },
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
                          sentiment: { type: "integer", minimum: 0, maximum: 100 },
                          quote: { type: "string" },
                        },
                        required: ["name", "archetype", "age", "sentiment", "quote"],
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
                          field: { type: "string", enum: ["name","timeline","keyMessage","hashtag","slogan","targetAudience","copy"] },
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
                  },
                  required: ["segments","personas","tones","risk","riskScore","riskRationale","flags","improvedCopy"],
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

      const order = ["Gen Z", "Parents", "Sustainability Advocates"] as const;
      const sortedSegments = order
        .map((name) => parsed.segments.find((s) => s.name === name))
        .filter((s): s is SimulationSegment => Boolean(s));
      if (sortedSegments.length !== 3) return { ok: false, error: "Incomplete segments. Try again." };

      return {
        ok: true,
        data: {
          segments: sortedSegments,
          personas: parsed.personas.slice(0, 3),
          tones: parsed.tones.slice(0, 4),
          risk: parsed.risk,
          riskScore: Math.max(0, Math.min(100, parsed.riskScore)),
          riskRationale: parsed.riskRationale,
          flags: parsed.flags ?? [],
          improvedCopy: parsed.improvedCopy ?? "",
        },
      };
    } catch (e) {
      console.error("simulateCampaign failed:", e);
      return { ok: false, error: "Network error. Please try again." };
    }
  });