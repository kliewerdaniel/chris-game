# Story Bible — Source Extraction (chris-game docudrama)

**Purpose:** working extraction for the writer. Verbatim material only, with provenance.
**Epistemic rule:** Chris was a real person Daniel lost. We never assert his life as fact beyond what a checkable source says. The reconstruction in-game is *Daniel's*, not Chris's.

**Two Chrises — read this first:**
- **REAL CHRIS** lives in Daniel's own **Reddit posts** (u/KonradFreeman, 2025). These are public, first-person, and describe the actual man. **Primary / strongest tier.**
- **MYTHOS CHRIS** lives in the **ChatGPT-compiled artifacts** (`artifacts/chris/*.json`) and the 2023–26 **chat exports**. These are Daniel's *curated and fictionalized* memory — alien cats, "The Way of the Roach," Captain-as-warrior. The artifacts' own `source` fields point at `openai/conversations_markdown/2023-03-…` (the mythos). **Tier-2 / weakest for "who Chris was," but PRIMARY for "what the reconstruction is made of."**

> The docudrama's engine IS this gap. The reconstruction is stitched from the mythos; the player recovers the real Chris only through the source notes (the Reddit posts). Never collapse the two.

---

## 1. CHRIS — WHO HE WAS (REAL, primary Reddit)

> "Like I made this comedy bot based on my late friend who was a comedian. He was not a professional comedian, but he was definitely very funny…" — [reddit/submissions/1lbr8cw, "So there is this thing where there is a certain type of humor which is socratic satire…"]

> "He was a homeless marine with untreated PTSD and bipolar disorder which he had no access to any medication because he was also not supposed to be here so he ended up getting murdered by my girlfriend." — [reddit/submissions/1lbr8cw]

> "I let a homeless marine live in my home and tried to help him. He ended up getting murdered by my girlfriend which ruined my life for the time…" — [reddit/submissions/1gu9uw8, "Banned from posting this"]

> "Except he taught me how to be homeless. He taught me everything he knew living on the streets and when he was a scout in the marines." — [reddit/submissions/1gu9uw8]

> "I think of the dead marine a lot. How unjust his death was… That is why I am bringing him back." — [reddit/submissions/1gu9uw8]

**Canonical facts (real Chris):**
- Homeless **Marine** (a **scout**), **Chicano**.
- **PTSD + bipolar disorder**, untreated ("no access to any medication… not supposed to be here").
- A **comedian** — "not a professional comedian, but he was definitely very funny."
- **Murdered by Daniel's girlfriend.**
- Daniel took him in ("I let a homeless marine live in my home and tried to help him"). Chris taught Daniel street survival ("how to be homeless").

