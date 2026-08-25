/**
 * Tests for the deterministic reconstruction adapter (Iteration 1).
 *
 * These tests protect the CONTRACT, not the implementation. They assert that
 * buildReconstructionState maps real engine state to a visual-epistemic state
 * faithfully and deterministically. They use the repository's actual catalogs
 * (facts.ts / evidence.ts / characters/chris.ts) via real WorldState fixtures —
 * no parallel epistemic model.
 */

import { describe, it, expect } from "vitest";
import { buildReconstructionState, type ReconstructionState } from "../lib/reconstruction/state";
import { createWorldState, addKnownFact, discoverEvidence } from "../lib/core/world";
import { instantiateEvidence, markDiscovered } from "../lib/core/evidence";
import type { WorldState } from "../lib/core/types";

function freshWorld(): WorldState {
  return createWorldState({ startLocation: "apartment", characterIds: ["chris"], episodeId: "ep1" });
}

/** Build a state with a set of known facts + discovered evidence ids. */
function stateWith(known: string[], evidence: string[] = []): WorldState {
  let s = freshWorld();
  for (const f of known) s = addKnownFact(s, f);
  for (const e of evidence) {
    const ev = markDiscovered(instantiateEvidence(e as never));
    s = discoverEvidence(s, ev);
  }
  return s;
}

function regionOf(rs: ReconstructionState, id: string) {
  return rs.fragments.find((f) => f.id === id)?.region ?? rs.voids.find((v) => v.id === `void:${id}`)?.region;
}

describe("buildReconstructionState — purity & determinism", () => {
  it("produces identical output for identical input", () => {
    const s = stateWith(["ep1.feed.real", "ep1.act"], ["ev_source_post"]);
    expect(buildReconstructionState(s)).toEqual(buildReconstructionState(s));
  });

  it("is order-independent across equivalent input collections", () => {
    const a = stateWith(["ep1.feed.real", "ep1.act", "ep1.live"], ["ev_source_post", "ev_phone"]);
    const b = stateWith(["ep1.live", "ep1.act", "ep1.feed.real"], ["ev_phone", "ev_source_post"]);
    const ra = buildReconstructionState(a);
    const rb = buildReconstructionState(b);
    expect(ra.fragments.map((f) => f.id).sort()).toEqual(rb.fragments.map((f) => f.id).sort());
    expect(ra.fragments.map((f) => f.id).sort()).toEqual(rb.fragments.map((f) => f.id).sort());
    // regions are stable per id regardless of order
    for (const f of ra.fragments) {
      expect(regionOf(rb, f.id)).toEqual(f.region);
    }
    expect(ra.edges.map((e) => `${e.to}:${e.kind}`).sort()).toEqual(
      rb.edges.map((e) => `${e.to}:${e.kind}`).sort()
    );
    expect(ra.version).toEqual(rb.version);
  });
});

describe("buildReconstructionState — epistemic mapping (real catalogs)", () => {
  it("maps canonical established facts to anchored, full-opacity fragments", () => {
    const rs = buildReconstructionState(stateWith(["ep1.feed.real"]));
    const f = rs.fragments.find((x) => x.id === "ep1.feed.real");
    expect(f).toBeDefined();
    expect(f!.status).toBe("canonical");
    expect(f!.anchored).toBe(true);
    expect(f!.opacity).toBe(1);
    expect(rs.counts.established).toBeGreaterThanOrEqual(1);
  });

  it("maps testimony (ep4.rec.is_chris) as unanchored, human-origin fragment", () => {
    const rs = buildReconstructionState(stateWith(["ep4.rec.is_chris"]));
    const f = rs.fragments.find((x) => x.id === "ep4.rec.is_chris");
    expect(f).toBeDefined();
    expect(f!.status).toBe("testimony");
    expect(f!.anchored).toBe(false);
    expect(f!.claimedBy).toBe("reconstruction");
    expect(rs.counts.testimony).toBeGreaterThanOrEqual(1);
  });

  it("maps rumor (ep4.rec.remembers) to the lowest-opacity fragment kind", () => {
    const rs = buildReconstructionState(stateWith(["ep4.rec.remembers"]));
    const f = rs.fragments.find((x) => x.id === "ep4.rec.remembers");
    expect(f).toBeDefined();
    expect(f!.status).toBe("rumor");
    expect(f!.opacity).toBeLessThanOrEqual(0.3);
    expect(rs.counts.rumor).toBeGreaterThanOrEqual(1);
  });

  it("includes the engine-defined character belief as a belief fragment", () => {
    const rs = buildReconstructionState(freshWorld());
    const b = rs.fragments.find((x) => x.id === "belief:chris.belief.is_chris");
    expect(b).toBeDefined();
    expect(b!.status).toBe("belief");
    expect(b!.anchored).toBe(false);
    expect(rs.counts.belief).toBeGreaterThanOrEqual(1);
  });

  it("produces a void (not a fragment) for an unresolved unknown fact", () => {
    const rs = buildReconstructionState(freshWorld());
    const v = rs.voids.find((x) => x.id === "void:ep1.mother.knows");
    expect(v).toBeDefined();
    expect(v!.reason).toBe("unresolved-fact");
    // no fragment for it
    expect(rs.fragments.find((f) => f.id === "ep1.mother.knows")).toBeUndefined();
    expect(rs.counts.unknown).toBeGreaterThanOrEqual(1);
  });

  it("does NOT collapse unknown into the fragment set or a truth scalar", () => {
    const rs = buildReconstructionState(freshWorld());
    // the raw status is preserved; void carries the original statement label
    expect(rs.voids.some((v) => v.label.includes("mother"))).toBe(true);
    // visualCoherence is explicitly presentation, and we never assert it == truth
    expect(typeof rs.visualCoherence).toBe("number");
    expect(rs.visualCoherence).toBeGreaterThanOrEqual(0);
    expect(rs.visualCoherence).toBeLessThanOrEqual(1);
  });
});

