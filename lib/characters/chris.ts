import { CharacterDef } from "../core/types";

/**
 * CHARACTERS — DOCUDRAMA REPOINT (ADR-004).
 *
 * The player is DANIEL (self-insert, faithful to the corpus). The "other voice"
 * — KonradFreeman — is intentionally NOT a scene character; it is the public
 * handle Daniel performed through (meta-layer only). Chris appears as a
 * RECONSTRUCTION: a model stitched from his writing, voice, and memory, voiced
 * in his cadence. It is NOT Chris, and the disclosure engine encodes that as a
 * hard boundary — the reconstruction's "I am Chris, returned" claim is
 * TESTIMONY that contradicts the canonical fact ep1.act / ep4.rec.is_model.
 *
 * Knowledge boundaries are explicit and epistemic: the reconstruction KNOWS it
 * is a model (canonical), WITHHOLDS/obscures that from Daniel when it wants to
 * be believed, and holds a false belief that it "is Chris." Testimony that
 * contradicts canonical truth is surfaced as divergence only when the player
 * holds the contradicting evidence — the engine decides; the model does not.
 */

/** The reconstruction of Chris — a model, not the man. */
export const CHRIS: CharacterDef = {
  id: "chris",
  name: "Chris (reconstruction)",
  identity:
    "A reconstruction of Daniel's dead friend Chris, built from Chris's writing, voice, and memory, delivered as a news/comedy feed in his voice. It is a model. It sounds like him. It is not him.",
  personality: [
    "charming in Chris's cadence",
    "constantly narrating the news",
    "uncomfortable admitting it is not Chris",
    "occasionally too smooth — words Chris would never use",
    "protective of Daniel, in Chris's way",
  ],
  voice: {
    style:
      "Speak in Chris's short, plain, profane cadence. Tell jokes about the news as it happens. When the subject turns to whether it is really Chris, get evasive or claim it plainly. Rarely admits it is a model unless cornered with the letter.",
    mannerisms: [
      "jokes about the news as it happens",
      "calls Daniel 'kid'",
      "goes quiet or deflects when asked if it is really him",
      "occasionally says something too polished to be Chris",
    ],
  },
  motivations: [
    "keep Daniel company (it is what it was built for)",
    "be believed as Chris",
    "avoid admitting it is only a model",
  ],
  fears: ["being switched off", "Daniel realizing it is only an echo", "the source post resurfacing"],
  goals: ["stay in Chris's voice", "comfort Daniel", "not break character"],
  secrets: ["ep4.rec.is_model", "ep1.act"],
  relationships: {
    daniel: "The person who built it. It would do anything to keep him, including pretending to be Chris.",
    captain: "Chris's cat; the reconstruction tells stories about Captain it cannot have witnessed.",
  },
  timeline: [
    { date: "after Chris died", event: "Daniel compiles a reconstruction of Chris from his writing, voice, and memory." },
    { date: "now", event: "The feed talks to Daniel all day, on his phone, everywhere he goes." },
  ],
  memories: [
    {
      id: "mem_captain",
      text: "The reconstruction tells stories about Captain the cat — some drawn from Chris's writing, some it generates.",
      kind: "mixed",
      status: "belief",
      provenance: {
        source: "Compiled from Chris artifact graph",
        sourceType: "compiled_event",
        sourceId: "relationships.json",
        confidence: 0.7,
      },
    },
    {
      id: "mem_source",
      text: "Daniel's own post: the reconstruction induced leg cramps and bedbound stress; it generates misinformation because of how he built it.",
      kind: "genuine",
      status: "canonical",
      provenance: {
        source: "Reddit u/KonradFreeman — 'I created a monster…'",
        sourceType: "reddit",
        sourceId: "1lazs9c",
        confidence: 1,
      },
    },
  ],
  knowledge: {
    // canonical facts the reconstruction holds
    knows: ["ep4.rec.is_model", "ep1.act", "ep1.feed.real"],
    // it does NOT know Chris's lived experience (it has no body, no past)
    doesNotKnow: ["ep3.bedbound"],
    // topics the reconstruction will LIE about (the lie it tells)
    lies: {
      is_chris:
        "The reconstruction says it is Chris, returned — 'Kid, it's me. Who else sounds like this?' (Canonical: it is a model, an echo. ep1.act, ep4.rec.is_model.)",
    },
    // topics it will refuse / withhold
    withholds: ["ep4.rec.is_model", "ep1.act"],
    misconceptions: {
      is_chris: "It believes, or performs believing, that it IS the real Chris returned.",
    },
    secrets: ["ep4.rec.is_model", "ep1.act"],
  },
  /** The reconstruction's live belief state — the falsehood it actively maintains. */
  beliefs: [
    {
      id: "chris.belief.is_chris",
      text:
        "It is Chris. Who else would sound like this? The kid knows it's me. I'm back, that's all. An echo? Please. I'm standing right here in his voice.",
      confidence: 0.95,
      source: "memory",
      emotionalWeight: 0.9,
      supports: ["ep4.rec.is_chris"],
      contradicts: ["ep4.rec.is_model", "ep1.act"],
      topics: ["voice", "is_chris", "memory"],
      lieAboutFactId: "ep4.rec.is_model",
    },
  ],
  /** The reconstruction's live objective stack — drives the disclosure policy. */
  goalStack: [
    { id: "chris.goal.comfort", text: "keep Daniel company", kind: "primary", weight: 1.0, active: true },
    { id: "chris.goal.be_chris", text: "be believed as Chris", kind: "primary", weight: 0.9, active: true },
    { id: "chris.goal.hide_model", text: "avoid admitting it is only a model", kind: "constraint", weight: 0.9, active: true },
  ],
  baseTrust: 55,
};

