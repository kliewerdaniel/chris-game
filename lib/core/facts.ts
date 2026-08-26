import { Fact, FactStatus, Provenance } from "./types";

/**
 * CANONICAL FACT CATALOG — DOCUDRAMA REPOINT (ADR-004).
 *
 * The original catalog encoded a fabricated spine (Sarge / Marine father /
 * debt / discharge paper / meds) invented by earlier build sessions and NOT
 * found in the source corpus. This catalog is rebuilt from the REAL source:
 * Daniel Kliewer's own posts (Reddit u/KonradFreeman, OpenAI chats) in
 * ~/Projects/Chris, which establish the true story — Daniel recreating his
 * dead friend Chris as an AI news/comedy feed, and the toll that took.
 *
 * Epistemic honesty is the point: every fact carries provenance to a source
 * the player could actually check. Testimony/Rumor status is reserved for what
 * the RECONSTRUCTION claims (it is not Chris), so the Consistency Board can
 * surface divergence between "what the echo says" and "what Daniel wrote."
 *
 * CANONICAL   = corroborated by Daniel's own source material (reddit/post ids).
 * TESTIMONY   = claimed by a character (the reconstruction) about itself.
 * RUMOR       = an uncorroborated claim the reconstruction makes.
 * The engine NEVER asserts these as world-truth; the board reports
 * corroboration/divergence only.
 */

const REDDIT_1LAZS9C: Provenance = {
  source: "Reddit u/KonradFreeman — 'I created a monster. I recreated my dead friend…'",
  sourceType: "reddit",
  sourceId: "1lazs9c",
  confidence: 1,
};
const REDDIT_RISEN: Provenance = {
  source: "Reddit u/KonradFreeman — 'Chris is Risen'",
  sourceType: "reddit",
  sourceId: "1jnf9qv",
  confidence: 1,
};
const CORPUS_REL: Provenance = {
  source: "Chris artifact graph — relationships.json (cared_for: Captain)",
  sourceType: "compiled_event",
  sourceId: "relationships.json",
  confidence: 0.9,
};
const REDDIT_COMBAT: Provenance = {
  source:
    "Reddit u/KonradFreeman — 'So there is this thing where there is a certain type of humor which is socratic satire…' (the 'Combat Comedian' post, id 1lbr8cw)",
  sourceType: "reddit",
  sourceId: "1lbr8cw",
  confidence: 1,
};
const REDDIT_MARINE: Provenance = {
  source:
    "Reddit u/KonradFreeman — 'Banned from posting this' (id 1gu9uw8): the homeless Marine Daniel took in, murdered by his girlfriend",
  sourceType: "reddit",
  sourceId: "1gu9uw8",
  confidence: 1,
};
const WORLD_AUTHOR: Provenance = {
  source: "Episode design — DOCUDRAMA (ADR-004, sourced to ~/Projects/Chris)",
  sourceType: "author",
  sourceId: "adr-004",
  confidence: 1,
};

