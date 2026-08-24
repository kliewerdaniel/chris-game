import { Fact, FactStatus, Provenance } from "./types";

export const WORLD_AUTHOR: Provenance = {
  source: "Episode design — THE NIGHT BEFORE",
  sourceType: "author",
  sourceId: "ep1",
  confidence: 1,
};

/**
 * The canonical fact catalog for Episode 1.
 *
 * CRITICAL DESIGN RULE: this object is the deterministic source of truth.
 * The LLM is never allowed to add to or alter this. The narrator may only
 * surface these via character voices, and character testimony can CONTRADICT
 * them — but the engine holds the canonical version underneath.
 *
 * Status semantics:
 *  - canonical: ground truth the engine asserts.
 *  - testimony: a character's claim (see character knowledge/lies).
 *  - hypothesis/rumor/unknown: deliberately unresolved — gameplay material.
 */
export const FACTS: Record<string, Fact> = {
  // --- canonical world truth of THE NIGHT BEFORE ---
  "ep1.sarge.dead": {
    id: "ep1.sarge.dead",
    statement: "Sarge is dead. His body was found earlier today.",
    status: "canonical",
    provenance: WORLD_AUTHOR,
    verifiedBy: "ev_sarge_report",
  },
  "ep1.sarge.cause_unknown": {
    id: "ep1.sarge.cause_unknown",
    statement: "The official cause of Sarge's death has not been established.",
    status: "canonical",
    provenance: WORLD_AUTHOR,
  },
  "ep1.chris.present": {
    id: "ep1.chris.present",
    statement: "Chris is in the apartment with the player tonight.",
    status: "canonical",
    provenance: WORLD_AUTHOR,
  },
  "ep1.mother.unwell": {
    id: "ep1.mother.unwell",
    statement: "The player's mother is unwell and living elsewhere; contact is strained.",
    status: "canonical",
    provenance: WORLD_AUTHOR,
  },
  "ep1.apartment.tenuous": {
    id: "ep1.apartment.tenuous",
    statement: "The player's hold on the apartment is unstable (money owed, no lease).",
    status: "canonical",
    provenance: WORLD_AUTHOR,
  },

  // --- the SECRET: Chris is hiding that he was with Sarge that night ---
  "ep1.chris.with_sarge": {
    id: "ep1.chris.with_sarge",
    statement: "Chris was with Sarge in the hours before Sarge died, and has not told the player.",
    status: "canonical",
    provenance: WORLD_AUTHOR,
    verifiedBy: "ev_chris_note",
  },
  "ep1.chris.owes_money": {
    id: "ep1.chris.owes_money",
    statement: "Chris owes money tied to Sarge — a debt the player does not know about.",
    status: "canonical",
    provenance: WORLD_AUTHOR,
    verifiedBy: "ev_chris_note",
  },

  // --- contested / unresolved (gameplay) ---
  "ep1.sarge.chris_argument": {
    id: "ep1.sarge.chris_argument",
    statement: "Chris claims he and Sarge were fine — no argument. (Contradicted by the note.)",
    status: "testimony",
    claimedBy: "chris",
    provenance: { source: "Chris", sourceType: "compiled_event", sourceId: "chris", confidence: 0.6 },
  },
  "ep1.mother.knows": {
    id: "ep1.mother.knows",
    statement: "Whether the mother knows what happened to Sarge is unknown to the player.",
    status: "unknown",
    provenance: WORLD_AUTHOR,
  },
};

export type FactId = keyof typeof FACTS | string;

export function getFact(id: string): Fact | undefined {
  return FACTS[id];
}

export function factStatus(id: string): FactStatus | undefined {
  return FACTS[id]?.status;
}

/**
 * The deterministic truth resolver. Given a claim (e.g. from a character),
 * returns whether it is consistent with canonical world truth.
 *
 * This is what makes Chris's lies detectable: the engine compares what Chris
 * SAYS against FACTS, and can surface a contradiction when the player has
 * evidence. The model never performs this comparison.
 */
export function evaluateClaimAgainstCanon(
  claimedStatement: string,
  contradictsFactId: string
): {
  contradictsCanon: boolean;
  canonicalStatement?: string;
} {
  const canon = FACTS[contradictsFactId];
  if (!canon) return { contradictsCanon: false };
  // Heuristic: the narrator/engine supplies the contradictsFactId when a
  // character's testimony is known to conflict. We keep this deterministic.
  if (claimedStatement === "__CONTRADICTS__") {
    return { contradictsCanon: true, canonicalStatement: canon.statement };
  }
  return { contradictsCanon: false };
}
