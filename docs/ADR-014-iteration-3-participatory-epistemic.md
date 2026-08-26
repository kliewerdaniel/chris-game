# ADR-014: Iteration 3 — Participatory Epistemic Layer + Reconstruction Visual

**Status:** PROPOSED (review only — no implementation yet)
**Date:** 2026-08-25
**Supersedes:** — (extends ADR-004 docudrama, ADR-012 corpus voice, ADR-013 epistemic ledger)
**Carries:** the epistemic honesty boundary — *the reconstruction voices a world it does not define; the player can now interrogate that voicing and watch the epistemic state change.*

## Context

Iterations 1–2 built the docudrama spine and made its honesty **visible but passive**:

- ADR-012 — the reconstruction speaks from the compiled corpus, tagged `testimony`, provenance-linked.
- ADR-013 — a Ledger panel shows each established fact with its `status` chip + provenance source; the Consistency Board shows cross-timeline corroboration/divergence.

What's missing is **participation**. The honesty structure is something the player *reads*; it is not something the player *acts on*. The defining tension of the docudrama — the reconstruction is stitched from mythos (Tier-2 delusions), real Chris only recoverable through Daniel's Reddit posts (Tier-0) — is currently a static fact the player is told, not a force they feel.

Iteration 3 makes the epistemic layer **participatory**: the player can interrogate the reconstruction's claims, the reconstruction responds deterministically, and that exchange is recorded into the ledger. It also gives the reconstruction a **visual form** that visibly encodes its stitched-from-mythos nature — using CSS/Canvas only (no Three.js), preserving local-first + zero-new-dependency.

## Decision

Three dependency-ordered phases. Each is its own commit; this ADR is the design checkpoint for all three.

### Phase A — Interrogation interaction (epistemic interaction redesign)

- Any `NarrationLine` (especially `testimony`/reconstruction lines) becomes clickable → opens a lightweight **probe** affordance showing the provenance node + a "Challenge this?" prompt.
- On challenge of a `testimony` reconstruction line, the reconstruction responds via a **deterministic rule** (no LLM; fail-closed):
  - response chosen by `hash(factId)` → stable across reloads,
  - either **doubles down** with a second corpus-sourced line (tagged `testimony`), or **concedes** ("I'm just what Daniel compiled — I don't know if any of it's him").
- The challenge + response is recorded into the ledger as an established event (`epN.challenged.<id>`), so the player's skepticism is *part of the record*, not discarded.
- **Boundary preserved:** goes through the existing engine action pipeline (`addKnownFact` / `setFlag`); does **not** mutate `ReconstructionState` (`lib/reconstruction/state.ts`) or any existing API contract/save format.

### Phase B — Reconstruction visual (CSS/Canvas, NO Three.js)

- A deterministic visual for "the reconstruction" rendered in the existing aside/CaseFile region: a form **assembled from fragments**.
  - fragments whose source is **canonical Tier-0** (Reddit/blog) render **solid**,
  - fragments whose source is **Tier-2 mythos** (memories.json) render with a visible **stitched/glitch** treatment.
- This visually encodes the Two-Chris gap: the reconstruction is mostly stitching, with a few solid real-Chris bones.
- **Deterministic boundary:** `WorldState → Evidence/Facts → Provenance → ReconstructionState (read-only) → Visual`. Same inputs → same visual (no randomness), so it is reproducible and testable.
- **Non-goal:** Three.js / R3F. The audit (Phase 0/1) found the repo is hand-written CSS, Next 14.2.15, no 3D. A CSS/Canvas "stitched fragments" treatment carries the metaphor locally with **zero new dependencies**. R3F is deferred unless explicitly ratified.

### Phase C — Investigation cross-timeline deepening

- `buildInvestigationPayload` (ADR-003) output gains first-class **divergence alerts**: for each reconstruction `testimony` claim, flag whether a Tier-0 canonical fact *contradicts* it. The Consistency Board already computes corroboration/divergence; Phase C promotes a contradiction to an actionable alert the player can act on (re-read source, challenge).
- **Boundary preserved:** extends the existing payload shape additively; does not alter existing investigation logic outputs consumed elsewhere.

## Scope boundaries (carried from prior constraints)

- Engine action pipeline, API contracts, save format, narration text, and `ReconstructionState` shape are **not altered by UI iterations** — Phase A/C are additive through existing entry points.
- Fail-closed: missing provenance on a challenged line → reconstruction concedes (never asserts, never crashes).
- Local-first: no new runtime dependency; CSS/Canvas only.

## Verification (definition of done, per phase)

- `npx tsc -p tsconfig.json --noEmit` → clean.
- `npx vitest run` → all green, plus per-phase tests:
  - **A:** challenging a `testimony` line deterministically flips a stable response (hash-seeded) and records `epN.challenged.<id>`; after a concede, the claim is never re-asserted as `canonical`.
  - **B:** `buildReconstructionVisual(ws): Fragment[]` is deterministic; canonical-sourced fragments marked `solid`, mythos-sourced marked `stitched`; component renders both.
  - **C:** payload includes divergence flags; a contradictory `testimony` is flagged.
- `npm run build` → clean.
- `npx playwright test` → 2 passed (no core-loop regression).
- Manual: voice-OFF playthrough confirming probe affordance + visual render on the live build.

## Consequences

- The docudrama's central tension becomes something the player *does*, not something they're told.
- Honesty stays participatory and verifiable; the reconstruction can never silently upgrade a mythos claim to canon.
- Zero new dependencies; local-first preserved.

## Alternatives considered

- **R3F/Three.js 3D reconstruction scene.** Rejected as default: heavy dependency, audit shows no 3D in repo, marginal epistemic gain over a CSS "stitched fragments" treatment, and it would break the zero-new-dep local-first posture. Deferred; can be ratified separately as a later phase.
- **LLM-driven reconstruction rebuttals.** Rejected: non-deterministic, fails-open risk, and contradicts the fail-closed/no-LLM-in-core discipline. Deterministic hash-seeded responses keep it reproducible and testable.