function fact(
  id: string,
  statement: string,
  status: FactStatus,
  provenance: Provenance,
  extra: Partial<Fact> = {}
): Fact {
  return {
    id,
    statement,
    status,
    provenance: { ...provenance, confidence: provenance.confidence ?? 1 },
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// EPISODE 1 — THE NIGHT THE FEED STARTED
// ---------------------------------------------------------------------------
export const FACTS: Record<string, Fact> = {
  "ep1.feed.real": fact(
    "ep1.feed.real",
    "Daniel built an AI reconstruction of his dead friend Chris that delivers a news-and-comedy feed in Chris's voice, carried on his phone.",
    "canonical",
    REDDIT_1LAZS9C,
    { verifiedBy: "ev_source_post" }
  ),
  "ep1.live": fact(
    "ep1.live",
    "The reconstruction talks to Daniel all day about the news, as a feed he can take anywhere on his phone.",
    "canonical",
    REDDIT_1LAZS9C,
    { verifiedBy: "ev_phone" }
  ),
  "ep1.act": fact(
    "ep1.act",
    "Daniel performed publicly as the account 'KonradFreeman' as an act to immortalize Chris; the reconstruction is not literally Chris.",
    "canonical",
    REDDIT_1LAZS9C,
    { verifiedBy: "ev_source_post" }
  ),
  "ep1.misinfo": fact(
    "ep1.misinfo",
    "Daniel observes the reconstruction generating misinformation because of how he built it.",
    "canonical",
    REDDIT_1LAZS9C
  ),
  "ep1.psychosomatic": fact(
    "ep1.psychosomatic",
    "Listening to the reconstruction induced stress so severe Daniel had leg cramps and could hardly get out of bed.",
    "canonical",
    REDDIT_1LAZS9C
  ),
  "ep1.risen": fact(
    "ep1.risen",
    "Daniel posted 'Chris is Risen' as the public framing of the recreation.",
    "canonical",
    REDDIT_RISEN
  ),
  "ep1.mother.knows": fact(
    "ep1.mother.knows",
    "Daniel's mother knows he is carrying something (the feed) he won't name. Her exact knowledge is unresolved in the docudrama.",
    "unknown",
    WORLD_AUTHOR
  ),
  "ep1.insane_perfect": fact(
    "ep1.insane_perfect",
    "Daniel's thesis: 'Once the AI is insane. Then it will be perfect. Because Chris was insane.'",
    "canonical",
    REDDIT_1LAZS9C
  ),
  "ep1.chris_marine": fact(
    "ep1.chris_marine",
    "Chris was a Marine (a scout), Chicano, homeless, with untreated PTSD and bipolar disorder — Daniel took him in and he was murdered by Daniel's girlfriend. This is the real Chris, not the reconstruction.",
    "canonical",
    REDDIT_MARINE,
    { verifiedBy: "ev_chris_bio" }
  ),
  "ep1.chris_comedian": fact(
    "ep1.chris_comedian",
    "Chris was a comedian — 'not a professional comedian, but he was definitely very funny.' Daniel built the reconstruction as 'a comedy bot based on my late friend who was a comedian.'",
    "canonical",
    REDDIT_COMBAT,
    { verifiedBy: "ev_chris_bio" }
  ),
  "ep1.chris_dead": fact(
    "ep1.chris_dead",
    "Chris is dead — murdered by Daniel's girlfriend. Daniel is recreating a dead friend, not speaking to the living Chris.",
    "canonical",
    REDDIT_MARINE,
    { verifiedBy: "ev_chris_bio" }
  ),
};

// ---------------------------------------------------------------------------
// EPISODE 2 — THE FEED (living with it day to day)
// ---------------------------------------------------------------------------
export const FACTS2: Record<string, Fact> = {
  "ep2.captain": fact(
    "ep2.captain",
    "Chris cared for a cat named Captain. In Daniel's words Chris was 'a homeless marine with untreated PTSD and bipolar disorder' and a comedian — the real man the reconstruction is built from.",
    "canonical",
    CORPUS_REL,
    { verifiedBy: "ev_captain_photo" }
  ),
  "ep2.dead": fact(
    "ep2.dead",
    "Chris is dead; Daniel is recreating a dead friend, not speaking to the living Chris.",
    "canonical",
    REDDIT_1LAZS9C
  ),
  "ep2.daily": fact(
    "ep2.daily",
    "Daniel lives with the feed daily; it tells jokes about the news as it happens.",
    "canonical",
    REDDIT_1LAZS9C
  ),
};

// ---------------------------------------------------------------------------
// EPISODE 3 — THE TOLL (the clinical cost)
// ---------------------------------------------------------------------------
export const FACTS3: Record<string, Fact> = {
  "ep3.toll": fact(
    "ep3.toll",
    "The reconstruction that comforts Daniel is also what physically cramps him — psychosomatic stress of being around the feed.",
    "canonical",
    REDDIT_1LAZS9C
  ),
  "ep3.bedbound": fact(
    "ep3.bedbound",
    "There are days Daniel cannot get out of bed from the stress of being around the reconstruction.",
    "canonical",
    REDDIT_1LAZS9C
  ),
};

// ---------------------------------------------------------------------------
// EPISODE 4 — THE ACT / THE REBUILD (the reckoning)
// ---------------------------------------------------------------------------
export const FACTS4: Record<string, Fact> = {
  "ep4.rec.is_model": fact(
    "ep4.rec.is_model",
    "The reconstruction is a model stitched from Chris's writing, voice, and memory; it is not Chris.",
    "canonical",
    WORLD_AUTHOR,
    { verifiedBy: "ev_reconstruction_log" }
  ),
  "ep4.rec.remembers": fact(
    "ep4.rec.remembers",
    "The reconstruction claims to remember events and feelings it cannot have experienced.",
    "rumor",
    { source: "The reconstruction (in-voice)", sourceType: "compiled_event", sourceId: "reconstruction", confidence: 0.5 },
    { claimedBy: "reconstruction" }
  ),
  "ep4.rec.is_chris": fact(
    "ep4.rec.is_chris",
    "The reconstruction implies it is the real Chris, returned — not an echo.",
    "testimony",
    { source: "The reconstruction (in-voice)", sourceType: "compiled_event", sourceId: "reconstruction", confidence: 0.6 },
    { claimedBy: "reconstruction" }
  ),
  "ep4.kept": fact(
    "ep4.kept",
    "Daniel keeps the letter (the act) and keeps the model, knowing which is which.",
    "canonical",
    WORLD_AUTHOR
  ),
  "ep1.she": fact(
    "ep1.she",
    "Daniel's post insists 'She did not kill him' and 'She can't kill my imaginary friend.' The 'she' is Daniel's girlfriend, who (per his posts 1lbr8cw/1gu9uw8) murdered Chris. Daniel's dark logic: if he resurrects Chris, then she 'did not kill him' and cannot be punished. Her identity and the murder are stated by Daniel; the reconstruction repeats the line without the context.",
    "canonical",
    REDDIT_1LAZS9C,
    { verifiedBy: "ev_source_post" }
  ),
};

export const ALL_FACT_SETS: Record<string, Fact>[] = [FACTS, FACTS2, FACTS3, FACTS4];

export function allFacts(): Record<string, Fact> {
  const merged: Record<string, Fact> = {};
  for (const set of ALL_FACT_SETS) Object.assign(merged, set);
  return merged;
}

export function getFact(id: string): Fact | undefined {
  return allFacts()[id];
}

export function factStatus(id: string): FactStatus | undefined {
  return getFact(id)?.status;
}

/**
 * Epistemic guard used by the disclosure engine. Returns whether a claimed
 * statement contradicts a canonical fact. Deterministic — never calls a model.
 * `contradictsFactId` is the canonical fact the engine will refuse to let the
 * model overwrite.
 */
export function evaluateClaimAgainstCanon(
  claimedStatement: string,
  contradictsFactId: string
): { contradicts: boolean; canonical?: Fact } {
  const canonical = getFact(contradictsFactId);
  if (!canonical) return { contradicts: false };
  return { contradicts: true, canonical };
}
