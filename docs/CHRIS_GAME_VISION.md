# CHRIS — Game Redesign & Re-architecture Vision

> **Status:** LIVING DESIGN DOCUMENT — design conversation in progress.
> Nothing here is finalized. Every section is open until recorded in DECISIONS.
> **No implementation has been authorized beyond recording decisions + this plan.**
> This document is the shared notebook, not a build spec.

---

## 0. MANDATE

Redesign CHRIS as a **game re-architecture**, not a CSS polish. The interface
should itself feel like an investigation into memory — the player reconstructs a
person. Central principle: **the interface is the reconstruction.** Hard
constraint (non-negotiable unless we decide otherwise together): **the LLM never
feeds the visual and never defines canonical truth.** The compiled knowledge
graph + deterministic engine are the source of truth; the model only interprets.

---

## 1. REPOSITORY AUDIT (as-found, verified against code at `main`)

### 1.1 Actual dependency versions (NOT assumed)
| Concern | Version | Notes |
|---|---|---|
| Next.js | **14.2.15** | App Router. Target: 16.x. |
| React | 18.3.1 | Target: 19.x (required by Next 16). |
| TypeScript | 5.4.5 | strict; Next 16 wants ES2022+ target. |
| three | 0.169.0 | present; bump likely needed for R3F v9. |
| @react-three/fiber | **8.18.0** | pairs with **React 18**. → must become **v9** for React 19. |
| @react-three/drei | 9.122.0 | must move to a v9-compatible line. |
| zod | 3.23.8 | runtime validation. |
| Styling | hand-written CSS (`globals.css` 840 lines + `tokens.css`) | no Tailwind. |
| Unit tests | vitest 1.6.0 | 23 test files. |
| E2E | @playwright/test 1.48.0 | `e2e/core-loop.spec.ts` (8 specs). |
| Deploy | Vercel (`vercel.json`) | static prerender + serverless `/api/*`. |

**Correction to brief premise:** the repo is *not* a single-stack PoC — it is
Iteration 2 (real epistemic design system, 3-column layout, Consistency Board,
R3F already installed, Playwright present).

### 1.2 Architecture (8 layers + 2 systems)
```
PLAYER INPUT → INTENT PARSER (rule-based; LLM opt-in ADR-002) → GAME ACTION
  → WORLD STATE (serializable) → RETRIEVAL (provenance-preserving)
  → CHARACTER STATE → EVIDENCE (immutable, provenance) → NARRATION (local model,
  fail-closed) → VALIDATION → ENGINE-ONLY state transition → SAVE
```
Plus: **Investigation Graph** (`lib/core/investigation.ts`) — deterministic
facts/evidence/beliefs with supports/contradicts/claimedBy/verifiedBy/relatesTo
edges. **Episode system** (`lib/engine/episode{1..4}.ts`). **R3F scene**
(`components/ReconstructionScene.tsx`).

### 1.3 Gold (preserve)
- Deterministic engine owns all state; LLM is narration-only, fail-closed,
  never mutates `WorldState` (test: mock "Sarge is alive" never enters
  `knownFacts`).
- Epistemic type system (`FactStatus`) + `Provenance` on every fact/evidence.
- Investigation graph with contradiction + corroboration detection.
- **Two-Chris gap** is the narrative engine and the natural visual
  differentiator (real-Chris-bone vs stitched-from-mythos).

### 1.4 Gaps (engine tracks it, player can't see it — from ui-audit)
| Gap | Severity |
|---|---|
| Disclosure decision (lie/withhold) invisible | CRITICAL |
| Established Facts shows raw fact IDs (defect) | HIGH |
| Epistemic palette dormant (status almost always `canonical`) | HIGH |
| beliefs/hypotheses/inventory/contacts/mood/events unshown / no creation path | MED |
| Health/stamina/social static yet displayed (misleading) | MED |
| R3F scene passive toggle, not in core loop | MED |
| Commands list = curated strings, not real grammar | LOW |

### 1.5 The structural weakness (the real reason it feels like a sequence)
The investigation graph is **precomputed from a static catalog** and only
**revealed** as the player discovers. The player's `beliefs`/`hypotheses`
arrays exist in `WorldState` but have **no creation path**. The player *reveals*
a fixed graph; they do **not build one**. Making "reconstructing Chris" a game
requires the player's reconstruction to be a **mutable graph they construct**.

---

## 2. VISION

> I am not browsing a website. I am not reading a novel. I am not talking to an
> AI. I am reconstructing a person.

