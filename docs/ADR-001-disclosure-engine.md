# ADR-001 — Procedural Character Disclosure Engine

**Status:** Proposed (working-tree, awaiting review)
**Date:** 2026-08-24
**Project:** CHRIS (`~/Projects/chris-game`)

## Context

The repo currently has a deterministic world with an AI *narrator*, but characters
are driven by a **hardcoded lookup** (`CharacterEngine.resolveTopic`,
`lib/characters/engine.ts:59`). Chris's response to "Sarge" is picked from three
static tables in `chris.ts` (`lies` / `withholds` / `knows`). This is the
"chatbot on a state machine" failure mode: the Ep1 contradiction (note vs. Chris's
"we were fine") is pre-authored, not emergent.

The thesis (user, 20-point brief) is correct: convert Chris from a lookup into a
**bounded agent** with beliefs, goals, and a procedural disclosure policy. The
world must simulate *what Chris thinks*, not just *what Chris says*.

The types already imply this:
- `WorldState.beliefs[]` / `hypotheses[]` exist (player side).
- `Fact` carries `supportsFactIds`/`contradictsFactIds`/`verifiedBy`.
- `FactStatus` is the full epistemic enum.
- `CharacterRuntimeState` has `knowsFactIds`/`withheld`/`trust`/`mood`.

So this ADR *instantiates* a character simulation the types already imply, rather
than bolting on new systems.

## Ratified forks (user decision)

1. **Lie WORDING = pre-authored per-topic seeds + procedural DECISION.**
   The lie-vs-truth decision is always deterministic (computed from
   beliefs/goals/trust/emotion). The rendered text is anchored to a per-topic
   seed so the model cannot fabricate canon. Fail-closed. Ruled out: model-
   generated lie text (drift risk), which would require stronger output
   validation anyway.
2. **Scope = disclosure engine + second character together.** Add a second
   character (`MOTHER`) now to stress-test separate knowledge / conflicting
   beliefs / information propagation early, per the user's point #18.

## Decision

Introduce a deterministic **disclosure policy** that replaces the static
`resolveTopic` lookup as the source of truth for how a character answers a topic,
while keeping `resolveTopic` as a thin back-compat wrapper so existing tests pass.

### New types (`lib/core/types.ts`)

```ts
export type DisclosureMode =
  | "truth" | "partial" | "lie" | "withhold"
  | "deflect" | "joke" | "threaten";

export interface Belief {
  id: string;
  text: string;                 // what the character believes
  confidence: number;           // 0..1
  source: "canonical" | "perception" | "testimony" | "memory" | "inference";
  emotionalWeight: number;      // 0..1 — how much it matters to them
  supports: string[];           // fact/belief ids this belief supports
  contradicts: string[];        // fact/belief ids this belief contradicts
  lieAboutFactId?: string;      // if this belief is a deliberate falsehood
}

export interface Goal {
  id: string;
  text: string;
  kind: "primary" | "secondary" | "hidden" | "constraint" | "emotional";
  weight: number;               // 0..1 — how hard they pursue it
  active: boolean;
}

export interface DisclosureDecision {
  mode: DisclosureMode;
  topic: string;
  lieAboutFactId?: string;      // canonical fact the lie concerns
  seed?: string;                // pre-authored wording the narrator must render
  why: string;                 // human-readable reason (debug / provenance)
}
```

`CharacterRuntimeState` gains: `beliefs: Belief[]`, `goals: Goal[]`,
`askedTopics: Record<string, number>` (topic -> times asked),
`recentlyConfronted: boolean`. `CharacterKnowledge` gains `secrets?: string[]`.

### Disclosure policy (`lib/characters/engine.ts`)

`resolveDisclosure(state, characterId, topic, actionType): DisclosureDecision`

Deterministic evaluation in priority order:
1. **Emotion first.** If `recentlyConfronted` and topic hits a sensitive secret →
   `threaten` (or `deflect` at high trust).
2. **Goal conflict.** If answering the topic would endanger an `active`
   `primary`/`constraint` goal → `withhold` or `lie` (seeded from the relevant
   belief's `lieAboutFactId`).
3. **Topic secrecy.** If topic ∈ `withheld` → `withhold`.
4. **Belief-driven lie.** If the character holds a `belief` with `lieAboutFactId`
   for this topic → `lie` seeded from that belief.
5. **Trust gate.** If topic is `sarge_fine`/`money`/`the night` and
   `trust < TRUST_THRESHOLD` (default 55) → `lie`/`withhold` (the "you don't
   trust me enough yet" gate). Above threshold → `truth`/`partial`.
6. **Unknown.** If not known and not withheld → `unknown` (honest "I don't know").

`recordAsk(state, characterId, topic)` increments `askedTopics` and decays
`recentlyConfronted`. `adjustTrust`/`setMood`/`initState` unchanged in
signature. The Ep1 note-vs-lie contradiction becomes *emergent*: the policy sees
"answering about Sarge endangers `keep the note hidden` at trust 55" → `lie`/
`withhold` seeded from the canonical fact Chris is concealing.

### Second character: `MOTHER`

A `MOTHER` `CharacterDef` with:
- own `knows`/`doesNotKnow` (she does NOT know Chris was with Sarge that night),
- own `secrets` (`ep1.mother.knows` — she knows something about Sarge, withheld),
- own `beliefs` (she *believes* Chris was off drinking, contradicting canonical),
- her own `lies`/`withholds` seeds.

Registered in `CHARACTERS`. Ep1 `doCall` for `mother` now resolves her disclosure
through the same policy (initially: rings out / deflects — her secret only opens
in a later episode). This exercises separate knowledge + conflicting testimony
without scripting a full Mother scene.

### Narrator (`lib/narrative/narrator.ts`)

Extend `handling` union to include `partial | deflect | joke | threaten`. Add
`seed?` to `NarrationContext`; render prompt seeds each new mode; add fallback
lines per mode. The model still only renders prose — no state authority moves.

## Consequences

- Chris's contradiction is now *emergent* from belief/goal state, not hardcoded.
- Adding Character B (Mother) breaks the single-knowledge-base assumption early.
- All state mutation remains rule-driven; the LLM is still a renderer only.
- Existing 65 tests stay green: `resolveTopic` is preserved as a wrapper; no
  `CharacterRuntimeState` field is removed; `createWorldState` gains optional
  belief/goal init.
- New hermetic tests (`tests/disclosure.test.ts`) cover the policy with no model.

## Out of scope (deferred per user priority order P3–P6)

Investigation graph UI, event scheduler, phone contact graph, transcript export,
state hashing, inference profiles, compile-time cognitive substrate. These build
on the disclosure engine once the Ep1 vertical slice proves compelling.
