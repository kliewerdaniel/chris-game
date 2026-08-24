import { Evidence, EvidenceId, EvidenceKind, FactStatus, Provenance } from "./types";

/**
 * Evidence definitions for Episode 1. These are IMMUTABLE templates. A piece of
 * evidence is "created" once when the player discovers it; after that its
 * content cannot change. The `discovered` flag is the only mutable bit, and it
 * only flips false → true (one-way).
 *
 * This connects forward to the cryptographic audit/evidence architecture: each
 * evidence carries a stable id and provenance so a future verifiable ledger can
 * anchor it without changing the game model.
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

const DEFS: Record<EvidenceId, EvidenceDef> = {
  ev_sarge_report: {
    id: "ev_sarge_report",
    kind: "document",
    title: "Death notification", // shown to the player as a printed notice
    content:
      "OFFICIAL NOTICE — Sarge (legal name withheld) was found deceased earlier today. Next of kin and associates are asked not to disturb the scene. A detective will call.",
    status: "canonical",
    provenance: { source: "Episode design", sourceType: "author", sourceId: "ep1", confidence: 1 },
    supportsFactIds: ["ep1.sarge.dead"],
  },
  ev_chris_note: {
    id: "ev_chris_note",
    kind: "physical_object",
    title: "Chris's crumpled note",
    content:
      "Half of a torn page, in Chris's hand: \"—if they ask, we were fine. Sarge and me, we were fine. Don't tell them about the money. Don't tell [you].\" The rest is torn away.",
    status: "canonical",
    provenance: { source: "Episode design", sourceType: "author", sourceId: "ep1", confidence: 1 },
    supportsFactIds: ["ep1.chris.with_sarge", "ep1.chris.owes_money"],
    contradictsFactIds: ["ep1.sarge.chris_argument"],
  },
  ev_phone_chris: {
    id: "ev_phone_chris",
    kind: "phone_contact",
    title: "Chris — contact",
    content: "Chris's number is saved. He answers when you call. He is in the room.",
    status: "canonical",
    provenance: { source: "Episode design", sourceType: "author", sourceId: "ep1", confidence: 1 },
  },
  ev_photo_sarge: {
    id: "ev_photo_sarge",
    kind: "physical_object",
    title: "Photo: Chris, Sarge, and you",
    content:
      "A faded photo. Three figures on a porch — Chris, Sarge, and someone younger. On the back, in Chris's hand: \"the only family that counted.\"",
    status: "canonical",
    provenance: { source: "Compiled from Chris memory artifacts", sourceType: "compiled_event", sourceId: "memory_015", confidence: 0.8 },
  },
  ev_bottle: {
    id: "ev_bottle",
    kind: "physical_object",
    title: "Two empties by the couch",
    content:
      "Two empty bottles on the floor by the couch. One is Chris's usual. The other is a brand Sarge liked. Chris says they were his alone tonight.",
    status: "observation",
    provenance: { source: "Episode design", sourceType: "author", sourceId: "ep1", confidence: 1 },
    contradictsFactIds: ["ep1.sarge.chris_argument"],
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

/**
 * Flip discovery. Returns a NEW object (immutability): content is identical,
 * only `discovered` becomes true. Idempotent.
 */
export function markDiscovered(ev: Evidence): Evidence {
  if (ev.discovered) return ev;
  return Object.freeze({ ...ev, discovered: true }) as Evidence;
}

export const EPISODE1_EVIDENCE_IDS: EvidenceId[] = Object.keys(DEFS);
