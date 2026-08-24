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

// ---------------------------------------------------------------------------
// EPISODE 2 — THE PORCH (early days, the cabin; Chris alive, teaching)
// ---------------------------------------------------------------------------
export const EP2_WORLD_AUTHOR: Provenance = {
  source: "Episode design — THE PORCH",
  sourceType: "author",
  sourceId: "ep2",
  confidence: 1,
};

export const FACTS2: Record<string, Fact> = {
  "ep2.cabin": {
    id: "ep2.cabin",
    statement: "Chris and the player live in a small cabin on the edge of a dead-end road, off the grid.",
    status: "canonical",
    provenance: EP2_WORLD_AUTHOR,
  },
  "ep2.chris.alive": {
    id: "ep2.chris.alive",
    statement: "Chris is alive and present in the player's daily life.",
    status: "canonical",
    provenance: EP2_WORLD_AUTHOR,
  },
  "ep2.chris.teaching": {
    id: "ep2.chris.teaching",
    statement: "Chris is teaching the player to live outside normal systems — wood, water, wiring, and how to read people.",
    status: "canonical",
    provenance: EP2_WORLD_AUTHOR,
  },
  // The secret that survives from Ep1: Chris was with Sarge; the debt exists.
  "ep2.chris.with_sarge": {
    id: "ep2.chris.with_sarge",
    statement: "Chris was with Sarge in the hours before Sarge died. The player learned this from the note.",
    status: "canonical",
    provenance: EP2_WORLD_AUTHOR,
    verifiedBy: "ev_chris_note",
  },
  "ep2.chris.owes_money": {
    id: "ep2.chris.owes_money",
    statement: "Chris owes a debt tied to Sarge; it has not yet come due.",
    status: "canonical",
    provenance: EP2_WORLD_AUTHOR,
    verifiedBy: "ev_chris_note",
  },
  // Contested: Chris claims he left the Corps clean. The player has NO evidence
  // either way yet — this is a hypothesis the episode lets the player form.
  "ep2.chris.corps_discharge": {
    id: "ep2.chris.corps_discharge",
    statement: "Chris claims he left the Marine Corps on his own terms. Whether that is true is unresolved.",
    status: "testimony",
    claimedBy: "chris",
    provenance: { source: "Chris", sourceType: "compiled_event", sourceId: "chris", confidence: 0.6 },
  },
};

// ---------------------------------------------------------------------------
// EPISODE 3 — THE LAST CALL (the decline; Chris failing; a final truth)
// ---------------------------------------------------------------------------
export const EP3_WORLD_AUTHOR: Provenance = {
  source: "Episode design — THE LAST CALL",
  sourceType: "author",
  sourceId: "ep3",
  confidence: 1,
};

export const FACTS3: Record<string, Fact> = {
  "ep3.chris.declining": {
    id: "ep3.chris.declining",
    statement: "Chris's health is failing. He is slower, thinner, more forgetful.",
    status: "canonical",
    provenance: EP3_WORLD_AUTHOR,
  },
  "ep3.chris.alone": {
    id: "ep3.chris.alone",
    statement: "Chris is now often alone; the player is away, building a life and a company.",
    status: "canonical",
    provenance: EP3_WORLD_AUTHOR,
  },
  // The secret Chris finally tells: WHY he was with Sarge (the debt collector).
  "ep3.chris.truth_sarge": {
    id: "ep3.chris.truth_sarge",
    statement: "Chris tells the truth: he was with Sarge because a debt was being collected, and Sarge took the worst of it.",
    status: "canonical",
    provenance: EP3_WORLD_AUTHOR,
    verifiedBy: "ev_chris_truth",
  },
  "ep3.player.company": {
    id: "ep3.player.company",
    statement: "The player has founded a small technology company and is succeeding at it.",
    status: "canonical",
    provenance: EP3_WORLD_AUTHOR,
  },
  // Contested: Chris claims he is 'fine' and the player should focus on work.
  "ep3.chris.fine": {
    id: "ep3.chris.fine",
    statement: "Chris claims he is fine and the player should not worry. (Contradicted by his condition.)",
    status: "testimony",
    claimedBy: "chris",
    provenance: { source: "Chris", sourceType: "compiled_event", sourceId: "chris", confidence: 0.5 },
  },
};

// ---------------------------------------------------------------------------
// EPISODE 4 — THE REBUILD (after Chris; the player uses AI to reconstruct him)
// ---------------------------------------------------------------------------
export const EP4_WORLD_AUTHOR: Provenance = {
  source: "Episode design — THE REBUILD",
  sourceType: "author",
  sourceId: "ep4",
  confidence: 1,
};

export const FACTS4: Record<string, Fact> = {
  "ep4.chris.dead": {
    id: "ep4.chris.dead",
    statement: "Chris is dead. The player is building a reconstruction of him from his writing, voice, and memory.",
    status: "canonical",
    provenance: EP4_WORLD_AUTHOR,
  },
  "ep4.reconstruction.begins": {
    id: "ep4.reconstruction.begins",
    statement: "Using AI, the player assembles a reconstruction of Chris from compiled artifacts.",
    status: "canonical",
    provenance: EP4_WORLD_AUTHOR,
  },
  // The epistemic crux: the reconstruction is a MODEL of Chris, not Chris.
  "ep4.reconstruction.is_model": {
    id: "ep4.reconstruction.is_model",
    statement: "The reconstruction is a model trained on Chris's words and memories — not the man himself. The player must decide whether it is 'him'.",
    status: "canonical",
    provenance: EP4_WORLD_AUTHOR,
  },
  // Contested: the reconstruction claims to 'remember' things. It cannot.
  "ep4.reconstruction.remembers": {
    id: "ep4.reconstruction.remembers",
    statement: "The reconstruction speaks as if it remembers Chris's life. Whether those memories are genuine or generated is unresolved.",
    status: "rumor",
    claimedBy: "reconstruction",
    provenance: { source: "Reconstruction", sourceType: "compiled_event", sourceId: "reconstruction", confidence: 0.4 },
  },
  "ep4.player.grieving": {
    id: "ep4.player.grieving",
    statement: "The player is grieving Chris and ambiguous about what the reconstruction means.",
    status: "canonical",
    provenance: EP4_WORLD_AUTHOR,
  },
};

/** Merge all episode fact catalogs. */
export function allFacts(): Record<string, Fact> {
  return { ...FACTS, ...FACTS2, ...FACTS3, ...FACTS4 };
}

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
