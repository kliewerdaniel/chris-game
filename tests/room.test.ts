/**
 * M3 — room adapter tests.
 *
 * The adapter is PURE + DETERMINISTIC (mirrors reconstruction/state.test.ts
 * expectations). It must not depend on engine internals, and identical
 * WorldState must yield identical RoomState.
 */
import { describe, it, expect } from "vitest";
import { buildRoomState, roomVersionOf, type RoomState } from "../lib/reconstruction/room";
import { createWorldState } from "../lib/core/world";

function freshWorld(known: string[] = [], evidence: string[] = []): ReturnType<typeof createWorldState> {
  let ws = createWorldState({ startLocation: "apartment", characterIds: ["chris"], episodeId: "ep1" });
  ws = { ...ws, knownFacts: known, evidenceIds: evidence };
  return ws;
}

describe("M3 — buildRoomState (pure adapter)", () => {
  it("derives a stable version from world state (order-independent)", () => {
    const a = freshWorld(["ep1.she", "ep1.act"], ["ev_source_post"]);
    const b = freshWorld(["ep1.act", "ep1.she"], ["ev_source_post"]);
    expect(roomVersionOf(a)).toBe(roomVersionOf(b));
  });

  it("maps canonical/anchored fragments to the room center (lamp)", () => {
    // ep1.she is canonical in the catalog; anchored -> (0,0,0) center.
    const ws = freshWorld(["ep1.she"], []);
    const room = buildRoomState(ws, { "ep1.she": "canonical" });
    const pos = room.fragmentPositions["ep1.she"];
    expect(pos.x).toBeCloseTo(0, 5);
    expect(pos.y).toBeGreaterThan(pos.x); // floats above floor
    expect(pos.z).toBeCloseTo(0, 5);
  });

  it("scatters unanchored (testimony/belief) fragments outward by status", () => {
    const ws = freshWorld(["ep1.she", "mythos.1", "belief.1"], []);
    const room = buildRoomState(ws, {
      "ep1.she": "canonical",
      "mythos.1": "testimony",
      "belief.1": "belief",
    });
    const c = room.fragmentPositions["ep1.she"];
    const t = room.fragmentPositions["mythos.1"];
    const bel = room.fragmentPositions["belief.1"];
    const dist = (p: { x: number; y: number; z: number }) => Math.hypot(p.x, p.z);
    // canonical at center; testimony + belief further out.
    expect(dist(c)).toBeLessThan(dist(t));
    expect(dist(t)).toBeLessThan(dist(bel));
  });

  it("tone reflects reconstruction coherence (presentation only)", () => {
    const settled = buildRoomState(freshWorld(["ep1.she", "ep1.act"]), {
      "ep1.she": "canonical",
      "ep1.act": "canonical",
    });
    const fragmented = buildRoomState(freshWorld(["mythos.1"]), { "mythos.1": "rumor" });
    expect(settled.tone).toBe("settled");
    expect(fragmented.tone).toBe("fragmented");
  });

  it("exposes deterministic place anchors (the room frame)", () => {
    const room = buildRoomState(freshWorld(), {});
    const labels = room.anchors.map((a) => a.label);
    expect(labels).toEqual(["the lamp", "the window", "the door", "his chair"]);
  });

  it("is byte-stable across identical inputs", () => {
    const a: RoomState = buildRoomState(freshWorld(["ep1.she"]), { "ep1.she": "canonical" });
    const b: RoomState = buildRoomState(freshWorld(["ep1.she"]), { "ep1.she": "canonical" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