The interface is the machine through which that reconstruction becomes possible.
Visual state derives deterministically from `WorldState` →
`InvestigationGraph` / `PlayerReconstruction` / `ReconstructionState`. The
epistemic palette (canonical vs testimony vs delusion) is the visual language.

---

## 3. DESIGN PRINCIPLES
1. **Determinism is the aesthetic** — visual layer is a pure function of state.
2. **Epistemic status is the visual grammar** — FactStatus everywhere.
3. **Engine reveals; player reconstructs** — disclosure + connect + challenge +
   hypothesize.
4. **Spatial only when it communicates** — 3D earns its place via the graph.
5. **Accessible by architecture** — see §9 (user override recorded; dissent noted).

---

## 4. PLAYER EXPERIENCE
- Current: read log + side panels; reveal facts; occasionally challenge.
- Target: an investigative surface where discovery, contradiction, hypothesis,
  and reflection are first-class, systemic, and visible — the player builds a
  model of Chris and watches it shift.

---

## 5. THE PLAYER RECONSTRUCTION GRAPH (the "Build" decision — design)

**Chosen fork (DECISION D2):** the player **builds a mutable reconstruction
graph**, not just reveals a fixed one. This is the architectural leap and
touches `lib/core/investigation.ts` + `WorldState` (frozen spine) — green-lit.

### 5.1 Model
```
CANONICAL GRAPH  (engine-owned, immutable: facts/evidence/beliefs + edges)
        │  player proposes: hypotheses, edges ("I think A is supported by E")
        ▼
PLAYER RECONSTRUCTION  (mutable, in WorldState)
        │  engine EVALUATES proposed edges against canonical (deterministic)
        ▼
CORROBORATION / DIVERGENCE  (pure graph math over canonical data)
        │  feeds
        ▼
VISUAL STATE  (Memory Palace spatial scene)
```
The player's graph is a **model of the truth model** — exactly the brief's
"there is a truth model, and there player's model of that truth." The LLM never
enters: hypothesis evaluation is graph comparison, not generation.

