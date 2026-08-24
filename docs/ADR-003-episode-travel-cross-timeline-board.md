# ADR-003 — Episode Travel (non-destructive rewind) + Cross-Timeline Consistency Board

**Status:** Proposed (working-tree, awaiting review)
**Date:** 2026-08-24
**Project:** CHRIS (`~/Projects/chris-game`)

## Context

The story is already non-linear in time: `ep1` THE NIGHT BEFORE (the night Sarge
died) → `ep2` THE PORCH (years earlier, the cabin) → `ep3` THE LAST CALL (much
later) → `ep4` THE REBUILD (after, the reconstruction). The player asked for the
ability to move back and forth between episodes ("travel from one to another").

The engine today is **forward-only**: each episode's `setup(carry)` imports the
*previous* episode's final `WorldState` to carry trust/evidence/known-facts
forward. There is no rewind contract, and the Consistency Board (`/api/investigation`)
is **per-episode** — it takes a single serialized `WorldState`. The epistemic
payoff (corroboration across time) is currently capped at one episode at a time.

Two design questions were put to the user and **ratified**:

1. **Scope** → *Revisit completed episodes (non-destructive rewind) + unlock free
   travel after finishing ep4.* First-playthrough reveal order is preserved; the
   hub never spoils the curated contradiction reveals.
2. **Board** → *Aggregate across all visited episodes* — cross-timeline
   corroboration / divergence, which is the epistemic killer feature of the game.

## Decision

Introduce a **Travel Journal**: a client-owned, persisted list of per-episode
snapshots captured when the player *enters* an episode and (more richly) when an
episode *completes*. Travel is a read-only replay of a snapshot — it never
mutates the snapshot or the live (forward) timeline, so it is strictly
non-destructive.

### Travel rules
- **During first playthrough:** the player may jump to any **completed** episode
  (a snapshot exists for it). Jumping shows that episode's state frozen; the
  forward timeline is untouched. Returning to the furthest reached episode resumes
  live play exactly where they left it (`restore` keeps current in-place progress).
- **After `ep4` completes (`ep4.closed`):** all episodes become free-travel
  (the `freeTravel` flag flips on); the player may jump anywhere, in any order,
  with full knowledge. This is the "sandbox / re-read" mode.
- **Continuity intact:** jumping into a *completed* episode replays its end-state
  snapshot (which already carries the carried-forward trust/evidence). This is
  consistent with the existing `setup(carry)` contract — the snapshot is exactly
  the state `nextEpisode` produced for the next episode, so the other episodes'
  forward lineage is preserved.

### Cross-timeline board
`/api/investigation` gains an **optional** `states: string[]` body field. When
present, the endpoint builds the per-episode payload for each state and
**unions** them:
- `established` / `discovered` → union across timelines.
- `corroboration` → union of fact rows; a fact is corroborated if it is
  corroborated in *any* timeline, and we surface `timelines` (the episode ids
  where it appears) so the player can see *which timelines agree*.
- `visibleContradictions` → union; each carries a `timeline` tag.
- `openLeads` → union, degree summed across timelines (a lead that is open in
  multiple episodes is more central → higher degree → ranked first).

Single-state (backward-compatible) calls continue to return the same shape as
before (the old `episodeId` key is retained; aggregate calls return
`episodeId: "all"` and add `timelines: string[]`).

### Epistemic boundary (non-negotiable, same as ADR-002)
The board still **never asserts a world-truth.** It reports *corroboration and
divergence across the timelines the player has actually visited.* A fact that is
contested in ep1 but canonical-only in ep3 is shown as "diverges in ep1,
un-contested in ep3" — the player decides. No model call in this path; the
endpoint (and `lib/core/investigation.ts`) remain pure, deterministic derivations
over engine-owned state.

## Ratified forks (user decision)
1. **Non-destructive rewind of completed episodes + free travel after ep4** (not
   free mid-playthrough hub travel, which would spoil reveal order).
2. **Aggregate board across visited episodes** (not per-episode-only).

## Consequences
- Travel is **client-side** (snapshot replay) and **server-stays-frozen**: no new
  engine state machine, no new episode transition contract. The engine's
  `processTurn` / `nextEpisode` is unchanged. This keeps the frozen spine honest.
- The snapshot captures a full `WorldState` (already serializable via
  `serializeWorldState`/`deserializeWorldState` in `lib/core/world.ts`).
- Persistence rides on the existing `localStorage` save (`SAVE_KEY`), extended
  with a `journal` array. No cloud, no secrets.
- Added surface: `lib/core/travel.ts` (journal model + pure helpers), extension
  to `lib/core/investigation.ts` (`aggregateInvestigation`), `/api/investigation`
  accepts `states[]`, and `components/GameClient.tsx` travel UI + aggregated board
  rendering + snapshot capture.

## Tasks (dependency order)
1. `lib/core/travel.ts` — `TravelJournal` type + `captureSnapshot`,
   `markComplete`, `canTravelTo`, `isFreeTravel`, `restore`. Hermetic tests.
2. `lib/core/investigation.ts` — `aggregateInvestigation(states[])`. Hermetic tests.
3. `/api/investigation` — accept optional `states[]`, return aggregate.
4. `GameClient.tsx` — travel chips, capture on enter/complete, aggregated board,
   persistence of `journal`.
5. tsc + vitest + build green; live re-verify travel + board against ornith.
