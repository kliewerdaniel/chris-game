# CHRIS — Architecture & Source Reconnaissance

> A literary survival mystery. A compiled knowledge graph becomes a living world
> under a deterministic game engine; a **local** AI provides the conversational
> interface. The LLM does **not** define reality — the compiled world does.

---

## 1. What I inspected (local, not the deployed sites)

I treated the two Vercel deployments only as reference/validation targets and
worked from the **local repositories** instead.

### 1a. Chat Compile — `~/Projects/Chris` (Sovereign Knowledge Compiler)

- **Framework:** Vite + TypeScript single-page app (static, client-rendered).
- **Build:** `npm run build` → `dist/` of static HTML/JS/CSS, no runtime backend.
- **Compiled artifacts** (the actual game-relevant output, in `artifacts/`):
  - `chris/` — **the curated slice for the character "Chris"**:
    - `README.md` — provenance + how the slice was produced from the full corpus.
    - `episodes.json` — 4 narrative episodes (the night before Sarge, the porch,
      the last call, the rebuild).
    - `chris-character.json` — identity, traits, values, voice, relationships,
      timeline, secrets, mannerisms, facts, fiction.
    - `chris-memories.json` — **80 memories**, each with `kind`
      (`genuine`/`fiction`/`belief`/`dream`/`external-reference`), `tier`
      (core/secondary/peripheral), `status` (canonical/testimony/hypothesis/
      unknown), and `provenance` (source, sourceType, sourceId, confidence).
    - `chris-lore.json` — themes, symbols, world rules, lore.
    - `prompts/` — sovereign-system.md, compile-prompt variants, the model card
      for `deepreinforce-ai_Ornith-1.0-35B-Q4_K_M.gguf`.
  - `conversations/` (2,489), `themes/`, `graph/` — the full corpus. **Not** all
    of this is game material; the `chris/` slice is.
