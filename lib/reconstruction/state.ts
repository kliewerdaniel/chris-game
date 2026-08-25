/**
 * RECONSTRUCTION STATE — deterministic visual-epistemic adapter (ADR Iteration 1).
 *
 * This module is the single bridge between the deterministic game engine and
 * any future visual renderer (R3F, SVG fallback, etc.). It is:
 *   - PURE: no React, no Three.js, no fetch, no model call.
 *   - DETERMINISTIC: identical WorldState -> identical ReconstructionState.
 *   - ORDER-INDEPENDENT: the order of knownFacts / evidenceIds never changes output.
 *   - GENERIC: it understands the engine's abstractions (WorldState, FactStatus,
 *     Evidence, Provenance, Belief, InvestigationGraph, EdgeKind, contradictions,
 *     known/discovered facts). It contains NO episode-specific fact ids.
 *
 * The LLM never feeds this module. Every value is derived from engine-owned
 * state via `playerInvestigation()` + `buildInvestigationPayload()` (which
 * themselves only read the static canonical catalogs + the player's WorldState).
 *
 * IMPORTANT (epistemic honesty): the engine's statuses — canonical, testimony,
 * belief, hypothesis, rumor, unknown — are DIFFERENT EPISTEMIC KINDS, NOT points
 * on a truth scale. This adapter preserves each status and provenance exactly.
 * It never collapses them into a single "truth score."
 */

import type { FactStatus, Provenance, WorldState } from "../core/types";
import {
  getInvestigationGraph,
  playerInvestigation,
  buildInvestigationPayload,
  type EdgeKind,
} from "../core/investigation";
import { allFacts, getFact } from "../core/facts";
import { getEvidenceDef } from "../core/evidence";

// ---------------------------------------------------------------------------
// Types — the contract a renderer consumes.
// ---------------------------------------------------------------------------

export type ReconStatus = FactStatus;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A geometric fragment. `id` is the engine's stable id -> identity across turns. */
export interface ReconFragment {
  id: string; // fact id | evidence id | `belief:<id>` | `hypothesis:<id>`
  kind: "fact" | "evidence" | "belief" | "hypothesis";
  status: ReconStatus;
  label: string;
  quote?: string;
  claimedBy?: string;
  provenance?: Provenance;
  /** stable 0..1 hash(id) — used for deterministic jitter, never motion seed. */
  seed: number;
  /** deterministic home position (stable identity). */
  region: Vec3;
  /** 0.4..1.4 from confidence + content length. */
  size: number;
  /** per-status (canonical 1 … rumor .3). A presentation value, not truth. */
  opacity: number;
  /** canonical/verified -> settled (no drift); else drifts. */
  anchored: boolean;
  /** local edges (for highlight on selection). */
  edges: ReconEdge[];
}

export interface ReconEdge {
  to: string; // fragment id or topology node id
  kind: EdgeKind;
  weight: number; // 0..1
}

export interface ReconContradiction {
  id: string; // `c:<factId>` — stable
  factId: string;
  /** fragment/node ids in tension (graph ids; align with fragment positions). */
  between: string[];
  /** 0..1 presentation of instability (NOT a truth measure). */
  tension: number;
  /** epistemic-framed report from the engine (never asserts world-truth). */
  report: string;
}

/** First-class absence. Nothing is rendered for it by default. */
export interface ReconVoid {
  id: string; // `void:<factId>` — stable
  /** what *could* be here (for a11y/legend, never a glowing placeholder). */
  label: string;
  region: Vec3;
  reason: "unresolved-fact" | "topology-gap";
}

export interface ReconTopologyNode {
  id: string;
  kind: "person" | "event" | "place" | "claim" | "character" | "evidence";
  label: string;
  status?: ReconStatus;
  region: Vec3;
}

export interface ReconstructionCounts {
  established: number; // canonical + inferred + observation
  testimony: number;
  belief: number;
  hypothesis: number;
  rumor: number;
  unknown: number; // voids
  contradicted: number;
}

