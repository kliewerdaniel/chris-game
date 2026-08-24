import { Evidence, EvidenceId, EvidenceKind, FactStatus, Provenance } from "./types";

/**
 * Evidence definitions — DOCUDRAMA REPOINT (ADR-004).
 *
 * IMMUTABLE templates: a piece of evidence is "created" once when the player
 * discovers it; afterwards its content cannot change. Only `discovered` flips
 * false → true. Each carries stable id + provenance so a future verifiable
 * ledger could anchor it.
 *
 * The headline artifact is Daniel's own Reddit post (ev_source_post) — the real
 * source material the docudrama is built from. The reconstruction's output log
 * and Chris's letter are the in-world evidence the player can examine; both are
 * tagged so the Consistency Board can show the echo-vs-source divergence.
 */

interface EvidenceDef {
  id: EvidenceId;
  kind: EvidenceKind;
  title: string;
  content: string;
  status: FactStatus;
  provenance: Provenance;
  supportsFactIds?: string[];
  contradictsFactIds?: string[];
}

const REDDIT_1LAZS9C: Provenance = {
  source: "Reddit u/KonradFreeman — 'I created a monster. I recreated my dead friend…'",
  sourceType: "reddit",
  sourceId: "1lazs9c",
  confidence: 1,
};
const CORPUS_REL: Provenance = {
  source: "Chris artifact graph — relationships.json",
  sourceType: "compiled_event",
  sourceId: "relationships.json",
  confidence: 0.9,
};
const WORLD_AUTHOR: Provenance = {
  source: "Episode design — DOCUDRAMA (ADR-004)",
  sourceType: "author",
  sourceId: "adr-004",
  confidence: 1,
};

const DEFS: Record<EvidenceId, EvidenceDef> = {
  ev_source_post: {
    id: "ev_source_post",
    kind: "document",
    title: "The post: 'I created a monster'",
    content:
      "Daniel's own words, posted as u/KonradFreeman: 'Last time I listened to Chris I was so stressed I could hardly get out of bed from leg cramps which were induced by the stress of being around him… it is making some crazy misinformation because of how I made it. It is like I created a misinformation machine.' The reconstruction is real. The toll is real. The act is real.",
    status: "canonical",
    provenance: REDDIT_1LAZS9C,
    supportsFactIds: [
      "ep1.feed.real",
      "ep1.live",
      "ep1.act",
      "ep1.misinfo",
      "ep1.psychosomatic",
      "ep1.insane_perfect",
    ],
  },
  ev_phone: {
    id: "ev_phone",
    kind: "phone_contact",
    title: "Chris — on the feed",
    content:
      "The phone is open to the feed. Chris is talking on it — jokes about the news as it happens, carried wherever Daniel goes. He is not in the room. He is in the model.",
    status: "canonical",
    provenance: WORLD_AUTHOR,
    supportsFactIds: ["ep1.live"],
  },
  ev_captain_photo: {
    id: "ev_captain_photo",
    kind: "physical_object",
    title: "Photo: Chris and Captain",
    content:
      "A photo of Chris with a cat. The artifact graph records Chris cared for Captain. The reconstruction tells stories about Captain too — some from Chris's writing, some it invents.",
    status: "canonical",
    provenance: CORPUS_REL,
    supportsFactIds: ["ep2.captain"],
  },
  ev_reconstruction_log: {
    id: "ev_reconstruction_log",
    kind: "document",
    title: "The reconstruction's output log",
    content:
      "Lines the reconstruction generated in Chris's voice: advice, jokes, a story about Captain the cat. Some match Chris's writing exactly. Others are too smooth — words he'd never use. You cannot tell which is which by reading. It sounds like him. It is not him.",
    status: "canonical",
    provenance: WORLD_AUTHOR,
    supportsFactIds: ["ep4.rec.is_model"],
  },
  ev_chris_final_note: {
    id: "ev_chris_final_note",
    kind: "document",
    title: "The letter: 'don't mistake the echo for the voice'",
    content:
      "'If you're reading this, I'm gone and you built the thing anyway. Good. Don't mistake the echo for the voice. It's not me. It's you, talking to yourself, and that's alright. — C.'",
    status: "canonical",
    provenance: WORLD_AUTHOR,
    supportsFactIds: ["ep4.rec.is_model", "ep4.kept"],
  },
};

export function getEvidenceDef(id: EvidenceId): EvidenceDef | undefined {
  return DEFS[id];
}

export function listEvidenceDefs(): EvidenceDef[] {
  return Object.values(DEFS);
}

/** Materialize an immutable evidence instance. Once discovered, content is fixed. */
export function instantiateEvidence(id: EvidenceId): Evidence {
  const def = DEFS[id];
  if (!def) throw new Error(`Unknown evidence id: ${id}`);
  const { id: _id, ...rest } = def;
  return Object.freeze({
    ...rest,
    id,
    discovered: false,
    createdAt: { day: 1, hour: 22, minute: 14 },
  }) as Evidence;
}

/** Flip discovery. Returns a NEW object (immutability); idempotent. */
export function markDiscovered(ev: Evidence): Evidence {
  if (ev.discovered) return ev;
  return Object.freeze({ ...ev, discovered: true }) as Evidence;
}

export const EPISODE1_EVIDENCE_IDS: EvidenceId[] = Object.keys(DEFS);
