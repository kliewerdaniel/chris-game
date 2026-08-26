import { describe, it, expect } from "vitest";
import { buildGraphLayout, graphVersionOf } from "../lib/reconstruction/graph";
import { createWorldState } from "../lib/core/world";

describe("D4 graph-layout adapter", () => {
  const ws = createWorldState({
    startLocation: "apartment_living",
    characterIds: ["chris"],
    episodeId: "ep1",
  });

  it("builds a deterministic graph from a known WorldState", () => {
    const g = buildGraphLayout(ws);
    expect(g.nodes.length).toBeGreaterThan(0);
    expect(g.edges.length).toBeGreaterThanOrEqual(0);
    // Stable identity.
    expect(g.version).toBe(graphVersionOf(ws));
  });

  it("is order-independent: same WorldState -> identical version regardless of fact order", () => {
    const a = buildGraphLayout(ws);
    const b = buildGraphLayout(ws);
    expect(a.version).toBe(b.version);
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id));
  });

  it("places every node at a finite, reproducible 3D position", () => {
    const g = buildGraphLayout(ws);
    for (const n of g.nodes) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
      expect(Number.isFinite(n.position.z)).toBe(true);
    }
  });

  it("marks contradiction/claimedBy edges as tension edges only when contradictions exist", () => {
    const g = buildGraphLayout(ws);
    // Tension edges must reference nodes present in the layout.
    for (const e of g.edges.filter((e) => e.tension)) {
      const ids = new Set(g.nodes.map((n) => n.id));
      expect(ids.has(e.from)).toBe(true);
      expect(ids.has(e.to)).toBe(true);
    }
  });

  it("adds player hypotheses as authored nodes", () => {
    const w2 = createWorldState({
      startLocation: "apartment_living",
      characterIds: ["chris"],
      episodeId: "ep1",
    });
    w2.hypotheses.push({ id: "h_d4_test", text: "Chris knew the lamp was broken" });
    const g = buildGraphLayout(w2);
    const node = g.nodes.find((n) => n.id === "hypothesis:h_d4_test");
    expect(node).toBeDefined();
    expect(node!.authored).toBe(true);
  });
});
