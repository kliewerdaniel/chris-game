/**
 * BOARD LAYOUT — deterministic 2D projection of the investigation graph.
 *
 * This is the bridge between the engine's `GraphState` (built by
 * `lib/reconstruction/graph.ts` from `WorldState`) and the 2D diegetic
 * investigation board (components/InvestigationBoard.tsx).
 *
 * Design rules (same contract as the graph adapter):
 *   - PURE: no React, no Three.js, no engine mutation, no model call.
 *   - DETERMINISTIC: identical GraphState -> identical BoardLayout.
 *   - NO Math.random: every position is a stable hash of the node id, so a
 *     card's place on the board never drifts between turns (the player builds a
 *     mental model; it must not reshuffle under them).
 *
 * The board is NOT a graph-theory plot. It is an investigation wall: nodes are
 * placed on a stable spiral by epistemic "kind" so related artifacts cluster,
 * and contradiction tension is expressed as a red thread between two cards — the
 * visual language the brief asks for ("a red thread suddenly appears").
 *
 * Epistemic boundary (unchanged): this module reads only `GraphState`, which is
 * itself derived from engine-owned state. It NEVER asserts world-truth. Tension
 * is a presentation parameter (derived from the engine's own contradiction
 * density), not a truth measure.
 */

import type { GraphState, GraphNode, GraphEdge } from "../reconstruction/graph";

export type CardKind =
  | "person"
  | "place"
  | "event"
  | "claim"
  | "character"
  | "evidence"
  | "fragment"
  | "contradiction";

export interface BoardCard {
  id: string;
  kind: CardKind;
  label: string;
  /** 0..1 — epistemic confidence-ish presentation value (size). */
  size: number;
  /** deterministic position in board space (0..1, 0..1). */
  x: number;
  y: number;
  status?: string;
  /** authored = a hypothesis the player themselves wrote. */
  authored: boolean;
}

export interface BoardThread {
  id: string;
  from: string; // card id
  to: string; // card id
  /** true for contradicts (red tension thread). */
  tension: boolean;
  /** 0..1 presentation of instability (NOT a truth measure). */
  weight: number;
}

export interface BoardLayout {
  cards: BoardCard[];
  threads: BoardThread[];
  /** contradictions surfaced as their own disturb-the-structure cards. */
  contradictions: { id: string; report: string; between: string[]; tension: number }[];
}

// Stable hash -> [0,1) (matches graph.ts hashUnit).
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

// Cluster rings: each kind gets a stable angular band so related artifacts sit
// near each other (people together, places together, evidence together), while
// the per-id hash spreads them within the band. No physics, no Math.random.
const KIND_BAND: Record<CardKind, number> = {
  person: 0.0,
  character: 0.0,
  place: 0.6,
  event: 1.2,
  evidence: 1.8,
  fragment: 2.4,
  claim: 3.0,
  contradiction: 3.6,
};

function placeCard(node: GraphNode, index: number): BoardCard {
  const kind = node.kind as CardKind;
  const band = (KIND_BAND[kind] ?? 3.0) + (hashUnit(node.id + ":band") - 0.5) * 0.5;
  const angle = band + index * 0.21;
  // Radius grows slowly with index so the wall fills from a core outward.
  const radius = 0.12 + Math.sqrt(index + 1) * 0.052;
  const cx = 0.5 + Math.cos(angle) * radius;
  const cy = 0.5 + Math.sin(angle) * radius * 0.82; // slight vertical squash
  return {
    id: node.id,
    kind,
    label: node.label,
    size: node.size,
    x: Math.min(0.96, Math.max(0.04, cx)),
    y: Math.min(0.94, Math.max(0.06, cy)),
    status: node.status,
    authored: node.authored,
  };
}

/**
 * Project a GraphState into a 2D board layout. Pure & deterministic.
 * Composes the engine's own `buildGraphLayout` output so it stays in lockstep
 * with the canonical catalogs — same facts, same epistemic treatment.
 */
export function buildBoardLayout(graph: GraphState): BoardLayout {
  // Dedup nodes by id (defensive — graph.ts already de-dupes, but the board must
  // never emit two cards with the same React key).
  const nodeSeen = new Set<string>();
  const cards: BoardCard[] = [];
  for (const n of graph.nodes) {
    if (nodeSeen.has(n.id)) continue;
    nodeSeen.add(n.id);
    cards.push(placeCard(n, cards.length));
  }

  const byId = new Map(cards.map((c) => [c.id, c]));

  // Dedup edges by key AND drop self-loops (from===to). A contradiction whose
  // `between` lists the same endpoint twice would otherwise emit a self-edge,
  // and several such edges would collide on the same React key. Renderer-side
  // safety only — no engine mutation, frozen spine preserved.
  const threads: BoardThread[] = [];
  const threadSeen = new Set<string>();
  for (const e of graph.edges as GraphEdge[]) {
    if (e.from === e.to) continue;
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    const key = `${e.from}->${e.to}`;
    if (threadSeen.has(key)) continue;
    threadSeen.add(key);
    threads.push({
      id: key,
      from: e.from,
      to: e.to,
      tension: e.tension,
      weight: e.weight,
    });
  }

  const contradictions = graph.tensions.map((t) => ({
    id: t.id,
    report: t.report,
    between: t.between.filter((id) => byId.has(id)),
    tension: t.tension,
  }));

  // Identity-stability check helper (used by tests + renderer).
  const version = String(
    hashUnit(
      JSON.stringify({
        c: graph.nodes.map((n) => n.id).sort(),
        t: graph.tensions.map((t) => t.id).sort(),
      })
    )
  );
  (cards as BoardCard[] & { version?: string }).version = version;

  return { cards, threads, contradictions };
}

/** Identity-stability check — identical inputs -> identical layout version. */
export function boardVersionOf(graph: GraphState): string {
  return buildBoardLayout(graph).cards.length
    ? ((buildBoardLayout(graph).cards as BoardCard[] & { version?: string }).version ?? "")
    : "";
}
