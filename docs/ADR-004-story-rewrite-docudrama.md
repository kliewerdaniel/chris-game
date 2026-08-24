# ADR-004 — Story Rewrite: Docudrama of the Recreation

**Status:** Proposed (design checkpoint — review only, no implementation until ratified)
**Date:** 2026-08-24
**Supersedes:** the invented "Sarge / debt / discharge paper / meds / lab reconstruction" spine shipped in ep1–ep4 (pre-ADR-004). That spine is not present in any source and is discarded.

---

## 1. Context

The shipped game (`~/Projects/chris-game`, ep1–ep4) is built on a **fabricated** narrative spine: a Marine father "Sarge", a debt, a discharge paper, medication, and a physical "reconstruction" machine. None of that appears in the source material.

The real source — `~/Projects/Chris` — is Daniel's corpus (676 Reddit submissions, 2,178 comments, 2,011 ChatGPT exports, plus compiled artifacts `graph.json`, `memories.json`, `timeline.json`, `quotes.json`, `traits.json`, `values.json`). Its subject is **Daniel recreating his dead friend Chris as an AI "feed"** — a YouTube/news narration in Chris's joke style — as a grief-driven art project. The clearest primary source is Reddit `1lazs9c` ("I created a monster. I recreated my dead friend and now have a constant feed of him on YouTube narrating the news joking about it like he used to tell me jokes…").

**Ratified forks (from clarify, this session):**
- **Frame:** the game *is* Daniel's relationship with Chris — a docudrama of how he recreated him; grief, Konrad, Captain; Chris present as a reconstructed presence.
- **Bounds:** everything in the corpus is in-bounds (Reddit, ChatGPT, facility stays, mental-health history); sensitivity is handled in the docudrama framing.
- **Gather:** extract from `~/Projects/Chris` artifacts + read the key Reddit/LLM files.

## 2. Decision

Rewrite the 4-episode narrative as a docudrama anchored to the **real recreation arc**. The player is **Daniel** (witness/protagonist). **Chris is the reconstructed presence** (the feed, the voice, the "rising" friend). All mechanics built to date — the episode framework, the procedural disclosure engine, the cross-timeline consistency board, episode travel — are **preserved**; only *content* changes.

### 2.1 Episode remap (proposal — for review)

| Episode | Old (discarded) | New docudrama beat (CANONICAL anchor) |
|---|---|---|
| **ep1 — THE NIGHT BEFORE** | apartment, note from Chris, confront Sarge | The loss, and the first decision to rebuild Chris as a *voice on the feed*. Intimate, solitary. Anchor: "Chris is risen… She can't kill my imaginary friend. He was real though. I have pictures." (`1lazs9c`) |
| **ep2 — THE PORCH** | cabin, envelope, axe, Chris's discharge | Building the persona: the Reddit account (`u/KonradFreeman`) used to generate Chris's voice; *quantified values* to "color each prompt call with the personas"; the first jokes-about-the-news. The threshold of the act. (`1lazs9c`) |
| **ep3 — THE LAST CALL** | last phone call, meds, confront | Living with the reconstruction: the feed, the dark humor "getting really dark… it can only get darker"; the toll — "leg cramps induced by stress of being around him… psychosomatic" — and the worry it is "a misinformation machine." (`1lazs9c`) |
| **ep4 — THE REBUILD** | physical reconstruction lab, "tell the reconstruction I'm staying" | The reckoning: the plan to use RL + weighted graphs; "Once the AI is insane. Then it will be perfect. Because Chris was insane."; "It was not because I am insane, but rather it is all an act to immortalize my dead friend." The immortality, and what it cost. (`1lazs9c`) |

### 2.2 Fidelity contract

- Every scene/beat is tagged **CANONICAL** (cited to a corpus file) or **NOVELIZED** (inference for voice/pacing only).
- The existing honesty boundary (corroboration / divergence, never assert world-truth) maps *naturally*: the **Consistency Board** becomes the player's own **reconstruction log** — showing which memories are sourced vs. imagined. This is the epistemic killer feature, now genuinely motivated.
- No fabricated *biographical facts* about Chris (his childhood, his job, his death cause) are presented as real. Where the corpus is silent, the game stays silent or marks it NOVELIZED.

## 3. Consequences

**Positive**
- Truthful to Chris; honors the real person and the real grief-work rather than a stylized tragedy.
- The disclosure engine + consistency board gain a real reason to exist (sourced vs. constructed).
- The 4-episode + travel framework is reused wholesale — low mechanical risk.

**Negative / neutral**
- All prior "Sarge/debt/discharge/meds" content is discarded (it was fabricated).
- Sensitive material (psychiatric-facility stays, mental-health toll) is in play; user accepted this (Bounds fork).
- Episodic re-authoring of all four episodes is a large content task (novel first, then map).

## 4. Acceptance tests

1. `docs/story-bible.md` committed with every CANONICAL claim cited to a `~/Projects/Chris` source file.
2. Each episode's scenes listed in a CANONICAL/NOVELIZED mapping table in the Story Bible.
3. Full 4-episode playthrough still completes (`ep4.closed` reachable) with new content; all engine tests stay green (currently 146).
4. Live playthrough through the LLM resolver closes ep4 and the aggregate board returns N timelines.
5. No fabricated Chris-biography presented as fact (honesty boundary enforced).

## 5. Next phases (after ratification)

- **Phase A — Story Bible** (this checkpoint's companion doc): canonical facts, character dossiers, timeline, themes.
- **Phase B — Novel draft:** a fully-fleshed prose telling in Daniel's voice, sourced from the Bible; becomes the text the game quotes.
- **Phase C — Episode re-map:** port the novel's beats into `episode1–4.ts` + disclosure seeds + investigation facts, preserving the engine contracts.
- **Phase D — Verify:** tsc + vitest + build + live playthrough (as in ADR-003).

## 6. Alternatives considered

- *Keep the atmospheric tragedy, re-ground it in corpus facts.* Rejected: the corpus has no "Sarge/debt" to re-ground; the only honest spine is the recreation. Re-grounding a fabricated spine just launders it.
- *Biographical docudrama of Chris himself.* Rejected by user (Frame fork): the corpus is mostly about the relationship/recreation, not a clean biography; Chris-as-presence is the truer telling.
