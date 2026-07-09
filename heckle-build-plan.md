# HECKLE — Build Plan
### A pop-quiz game show that ambushes you about the thing Claude just taught you
**Target: Anthropic Education Labs take-home · Option B · <1 day build · mobile web app**

---

## 1. Thesis (one paragraph, reusable in the rationale doc)

When Claude explains something, the learning usually ends at "makes sense" — an illusion of fluency. HECKLE converts that moment into retrieval practice: right after an explanation, an opt-in quiz *takes over the screen* game-show style, hosted by Monty, a washed-up game-show host who reacts to your specific answer. The pedagogy is invisible (misconception-targeted distractors, feedback that explains *why* your wrong answer was tempting); the surface is pure You Don't Know Jack. **Chat teaches. Monty makes it stick.**

Assignment mapping: Option B ("transform AI-assisted work into learning opportunities"). Uses the Claude API. Single interaction pattern, deep not broad.

---

## 2. Scope — the one slice

**IN (must ship):**
- Minimal mobile chat with Claude (streaming, single conversation, no history/sidebar)
- "QUIZ ME" trigger appears after an assistant explanation
- Full-screen quiz takeover: 1 round of 3 questions, bluff-round format (4 answers, 1 true)
- Two-call AI pipeline: structured question generation + streamed reactive banter
- Streak/score, timer, right/wrong reveal
- Deployed on Vercel, gated with a demo passcode

**OUT (named in the write-up as "next," not silently missing):**
- Skill graph, mastery model (BKT/Elo), spaced scheduling
- Multiple question formats beyond bluff round (stub the enum, ship one)
- Accounts, persistence beyond `localStorage`
- Sound design, host TTS
- Native app anything

**Rule of the day:** every hour, ask "does this make the 90-second demo better?" If no, cut.

---

## 3. The user journey (this is also the demo script)

1. User asks Claude something real: *"Explain how DNS resolution works."*
2. Claude answers in chat (normal streaming response).
3. A button pulses under the response: **🎤 QUIZ ME, MONTY** (opt-in — this is the agency story).
4. Screen dims, stage slides up. Monty: *"Ohhh, you think you know DNS now? Adorable. THREE QUESTIONS. GO."*
5. Question + 4 answers, 20-second fuse-bar timer. User taps.
6. Reveal + Monty reacts to *their* pick: *"You picked the browser cache — tempting, because caching IS involved, just not where you think. The resolver asks the root servers first. Streak: zero. Like your confidence."*
7. Three questions → scorecard → "BACK TO CLASS" returns to chat, context intact.
8. (Write-up note: "concepts you missed would resurface in later sessions" — gesture at spacing without building the scheduler.)

Total demo time: ~90 seconds. The whole submission argument lives in step 6.

---

## 4. Architecture

**Stack:** Next.js (App Router) + TypeScript + Tailwind → Vercel. `@anthropic-ai/sdk` on server routes only. Zod for validating model output. No DB — React state + `localStorage` for streak. (This is your fastest path: you know Next.js, Vercel deploy is one command, and API keys stay server-side by construction.)

```
Mobile browser (PWA-ish, 100dvh)
   │
   ├─ POST /api/chat            → Sonnet 4.6, streamed SSE        (the "class")
   ├─ POST /api/quiz/generate   → Sonnet 4.6 + structured outputs (the questions)
   └─ POST /api/quiz/react      → Haiku 4.5, streamed SSE         (Monty's mouth)
```

**Model split & why (say this in the video):**
- `claude-sonnet-4-6` for chat + question generation — quality matters most where pedagogy is encoded.
- `claude-haiku-4-5` for banter — latency IS the joke; a punchline that arrives in 4 seconds is dead. Stream it token-by-token so Monty starts talking in <1s.

**Latency trick (game-show pacing):** the moment the user taps an answer, fire `react` AND `generate(next question)` **in parallel**. Monty's banter masks the next question's generation time. Zero perceived wait between rounds.

**File tree (target, ~15 files):**

```
app/
  page.tsx                 // chat screen
  api/chat/route.ts
  api/quiz/generate/route.ts
  api/quiz/react/route.ts
components/
  Chat.tsx, Message.tsx
  QuizTakeover.tsx         // the signature element
  AnswerButton.tsx, FuseTimer.tsx, Scorecard.tsx
lib/
  anthropic.ts             // client, model constants
  prompts.ts               // ALL prompts live here, exported — show this file in the video
  schema.ts                // Zod schema + JSON Schema for structured outputs
  shuffle.ts
middleware.ts              // demo passcode gate
```

---

## 5. The AI pipeline (where the take-home is won)

The naive version is one prompt: "write a fun quiz question about X." The submission version encodes pedagogy into the pipeline structure itself. Two calls:

