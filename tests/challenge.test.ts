import { describe, it, expect } from "vitest";
import { doChallenge } from "../lib/engine/dialogue";
import { createWorldState } from "../lib/core/world";
import { getFact } from "../lib/core/facts";

/**
 * ADR-014 §5.2 — the player's skepticism drives the engine deterministically.
 * doChallenge must resolve the targeted fact, record `challenge.<factId>` into
 * the ledger, and fail-closed concede when a claim has no source (never
 * asserts world-truth).
 */
describe("ADR-014 §5.2 — challenge loop", () => {
  it("records challenge.<factId> into established facts (ledger-tracked)", () => {
    const s = createWorldState({ startLocation: "apartment", characterIds: ["chris"], episodeId: "ep1" });
    const fact = getFact("ep1.she"); // canonical, has provenance
    const { state, result } = doChallenge(s, {
      type: "challenge",
      targetId: "ep1.she",
      intent: { verb: "challenge", target: "ep1.she" },
      raw: "challenge ep1.she",
    });
    expect(result.establishedFacts).toContain("challenge.ep1.she");
    expect(state.knownFacts).toContain("challenge.ep1.she");
    expect(fact).toBeTruthy();
  });

  it("fail-closed: no provenance source -> reconstruction concedes, never asserts", () => {
    const s = createWorldState({ startLocation: "apartment", characterIds: ["chris"], episodeId: "ep1" });
    const { result } = doChallenge(s, {
      type: "challenge",
      targetId: "reconstruction.voice",
      intent: { verb: "challenge", target: "reconstruction.voice" },
      raw: "challenge reconstruction.voice",
    });
    const line = result.narration[result.narration.length - 1];
    // Concede branch: explicitly disclaims knowledge, no world-truth claim.
    expect(line.text.toLowerCase()).toMatch(/don't know|don't have a source|just what daniel compiled/);
    expect(line.handling).toBe("unknown");
  });

  it("targeted challenge resolves the factId from action.targetId", () => {
    const s = createWorldState({ startLocation: "apartment", characterIds: ["chris"], episodeId: "ep1" });
    const { result } = doChallenge(s, {
      type: "challenge",
      targetId: "ep1.mother.knows",
      intent: { verb: "challenge", target: "ep1.mother.knows" },
      raw: "challenge ep1.mother.knows",
    });
    expect(result.establishedFacts).toContain("challenge.ep1.mother.knows");
  });
});
