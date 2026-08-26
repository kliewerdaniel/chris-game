/**
 * D7 — environment adapter (the room / porch / last-call).
 *
 * The environment registry is a PRESENTATION frame around the same deterministic
 * reconstruction. Asserts: identical WorldState -> identical state per env;
 * canonical fragments stay at the focal center; anchors come from the registry
 * (so the frame is environment-specific, not invented per-run); and that the
 * three environments share the same epistemic grammar (center invariant).
 */

import { test, expect } from "vitest";
import { createWorldState } from "../lib/core/world";
import { buildEnvironmentState, type EnvironmentId } from "../lib/reconstruction/environment";
import { buildReconstructionState } from "../lib/reconstruction/state";

function statusesFor(ws: ReturnType<typeof createWorldState>) {
  const recon = buildReconstructionState(ws);
  const s: Record<string, string> = {};
  for (const f of recon.fragments) s[f.id] = f.status;
  return s;
}

const ENVS: EnvironmentId[] = ["the_room", "the_porch", "the_last_call"];

test("D7 environment deterministic per environment", () => {
  const ws = createWorldState({ startLocation: "home", characterIds: ["chris"], episodeId: "ep1" });
  const s = statusesFor(ws);
  for (const env of ENVS) {
    const a = buildEnvironmentState(env, ws, s);
    const b = buildEnvironmentState(env, ws, s);
    expect(a).toEqual(b);
    expect(a.version).toBe(b.version);
  }
});

test("D7 environment anchors come from the registry, not invented per-run", () => {
  const ws = createWorldState({ startLocation: "home", characterIds: ["chris"], episodeId: "ep1" });
  const s = statusesFor(ws);
  const room = buildEnvironmentState("the_room", ws, s);
  const porch = buildEnvironmentState("the_porch", ws, s);
  const last = buildEnvironmentState("the_last_call", ws, s);

  expect(room.anchors[0].label).toBe("the lamp");
  expect(porch.anchors[0].label).toBe("the porch light");
  expect(last.anchors[0].label).toBe("the phone");

  for (const e of [room, porch, last]) {
    expect(e.anchors[0].position.x).toBeCloseTo(0, 5);
    expect(e.anchors[0].position.y).toBeCloseTo(0, 5);
    expect(e.anchors[0].position.z).toBeCloseTo(0, 5);
  }
});

test("D7 environment canonical fragments stay at the focal center in every environment", () => {
  const ws = createWorldState({
    startLocation: "home",
    characterIds: ["chris", "mother"],
    episodeId: "ep1",
  });
  const s = statusesFor(ws);
  for (const env of ENVS) {
    const state = buildEnvironmentState(env, ws, s);
    const canonical = Object.entries(state.fragmentPositions).filter(
      ([id]) => s[id] === "canonical"
    );
    expect(canonical.length).toBeGreaterThan(0);
    for (const [, pos] of canonical) {
      expect(pos.x).toBeCloseTo(0, 5);
      expect(pos.y).toBeCloseTo(0, 5);
      expect(pos.z).toBeCloseTo(0, 5);
    }
  }
});

test("D7 environment id is stamped onto the room state", () => {
  const ws = createWorldState({ startLocation: "home", characterIds: ["chris"], episodeId: "ep1" });
  const s = statusesFor(ws);
  expect(buildEnvironmentState("the_porch", ws, s).id).toBe("the_porch");
  expect(buildEnvironmentState("the_last_call", ws, s).id).toBe("the_last_call");
});
