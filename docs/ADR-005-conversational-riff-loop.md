# ADR-005 — Conversational Riff Loop

- **Status:** Proposed
- **Date:** 2026-08-24
- **Supersedes:** — (adds a capability; does not replace ADR-001/002/004)
- **Author:** Hermes (for Daniel Kliewer)

---

## 1. Context

The player can already type free-form text and the engine parses it into one
of the closed `GameAction` verbs (`talk`, `ask`, `examine`, …) and routes it
through the deterministic disclosure policy. But the *response* is not a
conversation yet:

1. **No conversational memory.** `WorldState` (`lib/core/types.ts:131`) carries
   `events` and per-character `askedTopics` *counts*, but **never the actual
   lines spoken**. Every `Narrator.narrate` call is stateless — the model
   receives `{action, character, handling, seed, relevantMemories}` and has zero
   knowledge of what it just said. It cannot "riff off the response."
2. **Static seeds.** The lie/withhold/deflect seeds are fixed strings. With
   temperature 0.6 you get surface variation, not continuity or escalation.
3. **Free input is gated.** Off-topic sentences fall to `general` or get
   rejected; there is no open channel for "just talk to Chris."

We want: *take an input, parse it into one of the outputs, then riff off the
response so each ask yields a unique, history-aware reply* — while keeping the
epistemic boundary intact (the model renders, it does not decide what is true).

### Ratified forks (user-selected)

| Fork | Decision |
|------|----------|
| Free-form entry | Add a **`chat`/`say` verb**: any sentence flows in; the LLM maps it to a `topicId` if relevant, else pure banter. |
| Uniqueness driver | **Hybrid**: rule-locked prose for boundary turns (lie/withhold/deflect/partial), free LLM riff for open turns, history-conditioned. |
| Memory window | **Per-character rolling window (~6 turns)** injected into the prompt. |
| LLM parser default | **On by default for the chat channel**, fail-closed to rules. |

---

## 2. Decision

### 2.1 Pipeline (the loop)

```
player text
   │
   ▼
parse → GameAction{ verb:"chat", topicId?, raw }      (rules + optional LLM topic extraction)
   │
   ▼
CharacterEngine.resolveDisclosure(...) → DisclosureDecision{ mode, seed }
   │  (RULE-ONLY. unchanged. the model never decides truth/lie.)
   ▼
Narrator.narrate(ctx)  ── ctx.recentExchanges (last ≤6) injected
   ├─ boundary mode (lie/withhold/deflect/partial/threaten): SEED-LOCKED.
   │     model renders the seed verbatim/paraphrase; history NOT used to vary.
   └─ open mode (truth/unknown/joke/narration): FREE RIFF.
         history-conditioned, temp raised, uniqueness-guarded.
   │
   ▼
Engine appends Exchange{ speaker, verb, topic, handling, text } → WorldState.conversationLog
   │  (always appended, even on model-down fallback, so the transcript is continuous)
   ▼
next turn sees this exchange in its window → riff/escalate/reference.
```

### 2.2 New state (`lib/core/types.ts`)

```ts
export interface Exchange {
  turn: number;
  speaker: CharacterId | "player" | "narrator";
  verb?: IntentVerb;
  topicId?: string;
  handling?: DisclosureMode;
  text: string;
  ts: { day: number; hour: number; minute: number };
}

// WorldState gains:
conversationLog: Exchange[];               // default []
// CharacterRuntimeState gains:
recentlySaid: string[];                    // last ≤4 response texts, for uniqueness guard
```

No migration: `WorldState` is serialized via plain `JSON.stringify/parse`
(`lib/core/world.ts:73`), and games are created fresh per load. `createWorldState`
initializes both fields; the engine tolerates a missing `conversationLog`.

### 2.3 New verb

- `IntentVerb` gains `"chat"`.
- `VERB_PATTERNS` (`lib/inference/intent.ts`) gains chat triggers: `say`,
  `chat`, `tell him`, `ask` (already present), bare prose with no other verb.
- A shared handler `resolveChat(state, action, characterId, episode)` lives in a
  **new** `lib/engine/dialogue.ts` (NOT duplicated into each episode) so the
  riff logic is single-source-of-truth across ep1–4. `talk`/`ask` remain
  deterministic for explicit structured queries.

### 2.4 LLM topic extraction (default ON for chat)

In `GameEngine.processTurn`, when `action.intent.verb === "chat"`:
1. Attempt `resolveIntentWithLLM(raw, inference, allowed)` to extract an
   optional `topicId` (closed-schema tool call, re-validated against episode
   `dispatch` + `allowed.targetIds/topicIds`).
2. On any failure (model down, bad id), **fall back to rules** (`parseAction`).
   Fail-closed: never a cloud call, never a truth invented.
3. Even when a topic is extracted, the *decision* still comes from
   `resolveDisclosure` (rules). The model only ever supplies a candidate `topicId`.

This makes "you're not really him, are you?" route to `is_chris` → lie (boundary,
seed-locked) while "tell me a joke about the news" routes to `general` → open riff.

### 2.5 Narrator changes (`lib/narrative/narrator.ts`)

`buildContext` / `NarrationContext` gain:
- `recentExchanges: Exchange[]` — the rolling window.
- `freeRiff: boolean` — true for open modes, false for boundary modes.

`renderPrompt`:
- For `freeRiff`, append a `RECENT EXCHANGE` block (speaker + line, last ≤6) and
  instruct: *"Reference or escalate the prior exchange when natural. Do not
  contradict established facts. Stay in voice."*
