# ADR-006 — Universal Chat Interface to One Continuous World

- **Status:** Implemented (verified: 144 tests green, live model @ :8080 talks back on every input)
- **Date:** 2026-08-24
- **Supersedes:** — (extends ADR-005; does not replace ADR-001/002/004)
- **Author:** Hermes (for Daniel Kliewer)

---

## 1. Context

Today the engine has two disjoint response channels:

1. **Deterministic world actions** (`look`, `examine`, `move`, `use`, `search`,
   `call`, `wait`, `sleep`, `inventory`, `evidence`) — handled by the active
   `Episode.dispatch`, return rule-authored narration (room descriptions,
   item text), and **produce no conversational voice**.
2. **Social/disclosure verbs** (`talk`, `ask`, `confront`, `chat`) — voiced by
   the `Narrator` (local model) and appended to `WorldState.conversationLog`.

Two consequences the player feels:
- Typing anything the parser is **not confident** about (free prose, typos,
  half-thoughts) hits the `I didn't catch that` wall (`game-engine.ts:119-130`)
  instead of a reply.
- The world never *talks back*. Examining the phone yields a dry description;
  Chris/the feed never reacts. The "feed that narrates your life" premise
  (ADR-004 corpus: *"I can take him wherever I go… talking to me telling me
  jokes about the news as it happens"*) is under-realized.

**User directive (verbatim):** *"I want it so that any time you type something
you get a chat response back and it all is part of the same world so you can
chat with the state of the world and it will always chat back whether it be
chris or the feed."*

That is: **chat is the universal input/output channel**. Every keystroke lands
in ONE `WorldState`, is answered by the reconstruction's voice (Chris = the
feed), and the answer is aware of the live state of the world (where you are,
what you've found, what's been established). No dead input. No silent world.

### Design constraints (carried from ADR-001/004/005)
- The model **renders**, it never **authors** world-canon. The world snapshot
  fed to the model is read-only context; it may *reference* established state
  but cannot *invent* new facts/locations/events.
- Disclosure policy (`CharacterEngine.resolveDisclosure`) stays **rule-only**.
  Boundary topics (`is_chris` → deflect/lie) still seed-lock; the model never
  decides truth.
- Fail-closed: model-down → deterministic fallback line; no cloud call.
- `WorldState` remains the single source of truth; the chat transcript
  (`conversationLog`) is one continuous array across all turn types.

---

## 2. Decision

### 2.1 Pipeline (the new universal loop)

```
player text (ANY text)
   │
   ▼
parseAction(raw) → GameAction { type, targetId, topicId, raw }
   │
   ├─ IF type is a WORLD verb AND ep.dispatch(action) exists:
   │     handler runs → deterministic state change + base narration
   │     (e.g. "You examine the phone. A flip phone, dead battery.")
   │           │
   │           ▼
   │     ALWAYS append a FEED REACTION: selectSpeaker(...) voices a
   │     world-aware riff referencing the action result + live snapshot.
   │
   └─ ELSE (social verb, free prose, unknown, low-confidence):
         coerce to `chat` (target = selectSpeaker(...)).
           │
           ▼
         resolveChat(state, action) → resolveDisclosure (RULE-ONLY)
           │  topic from rules/LLM-extractor; else `general` (open riff)
           ▼
         Narrator.narrate(ctx)  — ctx.worldSnapshot INJECTED
           ├─ boundary mode: SEED-LOCKED (unchanged)
           └─ open mode: FREE RIFF, now GROUNDED in worldSnapshot
           ▼
         Exchange appended to WorldState.conversationLog (always)
```

**Key change:** there is no "didn't catch that" exit. `unknown`/low-confidence
input is coerced to `chat` and answered. World actions still execute
deterministically AND gain a conversational reaction. The player never hits a
wall and the world always speaks.

### 2.2 Speaker routing — `selectSpeaker(state, action)`

The voice that answers is chosen deterministically:

