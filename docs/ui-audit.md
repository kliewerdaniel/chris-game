# CHRIS — UI Audit (Pass 1)

> Authoritative as of `main` HEAD. Read against **actual code**, not the
> "single vertical stack / unstyled PoC" picture in the redesign brief — that
> picture does not match the current repo (see §0).

---

## 0. Premise discrepancy — READ FIRST

The redesign brief describes the current UI as:

> a single vertical stack: title, "new game" / "board" links, an "Evidence"
> panel ("Nothing recovered yet. Search the room."), an "Established Facts"
> panel, a "Commands" list … a "SAY" input … and a "World" / "Board" section
> at the bottom. It reads as an unstyled proof-of-concept.

**The repository at `main` is not that.** It is already **Iteration 2**
(`app/globals.css` header comment: *"design system (Iteration 2)"*), a
purpose-built literary layout:

- `app/globals.css` (946 lines) — a real design-token system: warm paper
  surfaces (`--bg`, `--bg-soft`, `--bg-panel`), manuscript ink ramp, a
  **lamplight gold accent**, an 8-hue **epistemic palette** (canonical /
  testimony / belief / hypothesis / rumor / observation / contradiction /
  unknown — each with a *texture* cue, not just color), Newsreader/Fraunces/
  Plex-Mono type roles, and a deliberate responsive collapse.
- `app/layout.tsx` — three `next/font` faces wired to CSS vars.
- `components/GameShell.tsx` — a 3-column grid: `WorldPanel` (left) ·
  `NarrativeLog` (center) · `EvidencePanel` (right), with `TravelBar`,
  `GameHeader`, `CommandInput`, `TabBar` (mobile), `Toast`, and two overlays.
- `EvidencePanel` already contains a **Consistency Board** (corroboration /
  contradictions / open leads), Evidence, Established Facts, and Commands.
- `globals.css` already has a first-class mobile layout (rails → bottom
  drawer toggled by `TabBar`).

So the brief's "what's wrong" list is partly **stale**. The real questions for
Pass 2 are *refinement / gap-closing on an existing design system*, not
greenfield. **Before I touch Pass 2, confirm which you're seeing:**

- **(a)** You're looking at the **live demo** `chris-game-xi.vercel.app` and
  it *is* showing the old single-stack PoC → the deploy is stale; I should
  redeploy `main` and then audit the real surface.
- **(b)** You're looking at `main` in an editor and the brief text is just an
  outdated summary → I refine the Iteration-2 surface below.
- **(c)** You want me to *throw out* Iteration 2 and do a different aesthetic
  from scratch → tell me the direction.

Everything in §1–§4 below is verified against current `main` code regardless
of which you pick.

---

## 1. What state actually exists vs. what the UI gestures at

Engine state is defined in `lib/core/types.ts` (`WorldState`) and mutated only
by `lib/engine/*`. The deterministic engine is the source of truth; the LLM is
a narration interface only (`lib/core/types.ts:1-8`, `lib/narrative/narrator.ts`).

State the engine tracks (from `WorldState`):
`player.{health,stamina,money,socialTrust}`, `location`, `time`, `inventory`,
`contacts`, `phoneUnlocked`, `knownFacts`, `beliefs`, `hypotheses`, `flags`,
`quests`, `events`, `evidenceIds`, `characterStates[id].{trust,mood,withheld,
knowsFactIds,beliefs,goals,askedTopics,recentlyConfronted}`, `episodeId`,
`progression`, `episodeComplete`, `endingId`, `conversationLog`.

Plus the **disclosure decision** the engine makes per topic
(`DisclosureMode`: truth / partial / **lie** / withhold / deflect / joke /
threaten — `types.ts:54-62`), decided rule-only, never by the model.

### 1.1 Which of those the UI actually surfaces