export interface ReconstructionState {
  /**
   * PRESENTATION PARAMETER ONLY.
   * Describes how visually *assembled* the reconstruction should appear
   * (fraction of fragments that are anchored/settled). It is NOT a probability,
   * confidence score, or measure of truth. The raw epistemic counts below are
   * authoritative.
   */
  visualCoherence: number;
  /**
   * PRESENTATION PARAMETER ONLY.
   * Overall instability for rendering tension. Derived from contradiction
   * density. Not a measure of how "wrong" anything is.
   */
  tension: number;
  counts: ReconstructionCounts;
  fragments: ReconFragment[];
  contradictions: ReconContradiction[];
  voids: ReconVoid[];
  topology: ReconTopologyNode[];
  edges: ReconEdge[];
  /** the live episode — the renderer maps this to tone (not this module's job). */
  episodeId: string;
  /** stable hash of inputs — identity-stability check across turns/orderings. */
  version: string;
}

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Small stable string hash -> [0,1). Same input always yields same output. */
function hashUnit(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // second mix for better spread
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Cluster centers keep each status in a meaningful region of the figure. */
const CLUSTER: Record<string, Vec3> = {
  canonical: { x: 0.0, y: 0.0, z: 0.0 },
  inferred: { x: 0.0, y: 0.0, z: 0.0 },
  observation: { x: 0.0, y: 0.0, z: 0.0 },
  testimony: { x: 0.22, y: 0.12, z: 0.1 }, // warm, near the figure
  belief: { x: -0.3, y: 0.22, z: 0.0 }, // cool, interior
  hypothesis: { x: 0.12, y: -0.32, z: 0.2 }, // exploratory, scattered
  rumor: { x: -0.6, y: -0.5, z: -0.3 }, // outside the main mass
  unknown: { x: 0.0, y: 0.0, z: 0.0 },
};

/** Deterministic position from id + status. Identical id -> identical position. */
export function hashToPosition(id: string, status: ReconStatus): Vec3 {
  const c = CLUSTER[status] ?? CLUSTER.canonical;
  const j = (key: string) => (hashUnit(key) * 2 - 1) * 0.35;
  return {
    x: c.x + j(id + ":x"),
    y: c.y + j(id + ":y"),
    z: c.z + j(id + ":z"),
  };
}

/** Per-status presentation treatment. Derived from status generically. */
const STATUS_TREATMENT: Record<
  ReconStatus,
  { opacity: number; anchored: boolean }
> = {
  canonical: { opacity: 1.0, anchored: true },
  inferred: { opacity: 0.95, anchored: true },
  observation: { opacity: 0.9, anchored: true },
  testimony: { opacity: 0.7, anchored: false },
  belief: { opacity: 0.5, anchored: false },
  hypothesis: { opacity: 0.45, anchored: false },
  rumor: { opacity: 0.3, anchored: false },
  unknown: { opacity: 0, anchored: false }, // becomes a void, not a fragment
};

function sizeFor(confidence: number | undefined, textLen: number): number {
  const base = 0.4 + clamp01((textLen ?? 0) / 600) * 0.6; // longer content -> larger
  const conf = confidence ?? 0.5;
  return Math.min(1.4, base * (0.7 + conf * 0.3));
}

function topologyKindFor(graphKind: string): ReconTopologyNode["kind"] {
  switch (graphKind) {
    case "character":
      return "character";
    case "evidence":
      return "evidence";
    case "fact":
      return "claim";
    default:
      return "claim";
  }
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Build the reconstruction state from a WorldState. Pure & deterministic.
 * Composes the engine's own investigation pipeline; adds no epistemic judgment.
 */
export function buildReconstructionState(state: WorldState): ReconstructionState {
  const graph = getInvestigationGraph();
  const payload = buildInvestigationPayload(state);
  const pi = playerInvestigation(state);

  const knownFacts = [...state.knownFacts].sort();
  const evidenceIds = [...state.evidenceIds].sort();
  const hypothesisIds = state.hypotheses.map((h) => h.id).sort();

  // Stable id -> fragment map (dedupes across sources).
  const fragById = new Map<string, ReconFragment>();
  const addFrag = (f: ReconFragment) => {
    if (!fragById.has(f.id)) fragById.set(f.id, f);
  };

  // 1. Known facts -> fragments carrying the catalog's own FactStatus.
  for (const fid of knownFacts) {
    const f = getFact(fid);
    if (!f) continue;
    const t = STATUS_TREATMENT[f.status];
    addFrag({
      id: fid,
      kind: "fact",
      status: f.status,
      label: f.statement,
      quote: f.provenance?.quote,
      claimedBy: f.claimedBy,
      provenance: f.provenance,
      seed: hashUnit(fid),
      region: hashToPosition(fid, f.status),
      size: sizeFor(f.provenance?.confidence, f.statement.length),
      opacity: t.opacity,
      anchored: t.anchored,
      edges: [],
    });
  }

  // 2. Discovered evidence -> fragments.
  for (const eid of evidenceIds) {
    const e = getEvidenceDef(eid);
    if (!e) continue;
    const t = STATUS_TREATMENT[e.status];
    addFrag({
      id: eid,
      kind: "evidence",
      status: e.status,
      label: e.title,
      quote: e.provenance?.quote,
      provenance: e.provenance,
      seed: hashUnit(eid),
      region: hashToPosition(eid, e.status),
      size: sizeFor(e.provenance?.confidence, e.content.length),
      opacity: t.opacity,
      anchored: t.anchored,
      edges: [],
    });
  }

  // 3. Character beliefs (engine-defined; always part of the reconstruction).
  for (const node of graph.nodes.values()) {
    if (node.kind !== "belief") continue;
    const id = node.id; // `belief:<id>` — aligns with contradiction endpoints
    addFrag({
      id,
      kind: "belief",
      status: "belief",
      label: node.text,
      claimedBy: node.claimedBy,
      provenance: node.confidence !== undefined ? { source: "", sourceType: "author", sourceId: "", confidence: node.confidence } : undefined,
      seed: hashUnit(id),
      region: hashToPosition(id, "belief"),
      size: sizeFor(node.confidence, node.text.length),
      opacity: STATUS_TREATMENT.belief.opacity,
      anchored: false,
      edges: [],
    });
  }

  // 4. Player hypotheses -> fragments.
  for (const h of state.hypotheses) {
    const id = `hypothesis:${h.id}`;
    addFrag({
      id,
      kind: "hypothesis",
      status: "hypothesis",
      label: h.text,
      seed: hashUnit(id),
      region: hashToPosition(id, "hypothesis"),
      size: sizeFor(0.5, h.text.length),
      opacity: STATUS_TREATMENT.hypothesis.opacity,
      anchored: false,
      edges: [],
    });
  }

  // 5. Voids — catalog facts with status `unknown` the player hasn't established.
  const knownSet = new Set(knownFacts);
  const voids: ReconVoid[] = [];
  for (const f of Object.values(allFacts())) {
    if (f.status === "unknown" && !knownSet.has(f.id)) {
      voids.push({
        id: `void:${f.id}`,
        label: f.statement,
        region: hashToPosition(f.id, "canonical"), // sits inside the would-be figure
        reason: "unresolved-fact",
      });
    }
  }
  voids.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // 6. Contradictions (only those the player can currently see — epistemic honesty).
  const contradictions: ReconContradiction[] = pi.visibleContradictions.map((c) => {
    const supporters = payload.corroboration.find((r) => r.factId === c.factId)?.supporters ?? 0;
    const contradictors = c.claimNodeIds.length;
    const tension = clamp01(contradictors / (supporters + contradictors + 1e-6));
    return {
      id: `c:${c.factId}`,
      factId: c.factId,
      between: [c.factId, ...c.claimNodeIds].sort(),
      tension,
      report: c.report,
    };
  });
  contradictions.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // 7. Topology — graph nodes/edges in player scope, with semantic kinds.
  const charNodeIds = [...graph.nodes.keys()].filter((k) => k.startsWith("char:"));
  const scope = new Set<string>([
    ...fragById.keys(),
    ...knownFacts,
    ...evidenceIds,
    ...charNodeIds,
  ]);
  const topology: ReconTopologyNode[] = [];
  for (const node of graph.nodes.values()) {
    if (!scope.has(node.id)) continue;
    topology.push({
      id: node.id,
      kind: topologyKindFor(node.kind),
      label: node.label,
      status: node.status,
      region: hashToPosition(node.id, (node.status ?? "unknown") as ReconStatus),
    });
  }
  topology.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const edges: ReconEdge[] = [];
  for (const e of graph.edges) {
    if (!scope.has(e.from) || !scope.has(e.to)) continue;
    edges.push({ to: e.to, kind: e.kind, weight: e.weight ?? 1 });
  }
  edges.sort((a, b) =>
    a.to < b.to ? -1 : a.to > b.to ? 1 : a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0
  );

  // Wire local edges onto fragments for selection highlight.
  for (const f of fragById.values()) {
    f.edges = edges.filter((e) => e.to === f.id || f.id === e.to).map((e) => ({ ...e }));
  }

  // 8. Counts (authoritative raw epistemic state).
  const counts: ReconstructionCounts = {
    established: 0,
    testimony: 0,
    belief: 0,
    hypothesis: 0,
    rumor: 0,
    unknown: voids.length,
    contradicted: contradictions.length,
  };
  for (const f of fragById.values()) {
    if (f.status === "canonical" || f.status === "inferred" || f.status === "observation") counts.established++;
    else if (f.status === "testimony") counts.testimony++;
    else if (f.status === "belief") counts.belief++;
    else if (f.status === "hypothesis") counts.hypothesis++;
    else if (f.status === "rumor") counts.rumor++;
  }

  // Presentation params (NOT truth). Documented as such on the interface.
  const fragments = [...fragById.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const anchoredN = fragments.filter((f) => f.anchored).length;
  const visualCoherence = clamp01(0.12 + 0.88 * (anchoredN / (fragments.length + 1e-6)));
  const tension = clamp01(counts.contradicted / (counts.established + counts.contradicted + 1e-6));

  const version = String(
    hashUnit(
      JSON.stringify({
        k: knownFacts,
        e: evidenceIds,
        h: hypothesisIds,
        ep: state.episodeId,
      })
    )
  );

  return {
    visualCoherence,
    tension,
    counts,
    fragments,
    contradictions,
    voids,
    topology,
    edges,
    episodeId: state.episodeId,
    version,
  };
}
