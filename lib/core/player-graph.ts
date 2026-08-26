/**
 * PLAYER RECONSTRUCTION GRAPH (M2) — deterministic player-authored layer.
 *
 * This is the player's OWN reconstruction graph: hypotheses they form, and the
 * edges they draw between claims. It is a SEPARATE layer from the engine's
 * canonical investigation graph (`investigation.ts`). The player layer NEVER
 * mutates canonical facts — it is evaluated *against* them and reports
 * corroboration / divergence only.
 *
 * Epistemic boundary (unchanged, load-bearing):
 *   - The engine owns truth (canonical facts, the canonical investigation graph).
 *   - The player owns a model. `test()` reports whether the canonical graph
 *     supports or contradicts the player's node — it never declares the player
 *     "right" or "wrong," only whether their model aligns with the engine's.
 *   - No LLM, no Math.random. Every evaluation is deterministic and hermetic.
 *
 * Pure module: no React, no Three.js, no fetch. It reads `WorldState` +
 * the canonical catalogs and returns player-graph state + evaluation reports.
 */

import type { WorldState, FactStatus } from "./types";
import { getInvestigationGraph } from "./investigation";
import { allFacts, getFact } from "./facts";
import { getEvidenceDef } from "./evidence";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A player-authored reconstruction node. Distinct from canonical graph nodes. */
export interface PlayerGraphNode {
  id: string; // `pg:<slug>` — stable, player-scoped
  /** source text the player entered. */
  text: string;
  /** when the node is a re-statement of a canonical fact/evidence id. */
  anchors?: string; // fact id | evidence id
  /** resolved epistemic status for presentation (hypothesis by default). */
  status: FactStatus;
  /** deterministic verdict from the last `test` (presentation only). */
  verdict?: "corroborated" | "divergent" | "unanchored" | "untested";
}

export type PlayerEdgeKind =
  | "supports"
  | "contradicts"
  | "relatesTo";

/** A player-authored edge between two reconstruction ids (canonical or player). */
export interface PlayerGraphEdge {
  id: string; // `pe:<a>~<b>~<kind>` — stable
  from: string; // node id (canonical fact/evidence id, or `pg:<slug>`)
  to: string; // node id (canonical fact/evidence id, or `pg:<slug>`)
  kind: PlayerEdgeKind;
  /** deterministic inference vs the canonical graph (presentation only). */
  alignment?: "corroborates" | "diverges" | "new";
}

export interface PlayerGraphState {
  nodes: PlayerGraphNode[];
  edges: PlayerGraphEdge[];
  version: string;
}

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

/** Stable slug from arbitrary player text. */
function slug(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return cleaned || "node";
}

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

/** Canonical node id set: every fact + evidence id the engine knows. */
function canonicalIds(): Set<string> {
  const ids = new Set<string>();
  for (const f of Object.values(allFacts())) ids.add(f.id);
  return ids;
}

/**
 * Evaluate a player node against the canonical investigation graph.
 * Deterministic: same inputs -> same verdict. NEVER asserts world-truth —
 * returns only whether the engine's own graph corroborates or diverges.
 */
export function evaluateNode(
  node: PlayerGraphNode
): "corroborated" | "divergent" | "unanchored" {
  // A node that doesn't anchor to a canonical fact/evidence can't be tested.
  const anchor = node.anchors;
  if (!anchor) return "unanchored";
  const wellFormed = !!getFact(anchor) || !!getEvidenceDef(anchor);
  if (!wellFormed) return "unanchored";

  const g = getInvestigationGraph();
  const n = g.nodes.get(anchor);
  if (!n) return "unanchored";

  // If the canonical node carries a non-canonical status (testimony/belief/
  // rumor/hypothesis), the player's re-statement is a model of a model — it
  // corroborates the *claim's existence* but inherits the source's uncertainty.
  const status = (n.status ?? "unknown") as FactStatus;
  if (status === "canonical" || status === "inferred" || status === "observation") {
    return "corroborated";
  }
  // Testimony/belief/rumor/hypothesis/unknown anchors: the player's node is a
  // plausible reconstruction but diverged from ground truth (it's a delusion of
  // the reconstruction, not Chris). Report divergent so the board shows tension.
  return "divergent";
}

/**
 * Evaluate a player edge against the canonical graph's edges between the same
 * two ids. Deterministic lookup only — never mutates the canonical graph.
 */
export function evaluateEdge(
  edge: PlayerGraphEdge
): "corroborates" | "diverges" | "new" {
  const g = getInvestigationGraph();
  // Map player edge kind onto canonical edge semantics.
  const canonicalKind =
    edge.kind === "supports"
      ? "supports"
      : edge.kind === "contradicts"
        ? "contradicts"
        : "relatesTo";
  const present = g.edges.some(
    (e) =>
      (e.from === edge.from && e.to === edge.to) ||
      (e.from === edge.to && e.to === edge.from)
  );
  if (!present) return "new"; // player drew a relation the engine didn't encode
  const matching = g.edges.some(
    (e) =>
      (((e.from === edge.from && e.to === edge.to) ||
        (e.from === edge.to && e.to === edge.from)) &&
        e.kind === canonicalKind)
  );
  return matching ? "corroborates" : "diverges";
}

// ---------------------------------------------------------------------------
// Actions (deterministic, no world-truth mutation)
// ---------------------------------------------------------------------------

