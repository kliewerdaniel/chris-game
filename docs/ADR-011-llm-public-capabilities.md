# ADR-011: LLM Capabilities on the Public Build (free-chat + LLM commands)

**Status:** PROPOSED (design checkpoint — await user review before code)
**Date:** 2026-08-25
**Supersedes:** — (extends ADR-002, ADR-005, ADR-009, ADR-010)
**Carries:** untouched epistemic boundary — *the AI voices a world it does not
define; the deterministic engine owns reality.*

## Context
ADR-009 shipped a public build whose only server call is narration
(`/api/narrate`). The user now wants **both** LLM capabilities on that public
build:

1. **Free-chat with Chris** — players talk to the reconstruction in character.
2. **LLM-driven intent parsing** — players type naturally; the LLM maps it to a
   fixed, validated game action (instead of the rule parser).

Both reuse the **same hosted key** already used for narration. No new secrets.

### Grounding (what already exists)
- `lib/engine/dialogue.ts` `doChat` → `resolveChat` runs the **deterministic**
  disclosure policy (`characterEngine.resolveDisclosure`) and records the
  exchange. It makes **no model call**. Narration for the chat line is produced
  separately by `Narrator`. The narrator already supports `freeRiff` +
  `recentExchanges` + `seed`/`lieText` (ADR-005). → **Free-chat is ~80% wired;
  it needs the hosted key + the engine passing the chat context through.**
- `lib/inference/llm-intent.ts` `resolveIntentWithLLM` maps free-text → a
  closed-schema `GameAction` via tool-calling, then the engine re-validates via
  `ep.dispatch`. It is **local-model only today** (`CHRIS_USE_LLM_PARSE`).
- **Hard constraint discovered:** on the public build the engine runs
  **client-side** with `inference: null` (ADR-009). The hosted key lives only in
  the serverless function. Therefore LLM *intent parsing* **cannot happen in the
  browser** — it must move server-side behind a new function, returning a
  validated `GameAction` the client engine re-applies. (Tool-calling is also
  currently dropped by `HostedProvider.chat` — must be fixed for this path.)

## Decision

### Capability 1 — Free-chat with Chris
- Keep `doChat` deterministic (disclosure stays rule-only — **boundary intact**).
- The narration step for a chat turn already sends `handling` + `seed` +
  `recentExchanges` + `freeRiff` to the narrator. We confirm the engine passes
  this context on `chat` turns (implementation task) and gate the feature on the
  hosted key being present (reuse `NEXT_PUBLIC_NARRATION=hosted`).
- **Ethical guardrail (recommended default ON):** because this is the
  reconstruction of a *dead friend*, the UI shows a one-time disclosure — "This
  is a reconstruction. An AI model voiced in Chris's style, not Chris." — before
  free-chat is first enabled. Reuses the existing `ep4.rec.is_model` truth.
- Boundary disclosure modes (lie/withhold/deflect/partial/threaten) stay
  **seed-locked** — the model paraphrases engine-fixed wording only
  (`narrator.ts` already enforces this). Open modes (truth/unknown) free-riff in
  voice. The model never authors world-canon.

### Capability 2 — LLM intent parsing (public build)
- New serverless `POST /api/intent` (same `runtime=nodejs`, same key, **subject
  to the ADR-010 spend guard** — it burns tokens). Request body: `{ raw, allowed:
  { verbs, targetIds, topicIds } }`. Response: a `GameAction` (or `null`).
- Internally: `resolveIntentWithLLM` (tool-calling). Fix `HostedProvider.chat` to
  forward `tools` + `tool_choice` and surface `tool_calls`. The model only sees
  the raw text + the closed action schema — **never** world state, facts, trust.
- Client receives the `GameAction`, then runs it through `ep.dispatch` exactly
  like a rule-parsed action. If `/api/intent` errors, times out, or returns
  `null`, the client falls back to the **rule parser** (`parseAction`). Model
  output is never trusted; the engine is authoritative.
- `CHRIS_USE_LLM_PARSE=1` now also enables the remote path on the server function
  (default OFF — rules remain the public default so a key outage never breaks
  input parsing).

### Shared
- Both `/api/narrate` and `/api/intent` run through `guardNarration` (ADR-010):
  per-request token clamp, per-minute + daily budget, 429 fail-closed. Intent
  calls count toward the same budget.
- No new secrets. Same `CHRIS_HOSTED_*` env. TTS stays OFF for public (decision
  #4) — free-chat is text only.

## Rejected alternatives
- **Client-side LLM parsing** — rejected: the key cannot leave the server (ADR-009
  security stance); the browser bundle must stay secret-free.
- **Let the LLM decide world effects** (open action space) — rejected: violates
  the core boundary; the engine owns reality, the model only voices/parses.
- **Free-chat without the "model, not the man" disclosure** — rejected: ethically
  required when a player talks to the reconstruction of a deceased person.

## Consequences
- Public players get natural-language commands AND in-character conversation with
  Chris, both fail-closed and spend-guarded.
- Two new serverless functions (`/api/intent`) added; `HostedProvider` gains
  tool-call support (needed for both structured parsing and possibly better
  chat).
- Engine still runs client-side and authoritative; model stays a parser/voice.
- The "talk to a dead friend's reconstruction" surface gets an explicit,
  one-time disclosure — the most sensitive UX in the game; we surface it, not
  hide it.

## Open question for the user
Free-chat with a deceased person is the most ethically loaded feature here. Two
sub-options:
- **(a)** Free-chat text only (recommended) — no cloned voice, one-time
  "reconstruction, not Chris" notice.
- **(b)** Allow free-chat but keep it strictly behind the narration key + the
  disclosure, with no extra special-casing.

This ADR assumes (a). Flag if you want (b) or something else.

## Verification (build phase, post-approval)
- tsc clean, vitest green (add `/api/intent` tests with MockProvider tool-calls +
  remote fallback).
- Live: `/api/intent` returns a valid `GameAction` for natural input; returns 429
  under the spend guard; client falls back to rules when it 503s.
- Free-chat line is voiced through the disclosure engine; boundary modes
  seed-locked; one-time disclosure shows before first chat.