- Raise `temperature` to ~0.9 for `freeRiff` calls.

**Uniqueness guard** (in `narrate`): after generating, if `text` is near-duplicate
of any entry in `characterStates[cid].recentlySaid`, re-call the model once with
*"Do NOT repeat a prior line. Say something new."* If still repeated (or model
down), append the deterministic fallback. `recentlySaid` is updated with the
final text (capped at 4).

**Boundary integrity:** for lie/withhold/deflect/partial/threaten, `freeRiff`
is false; the seed is rendered verbatim/paraphrase exactly as today. History is
never used to vary a boundary turn. This preserves the docudrama contradiction
(echo vs voice) as rule-emergent, not model-authored.

### 2.6 Epistemic boundary (non-negotiable)

- The disclosure *decision* (truth/lie/withhold/…) stays **rule-only** in
  `CharacterEngine`. The model never sees trust, secrets, or facts as inputs it
  can mutate.
- History is **prompt context only** — it influences prose, never `WorldState`.
- Model-down → existing deterministic fallback lines; an exchange is still
  appended so the transcript stays continuous and the next turn still has context.

---

## 3. Consequences

### Positive
- Chris becomes a *conversational* presence: inside-jokes accumulate, topics
  escalate, references land. Each session feels unique.
- The boundary turns (the emotional core — the lie that it is Chris) stay locked
  and trustworthy; riffing lives only where it is safe.
- No new provider; uses the existing local ornith @ :8080 path. Fully offline-capable.

### Negative / cost
- Larger prompt per turn (history window) → slightly higher token use. Bounded by
  the ≤6 window and a max-tokens cap on exchange text.
- Determinism for *exact* replay is reduced on open turns (by design). Tests must
  assert *plumbing* (history passed, seed-lock holds, uniqueness guard fires),
  not exact prose.
- A new shared module (`dialogue.ts`) + 2 new state fields + 1 verb; all 4
  episodes must route `chat` through it.

### Neutral
- `talk`/`ask` unchanged in behavior; `chat` is additive.

---

## 4. Alternatives considered

- **Pure LLM riff everywhere** (history-conditioned, no seed-lock): simpler, but
  the model could drift a lie or break the echo/voice contradiction. Rejected —
  violates the epistemic boundary ADR-001/004 encode.
- **Pre-authored variant pools per (topic,handling)** picked non-deterministically:
  fully offline and "unique," but not real riffing and authors drift from
  corpus. Rejected as least faithful to "riff off the response."
- **Keep rule verbs only, raise temperature**: produces variation but no
  continuity/reference. Rejected — does not satisfy "riff off the response."

---

## 5. Acceptance tests (definition of done)

1. **tsc clean + existing suite green.** Baseline 138 vitest must stay green;
   `next build` succeeds.
2. **Conversation log appended.** A `chat` turn appends exactly one `Exchange`
   (player + model lines, or player + fallback) to `WorldState.conversationLog`;
   window of last ≤6 is what `Narrator` receives as `recentExchanges`.
3. **Seed-lock holds.** For a boundary topic (`is_chris` → lie), `narrate`
   returns the seed wording verbatim regardless of prior history; history does
   NOT alter a boundary line. (Assert via MockProvider returning a divergent
   string for the riff path but the seed for the boundary path.)
4. **Uniqueness guard fires.** With a `MockProvider` that returns the same string
   on the first two calls then a different one, the second open-turn call receives
   a "do not repeat" nudge and the final text differs from `recentlySaid[0]`.
5. **LLM topic extraction is fail-closed.** With the model down, a chat utterance
   implying `is_chris` still routes through `resolveDisclosure` → lie (decision
   unchanged by the missing model); no throw reaches the player.
6. **Boundary decision unchanged by model.** Even with the LLM parser on, the
   `topicId` it proposes never changes the *mode* — only `resolveDisclosure` does.
   Assert `resolveChat(...).decision.mode` equals the rules-only decision.
7. **Model-down continuity.** A `chat` turn with `CHRIS_INFERENCE=mock` (no live
   provider) still appends an exchange and returns a deterministic fallback line;
   the engine records the action.
8. **Manual observation gate (not committed):** against live ornith @ :8080, two
   consecutive `chat "say something about the news"` turns produce *different*
   lines, and a follow-up `chat "that last one was good, more like that"` shows
   the model referencing the prior exchange.

---

## 6. Implementation notes

- New file `lib/engine/dialogue.ts` exporting `resolveChat` + `appendExchange` +
  `recentExchangesFor(state, characterId, n=6)`.
- `lib/core/types.ts`: add `Exchange`, `WorldState.conversationLog`,
  `CharacterRuntimeState.recentlySaid`; add `"chat"` to `IntentVerb`.
- `lib/inference/intent.ts`: chat verb patterns.
- `lib/narrative/narrator.ts`: `freeRiff`, `recentExchanges`, uniqueness guard,
  temp bump for riff.
- `lib/engine/game-engine.ts`: default-on LLM topic extraction for `chat`.
- `lib/engine/episode{1..4}.ts`: add `case "chat":` → shared `resolveChat`.
- `lib/core/world.ts`: initialize new fields in `createWorldState`.

Phase split (each its own commit, per ADR-gated discipline):
- **5A** — state + verb + types (no behavior change; tests for serialization).
- **5B** — `dialogue.ts` shared chat resolver + episode routing.
- **5C** — Narrator riff (history window, freeRiff, uniqueness guard).
- **5D** — default-on LLM topic extraction for chat + fail-closed tests.