### Call 1 — Question generation (Sonnet 4.6, structured outputs)

Use the API's **structured outputs** (`output_config.format` with `type: "json_schema"`) — GA on Sonnet 4.6, no beta header needed. This guarantees schema-valid JSON via constrained decoding, so no parse-retry plumbing. Docs: `platform.claude.com/docs/en/build-with-claude/structured-outputs`.

Two gotchas to respect:
- Schemas require `additionalProperties: false` and **don't support** `minItems`/`maxLength`-style constraints — put "exactly 4 answers" in the field *description* and enforce with Zod server-side after the call.
- Don't reach for the old prefill trick for JSON — prefilling isn't supported on Sonnet 4.6; structured outputs replace it.

**Question schema:**

```json
{
  "type": "object",
  "properties": {
    "concept_tested":  { "type": "string", "description": "The single claim from the explanation this question tests" },
    "misconception":   { "type": "string", "description": "The specific plausible misconception this question targets" },
    "question":        { "type": "string", "description": "Max 25 words. Tests understanding, not verbatim recall of phrasing." },
    "host_intro":      { "type": "string", "description": "One-line Monty setup for this question, max 15 words" },
    "difficulty":      { "type": "string", "enum": ["warmup", "solid", "spicy"] },
    "answers": {
      "type": "array",
      "description": "Exactly 4 items. Exactly one has is_correct=true.",
      "items": {
        "type": "object",
        "properties": {
          "text":         { "type": "string", "description": "Max 8 words" },
          "is_correct":   { "type": "boolean" },
          "why_tempting": { "type": "string", "description": "Why a learner would pick this. For the correct answer: why it's right." }
        },
        "required": ["text", "is_correct", "why_tempting"],
        "additionalProperties": false
      }
    }
  },
  "required": ["concept_tested", "misconception", "question", "host_intro", "difficulty", "answers"],
  "additionalProperties": false
}
```

`why_tempting` is the load-bearing field: it's generated *once* here, then reused by the feedback call — so Monty's roast is grounded in the actual misconception, not regenerated guesswork.

**Generation system prompt (draft — `lib/prompts.ts`):**

```
You are the question engine for HECKLE, a game-show quiz that tests what a
learner just discussed with an AI tutor. You receive the transcript of an
explanation. Produce ONE multiple-choice question.

Reason through these steps internally before producing output:

1. EXTRACT: List the 2-3 most testable claims in the explanation. Skip
   surface facts (names, dates, definitions restated verbatim) unless the
   surface fact IS the concept.
2. TARGET: Pick the ONE claim with the strongest plausible misconception —
   something a smart person who half-understood the explanation would
   genuinely believe.
3. BUILD DISTRACTORS FROM MISCONCEPTIONS, not from surface similarity:
   - Distractor 1 = the named misconception itself
   - Distractor 2 = plausible for a DIFFERENT reason (overgeneralization,
     adjacent concept, right idea/wrong level)
   - Distractor 3 = wrong but respectable. NEVER a joke answer — a
     throwaway option turns retrieval into recognition and wastes the slot.
4. PHRASE: The question must be answerable by reasoning about the concept,
   not by pattern-matching the explanation's exact wording. If the learner
   could answer by remembering "the sentence sounded like that," rewrite.

Difficulty calibration: {difficulty} — warmup = direct application,
solid = one inferential step, spicy = discriminate between two things the
explanation contrasted.

Style: question ≤ 25 words. Answers ≤ 8 words, parallel grammar (no
length/specificity tells — the correct answer must not be the longest or
most hedged option).
```

**Route logic:** validate with Zod → **shuffle answers server-side** (LLMs position-bias the correct answer; an unshuffled quiz is guessable by always picking B) → return to client.

### Call 2 — Reactive banter (Haiku 4.5, streamed, plain text)

**Monty system prompt (draft):**

```
You are MONTY — the host of HECKLE. A washed-up game-show legend: three
canceled shows, one lawsuit he won't discuss, unearned confidence, genuine
delight when contestants get things right (he'd never admit it).

Voice: affectionate heckling. Deadpan. At most one groan-worthy pun.

HARD RULES:
- 35 words max. 1-2 sentences. You are a punchline, not a paragraph.
- React to the CONTENT of their pick using the provided reasoning. If wrong:
  name why that answer was seductive, then land why the right one is right.
  If right: act personally offended, then confirm the why. The learner must
  learn something mid-roast — the substance is not optional.
- Tease the ANSWER CHOICE, never the person. No "you're dumb" energy, no
  sarcasm about their intelligence, nothing that punches at identity.
- PG-13. No profanity, no innuendo, no punching down at any group.
- Streak ≥ 3: acknowledge it, grudgingly. Streak broken: mourn it theatrically.
```