| Engine state | Surfaced? | Where |
|---|---|---|
| narration log | ✅ | `NarrativeLog` |
| `evidenceIds` (discovered) | ✅ (as Evidence) | `EvidencePanel` |
| `establishedFacts` (fact IDs) | ⚠️ see §2 | `Established Facts` |
| `episodeId`, `location` | ✅ | `WorldPanel` |
| `time` (day/clock) | ✅ | `GameHeader` |
| `characterStates.chris.trust` | ✅ | `WorldPanel` TRUST·CHRIS |
| `player.socialTrust` | ✅ (likely static — §2) | `WorldPanel` SOCIAL |
| `quests` | ✅ | `WorldPanel` Quests |
| travel journal / free-travel | ✅ | `TravelBar` |
| consistency graph | ✅ (gated) | `Consistency Board` |
| `inventory` | ❌ **MISSING** | — (no panel; `hyp-item` CSS is dead) |
| `contacts` / `phoneUnlocked` | ❌ **MISSING** | — (no contacts UI; `call` verb exists ep2+) |
| `beliefs` / `hypotheses` | ❌ **MISSING** | — (`hyp-item` CSS exists, unused) |
| `characterStates[id].mood` | ❌ **MISSING** | — |
| `characterStates[id].withheld` | ❌ **MISSING** | — (the topics Chris refuses to discuss) |
| `events` | ❌ **MISSING** | — |
| `knownFacts` (statements) | ❌ (only IDs via Established) | — |
| **disclosure decision** (lie/withhold) | ❌ **MISSING — most important** | — |

---

## 2. Element inventory — classification

Verified against `GameShell.tsx`, `GameClient.tsx`, `globals.css`.

### Load-bearing (surface real engine state)
- **`NarrativeLog`** — the story itself. Correctly the primary surface.
- **`EvidencePanel` → Evidence** — wired to `evidence` (from
  `result.discoveredEvidence`). Real, immutable, provenance-tagged. Good.
- **`Established Facts`** — wired to `established` (from
  `result.establishedFacts`). ⚠️ **But it renders raw fact IDs**
  (`ep1.feed.real`, `ep1.psychosomatic`, …) as text (`EvidencePanel` maps `f`
  directly). The player sees internal identifiers, not statements. This is an
  under-wiring defect, not a design choice — fixable by resolving IDs →
  `Fact.statement` from the compiled graph.
- **`WorldPanel` EPISODE / LOCATION** — real.
- **`WorldPanel` TRUST·CHRIS** — real (`characterStates.chris.trust`).
- **`WorldPanel` Quests** — real.
- **`TravelBar`** — real (snapshot reachability + free-travel).
- **`Consistency Board`** — real (`buildInvestigationPayload`,
  `lib/core/investigation.ts:322`). Corroboration / contradictions / open
  leads. Gated behind `[board]`; empty until opened.
- **`GameHeader` Day/clock** — real (`ws.time`).

### Misleading (implies state/capability the engine doesn't have)
- **`WorldPanel` HEALTH** — `ws.player.health` is set once in
  `lib/core/world.ts` and **never mutated anywhere in `lib/`** (grep: 0 hits
  for `health`/`stamina`/`money` in `lib/engine`). Constant. Implies a
  survival-pressure system that does not exist. **Misleading.**
- **`WorldPanel` STAMINA** — same: never mutated. **Misleading.**
- **`WorldPanel` SOCIAL (`socialTrust`)** — no mutation found in engine
  (grep clean). Almost certainly static. **Likely misleading** (verify).
- **`Commands` list** — hand-authored per-episode string arrays
  (`commandHints(ws)` in `GameClient.tsx:686`). Not derived from the real
  parser grammar (`lib/inference/intent.ts` supports look/talk/ask/examine/
  search/move/use/call/confront/sleep/tell/wait/inventory/evidence/help/chat).
  It is a *partial curated hint list*, not the grammar. Clickable-to-fill, but
  competes with story text as a permanent wall — matches the brief's complaint.
  **Misleading-as-grammar** (it looks like syntax when it's flavor).
- **Polychrome epistemic palette is mostly dormant.** The 8-hue
  status system exists in CSS, but `NarrationLine.status` is only ever set to
  `canonical` (in `EPISODE_INTROS`). `testimony`/`belief`/`hypothesis`/
  `rumor`/`contradiction` are essentially unused in live narration → a rich
  visual language that's asleep.

### Decorative / questionable real-estate
- **`Consistency Board` permanent rail position** — it's gated behind
  `[board]` and renders *inside* the right rail above Evidence. When closed,
  that space is just Evidence/Facts/Commands. Reasonable, but the board could
  be a more prominent diegetic "case file" rather than a toggle-in-a-panel.
- **`Toast`** — fine (transient feedback).
- **`TabBar` (mobile)** — World/Board rail switcher. Not duplication; correct
  mobile pattern. (The brief's "board appears twice" is an artifact of the
  older single-stack build, not current code.)

---

## 3. What's missing (engine tracks it, player can't see it)

Ranked by relevance to the project's thesis (*local AI as interface, compiled
world as reality; the engine is the truth*):

