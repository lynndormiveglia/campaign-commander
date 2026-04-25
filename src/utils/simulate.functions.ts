import { createServerFn } from "@tanstack/react-start";

export type SimulationSegment = {
  name: "Gen Z" | "Parents" | "Sustainability Advocates";
  sentimentPct: number;
  topReaction: string;
  fix: string;
};

export type SimulationResult = {
  segments: SimulationSegment[];
  tones: string[];
  risk: "LOW" | "MEDIUM" | "HIGH";
  riskRationale: string;
};

export type SimulationResponse =
  | { ok: true; data: SimulationResult }
  | { ok: false; error: string };

const SYSTEM_PROMPT = `You are a senior brand strategist running a synthetic focus group for a marketing campaign.

You will be given the raw copy for a marketing campaign. Critique it as if you had just shown it to three audience segments and aggregated their reactions. Be specific to the actual words in the copy — never give generic feedback.

You MUST call the return_simulation tool with your analysis. Rules:
- Always return EXACTLY three segments, in this order, with these exact names: "Gen Z", "Parents", "Sustainability Advocates".
- sentimentPct is the % of that segment that reacts positively (0–100 integer). Vague, defensive, or unsubstantiated copy should score low (10–40). Specific, transparent, evidence-backed copy should score high (60–90).
- topReaction is a short, in-character quote/observation from that segment (max ~140 chars). Reference something concrete about the copy.
- fix is one actionable rewrite suggestion targeted at this segment (max ~140 chars).
- tones: 2–4 short adjectives describing the emotional tone of the copy (e.g. "Defensive", "Vague", "Authentic", "Optimistic", "Corporate", "Confident").
- risk: LOW / MEDIUM / HIGH backlash risk based on how the copy would land publicly.
- riskRationale: one sentence explaining the risk level.`;

export const simulateCampaign = createServerFn({ method: "POST" })
  .inputValidator((data: { campaignText: string }) => {
    if (!data || typeof data.campaignText !== "string") {
      throw new Error("campaignText is required");
    }
    const text = data.campaignText.trim();
    if (text.length < 5) throw new Error("Campaign copy is too short.");
    if (text.length > 4000) throw new Error("Campaign copy is too long.");
    return { campaignText: text };
  })
  .handler(async ({ data }): Promise<SimulationResponse> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "AI is not configured. Please try again later." };
    }

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
            { role: "user", content: `Campaign copy to simulate:\n\n${data.campaignText}` },
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
                      type: "array",
                      minItems: 3,
                      maxItems: 3,
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
                    tones: {
                      type: "array",
                      minItems: 2,
                      maxItems: 4,
                      items: { type: "string" },
                    },
                    risk: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
                    riskRationale: { type: "string" },
                  },
                  required: ["segments", "tones", "risk", "riskRationale"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "return_simulation" } },
        }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          return { ok: false, error: "Too many simulations right now — try again in a moment." };
        }
        if (res.status === 402) {
          return { ok: false, error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." };
        }
        const body = await res.text().catch(() => "");
        console.error("AI gateway error", res.status, body);
        return { ok: false, error: "Couldn't reach the simulator. Please try again." };
      }

      const json = await res.json();
      const toolCall = json?.choices?.[0]?.message?.tool_calls?.[0];
      const argsStr = toolCall?.function?.arguments;
      if (!argsStr) {
        console.error("AI gateway: no tool call in response", JSON.stringify(json).slice(0, 500));
        return { ok: false, error: "The simulator returned an unexpected response. Try again." };
      }

      let parsed: SimulationResult;
      try {
        parsed = JSON.parse(argsStr);
      } catch (e) {
        console.error("AI gateway: tool args not valid JSON", argsStr.slice(0, 500));
        return { ok: false, error: "The simulator returned malformed data. Try again." };
      }

      // Enforce locked segment order
      const order = ["Gen Z", "Parents", "Sustainability Advocates"] as const;
      const sortedSegments = order
        .map((name) => parsed.segments.find((s) => s.name === name))
        .filter((s): s is SimulationSegment => Boolean(s));

      if (sortedSegments.length !== 3) {
        return { ok: false, error: "The simulator returned incomplete segments. Try again." };
      }

      return {
        ok: true,
        data: {
          segments: sortedSegments,
          tones: parsed.tones.slice(0, 4),
          risk: parsed.risk,
          riskRationale: parsed.riskRationale,
        },
      };
    } catch (e) {
      console.error("simulateCampaign failed:", e);
      return { ok: false, error: "Network error. Please try again." };
    }
  });