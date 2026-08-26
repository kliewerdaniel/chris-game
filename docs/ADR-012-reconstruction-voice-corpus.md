# ADR-012: Reconstruction Voice is Pulled from the Compiled Corpus (tagged testimony, provenance-linked)

**Status:** ACCEPTED (implemented; see verification below)
**Date:** 2026-08-25
**Supersedes:** — (extends ADR-004 docudrama repoint)
**Carries:** the epistemic honesty boundary — *the reconstruction voices a world
it does not define; what it says is sourced, never asserted as Chris's literal
speech.*

## Context

ADR-004 repointed the game to docudrama: every narrative beat anchored to the
real artifacts — KonradFreeman's Reddit posts (esp. `1lazs9c`) and Daniel's
compiled `~/Projects/Chris/artifacts/chris/` corpus. The prior rewrite pulled
*prose* from those artifacts but left the reconstruction's spoken one-liners as
either invented lines or lines with a dangling, unbacked `ref` id
(`{ kind: "memory", id: "corpus-chris" }` pointed at nothing).

Two questions the user answered, in order:

1. *"pull Chris's spoken voice from the compiled memories.json"* — the
   reconstruction's voice should come from what Daniel actually compiled about
   Chris, not from lines we invent.
2. *"wire that"* — register a real provenance node so those lines resolve to a
   source instead of a synthetic id.

### What `memories.json` actually is (honesty boundary)

`artifacts/chris/memories.json` (2011 entries) and `quotes.json` (500) are
**Daniel's ChatGPT fiction** — "The Way of the Roach and Cat," Chris as a
"comedic soldier," alien cats, Tracy/Booka. This fiction is exactly what the
`chris.json` dossier traits (marine, witty, protector, sharp) were compiled
from. It is **not Chris's recorded voice**. The decision is to use it as the
reconstruction's *spoken register* and tag it `testimony` (sourced to the
corpus, never claimed as Chris's literal words), matching the game premise:
Daniel's reconstruction speaks from what he compiled.

## Decision

- The reconstruction's spoken one-liners (Ep2 talk/confront, Ep3 talk/confront/doSit,
  Ep4 talk/run) are drawn from verbatim compiled-Chris material:
  - eigenvalue/matrix quips (`memory_031`, source `openai/conversations_markdown/2023-03-19/6091d46a.md`): *"eigenvalues are like the DNA of linear algebra"* / *"the matrix is the recipe, the vector's the ingredients"* / *"add a pinch of salt to the algorithm"*
  - *"The more data they have, the more they can control people's behavior. That's pretty scary."*
  - character: *"a man of principle, kid. I wouldn't betray your trust."* / *"The man could make you laugh in your darkest hour."*
  - bio cadence: *"a homeless marine… sharp wit… an alcoholic and loved weed… quite the lady's man."* (`memory_072`)
- Each line is emitted as a `NarrationLine` with `speaker: "chris"`,
  `status: "testimony"`, and `ref: { kind: "memory", id: "corpus-chris" }`.
- `lib/core/evidence.ts` exports `CORPUS_CHRIS_PROVENANCE` — a real
  `Provenance` node (`sourceType: "compiled_event"`, `sourceId: "memories.json"`,
  `source: "Compiled from ~/Projects/Chris/artifacts/chris/memories.json (memories_xxx) + openai/conversations_markdown/2023-03-19/6091d46a.md …"`, `confidence: 0.7`). This is the same provenance home as other evidence, so it is traceable.
- `components/GameShell.tsx` `NarrationLineView` renders a subtle **diegetic**
  source note (`.src-tag`) whenever `line.ref.kind === "memory" && line.ref.id === "corpus-chris"`, showing `CORPUS_CHRIS_PROVENANCE.source`. It is styled faint mono, matching the in-fiction cue grammar — **not a meta-tag**, no "TESTIMONY" sticker. The player can tell which lines are "what Daniel compiled" vs canonical fact.

### Why `testimony`, not `canonical` / `compiled`

`NarrationLine.status` is `FactStatus`; `"compiled"` is not a valid member, so
the lines use `"testimony"` (sourced claim, attributed). `ref` carries the
resolution to the provenance node.

### What was removed

Invented imagery in the prior pass ("coffee goes cold", "blinds drawn",
"behind your ribs", "a story he actually told once") was stripped; prose is now
re-anchored to the artifacts and the corpus voice.

## Verification

- `npx tsc -p tsconfig.json --noEmit` → clean.
- `npx vitest run` → **170 passed** (added 2 tests):
  - `CORPUS_CHRIS_PROVENANCE` exists, `sourceType === "compiled_event"`, sourced to `memories.json`.
  - Ep2 `talk` surfaces a line `speaker:"chris"`, `status:"testimony"`, `ref:{kind:"memory",id:"corpus-chris"}`.
- `npm run build` → clean.
- `npx playwright test` → 2 passed (core-loop e2e).

## Consequences

- The reconstruction now speaks from the actual compiled corpus, each line
  traceable to its source. The honesty boundary holds: tagged testimony /
  compiled, never asserted as Chris's literal voice.
- UI surfaces provenance subtly in-fiction; no epistemic break for a player
  who trusts the reconstruction's voice.