| Input shape | Speaker | Notes |
|-------------|---------|-------|
| `call <contact>` where contact reachable (e.g. `call mother`) | that contact id | voicing uses the contact's `CharacterDef` if present |
| anything else (free prose, `talk`/`ask`/`chat` to the feed, post-action reaction, nonsense) | `chris` (the reconstruction / the feed) | the constant companion; `CHAT_CHARACTER` |

This realizes "whether it be chris or the feed" — the feed IS the
reconstruction, so the default voice is `chris`; an explicit `call` to another
contact routes to that person. **Implementation check (6C):** every talkable
contact needs a `CharacterDef` in `CHARACTERS` (`lib/characters/chris.ts`) for
proper voicing; if a contacted id lacks a def, fall back to the feed voice with
a `speakerName` tag rather than crashing.

### 2.3 World snapshot — `WorldSnapshot` (new)

A read-only projection of `WorldState`, resolved at narration time and injected
into the prompt. This is what makes replies "aware of the state of the world."

```ts
export interface WorldSnapshot {
  location: string;
  time: string;                                  // formatted
  knownFacts: { id: string; statement: string; status: FactStatus }[];
  evidence: { id: string; title: string; content: string; status: FactStatus }[];
  flags: Record<string, boolean | number | string>;
  present: string[];                             // character ids at this location
  phoneUnlocked: boolean;
  episodeId: string;
}
```

`resolveSnapshot(state): WorldSnapshot` (new, lives in `lib/engine/dialogue.ts`
or a small `lib/engine/world-snapshot.ts`):

- `knownFacts` → `FACTS[id].statement` for each id in `state.knownFacts`.
- `evidence` → `getEvidenceDef(id)` → `{title, content, status}` for each
  discovered evidence id.
- `flags`, `present`, `phoneUnlocked`, `episodeId`, `location`, `time` straight
  from state.
- Verbatim evidence `content` is included so the feed can *quote/reference* what
  the player has actually found (never invent beyond it).

`NarrationContext` gains `worldSnapshot?: WorldSnapshot`.
`renderPrompt` injects a `WORLD STATE` block and instructs: *"You are in this
live world. Reference the current location, established facts, and discovered
evidence when natural. Do NOT contradict them. Do NOT invent new state,
locations, characters, or events."*

### 2.4 What the model may do with the snapshot

- **Open (truth/unknown/general) turns:** riff in voice, grounded in the
  snapshot — comment on where you are, react to what you just examined, recall
  an established fact, joke about the news feed. Still cannot *assert* new
  canon (no facts to invent; the snapshot is the bound).
- **Boundary turns:** unchanged — seed-locked, snapshot ignored for variation.
- **Post-action reactions:** the deterministic action result is passed as the
  "situation" so the feed's reaction is specific ("You found the note. Chris:
  'Took you long enough, kid. Read it out loud.'").

### 2.5 Epistemic boundary (non-negotiable, unchanged)

- `resolveDisclosure` is still the only decider of truth/lie/withhold.
- `worldSnapshot` is prompt context only — never written back to `WorldState`
  by the model. The engine still applies all state changes via deterministic
  episode handlers / `applyWorldEvents`.
- Model-down → existing deterministic fallback; exchange still appended.

---

## 3. Consequences

### Positive
- Every input is answered; the game feels like a living feed, not a parser.
- The reconstruction's "narrates your life as it happens" premise is realized —
  it reacts to your actions and knows your world.
- One continuous `WorldState` / `conversationLog`; nothing forks.
- Boundary turns (the emotional core) stay locked and trustworthy.

### Negative / cost
- Larger prompt per turn (snapshot) → more tokens. Bounded by the fact/evidence
  lists (small in this game) + ≤6 exchange window.
- World-action UX changes: `look`/`examine` now also produce a feed beat. That
  is the intended "world talks back" behavior, but it alters the prior silent
  deterministic narration. Acceptable per directive.
- Determinism for *exact* replay of open turns is further reduced (by design).

### Neutral
- `talk`/`ask`/`confront` unchanged in routing (they were already chat).
- Episodes still own content; only the *interface* + narration context change.

---

## 4. Alternatives considered

- **Keep two channels, just remove the "didn't catch that" wall.** Simpler, but
  the world still never reacts to actions; violates "chat with the state of the
  world." Rejected.