### 5.2 New player actions (deterministic, engine-owned)
- `hypothesize` — create a `Hypothesis` node (text + optional claimed factIds).
- `connect` / `test` — propose an edge between two nodes ("A is supported by
  E", "A contradicts B"). The engine compares the proposal against the canonical
  graph and returns CORROBORATED / DIVERGENT (epistemic-framed, never asserting
  the player is "right"). This is the **TEST** step of the loop.
- `challenge` (exists) — interrogate a testimony/claim; records `challenge.<id>`.

### 5.3 Emergent gameplay
- Two of the player's hypotheses conflict → a **contradiction emerges** and the
  spatial scene shows tension (Memory Palace "visual instability").
- A hypothesis conflicts with canonical → divergence alert (existing machinery
  reused).
- This closes the missing loop teeth: **CONNECT, FORM HYPOTHESIS, TEST,
  REFLECT** (the brief's skeleton, today only O/D/Q/I exist).

### 5.4 Epistemic safety
- Proposed edges are **never** written into the canonical graph.
- Evaluation is pure: does the canonical graph already contain/permit this edge?
- The ledger records player moves (`hypothesis.<id>`, `connect.<a>.<b>`),
  preserving the deterministic-core test net.

---

## 6. VISUAL DIRECTION (DECISION D1): MEMORY PALACE

Spatial / atmospheric / dreamlike. Highest "uncanny" fit for reconstructing a
person whose reconstruction may be delusional. (D1 was the user's pick over
A/B/D/E/Hybrid.)

**Spatial scope (DECISION D7):** beyond the investigation-graph-as-constellation
+ existing fragment field, the user also wants **authored 3D environments**
(the porch, the room, the last call). This implies a **new asset/content
pipeline** binding scenes to `WorldState`.

### 6.1 Asset pipeline reality (D9 — honest flag, not a blocker)
**Decision D9:** authored **GLTF** (real models, needs an asset-authoring step +
import pipeline). The first proof-of-concept environment (D12) is **the room**.

**The dependency I must surface (per brief §27 — tell you when it won't work):**
authored GLTF requires **actual model asset files** that **do not exist** in the
repo and **cannot be synthesized by me as photoreal geometry of a real dead
person's actual space**. "The room" is a real place tied to a real person; I can
build the *loader + WorldState binding + scene framework* deterministically, but
the **hero meshes themselves are an asset-production task** (you model/commission
them, or we source them). 

**Practical path I will take (no fabrication):**
1. Build the **scene framework first**: a GLTF loader, a spatial-content format
   binding a scene to `WorldState`, camera/atmosphere/lighting rigs, and the
   DOM safety net (§9). Verifiable in-engine with a **procedural placeholder**
   for "the room."
2. Swap in authored GLTF **when assets exist** — the loader is asset-agnostic,
   so this is a drop-in, not a rewrite.
3. The **investigation-graph-as-constellation** (procedural, no assets) ships
   independently and is not blocked by the model-asset gap.

So D9 is the *target*, but implementation proceeds framework-first with
placeholders; the authored meshes are an external dependency I'll track, not
pretend to generate.

---

## 7. NEXT.JS / REACT 19 MIGRATION (DECISION D3): DO IT NOW — concurrent with visual

**Verified technical findings (not assumed):**
- `@react-three/fiber@8` pairs with **React 18**; `@react-three/fiber@9` pairs
  with **React 19**. The repo is on R3F 8.18 + React 18.3.1. → Next 16 (React
  19) **requires R3F v9** + a v9-compatible `@react-three/drei`. This is a
  **breaking** R3F migration: `ThreeElements` becomes a module augmentation
  (`ThreeElement`) instead of global `JSX.IntrinsicElements`; StrictMode dev
  changes; `extend` API changes. Our `ReconstructionScene.tsx` uses these and
  must be migrated.
- **Next 16** (shipped Oct 2025; current ≥16.2.6): React 19.2 default; **Pages
  Router removed** (we use App Router — no pain); Turbopack default/stable
  (2–5× faster builds); Cache Components (`"use cache"`); new conservative
  caching defaults; `proxy.ts` (we have none); **min Node 20+**; React Compiler
  opt-in; `/api/*` route handlers remain. Security: pin ≥ Next 16.2.6 /
  React ≥ 19.2.4.
- Our app has **no custom Babel** → the Babel-removal risk does not apply.
- `eslint-config-next@14` must bump to 16; `tsconfig` target → ES2022+.

**Sequencing (DECISION D5): user chose CONCURRENT** — do the Memory Palace
visual work *in parallel with* the migration, NOT gated behind a parity-only
milestone. My recommendation (gate first) was overridden.

**Collaborator risk note (honest):** running the R3F v9 breaking migration and
the spatial redesign at the same time means a breakage can't be trivially
attributed to "migration" vs "new code." Mitigation I will enforce regardless:
keep a **thin parity e2e** (migrated app, scene hidden) and a **separate scene
e2e**, so a failure localizes. And the migration still reaches a **green
checkpoint** — we just don't *stop* there; we continue into the spatial build.

---

## 8. THREE.JS DEPTH (DECISION D4): FULL SPATIAL SCENES

Three.js becomes a first-class layer, not a toggle. Highest-value uses:
- The **investigation graph itself** rendered as a 3D constellation
  (force-directed facts/contradictions), clickable → detail + challenge.
- The existing **fragment field** (real-bone vs stitched) integrated into the
  core loop.
- **Authored reconstructed locations** (porch/room/last-call) as atmospheres
  (D7).
DOM/SVG/Canvas-2D remain for documents + timeline (2D is better there).

---

## 9. ACCESSIBILITY — DISSENT RECORDED (DECISION D6)

**Brief mandate (original §19):** *"Accessibility must be architectural. The
game must remain playable without relying entirely on WebGL… If the 3D scene
communicates information, there must be an accessible representation of that
information."*

**User decision (D6):** Memory Palace is **primary**; a11y is a **parallel
fall-back only** (not the accessible default). This **reverses** the brief's
architectural-a11y mandate and my recommendation.

**My dissent (per brief §27 — I tell you when I disagree):**
- Making WebGL the primary experience **fails** the original brief's own a11y
  bar: screen-reader users, WebGL-disabled/blocklisted browsers, low-power
  devices, and reduced-motion users would lose comprehension of information
  that lives only in the 3D scene.
- It is a **hard fail** for WCAG 2.1 AA (1.1.1 non-text content, 2.1 keyboard,
  2.3.1 avoid seizure, reduced-motion) for any state encoded *only* spatially.

**What I will still insist on as a non-negotiable engineering floor** (distinct
from the "primary vs fallback" question — this is safety, not the main
experience):
1. **Every spatial relation has a DOM representation in the DOM tree** (even if
   visually hidden / behind a toggle) — so it is crawlable, screen-readable, and
   survives WebGL-unavailable. Not the "primary" experience, but never absent.
2. **`prefers-reduced-motion`** fully respected (no forced motion/particles).
3. **Keyboard operability** of all game actions (the DOM affordances exist;
   they just aren't the headline view).

So: you own the artistic call that the Palace is primary. I will not block it.
But I will not ship a hard WebGL wall — the DOM safety net above is the floor I
will hold regardless of D6. Flagging so the trade-off is explicit, not silent.

---

## 10. PERFORMANCE — CONSTRAINT
Progressive disclosure; lazy-load WebGL; dispose scenes; code-split; the
deterministic core stays tiny and testable. Visual richness must not block first
interaction.

## 11. TESTING — PRESERVE THE SPINE
The 23 vitest + 8 playwright specs are the regression net for the deterministic
core. Any rewrite must not change underlying story/state. Add: visual
regression, a11y (axe), and **deterministic visual-state** tests (same
WorldState → same DOM/graph layout). Under D5 concurrency: keep **parity e2e**
(migrated, scene hidden) separate from **scene e2e** (new spatial build).

## 12. MIGRATION STRATEGY
**Strategy B/C hybrid:** new presentation layer around the *existing engine*.
Preserve `lib/` (engine, investigation, types, narrator) wholesale — extend
`investigation.ts` for the player graph rather than rewrite. Replace
`components/` + `app/` aggressively. Do NOT do a full rewrite (Strategy D).

---

## 13. ROADMAP (concurrent M0↔M3; M1 is the first concrete slice)

### M1 — EPISTEMIC LEGIBILITY (FIRST CONCRETE SLICE, engine-safe)
- **Why first:** highest gameplay value, zero migration risk, DOM/CSS only.
- Surface disclosure decisions (lie/withhold) as diegetic/in-fiction cues.
- Wake the dormant status palette in narration + board.
- Fix Established-Facts raw-ID defect (resolve → `Fact.statement`).
- **Files:** `components/GameClient.tsx`, `GameShell.tsx`, `globals.css`,
  `lib/narrative/*`.
- **AC:** e2e asserts disclosure cue + status coloring + facts show statements.
- Can run on the **current Next 14 stack** first (instant win), then
  re-verified after M0.

### M0 — SUBSTRATE PARITY (Next 16 / React 19 / R3F v9) — concurrent with M3
- Bump `next` 14→16, `react`/`react-dom` 18→19, `@types/*`, `eslint-config-next`
  16, `three` bump, `@react-three/fiber` 8→9, `@react-three/drei` → v9-compatible.
  Migrate `ReconstructionScene.tsx` to R3F v9 (`ThreeElement` augmentation,
  StrictMode). Keep behavior identical.
- **Files:** `package.json`, `tsconfig.json`, `next.config.mjs`, `eslintrc`,
  `components/ReconstructionScene.tsx`.
- **AC:** `tsc` 0; vitest 23 green; playwright 8 green; `next build` clean.
- **Gate as a CHECKPOINT (not a stop):** reach green, then continue into M3.

### M3 — MEMORY PALACE VISUAL (concurrent with M0)
- Investigation graph as a 3D constellation (clickable → detail + challenge).
- Fragment field in core loop (D4).
- **Authored reconstructed environments** (porch/room/last-call) — NEW asset/
  spatial-content pipeline (D7).
- Atmosphere layer (restrained motion/lighting/particles), reduced-motion path.
- DOM safety net per §9 present but not primary.
- **AC:** e2e mounts scene from a known WorldState; parity e2e still green.

### M2 — PLAYER RECONSTRUCTION GRAPH (the "Build" fork; frozen-spine green-lit) — DONE
- New `hypothesize` / `connect` / `test` actions; `PlayerReconstruction` state.
- Engine evaluates proposed edges against canonical (deterministic); ledger
  entries. Contradictions emerge.
- **Files:** `lib/core/types.ts`, `lib/core/player-graph.ts` (new — deterministic
  adapter), `lib/engine/reconstruct.ts` (new dispatch), `lib/engine/game-engine.ts`
  (route), `components/MemoryPalace.tsx` (new R3F view), `components/ReconstructionScene.tsx`
  (third "memory palace" mode), `components/GameClient.tsx` (command hints).
- **AC:** unit tests for edge evaluation (`tests/player-graph.test.ts`); engine
  dispatch (`tests/m2-dispatch.test.ts`); e2e hypothesize→grows palace
  (`e2e/core-loop.spec.ts`). All green. Model-only: never mutates canonical facts.

### M4 — ACCESSIBILITY + PERFORMANCE HARDENING
- DOM safety-net completeness; reduced-motion; lazy/dispose WebGL; a11y (axe).
- (Note: under D6 the DOM view is fallback, not default — but the floor §9
  holds.)

### M5 — TESTING EXPANSION
- Visual regression; a11y (axe) in CI; deterministic visual-state tests.

---

## 14. OPEN QUESTIONS (next round — material to execution)
- **Q1 (asset pipeline, D7):** authored 3D environments — **procedural
  geometry** (code-generated, no binary assets, fastest to iterate) vs **authored
  GLTF** (real models, needs an asset-authoring step + pipeline) vs **hybrid**
  (procedural shells + a few hero GLTFs)? Who authors the content?
- **Q2 (concurrency mechanics):** run M0+M3 on a **single feature branch** (merge
  migration + scene together) vs **two parallel branches** (migrate to green on
  one, build scene on the other, merge)? I recommend two branches so failures
  localize.
- **Q3 (disclosure cue taste — flagged by ui-audit):** surface lie/withhold as
  (a) subtle diegetic prose cue ("He won't meet your eye.") only, vs (b) an
  explicit epistemic tag on the line, vs (c) both (prose cue + a restrained
  in-fiction marker)? Recommend (a) or (c).
- **Q4 (first environment):** which authored space is the proof-of-concept —
  the **room** (most evidence-dense), the **porch**, or the **last call**?

## 15. DECISIONS (log)
| # | Decision | Why | Alternatives | Consequences | Status |
|---|---|---|---|---|---|
| D1 | **Memory Palace** visual direction | Best "uncanny" fit for reconstructing a possibly-delusional person; user pick | A Archive, B Forensic, D Art, E Hybrid, throw-out | Highest a11y risk → DOM floor (§9) | RECORDED |
| D2 | Player **BUILDs a mutable reconstruction graph** (loop 2) | Makes "reconstructing" a game, not a reveal sequence; user pick | Reveal-only (loop 1), Both | Touches frozen spine (`investigation.ts`) — green-lit | RECORDED |
| D3 | **Next 16 / React 19 migration NOW** | User pick; gated by M0 checkpoint | Defer (stay 14) | Requires R3F 8→9 breaking migration | RECORDED |
| D4 | **Full spatial scenes** (Three.js first-class) | User pick; graph-as-space + fragments + authored locations | Enhancement layer, Minimal toggle | WebGL-off fallback mandatory | RECORDED |
| D5 | **Concurrent** M0 (migration) + M3 (visual) — NOT gated | User override of my gate-first rec | Gate-first (recommended) | Breakage attribution harder; mitigated by split e2e | RECORDED (override) |
| D6 | **Memory Palace primary; a11y = parallel fallback** | User override of brief §19 + my rec | DOM-first accessible default | **Dissent recorded (§9)**; WCAG risk; DOM floor held | RECORDED (override, dissented) |
| D7 | **Authored 3D environments** (porch/room/last-call) | User pick ("also author") | Graph+field only | New asset/content pipeline; largest new subsystem | RECORDED |
| D8 | **First concrete slice = M1 disclosure surfacing** | Highest gameplay value, engine-safe | Graph-3D slice, fragment slice | M1 runs on current stack, then re-verified post-M0 | RECORDED |
| D9 | **Authored GLTF** for 3D environments (loader + WorldState binding + scene framework first; meshes are external assets) | User pick | Procedural, Hybrid | Hero meshes are an asset-production dependency, not synthesizeable in-repo (§6.1) | RECORDED |
| D10 | **Two parallel branches** for M0+M3 (migrate to green on one, build scene on the other, merge) | Localizes breakage (R3F-v9 vs new scene) | Single branch | Requires a merge step; parity e2e kept separate | RECORDED |
| D11 | **Disclosure cue = subtle diegetic prose only** (no epistemic tag) | User pick; most elegant, preserves fiction | Prose+marker, explicit tag | Engine already emits `handling`; UI renders cue in-fiction | RECORDED |
| D12 | **First authored environment = the room** (most evidence-dense) | User pick | porch, last-call | Highest content density → best proof-of-concept | RECORDED |

## 16. REJECTED IDEAS (log)
| Idea | Why rejected | Status |
|---|---|---|
| Defer Next 16 (my recommendation) | User overrode — do it now, concurrent (D3/D5) | OVERRIDDEN |
| Gate migration behind parity milestone | User wants concurrency (D5) | OVERRIDDEN |
| DOM-first accessible default (brief §19 + my rec) | User wants Palace primary (D6) | OVERRIDDEN, dissented (§9) |
| Keep R3F as passive toggle | User wants full spatial (D4) | OVERRIDDEN |
| Reveal-only graph | User wants build (D2) | OVERRIDDEN |
| Graph+field only (no authored env) | User wants authored 3D (D7) | OVERRIDDEN |
