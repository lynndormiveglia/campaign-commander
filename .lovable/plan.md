## Add real LLM-powered simulation to Screen 3

Today, screen 3 ("Simulate Before You Launch") shows hard-coded reactions for Gen Z, Parents, and Sustainability Advocates regardless of what you type in the textarea. We'll replace that with a real call to an LLM that reads your campaign copy and returns a structured, mock audience response.

The LLM acts as a "synthetic focus group" — its output is still a simulation (not real consumer data), but it will dynamically reflect the actual copy you paste in.

### What changes for the user

1. Paste any campaign copy into the textarea on Screen 3.
2. Click **Simulate Audience Reaction**.
3. The app calls Lovable AI in the background and within ~2–4 seconds shows:
   - Per-segment sentiment % + a top reaction quote + a suggested fix (Gen Z, Parents, Sustainability Advocates — same three locked segments)
   - Emotional tone tags (e.g. Defensive, Vague, Authentic)
   - Backlash risk level (LOW / MEDIUM / HIGH) + short rationale
4. If the API errors out (rate limit, no credits, network), show a clear inline error message and a "Retry" button — Screen 4's locked "Before/After" results stay unchanged either way.

### Technical approach

- **Lovable Cloud + Lovable AI Gateway**: enable Lovable Cloud (gives us `LOVABLE_API_KEY` automatically) and call `google/gemini-3-flash-preview` — fast and cheap, ideal for this short structured response.
- **TanStack server function** at `src/utils/simulate.functions.ts` — keeps the API key server-side. Takes `{ campaignText: string }`, returns the structured simulation result.
- **Structured output via tool calling** (per the AI Gateway docs) — the model is forced to call a `return_simulation` tool with a strict JSON schema:
  ```
  {
    segments: [{ name, sentimentPct, topReaction, fix }],   // 3 items, names locked
    tones: string[],                                         // 2–4 short adjectives
    risk: "LOW" | "MEDIUM" | "HIGH",
    riskRationale: string
  }
  ```
  This avoids JSON-parsing flakiness from free-text responses.
- **System prompt** instructs the model to behave as a marketing analyst, always return the three locked segment names in the same order, keep reactions under ~140 chars, and stay grounded in the input copy.
- **Frontend wiring** in `CampaignSimulator.tsx`:
  - Replace the static `SEGMENTS` constant usage in screen 3 with state populated from the server function response.
  - Keep the existing staggered reveal animation — it just animates over the LLM-derived data instead of the constants.
  - Keep the locked numbers on Screen 4 (Before/After 1.2%→4.8%, $2.3M, −18%) untouched per project memory.
- **Errors**: surface 429 (rate limit) and 402 (out of credits) as friendly messages; all other errors get a generic "Couldn't reach the simulator — try again."

### What stays the same

- Screens 1, 2, and 4 are untouched.
- The three audience segments remain Gen Z / Parents / Sustainability Advocates (locked in memory).
- The crisis comments on Screen 1 stay verbatim (locked in memory).
- Visual design, colors, fonts — no changes.

### Out of scope (ask if you want any of these)

- Persisting past simulations to a database.
- Letting the user edit the segment list.
- Streaming the response token-by-token (the response is small enough that a single request feels instant; streaming would add complexity for little gain).
