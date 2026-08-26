/**
 * ENVIRONMENT REGISTRY — D7 authored environments (asset-agnostic placeholder).
 *
 * Extends the M3 "the room" frame (D9/D12) into a small set of authored
 * reconstructed environments the player can move between: the room, the porch,
 * and the last call. Each environment is a PRESENTATION frame around the same
 * deterministic reconstruction — fragments still anchor by epistemic status
 * (canonical near the focal light, unanchored scatter outward).
 *
 * Epistemic boundary (unchanged from room.ts): this module reads only
 * `WorldState` + canonical catalogs. Environment ids map to REAL engine places
 * (porch / last-call are canonical episodes in `world-events.ts`) — they are
 * places-in-the-reconstruction, never assertions about Chris's real biography.
 *
 * The hero meshes (a real porch, a real phone on a real table) are an external
 * asset-production dependency (D9). Until those exist, the renderer draws a
 * procedural placeholder whose positions come from THIS registry, so swapping in
 * authored GLTF later is a drop-in.
 *
 * Determinism contract: identical {WorldState, envId} -> identical state.
 */

import type { WorldState } from "../core/types";
import type { Vec3 } from "./state";
import type { RoomState } from "./room";
import { buildRoomState } from "./room";

export type EnvironmentId = "the_room" | "the_porch" | "the_last_call";

export interface EnvironmentDef {
  id: EnvironmentId;
  /** human label (never a world-truth claim). */
  label: string;
  /** place anchors the reconstruction is framed by in this environment. */
  anchors: { id: string; label: string; position: Vec3 }[];
  /** presentation: ambient tint of the environment's key light. */
  lightColor: string;
  /** presentation: base floor/atmosphere tone. */
  floorColor: string;
  /** presentation: short epistemic framing line for the DOM safety net. */
  framing: string;
}

export const ENVIRONMENTS: Record<EnvironmentId, EnvironmentDef> = {
  the_room: {
    id: "the_room",
    label: "the room",
    anchors: [
      { id: "place:lamp", label: "the lamp", position: { x: 0, y: 0, z: 0 } },
      { id: "place:window", label: "the window", position: { x: -1.1, y: 0, z: -0.8 } },
      { id: "place:door", label: "the door", position: { x: 1.1, y: 0, z: 0.6 } },
      { id: "place:chair", label: "his chair", position: { x: 0.4, y: 0, z: -1.0 } },
    ],
    lightColor: "#e3b863",
    floorColor: "#191712",
    framing: "framed by the room. The lamp marks the center.",
  },
  the_porch: {
    id: "the_porch",
    label: "the porch",
    // Bound to the canonical ep2 world-event "Dawn at the porch" / "Chris meets
    // your eyes" (world-events.ts). A place the reconstruction is anchored to.
    anchors: [
      { id: "place:porch_light", label: "the porch light", position: { x: 0, y: 0, z: 0 } },
      { id: "place:railing", label: "the railing", position: { x: -1.2, y: 0, z: -0.6 } },
      { id: "place:step", label: "the step", position: { x: 1.0, y: 0, z: 0.7 } },
      { id: "place:chair", label: "his chair", position: { x: 0.5, y: 0, z: -1.0 } },
    ],
    lightColor: "#d9b06a",
    floorColor: "#14110d",
    framing: "framed by the porch. The light flickers; the night's questions follow.",
  },
  the_last_call: {
    id: "the_last_call",
    // Bound to the canonical ep3 world-event "Years later" / "The toll, named".
    label: "the last call",
    anchors: [
      { id: "place:phone", label: "the phone", position: { x: 0, y: 0, z: 0 } },
      { id: "place:table", label: "the table", position: { x: 0.9, y: 0, z: 0.8 } },
      { id: "place:window", label: "the window", position: { x: -1.1, y: 0, z: -0.7 } },
      { id: "place:chair", label: "the empty chair", position: { x: -0.4, y: 0, z: -1.0 } },
    ],
    lightColor: "#b98a3a",
    floorColor: "#100d0b",
    framing: "framed by the last call. A different phone, a different room, the same weight.",
  },
};

/** The next environment in the cycle (for the in-scene toggle). */
export function nextEnvironment(id: EnvironmentId): EnvironmentId {
  if (id === "the_room") return "the_porch";
  if (id === "the_porch") return "the_last_call";
  return "the_room";
}

/**
 * Build an environment frame for a given env id. Reuses the room adapter's
 * placement math (canonical near the focal light, unanchored scatter outward)
 * so all three environments share the same epistemic grammar. The `RoomState`
 * contract is preserved; we just stamp `envId` + pull anchors/atmosphere from
 * the registry so M3 tests that pass `the_room` keep passing.
 */
export function buildEnvironmentState(
  envId: EnvironmentId,
  state: WorldState,
  fragmentStatuses: Record<string, string>
): RoomState {
  const base = buildRoomState(state, fragmentStatuses);
  const def = ENVIRONMENTS[envId];
  return {
    ...base,
    id: envId,
    anchors: def.anchors,
  };
}

/** Identity-stability helper. */
export function environmentVersionOf(envId: EnvironmentId, s: WorldState): string {
  return buildEnvironmentState(envId, s, {}).version;
}
