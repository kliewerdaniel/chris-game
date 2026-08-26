/**
 * ROOM ENVIRONMENT — deterministic spatial adapter for "the room" (M3 / D9 / D12).
 *
 * Mirror of `state.ts`: a PURE, DETERMINISTIC bridge from `WorldState` to the
 * spatial framing of one authored environment ("the room"). No React, no
 * Three.js, no engine mutation. The renderer (`RoomEnvironment.tsx`) consumes
 * this and never reads engine state directly.
 *
 * Epistemic boundary (unchanged from the rest of the reconstruction system):
 *   - This module reads only `WorldState` (engine-owned) + the canonical catalogs.
 *   - It NEVER asserts world-truth. Tone is a *presentation parameter* derived
 *     from the reconstruction's existing `tension`/`visualCoherence`.
 *   - It is asset-agnostic: the hero meshes ("the room" as real geometry) are an
 *     external asset-production dependency (D9). Until those exist, the renderer
 *     draws a procedural placeholder whose positions come from THIS adapter, so
 *     swapping in GLTF later is a drop-in, not a rewrite.
 *
 * Determinism contract (same as `state.ts`):
 *   identical WorldState -> identical RoomState (order-independent).
 */

import type { WorldState } from "../core/types";
import type { Vec3 } from "./state";

export type RoomId = "the_room";

/** A place the reconstruction was anchored to in the real world (epistemic). */
export interface RoomAnchor {
  id: string; // stable: `place:<name>`
  label: string; // human place name (never a world-truth claim)
  /** deterministic position on the room floor. */
  position: Vec3;
}

/**
 * The room's frame. `fragmentPositions` is keyed by the reconstruction
 * fragment id and gives each fragment its place in the room. Anchored
 * (canonical / verified) fragments sit near the lamp at the room's center;
 * unanchored ones (testimony / belief / hypothesis / rumor) scatter outward by
 * status — carrying the Two-Chris gap into the space itself.
 */
export interface RoomState {
  id: RoomId;
  /** presentation parameter — tint of the lamp. NOT a truth measure. */
  tone: "settled" | "tense" | "fragmented";
  /** presentation parameter — 0..1, how assembled the room reads. */
  coherence: number;
  anchors: RoomAnchor[];
  /** fragmentId -> position in the room. */
  fragmentPositions: Record<string, Vec3>;
  /** stable hash of inputs — identity-stability check across turns/orderings. */
  version: string;
}

// Deterministic hash -> [0,1) (matches state.ts hashUnit).
function hashUnit(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// Place anchors (the real-world places the reconstruction can be anchored to).
// These are PRESENTATION anchors for the room environment — fixed, deterministic,
// and clearly framed as places-in-the-room, not assertions about Chris's life.
const PLACE_ANCHORS: RoomAnchor[] = [
  { id: "place:lamp", label: "the lamp", position: { x: 0, y: 0, z: 0 } },
  { id: "place:window", label: "the window", position: { x: -1.1, y: 0, z: -0.8 } },
  { id: "place:door", label: "the door", position: { x: 1.1, y: 0, z: 0.6 } },
  { id: "place:chair", label: "his chair", position: { x: 0.4, y: 0, z: -1.0 } },
];

// Scatter radius grows as epistemic status weakens (the Two-Chris gap in space).
const STATUS_SCATTER: Record<string, number> = {
  canonical: 0.0, // at the lamp, settled
  inferred: 0.12,
  observation: 0.12,
  testimony: 0.55, // stitched-from-mythos -> drifts toward the walls
  belief: 0.8,
  hypothesis: 1.0,
  rumor: 1.25,
  unknown: 0.0,
};

function fragmentPositionInRoom(fragmentId: string, status: string): Vec3 {
  const c = STATUS_SCATTER[status] ?? 0.6;
  // Deterministic angular spread from the id; no randomness. Canonical fragments
  // stay at the lamp (center) so they remain clickable at the camera's focal
  // point; unanchored (testimony/belief/...) scatter outward by status — carrying
  // the Two-Chris gap into the space itself.
  const a = hashUnit(fragmentId + ":angle") * Math.PI * 2;
  const r = c * (0.5 + hashUnit(fragmentId + ":ring") * 0.5);
  return {
    x: Math.cos(a) * r,
    y: 0.15 + hashUnit(fragmentId + ":h") * 0.5, // float gently above the floor
    z: Math.sin(a) * r,
  };
}

/**
 * Build the room frame from a WorldState. Pure & deterministic.
 * `fragmentStatuses` maps fragment/canonical ids -> their epistemic status so
 * the room can place each fragment by status (carrying the Two-Chris gap into
 * the space). The caller (ReconstructionScene) supplies this from the already
 * built `ReconstructionState`.
 */
export function buildRoomState(
  state: WorldState,
  fragmentStatuses: Record<string, string>
): RoomState {
  // Lamp tone from reconstruction tension/coherence (presentation only).
  const known = [...state.knownFacts].sort();
  const evidence = [...state.evidenceIds].sort();
  const hypotheses = state.hypotheses.map((h) => h.id).sort();

  // Coherence approximated from how many fragments are anchored (canonical).
  const ids = [...known, ...evidence, ...hypotheses];
  let anchored = 0;
  for (const id of ids) {
    const st = fragmentStatuses[id] ?? "unknown";
    if (st === "canonical" || st === "inferred" || st === "observation") anchored++;
  }
  const coherence = ids.length ? anchored / ids.length : 0.2;
  const tension = 1 - coherence; // presentation parameter only

  const tone: RoomState["tone"] =
    tension > 0.6 ? "fragmented" : tension > 0.3 ? "tense" : "settled";

  const fragmentPositions: Record<string, Vec3> = {};
  for (const id of ids) {
    const st = fragmentStatuses[id] ?? "unknown";
    fragmentPositions[id] = fragmentPositionInRoom(id, st);
  }

  const version = String(
    hashUnit(JSON.stringify({ k: known, e: evidence, h: hypotheses, ep: state.episodeId }))
  );

  return {
    id: "the_room",
    tone,
    coherence,
    anchors: PLACE_ANCHORS,
    fragmentPositions,
    version,
  };
}

/** Identity-stability check helper (used by tests + the renderer). */
export function roomVersionOf(s: WorldState): string {
  const probe = buildRoomState(s, {});
  return probe.version;
}
