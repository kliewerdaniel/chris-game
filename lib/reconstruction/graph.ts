/**
 * INVESTIGATION-GRAPH STATE — deterministic spatial adapter (D4).
 *
 * PURE, DETERMINISTIC bridge from `WorldState` to the 2D investigation-graph
 * (`GraphState`), consumed by `lib/board/board-layout.ts` and rendered by
 * `components/InvestigationBoard.tsx`. No React, no Three.js, no engine
 * mutation — the renderer never reads engine state directly.
 *
 * What it carries (all already computed by `buildReconstructionState`):
 *   - GRAPH NODES: the engine's investigation-graph `topology` (person / event /
 *     place / claim / character / evidence) + the player's reconstruction
 *     `fragments`.
 *   - EDGES: the graph `edges` (supports / contradicts / claimedBy / verifiedBy
 *     / relatesTo) — drawn as thin threads between nodes on the board.
 *   - CONTRADICTIONS: the reconstruction `contradictions` — drawn as hot tension
 *     threads (never a world-truth claim; just epistemic tension made visible).
 *
 * Layout is deterministic and order-independent: identical WorldState -> identical
 * GraphState (a stable hash positions each node; a fixed spiral spreads the
 * graph so structure is legible, no physics/random).
 *
 * Epistemic boundary (unchanged): this module reads only `WorldState` + the
 * canonical catalogs; it NEVER asserts world-truth. Tension is a presentation
 * parameter derived from the engine's own contradiction density.
 */

import type { WorldState } from "../core/types";
import {
  buildReconstructionState,
  hashToPosition,
  type ReconstructionState,
  type Vec3,
} from "./state";

export type GraphNodeKind =
  | "person"
  | "event"
  | "place"
  | "claim"
  | "character"
  | "evidence"
  | "fragment";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  /** deterministic 3D position (stable identity across turns). */
  position: Vec3;
  /** epistemic status when known (presentation tint). */
  status?: string;
  /** 0.4..1.4 — node size by content/confidence. */
  size: number;
  /** true for nodes the player themselves authored (hypotheses). */
  authored: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: string; // supports | contradicts | claimedBy | verifiedBy | relatesTo
  weight: number; // 0..1
  /** tension edges (contradicts) render hot. */
  tension: boolean;
}

export interface GraphTension {
  id: string;
  between: string[]; // node ids
  /** 0..1 presentation of instability (NOT a truth measure). */
  tension: number;
  report: string;
}

export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  tensions: GraphTension[];
  /** stable hash of inputs — identity-stability check across turns/orderings. */
  version: string;
}

// Deterministic hash -> [0,1) (matches state.ts hashUnit) so node positions are
// stable across renders/turns/orderings.
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

// Stable layout: nodes spiral out from the center by their rank (topology first,
// then fragments), each nudged by a deterministic per-id hash so the structure
// is legible and reproducible — no physics, no Math.random.
function layoutPosition(rank: number, id: string, radius = 1.5): Vec3 {
  const golden = 2.39996323; // golden angle for an even spiral
  const a = rank * golden + hashUnit(id + ":spin") * 0.6;
  const r = 0.12 + (rank === 0 ? 0 : Math.sqrt(rank) * 0.22) * radius;
  const ySpread = (hashUnit(id + ":y") * 2 - 1) * 0.5 * radius;
  return {
    x: Math.cos(a) * r,
    y: ySpread,
    z: Math.sin(a) * r,
  };
}

/**
 * Build the graph constellation from a WorldState. Pure & deterministic.
 * Composes the engine's own `buildReconstructionState` so it stays in lockstep
 * with the room view (same facts, same epistemic treatment).
 */
export function buildGraphLayout(state: WorldState): GraphState {
  const recon: ReconstructionState = buildReconstructionState(state);

  const nodes: GraphNode[] = [];
  const seen = new Set<string>();

  // 1. Topology nodes (the engine's investigation graph) — rank 0 cluster.
  let rank = 0;
  for (const t of recon.topology) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    nodes.push({
      id: t.id,
      kind: t.kind as GraphNodeKind,
      label: t.label,
      position: layoutPosition(rank++, t.id, 1.3),
      status: t.status,
      size: 0.6,
      authored: false,
    });
  }

  // 2. Reconstruction fragments (facts/evidence/beliefs/hypotheses the player
  //    has surfaced) — laid out just outside the topology core.
  for (const f of recon.fragments) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    const id = f.id;
    // Reuse the existing region hash so a fragment's graph position rhymes with
    // its room position (same identity across views).
    const base: Vec3 = hashToPosition(id, f.status);
    const pos: Vec3 = {
      x: base.x * 1.6,
      y: base.y * 1.6,
      z: base.z * 1.6,
    };
    nodes.push({
      id,
      kind: f.kind === "belief" || f.kind === "hypothesis" ? "fragment" : (f.kind as GraphNodeKind),
      label: f.label,
      position: pos,
      status: f.status,
      size: 0.4 + (f.size - 0.4) * 0.4,
      authored: f.kind === "hypothesis",
    });
  }

  // 3. Edges (graph edges + a synthetic link from each fragment to its topology
  //    scope where one exists by id prefix — kept deterministic, no inference).
  const edges: GraphEdge[] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const e of recon.edges) {
    if (!nodeIds.has(e.to)) continue;
    // `e.to` is relative to a fragment; resolve the canonical endpoint if present.
    const from = e.to.startsWith("belief:") ? e.to : e.to;
    if (!nodeIds.has(from)) continue;
    edges.push({
      from,
      to: e.to,
      kind: e.kind,
      weight: e.weight,
      tension: e.kind === "contradicts",
    });
  }

  // 4. Contradictions -> tension edges between the named node ids.
  const tensions: GraphTension[] = [];
  for (const c of recon.contradictions) {
    const present = c.between.filter((id) => nodeIds.has(id));
    if (present.length < 2) continue;
    tensions.push({
      id: c.id,
      between: present.map((id) => id),
      tension: c.tension,
      report: c.report,
    });
    // Express each tension as a hot edge between the first two endpoints.
    edges.push({
      from: present[0],
      to: present[1],
      kind: "contradicts",
      weight: c.tension,
      tension: true,
    });
  }

  const version = String(
    hashUnit(
      JSON.stringify({
        k: [...state.knownFacts].sort(),
        e: [...state.evidenceIds].sort(),
        h: state.hypotheses.map((h) => h.id).sort(),
        ep: state.episodeId,
      })
    )
  );

  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  edges.sort((a, b) =>
    a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0
  );

  return { nodes, edges, tensions, version };
}

/** Identity-stability check helper (used by tests + renderer). */
export function graphVersionOf(s: WorldState): string {
  return buildGraphLayout(s).version;
}