function addPlayerNode(
  state: WorldState,
  text: string,
  anchor?: string
): { state: WorldState; node: PlayerGraphNode } {
  const id = `pg:${slug(text)}:${Math.floor(hashUnit(text + (anchor ?? "")) * 1e4)}`;
  const existing = state.playerNodes.find((n) => n.id === id);
  const node: PlayerGraphNode = existing ?? {
    id,
    text,
    anchors: anchor,
    status: "hypothesis",
    verdict: anchor ? evaluateNode({ id, text, anchors: anchor, status: "hypothesis" }) : "untested",
  };
  const playerNodes = existing
    ? state.playerNodes.map((n) => (n.id === id ? node : n))
    : [...state.playerNodes, node];
  return { state: { ...state, playerNodes }, node };
}

function addPlayerEdge(
  state: WorldState,
  from: string,
  to: string,
  kind: PlayerEdgeKind
): { state: WorldState; edge: PlayerGraphEdge } {
  const id = `pe:${from}~${to}~${kind}`;
  const existing = state.playerEdges.find((e) => e.id === id);
  const edge: PlayerGraphEdge = existing ?? {
    id,
    from,
    to,
    kind,
    alignment: evaluateEdge({ id, from, to, kind }),
  };
  const playerEdges = existing
    ? state.playerEdges.map((e) => (e.id === id ? edge : e))
    : [...state.playerEdges, edge];
  return { state: { ...state, playerEdges }, edge };
}

export interface ReconstructResult {
  state: WorldState;
  /** human-readable lines describing what happened (engine-authored, fail-closed). */
  lines: string[];
  ok: boolean;
  reason?: string;
}

/**
 * HYPOTHESIZE — player forms a reconstruction node.
 * `anchor` (optional) ties the node to a canonical fact/evidence id so it can
 * later be `test`ed against the engine's graph.
 */
export function hypothesize(
  state: WorldState,
  text: string,
  anchor?: string
): ReconstructResult {
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    return { state, lines: ["> hypothesize: (empty)"], ok: false, reason: "say what you think connects" };
  }
  const { state: next, node } = addPlayerNode(state, trimmed, anchor);
  const note = node.verdict && node.verdict !== "untested"
    ? ` — already leaning ${node.verdict} against the record.`
    : ".";
  return {
    state: next,
    ok: true,
    lines: [`> you hypothesize: ${trimmed}`, `Noted in your reconstruction${note}`],
  };
}

/**
 * CONNECT — player draws an edge between two reconstruction ids (canonical
 * fact/evidence ids, or their own `pg:` nodes). Evaluated against the engine's
 * graph; the alignment is reported, never asserted as truth.
 */
export function connect(
  state: WorldState,
  from: string,
  to: string,
  kind: PlayerEdgeKind
): ReconstructResult {
  if (!from || !to || from === to) {
    return { state, lines: ["> connect: (bad link)"], ok: false, reason: "link two distinct claims" };
  }
  const { state: next, edge } = addPlayerEdge(state, from, to, kind);
  const align = edge.alignment;
  const word =
    align === "corroborates"
      ? "lines up with what the record already shows"
      : align === "diverges"
        ? "cuts against what the record already shows"
        : "is a relation the record doesn't spell out — your read";
  return {
    state: next,
    ok: true,
    lines: [`> you connect: ${from} —${kind}→ ${to}`, `Your link ${word}.`],
  };
}

/**
 * TEST — player evaluates one of their nodes against the canonical graph.
 * Deterministic verdict, never a world-truth claim. Updates the node's
 * `verdict` for the board.
 */
export function testNode(state: WorldState, nodeId: string): ReconstructResult {
  const node = state.playerNodes.find((n) => n.id === nodeId);
  if (!node) {
    // Allow testing a canonical fact id directly (reads engine status).
    const f = getFact(nodeId);
    if (f) {
      const verdict = evaluateNode({ id: nodeId, text: f.statement, anchors: nodeId, status: "hypothesis" });
      const word =
        verdict === "corroborated"
          ? "the record holds this as ground truth"
          : verdict === "divergent"
            ? "the record carries this only as someone's claim — not as ground truth"
            : "the record doesn't anchor this";
      return { state, ok: true, lines: [`> you test: ${nodeId}`, `${f.statement} — ${word}.`] };
    }
    return { state, lines: ["> test: (unknown node)"], ok: false, reason: "pick a node from your reconstruction" };
  }
  const verdict = node.anchors
    ? evaluateNode(node)
    : "unanchored";
  const playerNodes = state.playerNodes.map((n) =>
    n.id === node.id ? { ...n, verdict } : n
  );
  const word =
    verdict === "corroborated"
      ? "your read lines up with the record"
      : verdict === "divergent"
        ? "your read diverges from the record — it's a model of a model, not Chris"
        : "your node doesn't anchor to anything the record can test";
  return {
    state: { ...state, playerNodes },
    ok: true,
    lines: [`> you test: ${node.text}`, `${word}.`],
  };
}

// ---------------------------------------------------------------------------
// Derived view (for the board / recon adapters)
// ---------------------------------------------------------------------------

export function buildPlayerGraph(state: WorldState): PlayerGraphState {
  const nodes = [...state.playerNodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const edges = [...state.playerEdges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    nodes,
    edges,
    version: String(hashUnit(JSON.stringify({ n: nodes, e: edges, ep: state.episodeId }))),
  };
}

/** Resolve a player-supplied id token to a canonical fact/evidence id if it matches. */
export function resolveAnchor(token: string): string | undefined {
  const t = (token ?? "").trim().toLowerCase();
  if (!t) return undefined;
  for (const f of Object.values(allFacts())) {
    const id = f.id.toLowerCase();
    if (id === t || id.endsWith(`:${t}`) || id.endsWith(`.${t}`)) return f.id;
  }
  return undefined;
}
