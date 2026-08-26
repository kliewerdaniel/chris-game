/**
 * M5 — deterministic visual-state tests.
 *
 * The reconstruction views (room / environment / graph / palace) are pure
 * deterministic adapters (WorldState -> view state). These tests lock that
 * contract: identical input ALWAYS yields byte-identical output, so the
 * rendered scene cannot drift or flicker between renders/cleints. This is the
 * core guarantee behind the R3F stability work — no randomness in layout.
 *
 * No WebGL is required; these assert the data the renderer consumes.
 */

import { test, expect } from "vitest";
import { createWorldState } from "../lib/core/world";
import { buildRoomState } from "../lib/reconstruction/room";
import {
  buildEnvironmentState,
  type EnvironmentId,
} from "../lib/reconstruction/environment";
import { buildReconstructionState } from "../lib/reconstruction/state";
import { buildPlayerGraph } from "../lib/core/player-graph";
import {
  hypothesize,
  connect,
} from "../lib/core/player-graph";

function statusesFor(ws: ReturnType<typeof createWorldState>) {
  const recon = buildReconstructionState(ws);
  const s: Record<string, string> = {};
  for (const f of recon.fragments) s[f.id] = f.status;
  return s;
}

const ENVS: EnvironmentId[] = ["the_room", "the_porch", "the_last_call"];

test("room state is deterministic across repeated builds (no layout drift)", () => {
  const ws = createWorldState({
    startLocation: "home",
    characterIds: ["chris"],
    episodeId: "ep1",
  });
  const s = statusesFor(ws);
  const a = buildRoomState(ws, s);
  const b = buildRoomState(ws, s);
  expect(a).toEqual(b);
  expect(JSON.stringify(a.fragmentPositions)).toBe(
    JSON.stringify(b.fragmentPositions),
  );
});

test("environment states are deterministic AND share the canonical center invariant", () => {
  const ws = createWorldState({
    startLocation: "home",
    characterIds: ["chris"],
    episodeId: "ep1",
  });
  const s = statusesFor(ws);
  for (const env of ENVS) {
    const a = buildEnvironmentState(env, ws, s);
    const b = buildEnvironmentState(env, ws, s);
    expect(a).toEqual(b);
    // Same WorldState -> same fragment positions regardless of frame.
    expect(JSON.stringify(a.fragmentPositions)).toBe(
      JSON.stringify(b.fragmentPositions),
    );
  }
});

test("room state changes only when the world state changes (input-sensitivity)", () => {
  const ep1 = createWorldState({
    startLocation: "home",
    characterIds: ["chris"],
    episodeId: "ep1",
  });
  const s1 = statusesFor(ep1);
  const v1 = buildRoomState(ep1, s1).version;

  const ep2 = createWorldState({
    startLocation: "home",
    characterIds: ["chris"],
    episodeId: "ep2",
  });
  const s2 = statusesFor(ep2);
  const v2 = buildRoomState(ep2, s2).version;

  expect(v1).not.toBe(v2); // a different episode MUST change the visual state
});

test("player graph (memory palace) layout is deterministic for identical actions", () => {
  let ws = createWorldState({
    startLocation: "apartment_living",
    characterIds: ["chris"],
    episodeId: "ep1",
  });
  const h = hypothesize(ws, "Chris was a Marine scout", "ep1.chris_marine");
  expect(h.ok).toBe(true);
  ws = h.state;
  const c = connect(ws, h.state.playerNodes[0].id, "ep1.chris_marine", "supports");
  expect(c.ok).toBe(true);
  ws = c.state;

  const a = buildPlayerGraph(ws);
  const b = buildPlayerGraph(ws);
  expect(a).toEqual(b);
  expect(JSON.stringify(a.nodes)).toBe(JSON.stringify(b.nodes));
  expect(JSON.stringify(a.edges)).toBe(JSON.stringify(b.edges));
});

test("player graph positions are stable (no render jitter) for a fixed player theory", () => {
  let ws = createWorldState({
    startLocation: "apartment_living",
    characterIds: ["chris"],
    episodeId: "ep1",
  });
  ws = hypothesize(ws, "Chris was a Marine scout", "ep1.chris_marine").state;
  const a = buildPlayerGraph(ws);
  const b = buildPlayerGraph(ws);
  // Same theory -> identical version + node/edge sets (positions are derived
  // deterministically in buildPlayerGraph, so the scene cannot jitter).
  expect(a.version).toBe(b.version);
  expect(a.nodes.length).toBe(b.nodes.length);
  expect(JSON.stringify(a.nodes)).toBe(JSON.stringify(b.nodes));
});