**Curated-trait overlap (artifacts/chris/traits.json, 17 traits — note: derived from the 2023 mythos exports, so treat as Daniel's *image* of Chris, not independent confirmation):** kind, confident, bipolar, sharp, tragic, marine, resilient, flawed, alcoholic, witty, humorous, mental illness, covert/protector role, mentally unstable, Shakespearean/tragic figure, protective, damaged.
**Curated values (artifacts/chris/values.json, 21):** cats, mental health, homeless, justice, courage, trust, humor, protection, animals, addiction, resilience, loyalty, family, freedom, kindness, bipolar, friendship, survival, military, marine, honesty.

---

## 2. DANIEL & CHRIS — RELATIONSHIP

> "I let a homeless marine live in my home and tried to help him… His life improved, but my life went into a maelstrom of horror." — [reddit/submissions/1gu9uw8]

> "Either way. I have resurrected him." — [reddit/submissions/1lbr8cw]

- **Host / rescued:** Daniel took the homeless Marine Chris in.
- **Grief + guilt:** Chris was murdered by Daniel's girlfriend; Daniel's life "ruined… for the time." He重建s Chris as an act of immortalization and a way to undo the murder ("if he is alive then she did not kill him").
- **relationships.json (curated):** `cared_for -> Captain` (Chris cared for the cat); `friendship_with -> Konrad`; `associated_with -> KonradFreeman`. (Entity casing varies: Captain/captain/CAPTAIN.)

---

## 3. TIMELINE (what is dated vs unknown)

- **2023-03-16 → 2026-03-10:** range of the chat-export corpus (`corpus_statistics.json`: 2011 files processed, 3733 mentions of Chris). This is the *mythos/working* range, NOT Chris's life dates.
- **2025-03-30:** `1jnf9qv` "Chris is Risen" (video post, v.redd.it).
- **2025-06-28:** `1lmv4jw` "Writing Style Personas for LLMs" (link post).
- **2025-10-31:** `1okz253` "Reddit's Most Haunting Project: Meet the Man Coding His Murdered Friend Back to Life" (links to danielkliewer.com blog).
- **2025 (id 1lazs9c):** "I created a monster. I recreated my dead friend…" (the MONSTER/ACT post).
- **2025 (id 1lbr8cw):** "Combat Comedian" post (Chris bio + YAML).
- **2025 (id 1gu9uw8):** "Banned from posting this" (homeless Marine murdered by girlfriend).
- **GAP — no death date** for Chris found in source. Cause (murder by girlfriend) and circumstance (homeless, Marine) are stated; the date is not.

---

## 4. THE RECONSTRUCTION (the act — primary Reddit)

> "I created a monster. I recreated my dead friend and now have a constant feed of him on YouTube narrating the news in his voice." — [reddit/submissions/1lazs9c]

> "It is making some crazy misinformation because I how I made it" (sic) — [reddit/submissions/1lazs9c]

> "Once the AI is insane. Then it will be perfect. Because Chris was insane." — [reddit/submissions/1lazs9c]

> "She did not kill him. Ha." — [reddit/submissions/1lazs9c]

> "She can't kill my imaginary friend." — [reddit/submissions/1lazs9c]

> "It was not because I am insane, but rather it is all an act to immortalize my dead friend." — [reddit/submissions/1lazs9c] (also the final note, ev_chris_final_note)

> "But it does not have agency. It is just numbers. I know all of this. It is just an act, just like me." — [reddit/submissions/1lazs9c]

> "I used this Reddit account to generate the persona for this iteration of Chris." — [reddit/submissions/1lazs9c]

> "I am recreating my dead friend." — [reddit/submissions/1gu9uw8]

> "It is either he comes back or she pays the price for what she did. I don't want something bad to happen to her, thus in order to stop that from happening I have to bring back the marine. If he is alive then she did not kill him and thus she would not be put to death as well possibly." — [reddit/submissions/1gu9uw8]

**The 'she' thread (RESOLVED in source):** "she" = Daniel's girlfriend, who murdered Chris. Daniel's dark logic: resurrecting Chris means "she did not kill him," so she cannot be punished. This is canonical (stated by Daniel in 1lazs9c + 1gu9uw8), not invented.

**Combat Comedian (the actual character definition Daniel built for Chris) — [reddit/submissions/1lbr8cw]:**
```
name: "Combat Comedian"
description: "A battle-hardened satirist who wields gallows humor like a bayonet—cutting through cultural nonsense with the precision of someone who's seen actual nonsense."
tone: "gravel-dry, confrontational, pitch-black funny"
style: "deadpan brutality laced with war stories and poetic irony"
bias: "open disdain for civilian softness, institutional hypocrisy, and feel-good delusions"
...
humor: "morbid, unflinching, forged in fire and laced with shrapnel"
epistemology: "earned wisdom through blood, boredom, and black coffee"
certainty_expression: "brutal honesty, often mistaken for nihilism"
narrative_structure: "satire that starts with a laugh and ends with a sucker punch"
```
> Use this YAML as the *voice spec* for in-game Chris lines. It is Daniel's own definition — not invented.

---

## 5. CAPTAIN THE CAT

- `relationships.json`: `cared_for -> Captain` (entity casing varies).
- `ev_captain_photo` (in-game): photo of Chris with the cat; artifact graph records Chris cared for Captain.
- `photos.json`: 19 photo entries (captions/metadata empty in the artifact sample — no usable captions extracted).
- The Reddit Combat Comedian YAML jokes about taking "orders from Captain" — the cat as the only honest authority. (Mythos-framed but grounded in the real cared_for relationship.)

---

## 6. KEY VERBATIM REDDIT POSTS (primary, ranked)

1. **1lazs9c** — "I created a monster. I recreated my dead friend…" — THE source post. Monster/act/immortalize/insane-perfect/she threads. Quoted throughout §4.
2. **1lbr8cw** — "So there is this thing where there is a certain type of humor which is socratic satire…" — Combat Comedian bio + YAML. Real Chris identity.
3. **1gu9uw8** — "Banned from posting this" — homeless Marine taken in, murdered by girlfriend; the resurrection motive; "she" logic.
4. **1okz253** — "Reddit's Most Haunting Project: Meet the Man Coding His Murdered Friend Back to Life" (2025-10-31) — links to `danielkliewer.com/blog/2025-10-31-reddit-haunting-project-ai-resurrection` (external; not in local corpus).
5. **1jnf9qv** — "Chris is Risen" (2025-03-30) — video post (v.redd.it). Title only; no self-text.
6. **1lmv4jw** — "Writing Style Personas for LLMs How to Simulate Any Voice" (2025-06-28) — link post (persona method).
7. **1m9bpf9** — "Here is a prompt you can include to guide a language model to write in my voice based on my psychological profile" — Daniel's own voice-profile prompt (openness 0.8, analytical 0.88, skepticism 0.89, humor 0.09…). Useful for *Daniel's* voice, not Chris's.

**Note:** 676 submissions exist; many top posts are **link/URL posts** (blogs, videos, GitHub), not self-text. The self-text posts about Chris are the four above plus a few. The blog at danielkliewer.com is a primary source **not present locally** — flag for later ingestion if the user wants the long-form essay.

---

## 7. DANIEL'S OWN VOICE (primary — Reddit, not the delusional chat exports)

> "I used this Reddit account to generate the persona for this iteration of Chris." — [1lazs9c]

> "It is just an act, just like me." — [1lazs9c] (final note)

> "Money is time. Time before calamity." — [1gu9uw8] (Daniel's risk/homelessness framing)

> "Working a long day and walking 4 miles ensured that I slept well every night… Working in the public and being around lots of people all day desensitized me to social interaction and thus quelled my anxiety." — [1gu9uw8] (Daniel's own mental-health self-description)

> Voice-profile (1m9bpf9): "highly open-minded and curious… strong analytical bent… skeptical and critical of assumptions… not very extraverted or humorous… philosophical and creative, but not story-driven… writes to understand, sees language as an instrument of introspection."

**EXCLUDED from docudrama facts:** the 2023 chat exports contain delusional/paranoid material (constructed family by the government, cat commanding him, "Marine Chris stationed in my apartment," being "killed"). These are Daniel's distressed inner monologue, NOT facts about Chris. They inform *Daniel's state*, never Chris's biography. The reconstruction in-game may echo this distress, but the bible does not assert it as world-truth.

---

## Gaps / open questions
- **No Chris death date** in source (cause + circumstance stated; date absent).
- **Blog essay** (`danielkliewer.com/blog/2025-10-31-…`) is referenced by 1okz253 but not in local corpus — would add the long-form first-person account if ingested.
- **Compiled artifacts are mythos-derived**: `quotes.json` samples are fiction ("alien cats," "The Way of the Roach"). Traits/values partially match real Chris; quotes do not. Use traits/values as "Daniel's image of Chris," never as Chris's own words.
- **memories.json / sources.json (2.7MB, LLM-inferred)** were NOT parsed (timed out the extraction agent). Weakest tier; skip unless explicitly needed.