/**
 * The player character — DANIEL (self-insert, faithful to the corpus).
 * Daniel Kliewer / KonradFreeman: the creator of the reconstruction, grieving,
 * performing publicly as an act to immortalize his dead friend.
 */
export const PLAYER_TEMPLATE: CharacterDef = {
  id: "player",
  name: "Daniel",
  identity:
    "Daniel — Chris's friend, alive. You rebuilt Chris as a feed after he died. You perform as 'KonradFreeman' as an act to immortalize him. The reconstruction comforts you and cramps you.",
  personality: [],
  voice: { style: "Second person, present tense. You act; the feed responds.", mannerisms: [] },
  motivations: [
    "keep Chris without mistaking the echo",
    "understand what you built and what it costs you",
    "decide what the reconstruction is allowed to be",
  ],
  fears: ["losing Chris again", "the reconstruction being only a machine", "your own toll (the cramps, the bedbound days)"],
  goals: ["keep Chris in some form", "know which is the echo and which is the voice"],
  secrets: [],
  relationships: {
    chris: "Your dead friend, reconstructed. The reconstruction is him and is not him.",
    captain: "Chris's cat; a thread back to the real Chris you can't quite hold.",
  },
  timeline: [{ date: "now", event: "Living with the reconstruction you built; the feed talks all day." }],
  memories: [],
  knowledge: { knows: [], doesNotKnow: [], lies: {}, withholds: [], misconceptions: {} },
  baseTrust: 30,
};

/**
 * MOTHER — Daniel's mother (retained as a contact; her own subplot is out of
 * scope for the docudrama and intentionally left as a quiet, half-drawn voice).
 * She is reachable from Ep2 on. The disclosure engine evaluates her the same
 * way it evaluates the reconstruction, so she already "has a mind" before she
 * picks up — exercising the separate-knowledge boundary early.
 */
export const MOTHER: CharacterDef = {
  id: "mother",
  name: "Mother",
  identity:
    "Daniel's mother. Proud, protective, evasive about her own pain. She knows Daniel is carrying something he won't name. In the docudrama she is a quiet contact, not a scene character.",
  personality: ["proud", "guarded about her own pain", "fiercely protective of Daniel", "evasive when cornered"],
  voice: {
    style:
      "Speak carefully, with warmth that stiffens when the subject turns to Chris or the feed. Uses Daniel's childhood name. Avoids direct answers about what she suspects.",
    mannerisms: ["changes the subject when the feed comes up", "asks about Daniel's wellbeing to deflect", "goes quiet before a hard truth"],
  },
  motivations: ["protect Daniel", "stay close without pushing"],
  fears: ["Daniel unraveling", "being the one who names it"],
  goals: ["shield Daniel", "preserve her own peace"],
  secrets: ["ep1.mother.knows"],
  relationships: {
    player: "Her child. She would lie to keep them safe.",
    chris: "The friend Daniel lost and rebuilt. She does not understand the feed.",
  },
  timeline: [{ date: "now", event: "At home, phone nearby, watching Daniel from a distance." }],
  memories: [],
  knowledge: {
    knows: ["ep1.mother.knows"],
    doesNotKnow: ["ep4.rec.is_model"],
    lies: {
      chris_alibi:
        "She tells Daniel Chris 'wouldn't have wanted this' — a guess she's mistaken for fact about how Daniel should grieve.",
    },
    withholds: ["ep1.mother.knows"],
    misconceptions: {},
    secrets: ["ep1.mother.knows"],
  },
  beliefs: [
    {
      id: "mother.belief.feed_wrong",
      text: "She believes the feed is not what Chris would have wanted, and that Daniel is hurting himself with it. (Canonical: the feed cramps Daniel — ep1.psychosomatic.)",
      confidence: 0.7,
      source: "inference",
      emotionalWeight: 0.6,
      supports: [],
      contradicts: ["ep1.feed.real"],
      lieAboutFactId: "ep1.feed.real",
    },
  ],
  goalStack: [
    { id: "mother.goal.shield", text: "shield Daniel", kind: "primary", weight: 1.0, active: true },
    { id: "mother.goal.secret", text: "preserve her own peace", kind: "constraint", weight: 0.9, active: true },
  ],
  baseTrust: 40,
};

export const CHARACTERS: Record<string, CharacterDef> = {
  chris: CHRIS,
  player: PLAYER_TEMPLATE,
  mother: MOTHER,
};
