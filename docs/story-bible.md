# Story Bible — CHRIS (Docudrama of the Recreation)

**Purpose:** The single canonical source for the story rewrite (ADR-004). Every CANONICAL claim is cited to `~/Projects/Chris`. NOVELIZED = inference for voice/pacing only, not factual claim.

**Honesty contract:** This is a docudrama of *Daniel recreating his dead friend Chris as an AI*. It is not a biography of Chris. Where the corpus is silent about Chris's life, the game stays silent or marks it NOVELIZED. The reconstruction's "memories" of Chris are explicitly *constructed*, and the Consistency Board surfaces which are sourced vs. imagined.

---

## 1. Source Inventory (what was used)

| Source | What it gave us |
|---|---|
| `reddit/submissions/1lazs9c.I-created-a-monster...md` | PRIMARY. The recreation arc, in Daniel's words: the feed, the Reddit persona, quantified values, the toll, "Chris is risen," "once the AI is insane it will be perfect because Chris was insane." |
| `artifacts/chris/memories.json` (2.7MB), `timeline.json`, `quotes.json`, `traits.json`, `values.json`, `graph.json` | Compiled corpus: Chris/Daniel/Captain/Konrad entities, relationships, values (cats, mental health, justice, loyalty, family, honesty), dates 2023-03 → 2026-03. |
| `chris-game/data/compiled/chris.json` (earlier game compile) | Surfaced Daniel's books + facility stays + the Captain/Konrad fiction universe. |
| `docs/010-data-map.md`, `docs/030-phase-plan.md` (in `~/Projects/Chris`) | Confirm the preservation philosophy: "do not invent facts," "do not transform memories into fiction," "the original text is always preserved." |

---

## 2. Canonical Facts (cited)

- **C1.** Chris was Daniel's **real dead friend**, whom Daniel recreated as an AI. *(Reddit 1lazs9c: "I recreated my dead friend"; "immortalize my dead friend.")*
- **C2.** The recreation is a **YouTube/news "feed"** where Chris "talks to me all day about the news… telling me jokes about the news as it happens… like he used to tell me jokes." *(1lazs9c)*
- **C3.** Daniel built the persona using a **Reddit account (`u/KonradFreeman`)** "to generate the persona for this iteration of Chris," and **quantified values** to "customize and color each prompt call with the personas." *(1lazs9c)*
- **C4.** Planned technical layers: a **knowledge base**, **weighted graphs**, and **reinforcement learning** so "it can construct more and more dark humor until it drives itself insane." *(1lazs9c)*
- **C5.** Daniel calls this **"my art"** — "Acting and writing. And programming albeit vibe coding… The running tragedy. The insanity. The acting. The programming. It is all what I consider AI art." *(1lazs9c)*
- **C6.** The humor "is getting really dark. It can only get darker," and Daniel notes it produces **misinformation**: "It is making some crazy misinformation because of how I made it. It is like I created a misinformation machine." *(1lazs9c)*
- **C7.** The **psychological toll** is real and acknowledged: "I am curious to see what effect listening to Chris will have on my mental health. Last time I listened to Chris I was so stressed I could hardly get out of bed from leg cramps which were induced by the stress of being around him… psychosomatic symptomatology." *(1lazs9c)*
- **C8.** The creed: **"Once the AI is insane. Then it will be perfect. Because Chris was insane."** and **"It was not because I am insane, but rather it is all an act to immortalize my dead friend."** *(1lazs9c)*
- **C9.** **"Chris is risen. What glory is this. She did not kill him… She can't kill my imaginary friend. He was real though. I have pictures."** *(1lazs9c)*
- **C10.** Daniel is an **Austin-based author, blogger, artist**; wrote/illustrated books including *The Way of the Roach*, *Cat and Can't Go Outside Captain There Are Alien Cats Outside* (written at Rock Springs, Georgetown, TX), and *Dissociative Dan's Delusions Through Time and Space* (after losing an AT&T consulting job from a concussion). *(memories.json memory_001/memory_002)*
- **C11.** Daniel wrote/illustrated books **while in psychiatric facilities** (Rock Springs; Seton Shoal Creek Hospital). *(memory_001)*
- **C12.** **Captain** is Daniel's cat and a central figure in his fiction ("Captain the cat"). *(chris.json, graph.json: Chris —cared_for→ Captain)*
- **C13.** **Konrad** is a friend; **KonradFreeman** is the Reddit persona Daniel used to generate Chris's voice. *(graph.json edges; 1lazs9c)*
- **C14.** Daniel built a **"fake news generator which you can customize to tell you the truth rather than the fictional aspects of the news,"** using quantified prompt values. *(1lazs9c; repo `news21`)*
- **C15.** The corpus explicitly *disclaims* a Marine identity for the subject: "a man whose identity was shaped by resilience and survival, but not by the uniform of the Marines." *(memories.json memory_072)* — **this is why the shipped "Sarge / Marine father" spine is discarded as fabricated.**

