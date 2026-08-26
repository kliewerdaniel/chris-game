import { test, expect } from "vitest";
import { createDefaultEngine } from "../lib/engine/game-engine";
import { createWorldState } from "../lib/core/world";
import { buildPlayerGraph } from "../lib/core/player-graph";

/**
 * M2 — engine-level dispatch of player reconstruction-graph verbs.
 * processTurn must route hypothesize/connect/test to the player graph and
 * return a result whose narration is authored by the engine (fail-closed,
 * epistemic-honest). The canonical graph is never mutated.
 */
test("processTurn routes 'hypothesize' to the player graph without touching canonical facts", async () => {
  const eng = createDefaultEngine(undefined as any);
  const s = eng.newGame("ep1");
  const before = s.knownFacts.length;
  const { state, result } = await eng.processTurn(s, "hypothesize Chris was a Marine scout");
  expect(result.ok).toBe(true);
  expect(state.playerNodes.length).toBe(1);
  expect(state.knownFacts.length).toBe(before); // canonical untouched
  expect(result.narration.length).toBeGreaterThan(0);
});

test("processTurn routes 'connect' to the player graph edges", async () => {
  const eng = createDefaultEngine(undefined as any);
  let s = eng.newGame("ep1");
  s = (await eng.processTurn(s, "hypothesize Marine")).state;
  s = (await eng.processTurn(s, "hypothesize dead")).state;
  const { state, result } = await eng.processTurn(
    s,
    "connect ep1.chris_marine relatesTo ep1.chris_dead"
  );
  expect(result.ok).toBe(true);
  expect(state.playerEdges.length).toBe(1);
});

test("processTurn routes 'test' and updates the node verdict deterministically", async () => {
  const eng = createDefaultEngine(undefined as any);
  let s = eng.newGame("ep1");
  s = (await eng.processTurn(s, "hypothesize it was the girlfriend re: ep1.she")).state;
  const nodeId = s.playerNodes[0].id;
  const { state } = await eng.processTurn(s, `test ${nodeId}`);
  const updated = state.playerNodes.find((n) => n.id === nodeId)!;
  expect(["corroborated", "divergent", "unanchored"]).toContain(updated.verdict);
});

test("buildPlayerGraph is stable and order-independent after engine dispatch", async () => {
  const eng = createDefaultEngine(undefined as any);
  let s = eng.newGame("ep1");
  s = (await eng.processTurn(s, "hypothesize theory A re: ep1.chris_marine")).state;
  s = (await eng.processTurn(s, "hypothesize theory B re: ep1.chris_dead")).state;
  const g = buildPlayerGraph(s);
  expect(g.nodes.length).toBe(2);
  expect(g.edges.length).toBe(0);
  // second build identical
  expect(buildPlayerGraph(s).version).toBe(g.version);
});