- **Make `chat` the only verb; delete world actions.** Cleanest interface, but
  throws away the deterministic investigation mechanics (examine/evidence) that
  are core to the mystery. Rejected — world actions stay, they just also speak.
- **Inject full `WorldState` into the prompt.** Over-broad; leaks internal flags
  and bloats context. Rejected in favor of the bounded `WorldSnapshot`.

---

## 5. Acceptance tests (definition of done)

1. **tsc clean + existing 138 vitest green** (baseline preserved); `next build`
   succeeds.
2. **Always answered.** Feed nonsense / empty-ish prose (e.g. `"asdfgh"`,
   `"..."`) still produces a `chat` reply (no `I didn't catch that`). Assert
   `processTurn` returns `result.ok === true` and ≥1 narration line for such
   input (with model down → deterministic fallback line, still `ok`).
3. **World-aware reply.** After `examine` an evidence item (model mocked to echo
   a marker), the generated chat reaction prompt contains the resolved
   `worldSnapshot` (knownFacts + evidence content). Assert `buildContext` was
   called with `worldSnapshot` populated.
4. **Speaker routing.** `call mother` → speaker resolves to `mother` (or tagged
   fallback) when mother reachable; free prose → `chris`. Assert
   `selectSpeaker` output per case.
5. **Seed-lock holds under snapshot.** A boundary topic (`is_chris` → lie)
   returns the seed wording verbatim even with a populated `worldSnapshot`; the
   snapshot does NOT alter a boundary line.
6. **No state mutation from snapshot.** A chat turn with a mocked model that
   tries to "discover" a fact does NOT add to `knownFacts`/`evidenceIds`. The
   transcript grows by exactly the exchanges appended.
7. **Boundary decision unchanged by model.** Even with LLM parse on, the
   `topicId` it proposes never changes the *mode* — only `resolveDisclosure` does.
8. **Manual observation gate (not committed):** against live ornith @ :8080 —
   (a) type a free sentence → Chris replies, referencing current location;
   (b) `examine` an item, then `chat` → the reply acknowledges the item;
   (c) `chat about whether it's really Chris` → deflects (boundary intact).

---

## 6. Implementation notes

- New file `lib/engine/world-snapshot.ts` exporting `WorldSnapshot` +
  `resolveSnapshot(state)`. Imports `FACTS` (`lib/core/facts`) and
  `getEvidenceDef` (`lib/core/evidence`).
- `lib/core/types.ts`: add `WorldSnapshot`; add `worldSnapshot?: WorldSnapshot`
  to `NarrationContext` (in `narrative/narrator.ts`).
- `lib/narrative/narrator.ts`: `buildContext` resolves + attaches
  `worldSnapshot`; `renderPrompt` injects the `WORLD STATE` block + grounding
  instruction.
- `lib/engine/game-engine.ts`:
  - `processTurn`: replace the `!isConfident → "didn't catch that"` exit with a
    coerce-to-`chat` default; after a successful WORLD-verb handler, always
    append a feed reaction (resolveChat + generateNarration with the action
    result as situation).
  - `generateNarration`: accept a `situation?` arg for post-action reactions;
    pass `worldSnapshot` for all voiced turns.
- `lib/engine/dialogue.ts`: add `selectSpeaker(state, action)`; extend
  `resolveChat` to accept an optional `situation` (the deterministic action
  result) so post-action reactions are specific.
- `lib/inference/intent.ts`: `isConfident` keeps `chat` always-true; `unknown`
  is no longer a hard rejection (engine coerces). No new verb needed.
- `lib/characters/chris.ts`: ensure every talkable contact (`mother`, `phone`)
  has a `CharacterDef` for voicing (6C implementation check).

Phase split (each its own local commit, no push unless user says):
- **6A** — universal input gate + post-action feed reaction in `processTurn`.
- **6B** — `WorldSnapshot` + `resolveSnapshot` + narrator injection.
- **6C** — `selectSpeaker` + contact `CharacterDef` coverage.
- **6D** — tests + this doc marked Implemented.