describe("buildReconstructionState — contradictions (real engine graph)", () => {
  it("surfaces the engine's is_model contradiction only when in player scope", () => {
    // Without the fact in scope, playerInvestigation hides the contradiction.
    const hidden = buildReconstructionState(freshWorld());
    expect(hidden.contradictions.find((c) => c.factId === "ep4.rec.is_model")).toBeUndefined();

    // Once the player knows the canonical fact, the tension becomes visible.
    const visible = buildReconstructionState(stateWith(["ep4.rec.is_model"]));
    const c = visible.contradictions.find((x) => x.factId === "ep4.rec.is_model");
    expect(c).toBeDefined();
    expect(c!.between).toContain("belief:chris.belief.is_chris");
    expect(c!.between).toContain("ep4.rec.is_model");
    expect(c!.tension).toBeGreaterThan(0);
    expect(rs_hasText(c!.report, "diverges")).toBe(true);
    expect(visible.counts.contradicted).toBeGreaterThanOrEqual(1);
  });
});

function rs_hasText(s: string, sub: string): boolean {
  return s.toLowerCase().includes(sub.toLowerCase());
}

describe("buildReconstructionState — relationships / topology", () => {
  it("creates topology nodes and edges for known relationships", () => {
    const rs = buildReconstructionState(stateWith(["ep2.captain"], ["ev_captain_photo"]));
    // evidence supports the fact -> an edge exists
    const edge = rs.edges.find((e) => e.kind === "supports" && e.to === "ep2.captain");
    expect(edge).toBeDefined();
    // the character node 'chris' is in scope via relatesTo
    expect(rs.topology.some((n) => n.id === "char:chris")).toBe(true);
    expect(rs.topology.some((n) => n.kind === "evidence")).toBe(true);
  });

  it("multiple evidence sources raise corroboration-derived visual coherence", () => {
    const single = buildReconstructionState(stateWith(["ep1.feed.real"]));
    // ep1.feed.real is verified by ev_source_post; discover it too
    const corroborated = buildReconstructionState(stateWith(["ep1.feed.real"], ["ev_source_post"]));
    expect(corroborated.visualCoherence).toBeGreaterThanOrEqual(single.visualCoherence);
    expect(corroborated.counts.established).toBeGreaterThanOrEqual(single.counts.established);
  });
});

describe("buildReconstructionState — identity stability", () => {
  it("stable fragment ids & regions across an added fact (no churn)", () => {
    const before = buildReconstructionState(stateWith(["ep1.feed.real"]));
    const after = buildReconstructionState(stateWith(["ep1.feed.real", "ep1.act"]));
    const beforeIds = new Set(before.fragments.map((f) => f.id));
    for (const f of after.fragments) {
      if (beforeIds.has(f.id)) {
        // existing fragment kept its position
        expect(regionOf(before, f.id)).toEqual(f.region);
      }
    }
    // the new fact introduced exactly one new fragment id
    const newIds = after.fragments.map((f) => f.id).filter((id) => !beforeIds.has(id));
    expect(newIds).toEqual(["ep1.act"]);
  });

  it("void positions are unchanged when unrelated facts are added", () => {
    const before = buildReconstructionState(freshWorld());
    const voidBefore = regionOf(before, "ep1.mother.knows");
    const after = buildReconstructionState(stateWith(["ep1.feed.real", "ep2.dead", "ep3.toll"]));
    expect(regionOf(after, "ep1.mother.knows")).toEqual(voidBefore);
  });
});

describe("buildReconstructionState — episode id passes through", () => {
  it("carries the live episode id without special-casing any fact", () => {
    const s = stateWith(["ep1.feed.real"]);
    s.episodeId = "ep4";
    const rs = buildReconstructionState(s);
    expect(rs.episodeId).toBe("ep4");
  });
});