- **Live inference (per the site's own description):** the compiler ran once at
  compile time against local ornith.gguf; the deployed page only reads static
  files. This matches our local-first principle exactly.
- **Reusable for the game:** the `chris/` curated artifacts. We do **not**
  re-run the compiler and do **not** dump the full corpus into the game.

### 1b. KonradFreeman KB — `~/Projects/konradfreeman-kb`

- **Framework:** Astro static site (JS-free pages), `npm run build` → `dist/`.
- **Machine-readable graph:** `public/dataset.json` (3039 nodes / 5779 edges),
  `public/index.json`, `public/llms.txt`.
- **Node kinds:** posts, communities, themes, signatures, profiles, essays,
  curations, meta. Signatures encode recurring *persona* signals.
- **Decision:** this corpus is the **author's broader public voice/style
  substrate**, not the fictionalized game world. It informed Chris's *voice and
  humor* indirectly via the Chat Compile slice, but the game consumes the
  `chris/` curated artifacts, not the raw Reddit graph. No duplication of the
  graph into the game.

### 1c. Local inference infrastructure (confirmed live on this machine)

- **llama.cpp** (llama-server) at `http://127.0.0.1:8080`, OpenAI-compatible
  `/v1/chat/completions`, model `ornith.gguf`.
- **Ollama** at `http://127.0.0.1:11434` (`/api/chat`, `/api/embeddings`),
  `nomic-embed-text` (768-d) for semantic retrieval.
- **Critical gotcha (learned the hard way):** ornith.gguf is a *reasoning*
  model. With a small `max_tokens` it spends its budget on `reasoning_content`
  and returns an **empty or truncated visible line**. Fix: send
  `chat_template_kwargs: { enable_thinking: false }` and a sane budget
  (`max_tokens: 400` is plenty for 1–3 sentences). This is wired into the
  llama.cpp provider.

---

## 2. What I built — `~/Projects/chris-game`

A new **Next.js 14 App Router** app (TypeScript, strict). It is a *new consumer*
of the existing compiled artifacts, not a re-implementation of either compiler.

### 2a. Architecture (the 8 layers, enforced)

```
PLAYER INPUT
   → INTENT PARSER      lib/inference/intent.ts   (rule-based, deterministic)
   → GAME ACTION        lib/core/types.ts
   → WORLD STATE        lib/core/world.ts         (serializable, versioned)
   → RETRIEVAL          lib/retrieval/retrieval.ts
   → CHARACTER STATE    lib/characters/engine.ts
   → EVIDENCE           lib/core/evidence.ts
   → NARRATION          lib/narrative/narrator.ts (local model, scoped context)
   → OUTPUT VALIDATION  narrator.validateOutput + engine guard
   → STATE TRANSITION   only the engine mutates state
   → SAVE               localStorage (client) / serialized WorldState
```

| Layer | File(s) | Notes |
|---|---|---|
| World State | `lib/core/world.ts`, `lib/core/types.ts` | `WorldState` v1; player, location, time, inventory, money, relationships, known_facts, beliefs, hypotheses, events, flags, quests, character_states, evidence, phone, contacts, health/stamina, social trust, progression, endings. Fully serializable. |
| Compiled Knowledge | `data/compiled/chris.json` + `lib/characters/chris.ts` | Generated from `~/Projects/Chris/artifacts/chris/` by `scripts/compile-game-data.mjs` (curated import, **not** a second compiler). |
| Character Engine | `lib/characters/engine.ts`, `chris.ts` | Knowledge boundaries (`knows/doesNotKnow`), `lies`, `withholds`, `secrets`, trust 0–100, mood, distinctive voice. Chris is **not** a flattening of the author. |
| Game Rules | `lib/engine/game-engine.ts` | Deterministic handlers; every state change is engine-driven. |
| Retrieval | `lib/retrieval/retrieval.ts` | Provenance-preserving; keyword + cosine (uses Ollama `nomic-embed-text` when available, local fallback vectorizer otherwise). |
| Inference | `lib/inference/provider.ts` | `InferenceManager` → llama.cpp (`:8080`) → Ollama (`:11434`) → **explicit `NoLocalInferenceError`, never a silent cloud call.** `MockProvider` for tests/offline. |
| Narration | `lib/narrative/narrator.ts` | Scopes minimal context (character + topic + nearby memories + active evidence), voices Chris, tags epistemic status, validates output. |
| Evidence / Provenance | `lib/core/evidence.ts`, `lib/core/facts.ts` | Immutable evidence (one-way `markDiscovered`); every fact carries `provenance` + `status` (canonical/testimony/belief/hypothesis/rumor/unknown). |

### 2b. Epistemics (the gameplay core)

`FactStatus = canonical | testimony | belief | hypothesis | rumor | unknown | observation`.
Every fact/evidence instance records `provenance { source, sourceType, sourceId,
confidence }`. The player learns to distinguish **FACT / TESTIMONY / MEMORY /
BELIEF / HYPOTHESIS / RUMOR / UNKNOWN** — surfaced in the UI with status tags and
in the right-hand Evidence/Knowledge panels.

### 2c. Unreliable information (the central mechanic)

Chris can **lie** (`handling: "lie"` → voices the predetermined lie text) and
**withhold** (`handling: "withhold"` → deflects without revealing). The canonical
world underneath is deterministic. Episode 1's contradiction is built in:
Chris's spoken "we were fine" is `testimony`; the hidden note
(`ev_chris_note`) is `canonical` and explicitly `contradictsFactIds:
["ep1.sarge.chris_argument"]`. The AI narrator never resolves the contradiction
for the player.

### 2d. Episode 1 — "THE NIGHT BEFORE" (playable, self-contained)

Chris alive; Sarge already dead; something is wrong. Playable actions: look
around, talk to Chris, ask about Sarge, examine the note (the discovery), examine
the bottle/photo/phone, confront Chris (trust drop), search the room, call
(hidden behind phone unlock), sleep, leave. Contains: a beginning, multiple
interactions, **≥1 discovery** (the note), **≥1 contradiction** (note vs. Chris's
"fine"), **≥1 secret** (Chris was with Sarge; owes money), **≥1 character state
change** (trust −5 on confront; withhold lifted on discovery), **≥1 evidence**,
multiple interpretations, and **two endings** (sleep → `ep1.dawn`; leave →
`ep1.left`). The episode ends unresolved on purpose.

### 2e. UI

`app/` — literary-terminal layout: left = world/location/time/quests; center =
narrative; bottom = natural-language input; right = evidence / established facts
/ discovered knowledge. Typography-first, dark, intimate, responsive (panels hide
on mobile). Save/load via `localStorage`. No chat-app chrome.

### 2f. API

`app/api/turn/route.ts` — runs the engine **server-side** (so compiled
artifacts and inference stay off the client). `GET` is a local-only capability
probe. The model output is never allowed to mutate `WorldState`; only the engine
does.

---

## 3. Verification (what actually ran)

- `npx vitest run` → **51/51 passing** (world, evidence immutability, facts/
  epistemics, character boundaries/lies/withhold/trust, intent parsing,
  retrieval, save/load round-trip, and **the model-cannot-mutate-canonical-state
  guarantee** — a mock adversarial "Sarge is alive" reply never enters
  `knownFacts`).
- `npx tsc -p tsconfig.json --noEmit` → clean.
- `npm run lint` → clean (one harmless hook-deps warning).
- `npm run build` → success.
- **Live end-to-end playthrough against local ornith.gguf on `:8080`**: Chris
  speaks in-voice on talk/ask/confront; the note discovery, contradiction,
  canonical facts, trust change, and endings all resolve deterministically. No
  cloud provider is contacted (capability probe reports `localOnly: true`).

---

## 4. Constraints honored

- No 3D / Three.js / Unity / Unreal / splats. No auth, payments, multiplayer,
  blockchain.
- Compiled artifacts are **imported**, not duplicated; the full corpora are not
  embedded in a runtime prompt.
- The LLM is narration-only and fail-closed; local-first inference is a
  first-class architecture with a clean provider boundary (future distributed
  provider plugs in without engine changes).
- Fictionalized game content is clearly separated from source-derived material
  (provenance + `WORLD_AUTHOR` markers).

---

## 5. Extensibility path (not yet built — by design)

Compiled characters/worlds, distributed local inference across consumer硬件,
cryptographically verifiable (immutable) evidence, multiple AI characters,
persistent player memory, branching narratives, procedural events, AI adversarial
("hostile brain") testing layer — all sit behind the interfaces already defined
(`Evidence`, `InferenceProvider`, `CharacterEngine`, `Retrieval`, `Narrator`).
