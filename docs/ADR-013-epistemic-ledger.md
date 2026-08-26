# ADR-013: In-Game Epistemic Ledger (the honesty structure, made visible)

**Status:** ACCEPTED (implemented; see verification below)
**Date:** 2026-08-25
**Supersedes:** — (extends ADR-004 docudrama repoint, ADR-012 corpus voice)
**Carries:** the epistemic honesty boundary — *the reconstruction voices a world
it does not define; the ledger reports what the player has established, never
what the game asserts as truth.*

## Context

ADR-004 repointed the game to docudrama: every beat anchored to Daniel's real
artifacts, and every fact in `lib/core/facts.ts` carries **provenance** +
**status** (canonical / testimony / rumor / unknown / belief / hypothesis /
observation). ADR-012 pulled the reconstruction's voice from the compiled
corpus and tagged it `testimony`, provenance-linked.

But the provenance/status machinery is currently **invisible to the player**.
The CaseFile rail shows an "Established" list of bare `statement` strings plus a
tiny `sourceType` tag, and a Consistency Board (opened via `[board]`) that shows
corroboration/divergence across timelines. The honesty structure the whole game
is built on is not something the player can *read at a glance*.

The user chose: **make the epistemic honesty visible as an in-game ledger.**

## Decision

Add a **Ledger** panel to the existing CaseFile rail — a dedicated "Ledger"
section that lists the facts the player has established, each row showing:

- **the statement** (resolved from the fact catalog, not the raw id),
- **a status chip** using the same `statusClass`/`statusLabel` grammar already
  used on narration lines (`status-tag` colors), so color is never the only
  signal — the word (CANONICAL / TESTIMONY / UNKNOWN / …) is present,
- **the provenance source** as a faint diegetic line (`f.provenance.source`),
  mirroring how `NarrationLineView` already renders `.src-tag` for corpus-chris
  lines. This is the core of the honesty surfacing: the player sees *who said
  it / what it's sourced to*.

It does **not** add a new UI system — it is one more collapsible `<section>`
inside the existing `CaseFile` aside, reusing `getFact`, `statusClass`,
`statusLabel`, and the same CSS tokens. No R3F, no new engine contract.

### Scope boundaries (carried)
- The ledger is **display-only**. It never lets the player edit facts; it
  reflects `ws.knownFacts` (the engine's established set) exactly.
- Reconstruction-claimed facts (`claimedBy: "reconstruction"`) render with their
  `testimony`/`rumor` chip + provenance ("The reconstruction (in-voice)") — so
  the player can *see* that a line came from the echo, not from Daniel's source.
- `unknown` facts (e.g. `ep1.she`, `ep1.mother.knows`) keep their UNKNOWN chip —
  the ledger honestly shows the unresolved threads rather than papering over
  them. This is the docudrama point: Daniel's source leaves some things open.

### Why not repurpose the Consistency Board
The Board answers a different question (cross-timeline corroboration /
contradiction). The Ledger answers "what have *I* established, and from where."
Keeping them separate preserves the Board's semantics and gives the player two
complementary lenses.

## Verification

- `npx tsc -p tsconfig.json --noEmit` → clean.
- `npx vitest run` → all green (added a ledger render test: established fact
  renders its statement + status chip + provenance source via the component, or
  via a pure render harness).
- `npm run build` → clean.
- `npx playwright test` → 2 passed (no regression to core-loop e2e).

## Consequences

- The epistemic honesty the game is built on is now legible to the player in the
  same rail as evidence: every established fact carries its status + source.
- No new engine surface; `WorldState.knownFacts` remains the single source of
  truth. The ledger is a read-only projection.
