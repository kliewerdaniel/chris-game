# ADR-002 — LLM Intent Resolver (tool-calling, rules always fallback)

**Status:** Proposed (working-tree, awaiting review)
**Date:** 2026-08-24
**Project:** CHRIS (`~/Projects/chris-game`)

## Context

`lib/engine/game-engine.ts:77` resolves player input with a fully rule-based
parser (`parseAction` in `lib/inference/intent.ts`). It works, but coverage is
bounded by hand-written `VERB_PATTERNS`/`TARGET_PATTERNS`/`TOPIC_PATTERNS` and
returns `unknown` (→ "I didn't catch that") whenever no rule fires. The 20-point
brief asks the LLM to *parse what is said to call the tools which drive the
story*.

The "tools which drive the story" are the engine's existing closed action space:
`GameAction { verb, targetId, topicId, raw }` — verbs (`examine`, `talk`, `ask`,
`confront`, `call`, `move`…), target ids (`chris`, `phone`, `note`…), topic ids
(`sarge`, `money`…). The engine's `ep.dispatch(action)` is the executor. The LLM
only needs to **produce a `GameAction` from free text**; the engine validates and
runs it. No new state-authority moves to the model.

### Spike results (live, ornith.gguf @ :8080, 2026-08-24)
- **Native OpenAI-style tool-calling WORKS** and is schema-enforced. Across 5
  utterances all verbs were correct (`talk`/`examine`/`call`/`ask`/`sleep`).
- **LLM is a weak *closed-id* resolver.** `call mother on the phone` returned
  `verb:call` but **dropped `targetId`**; `Did you owe Sarge money?` returned
  target `Sarge` but **dropped the `money` topic**; it emitted `"Chris"`
  (capitalized) instead of the enum `chris`.
- **JSON-mode (`response_format:json_object` + `guided_json`) is UNRELIABLE** —
  the model ignored the schema and emitted free-form keys
  (`action`/`recipient`/`question`). Therefore the fallback path must be the
  **rule parser**, never JSON parsing of model output.

These findings dictate the hybrid shape below.

## Ratified forks (user decision)
1. **LLM PRIMARY when opted in; rules ALWAYS the fallback.** `CHRIS_USE_LLM_PARSE=1`
   enables the LLM resolver as the first attempt; on any miss it falls back to
   `parseAction` (rules), which also remains the default/offline path. Model down
   → game fully playable. Fail-closed, no cloud.
2. **Hybrid resolution:** the LLM resolves the *verb* (its strength); the existing
   deterministic rule matchers re-derive `targetId`/`topicId` from the raw text and
   correct anything the model dropped. The combination is then validated against
   `ep.dispatch` before any execution.

## Decision

### 2B — `InferenceRequest` gains tool-calling
`lib/inference/provider.ts`:
- New types: `ChatToolCall { name: string; arguments: string }`,
  `ChatTool { type:"function"; function:{ name:string; description:string; parameters:object } }`.
- `InferenceRequest.tools?: ChatTool[]`, `toolChoice?: "auto"|"none"|{type:"function";function:{name:string}}`.
- `InferenceResult.toolCalls?: ChatToolCall[]` (populated from
  `message.tool_calls` by `BaseHttpProvider`; `MockProvider` can emit them via a
  new `toolResponder`).
- `BaseHttpProvider.chat` forwards `tools`/`tool_choice` to llama.cpp; Ollama chat
  forwards them too (Ollama supports the OpenAI-style tool shim).
- No cloud provider is ever added. `MockProvider` stays deterministic.

### 2C — `lib/inference/llm-intent.ts`
- `buildActionSchema(allowed): ChatTool` — one function `resolve_player_action`
  whose `parameters` enum is constrained to `allowed.verbs` and the episode's
  reachable `targetIds`/`topicIds` (derived from `WorldState` contacts, evidence
  ids, and `CharacterEngine` topics). Restricting the enum shrinks the id-space
  the model must hit.
- `resolveIntentWithLLM(raw, inference, allowed): Promise<GameAction|null>`:
  1. Call `inference.chat()` with the tool schema, `toolChoice:"auto"`.
  2. If `result.toolCalls` is empty / malformed JSON → return `null` (→ rules).
  3. Parse arguments; `verb` must be in `allowed.verbs` or → `null`.
  4. Lowercase/canonicalize `targetId`/`topicId`; if not in the allowed enum →
     leave `undefined` (the rule pass will fill it).
  5. **Rule post-correction:** call the exported `resolveTargetsFromRules(raw)`
     from `intent.ts` to fill any dropped `targetId`/`topicId`. (This is what
     caught `call mother` and `owe money` in the spike.)
  6. Return the assembled `GameAction`.

### 2D — wire into `GameEngine.processTurn`
`lib/engine/game-engine.ts` `processTurn(state, raw)`:
- If `CHRIS_USE_LLM_PARSE` set **and** `deps.inference` is available:
  - `const llma = await resolveIntentWithLLM(raw, deps.inference, allowedFor(state))`
  - If `llma` is non-null **and** `ep.dispatch(llma)` is non-null (handler exists
    for this episode) → use `llma`.
  - Else → `parseAction(raw)` (rules).
- If not opted in → `parseAction(raw)` unchanged.
- The existing `isConfident(action)` gate and `ep.dispatch` null-check remain the
  hard validation boundary. The model's proposal is never trusted; it is validated
  exactly like a rule output.

`allowedFor(state)` derives the closed id-space from the active episode:
`WorldState.evidenceIds` + reachable contacts (`contactsForEpisode`) + character
ids + `CharacterEngine` topic ids. This keeps the LLM from emitting ids the
episode cannot handle.

### Epistemic boundary (invariant preserved from ADR-001)
- The LLM receives **only** the player's raw text + the closed action schema. It
  never receives `WorldState`, facts, secrets, evidence contents, or trust. It
  cannot invent a "truth."
- Output is a closed `GameAction`; `ep.dispatch` rejects anything unhandled.
- The LLM remains a *language resolver*, not an *executor*. No state mutation
  authority moves to the model.

## Consequences
- Free-text coverage expands dramatically (phrasing the rules don't list) while
  the action space stays strictly closed and validated.
- Offline path unchanged: rules default; LLM opt-in; model-down → rules.
- Existing 122 tests stay green (rules path untouched; new code behind opt-in +
  guarded tests).
- New hermetic tests (`tests/llm-intent.test.ts`): MockProvider tool-call resolves
  a verb; dropped target corrected by rule pass; fallback when model returns no
  tool call; fallback when model down. One guarded live test (skipped unless
  `CHRIS_LIVE_INTENT=1` and `:8080` reachable) exercises ornith end-to-end.

## Out of scope
Narration changes (LLM already narrates), character disclosure policy (ADR-001),
investigation graph. This ADR is strictly the *input→action* resolver.