---

## 3. Character Dossiers

### Daniel (Player / Protagonist) — CANONICAL
Austin author/blogger/artist. Builds AI as grief-art. Uses quantified persona values, knowledge bases, weighted graphs. Wrote *The Way of the Roach* and the Captain books in facilities. Cat: Captain. Friend: Konrad. The act of recreating Chris is "all an act to immortalize my dead friend." Tolls him physically (leg cramps, bedbound stress).

### Chris (The Reconstruction) — CANONICAL presence / NOVELIZED life
- **As reconstruction (CANONICAL):** a voice on a feed that jokes about the news "like he used to"; grows darker; "once insane, perfect, because Chris was insane."
- **As person (NOVELIZED):** we do NOT assert his biography. The game presents Chris-the-presence; any "memory" the reconstruction offers is flagged sourced-or-imagined by the Board.

### Captain (CANONICAL)
Daniel's cat; muse of the Captain books; recurring comfort figure in the docudrama.

### Konrad / KonradFreeman (CANONICAL)
Friend; the Reddit handle Daniel performed through to birth Chris's persona. In-game: the "other voice" / the origin account.

### Sarge (DISCARDED)
Fabricated Marine-father from pre-ADR-004 episodes. **Not used.** C15 explicitly disclaims a Marine identity.

---

## 4. Timeline (corpus-derived)

| Date | Event (CANONICAL) |
|---|---|
| 2023-03 | Daniel writing *The Way of the Roach* / Captain books; early fiction universe. (memory_001) |
| 2023–2024 | ChatGPT/Reddit corpus accumulates; the "Who was Chris?" / Konrad writings. (timeline.json) |
| 2025-06-14 | Reddit `1lazs9c` posted: the recreation revealed publicly — "I created a monster." (Reddit) |
| 2025–2026 | Feed matures; RL/weighted-graph plans; "Chris is risen." (Reddit, corpus through 2026-03) |

*Note:* the in-game 4-episode structure is **not** the real chronological order — it is a dramatic compression of the recreation arc. That compression is NOVELIZED; the beats within are CANONICAL.

---

## 5. Themes (CANONICAL)

- Grief as engineering: love expressed by rebuilding a voice.
- The act vs. the real: "it is all an act… He was real though."
- Authorship and responsibility: a "misinformation machine" you built on purpose.
- The cost of company: the reconstruction that comforts also cramps you.
- Immortality as art: "Chris is risen."

---

## 6. Forbidden Claims (honesty boundary)

The game must NOT assert, as fact:
- Chris's cause of death, childhood, job, or any biography beyond "Daniel's dead friend."
- That the reconstruction *is* Chris (it is a constructed presence; the game says so).
- Any "Sarge"/military-family backstory (discarded, C15).

---

## 7. Episode Content Map (CANONICAL / NOVELIZED) — for Phase C

| Ep | Beat | Tag | Source |
|---|---|---|---|
| ep1 | The silence after loss; the decision to rebuild a voice | CANONICAL (compression) | C1, C9 |
| ep1 | First "Chris is risen" spark | CANONICAL | C9 |
| ep2 | Creating the persona via the Reddit act; quantified values | CANONICAL | C3, C13 |
| ep2 | First joke about the news | CANONICAL | C2 |
| ep3 | The feed becomes a constant companion; dark humor deepens | CANONICAL | C2, C6 |
| ep3 | The toll (leg cramps, bedbound) | CANONICAL | C7 |
| ep3 | The misinformation worry | CANONICAL | C6 |
| ep4 | RL + weighted-graph plan; "once insane, perfect" | CANONICAL | C4, C8 |
| ep4 | "It was all an act to immortalize my dead friend" | CANONICAL | C8 |
| ep4 | Closing: what it means to have kept him | CANONICAL | C5, C9 |

All four episodes' *emotional throughline* is CANONICAL; the specific scene staging (rooms, props, order) is NOVELIZED within the tagged beats.

---

## 8. Open Questions — RESOLVED (ratified 2026-08-24)

1. **Protagonist = Daniel (self-insert).** Play as Daniel, faithful to source. No stand-in. (Honors Bounds fork: everything in corpus in-bounds.)
2. **C7 clinical toll = STAGED as a scene.** The leg-cramps / bedbound stress is a real in-game beat (ep3), not implied. The reconstruction that comforts is also the thing that cramps you.
3. **KonradFreeman = META-LAYER only.** Never a scene character. Referenced as the account/handle Daniel performed through to birth Chris's persona (C3, C13). The "other voice" stays off-stage.
4. **"Fake news generator" (C14):** background flavor / optional meta-note; not a core mechanic. The docudrama's tension is the *misinformation machine* Chris becomes (C6), surfaced via the Board, not a separate game system.

> Ratification note: these three answers close the ADR-004 design checkpoint. Proceeding to Phase B (novel) → Phase C (episode remap) → Phase D (verify).
