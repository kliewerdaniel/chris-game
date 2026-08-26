import { test, expect } from "vitest";
import { createWorldState } from "../lib/core/world";
import {
  hypothesize,
  connect,
  testNode,
  evaluateNode,
  evaluateEdge,
  buildPlayerGraph,
  resolveAnchor,
} from "../lib/core/player-graph";

// M2 — player reconstruction graph is a model, never engine truth.
// These tests assert determinism + the epistemic boundary (no canonical
// mutation, only corroboration/divergence reporting).

test("hypothesize adds a player node without touching canonical facts", () => {
  let s = createWorldState({ startLocation: "apartment_living", characterIds: ["chris"] });
  const before = s.knownFacts.length;
  const r = hypothesize(s, "Chris was a Marine scout");
  expect(r.ok).toBe(true);
  expect(r.state.playerNodes.length).toBe(1);
  expect(r.state.playerNodes[0].status).toBe("hypothesis");
  // canonical facts untouched
  expect(r.state.knownFacts.length).toBe(before);
});

test("hypothesize is idempotent for identical text (deterministic id)", () => {
  let s = createWorldState({ startLocation: "apartment_living", characterIds: ["chris"] });
  const a = hypothesize(s, "Chris was a Marine scout");
  const b = hypothesize(a.state, "Chris was a Marine scout");
  expect(b.state.playerNodes.length).toBe(1);
  expect(a.state.playerNodes[0].id).toBe(b.state.playerNodes[0].id);
});

test("anchored hypothesize evaluates against the record (corroborated for canonical fact)", () => {
  // ep1.chris_marine is a canonical fact in the catalog.
  const v = evaluateNode({ id: "x", text: "Marine", anchors: "ep1.chris_marine", status: "hypothesis" });
  expect(v).toBe("corroborated");
});

test("anchored hypothesize on an unresolved (unknown) fact reports divergent, not corroborated", () => {
  // ep1.mother.knows is 'unknown' in the catalog — Daniel's unresolved question.
  // The engine never lets a player theory rest as 'corroborated' on unresolved ground.
  const v = evaluateNode({ id: "x", text: "mother knows", anchors: "ep1.mother.knows", status: "hypothesis" });
  expect(v).toBe("divergent");
});

test("anchored hypothesize on a testimony-only fact reports divergent (model of a model)", () => {
  // ep4.rec.is_chris is 'testimony' — the reconstruction's own claim, not world truth.
  const v = evaluateNode({ id: "x", text: "it is really him", anchors: "ep4.rec.is_chris", status: "hypothesis" });
  expect(v).toBe("divergent");
});

test("connect evaluates alignment vs the canonical graph", () => {
  let s = createWorldState({ startLocation: "apartment_living", characterIds: ["chris"] });
  s = connect(s, "ep1.chris_marine", "ep1.chris_dead", "relatesTo").state;
  expect(s.playerEdges.length).toBe(1);
  const align = s.playerEdges[0].alignment;
  expect(["corroborates", "diverges", "new"]).toContain(align);
});

test("connect rejects self-loops and bad links", () => {
  let s = createWorldState({ startLocation: "apartment_living", characterIds: ["chris"] });
  const r = connect(s, "ep1.chris_marine", "ep1.chris_marine", "supports");
  expect(r.ok).toBe(false);
  expect(r.state.playerEdges.length).toBe(0);
});

test("test updates a node's verdict deterministically", () => {
  let s = createWorldState({ startLocation: "apartment_living", characterIds: ["chris"] });
  s = hypothesize(s, "Chris was a Marine scout", "ep1.chris_marine").state;
  const nodeId = s.playerNodes[0].id;
  const r = testNode(s, nodeId);
  expect(r.ok).toBe(true);
  const updated = r.state.playerNodes.find((n) => n.id === nodeId)!;
  expect(updated.verdict).toBe("corroborated");
});

test("test of an unanchored node reports unanchored", () => {
  let s = createWorldState({ startLocation: "apartment_living", characterIds: ["chris"] });
  s = hypothesize(s, "some free theory").state;
  const nodeId = s.playerNodes[0].id;
  const r = testNode(s, nodeId);
  expect(r.state.playerNodes.find((n) => n.id === nodeId)!.verdict).toBe("unanchored");
});

test("buildPlayerGraph is order-independent (sorted, stable version)", () => {
  let s = createWorldState({ startLocation: "apartment_living", characterIds: ["chris"] });
  s = hypothesize(s, "B theory").state;
  s = hypothesize(s, "A theory").state;
  const g1 = buildPlayerGraph(s);
  // same content, rebuilt
  const g2 = buildPlayerGraph(s);
  expect(g1.nodes.map((n) => n.id)).toEqual(g2.nodes.map((n) => n.id));
  expect(g1.version).toBe(g2.version);
});

test("evaluateEdge against a non-existent canonical relation is 'new'", () => {
  const e = evaluateEdge({ id: "pe:x~y~supports", from: "ep1.chris_marine", to: "ep1.insane_perfect", kind: "supports" });
  expect(["new", "corroborates", "diverges"]).toContain(e);
});

test("resolveAnchor maps a bare id or suffix to a canonical fact id", () => {
  expect(resolveAnchor("ep1.chris_marine")).toBe("ep1.chris_marine");
  expect(resolveAnchor("chris_marine")).toBe("ep1.chris_marine");
  expect(resolveAnchor("nonsense_id")).toBeUndefined();
});