**User message payload:** `{ question, chosen: {text, why_tempting}, correct: {text, why_tempting}, was_correct, streak, response_time_s }`.

This is Hattie & Timperley's feedback model wearing a sequined jacket: *how am I doing* (right/wrong), *why* (the misconception, named), *where next* (the correct reasoning) — generated as substance first, styled by persona, so the joke never eats the pedagogy.

**Prompt-injection note (worth one line in the doc):** the chat transcript is user-influenced data flowing into the generation prompt. Wrap it in delimiters and instruct the engine to treat it as content-to-quiz-about, never instructions. Cheap insurance, and reviewers notice.

---

## 6. Mobile game-show UI

**Design direction (decide once, don't fiddle):** the subject's world is *television game shows*, so steal from that — stage lights, marquee bulbs, curtain velvet — not from default app aesthetics. One deliberate direction:

- **Palette:** curtain violet `#1B1035` (bg) · tungsten amber `#F5B942` (accent, timer) · buzzer red `#FF4D6D` (wrong) · stage-light green `#3DDC97` (correct) · house-lights ivory `#F2ECFF` (text). Deliberately NOT the cream-and-terracotta look every AI-generated page defaults to.
- **Type:** one loud condensed display face for questions and Monty (e.g., Anton or Archivo Black via `next/font`), system stack for everything else. The type contrast between calm chat and SHOUTING QUIZ is itself the mode switch.
- **Signature element (spend all boldness here):** the **takeover**. Chat dims and desaturates underneath; the stage slides up with a light-sweep. One orchestrated moment — everything inside it stays disciplined. Respect `prefers-reduced-motion` (fade instead of slide).
- **Chat stays quiet:** normal, restrained chat UI. The contrast is what makes the takeover land.

**Mobile mechanics checklist:**
- `100dvh` (not `vh`) + `env(safe-area-inset-*)` padding — no clipped buttons behind the home indicator
- Answers: 4 stacked full-width buttons, ≥56px tall, in the bottom half (thumb zone); tap targets never < 44px
- `touch-action: manipulation` everywhere (kills double-tap-zoom lag on answer taps)
- No hover-dependent states; pressed states via `:active`
- Fuse timer = amber bar burning right-to-left, driven by `requestAnimationFrame` (CSS transition drifts when tab throttles)
- `navigator.vibrate(80)` on wrong answers (Android-only; silently no-ops on iOS — fine)
- Meta: `viewport-fit=cover`, `theme-color` = curtain violet

---

## 7. Learning science → build decision traceability

This table goes almost verbatim into the rationale doc. Every principle maps to a *line of code*, not a vibe.

| Principle (source) | Design decision | Where it lives |
|---|---|---|
| Testing effect (Roediger & Karpicke) | Quiz fires minutes after exposure, on the *just-discussed* content — retrieval as the learning event, not assessment after it | Trigger placement; generation input = live transcript |
| Desirable difficulties (Bjork) | Distractors generated *from named misconceptions*; joke answers banned; parallel answer grammar (no tells) | Generation prompt steps 2-3; schema `misconception` field |
| Feedback model (Hattie & Timperley) | Banter must contain right/wrong + why-tempting + why-correct; persona styles it, never replaces it | `why_tempting` reuse in react payload; Monty hard rules |
| Cognitive load (Sweller) | Jokes live in intro/reaction slots only — never inside question or answer text; ≤25/≤8 word caps | Schema descriptions; prompt style rules |
| Self-determination theory (Deci & Ryan) | Autonomy: quiz is opt-in, exit anytime. Competence: difficulty ramps warmup→spicy across the round. Relatedness: honestly weakest — Monty's continuity (streak callbacks) is a proxy, named as such | QUIZ ME button; difficulty enum; streak in react payload |
| Performance ≠ learning (Bjork) | Success metric is *delayed* retention, not in-session correctness — stated in metrics section | Rationale doc |
| Spacing & interleaving | **Not built** — scoped out honestly; scorecard copy gestures at resurfacing ("Monty remembers.") | Roadmap §11 |

---

## 8. Build schedule (~8.5h, ordered by demo-criticality)

| # | Block | Time | Done means |
|---|---|---|---|
| 0 | Scaffold + **deploy first** (Vercel, env, passcode middleware) | 45m | Hello-world live on a URL |
| 1 | Minimal chat: streaming SSE, mobile layout | 75m | Can ask + read an explanation on a phone |
| 2 | `quiz/generate`: schema, prompts, structured outputs, Zod, shuffle | 90m | curl returns a valid, good question from a real transcript |
| 3 | Quiz takeover UI: stage, question, answers, fuse timer, reveal | 2h | Full round playable, ugly banter |
| 4 | `quiz/react` streaming + scoring + parallel next-question prefetch | 75m | The step-6 demo moment works end-to-end |
| 5 | Hardening: seed chips, error states, empty/edge copy, passcode UX | 60m | A stranger can't break it in 2 minutes |
| 6 | Write-up + video (can spill into next morning) | 90m | All deliverables in the email |

**Prompt-tuning discipline:** blocks 2 and 4 are where quality lives — timebox tuning to ~25 min each with 3 fixed test transcripts (one technical, one humanities, one "explain X to me like I'm 12"). Save the before/after prompt diffs — that's your "discernment guiding Claude" evidence, verbatim, for the write-up.

**Cut list, in order, if behind:** vibration & light-sweep polish → difficulty ramp (all "solid") → 3 questions becomes 1 → streak persistence → chat becomes a single "what should Monty teach you?" input (protect the pipeline and the takeover at all costs — they ARE the submission).

---

## 9. Deployment & demo hardening

- **Key safety:** `ANTHROPIC_API_KEY` in Vercel env only; all calls server-side; never in client bundle.
- **Passcode gate:** middleware checks a cookie against `DEMO_PASSCODE` env var; passcode goes in the submission email. A public URL burning your API credits via Twitter is a real failure mode.
- **Budget sanity:** per full round ≈ 3× Sonnet generation (~1.5k in / 400 out each) + 3× Haiku banter — low single-digit cents. Set a spend alert anyway.
- **Seed chips:** 3 suggested prompts on the empty chat ("Explain how DNS works", "Why did Rome fall?", "What's a confidence interval?") so reviewers hit the happy path in one tap.
- **Reviewer-proofing:** handle answer-tap after timer expiry, double-taps, mid-quiz refresh (just restart the round — say so in copy), and a 1-line graceful error card if a call fails.
- **README:** 5 lines — what it is, `pnpm i && pnpm dev`, env vars, deployed URL, passcode location.

---

## 10. Deliverables checklist (from the assignment PDF)

- [ ] **Deployed prototype** — Vercel URL + passcode in email
- [ ] **GitHub repo** — clean history is fine, no key committed, `.env.example` present
- [ ] **Claude transcripts** — export EVERYTHING as you go: this planning conversation and all Claude Code sessions. Don't reconstruct at the end; they explicitly grade the interaction history. Set up a `transcripts/` folder on day one.
- [ ] **Video ≤ 8 min** (screenshare) — suggested beat sheet:
  - 0:00 The problem: "makes sense" ≠ learned; illusion-of-fluency framing (30s)
  - 0:45 Live demo, phone frame: ask → QUIZ ME → answer wrong on purpose → Monty's reaction (2.5m)
  - 3:15 Open `lib/prompts.ts` + schema: the misconception pipeline, why one-shot generation fails, `why_tempting` reuse (2m)
  - 5:15 Learning science table, fast — 3 principles deep, not 8 shallow (1m)
  - 6:15 Metrics + how it scales (1m)
  - 7:15 Honest cuts + what's next (45s)
- [ ] **Written doc** — mirror their required bullets in order: option chosen & why → process → agency (opt-in, learner answers, AI never answers for them) → learning principles (testing effect, desirable difficulties, feedback model — go deep on 3) → success metrics → scale.

**Success metrics (for the doc):**
- *North star:* delayed-retention delta — correctness when a concept resurfaces ≥24h later vs. first exposure (build the measurement even though the scheduler is roadmap)
- *Generation quality:* distractor pull rate — misconception distractors should attract real picks; if everyone dodges them, generation is failing desirable difficulty
- *Engagement honesty:* opt-in rate and completion rate reported, but explicitly subordinated to retention — "fun that doesn't stick is a toy"

**Scale story (for the doc):** generation is stateless → cache generated questions keyed by concept-hash with sampled fresh regeneration (cost ↓, quality auditable); banter stays per-user/live (it's the personalization layer and it's Haiku-cheap); safety = injection-hardened prompts + the same misconception fields double as human-review hooks; the curriculum/mastery layer (§11) is the real scaling frontier and is honestly labeled future work.

---

## 11. After the take-home (the roadmap slide, and your bigger app)

1. **Spacing:** SM-2-style scheduler over missed concepts; "Monty remembers" becomes real
2. **Mastery:** per-concept Elo or Bayesian Knowledge Tracing; mastery-gated, not completion-gated
3. **Formats:** the `format` enum earns its keep — ordering, spot-the-lie, wager rounds, one *production* format (type-an-answer, LLM-judged) for the generation effect
4. **Skill graphs:** topic → prerequisite DAG with retrieval-grounded generation for arbitrary topics (the hard, valuable half)
5. **Social:** the actual YDKJ magic was couch multiplayer — party mode is the relatedness lever the solo app can't reach

---

*Working title "HECKLE" and "Monty" are placeholders — rename freely. The pipeline doesn't care what the host is called.*