1. **The disclosure decision is invisible.** The engine decides, per topic,
   whether Chris tells the truth / partial / **lies** / withholds
   (`DisclosureMode`). This is *the* core mechanic and the whole epistemic
   hook — and the UI never surfaces it. A diegetic cue ("Chris won't meet your
   eye." / "He changes the subject." / a `WITHHELD`/`LIE` provenance tag on the
   line) would make the engine legible without breaking the "model never
   decides" rule. **Highest-value gap.**
2. **`withheld` topics** (`characterStates[id].withheld`) — what Chris is
   currently refusing to discuss. Natural "case file" material.
3. **`inventory`** — never shown, though the parser supports `inventory` and
   episodes reference it (`doInventory`). Dead CSS (`.hyp-item`) hints an
   intent that was dropped.
4. **`contacts` / `phoneUnlocked`** — phone state exists; `call` is a real verb
   (ep2+); no contacts surface.
5. **`beliefs` / `hypotheses`** — player notebook state tracked, never
   rendered (dead `.hyp-item` CSS).
6. **`mood`** — character emotional state, never shown.
7. **`events` log** — canonical events this playthrough, never surfaced.
8. **Static survival stats (health/stamina)** — either (a) remove them (they're
   misleading), or (b) leave them but stop implying pressure. **Out of scope
   for UI** (changing the survival model is an engine decision).

---

## 4. Ambiguities / flags for you (not guessing)

- **§0 premise**: which UI are you actually looking at? (a)/(b)/(c) above.
- **HEALTH/STAMINA/SOCIAL static**: confirm — if the engine truly never moves
  them, I'll drop or relabel those `WorldPanel` lines rather than ship a dead
  "stat" that implies a survival system.
- **Established Facts shows fact IDs**: this is a real defect. I'll resolve IDs
  → `Fact.statement` (from `data/compiled/chris.json`) in Pass 2. Confirm you
  want the *statement text*, not the ID, in that panel.
- **Scope of "show the disclosure decision"**: surfacing lie/withhold is a UI
  *presentation* of existing engine state (allowed — no new mechanics). But how
  explicit should it be? Options: subtle diegetic prose cue vs. an explicit
  epistemic tag on the line. I'll propose in the Pass 2 design, but flag the
  taste call now.
- **No Playwright in repo.** `package.json` has **zero** Playwright deps and
  there are no `.spec.ts`/e2e files — all 168 tests are **Vitest unit tests**
  (`tests/*.test.ts`). The brief says "extend the repo's Playwright/visual
  check" — that infra does not exist. I'll add a lightweight Playwright e2e
  (core-loop: SAY → Evidence/Facts update) as a new file, or substitute a
  DOM-level Vitest + `jsdom` test if you'd rather not pull a browser binary.
  **Confirm which you prefer** (Playwright needs a chromium download).

---

## 5. Out-of-scope engine gaps (listed, not silently fixed)

- Survival pressure (health/stamina) is modeled in state shape but never
  simulated. UI can only *hide* or *relabel* it; realizing pressure is an
  engine change.
- `beliefs`/`hypotheses`/`inventory`/`contacts` are tracked but have no
  discovery/ mutation path in the current episodes → surfacing them risks
  showing permanently-empty panels. I'll surface only what episodes actually
  populate, or render an honest empty-state.
- Cross-timeline corroboration (board across >1 timeline) exists in code but
  only triggers after visiting multiple episodes; not a default view.
