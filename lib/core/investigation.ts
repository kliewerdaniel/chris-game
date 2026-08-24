import { CharacterDef, Fact, FactStatus } from "./types";
import { allFacts } from "./facts";
import { listEvidenceDefs } from "./evidence";
import { CHARACTERS } from "../characters/chris";

/**
 * INVESTIGATION GRAPH (P3) — deterministic cross-reference engine.
 *
 * The player's investigation is, structurally, a graph:
 *   - nodes: facts (canonical + contested), evidence, character beliefs, claims
 *   - edges: supports / contradicts / claimedBy / verifiedBy / relatesTo
 *
 * This module BUILDS that graph from the existing canonical data and exposes
 * query operations the UI ("consistency board" / notebook) and the engine can
 * call. Every operation is deterministic and hermetic — it never asks the model,
 * and it NEVER asserts a world-truth. It reports CORROBORATION and DIVERGENCE:
 * "N sources agree / this is un-corroborated / these two claims diverge."
 *
 * Why this matters for the epistemic boundary: the engine's job is to make the
 * player's own reasoning visible and verifiable, not to decide for them. A
 * contradiction is surfaced as "Claim A and Claim B point at the same fact with
 * incompatible statuses" — the player decides what to believe.
 */

export type GraphNodeKind = "fact" | "evidence" | "belief" | "character" | "claim";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  /** epistemic status, when the node carries one. */
  status?: FactStatus;
  /** canonical statement / content. */
  text: string;
  /** who asserts it (for claims/beliefs/testimony). */
  claimedBy?: string;
  /** source confidence, if any. */
  confidence?: number;
}

export type EdgeKind = "supports" | "contradicts" | "claimedBy" | "verifiedBy" | "relatesTo";

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  /** optional weight 0..1 (e.g. claim confidence). */
  weight?: number;
}

export interface InvestigationGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  /** adjacency: nodeId -> outgoing edges. */
  out: Map<string, GraphEdge[]>;
  /** adjacency: nodeId -> incoming edges. */
  in: Map<string, GraphEdge[]>;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function factNode(f: Fact): GraphNode {
  return {
    id: f.id,
    kind: "fact",
    label: f.id,
    status: f.status,
    text: f.statement,
    claimedBy: f.claimedBy,
    confidence: f.provenance?.confidence,
  };
}

function buildGraph(factCatalog: Record<string, Fact> = allFacts()): InvestigationGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // 1. Facts
  for (const f of Object.values(factCatalog)) {
    nodes.set(f.id, factNode(f));
    if (f.verifiedBy) {
      edges.push({ from: f.id, to: f.verifiedBy, kind: "verifiedBy", weight: 1 });
    }
  }

  // 2. Evidence → supports / contradicts facts
  for (const ev of listEvidenceDefs()) {
    nodes.set(ev.id, {
      id: ev.id,
      kind: "evidence",
      label: ev.title,
      status: ev.status,
      text: ev.content,
      confidence: ev.provenance?.confidence,
    });
    for (const fid of ev.supportsFactIds ?? []) {
      edges.push({ from: ev.id, to: fid, kind: "supports", weight: 1 });
    }
    for (const fid of ev.contradictsFactIds ?? []) {
      edges.push({ from: ev.id, to: fid, kind: "contradicts", weight: 1 });
    }
  }

  // 3. Character beliefs (may diverge from canonical), and relationships.
  for (const def of Object.values(CHARACTERS) as CharacterDef[]) {
    nodes.set(`char:${def.id}`, {
      id: `char:${def.id}`,
      kind: "character",
      label: def.name,
      text: def.identity,
    });
    for (const b of def.beliefs ?? []) {
      const bid = `belief:${b.id}`;
      nodes.set(bid, {
        id: bid,
        kind: "belief",
        label: b.id,
        text: b.text,
        claimedBy: def.id,
        confidence: b.confidence,
      });
      for (const fid of b.supports) edges.push({ from: bid, to: fid, kind: "supports", weight: b.confidence });
      for (const fid of b.contradicts) edges.push({ from: bid, to: fid, kind: "contradicts", weight: b.confidence });
      // A false belief points at the canonical fact it hides.
      if (b.lieAboutFactId) edges.push({ from: bid, to: b.lieAboutFactId, kind: "contradicts", weight: b.confidence });
    }
    for (const [to, desc] of Object.entries(def.relationships)) {
      edges.push({ from: `char:${def.id}`, to: `char:${to}`, kind: "relatesTo", weight: 1 });
    }
  }

  // 4. Compile adjacency
  const out = new Map<string, GraphEdge[]>();
  const inc = new Map<string, GraphEdge[]>();
  for (const e of edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from)!.push(e);
    if (!inc.has(e.to)) inc.set(e.to, []);
    inc.get(e.to)!.push(e);
  }

  return { nodes, edges, out, in: inc };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface Contradiction {
  factId: string;
  /** the two (or more) nodes that assert incompatible things about the same fact. */
  claimNodeIds: string[];
  /** human-readable divergence, epistemic-framed (never asserts truth). */
  report: string;
}

/**
 * Surface every fact that two nodes describe incompatibly — e.g. a CANONICAL
 * fact and a TESTIMONY (or belief) that contradicts it. This is what makes
 * Chris's lies *detectable*: the board shows the note (evidence) and Chris's
 * "we were fine" claim pointing at ep1.sarge.chris_argument with incompatible
 * statuses.
 */
export function findContradictions(g: InvestigationGraph): Contradiction[] {
  const out: Contradiction[] = [];
  // Group nodes by the fact-id they bear/reference.
  const byResolvedFact = new Map<string, string[]>();
  for (const n of g.nodes.values()) {
    if (n.kind === "fact") {
      const group = byResolvedFact.get(n.id) ?? [];
      group.push(n.id);
      byResolvedFact.set(n.id, group);
    }
  }
  // A node contradicts a fact f if it has an edge contradicts->f.
  for (const [factId, incoming] of g.in.entries()) {
    const contradicts = incoming.filter((e) => e.kind === "contradicts");
    const supports = incoming.filter((e) => e.kind === "supports");
    const factNode = g.nodes.get(factId);
    if (!factNode) continue;
    if (contradicts.length > 0) {
      const claimNodeIds = contradicts.map((e) => e.from);
      const corrob = supports.length;
      out.push({
        factId,
        claimNodeIds,
        report:
          `${g.nodes.get(claimNodeIds[0])?.label} (${g.nodes.get(claimNodeIds[0])?.status ?? "claim"}) ` +
          `diverges from the canonical record (${factNode.status}). ` +
          (corrob > 0
            ? `${corrob} source${corrob > 1 ? "s" : ""} corroborate(s) the canonical version.`
            : `No source corroborates the canonical version — un-corroborated.`),
      });
    }
  }
  return out;
}

export interface Corroboration {
  factId: string;
  status: FactStatus | undefined;
  supporters: string[];
  contradictors: string[];
  /** derived epistemic verdict — framed as corroboration, never truth. */
  verdict: "corroborated" | "contested" | "un-corroborated" | "canonical-only";
}

/** For each fact, count how many nodes support vs contradict it. */
export function corroborationReport(g: InvestigationGraph): Corroboration[] {
  const out: Corroboration[] = [];
  for (const n of g.nodes.values()) {
    if (n.kind !== "fact") continue;
    const incoming = g.in.get(n.id) ?? [];
    const supporters = incoming.filter((e) => e.kind === "supports").map((e) => e.from);
    const contradictors = incoming.filter((e) => e.kind === "contradicts").map((e) => e.from);
    let verdict: Corroboration["verdict"];
    if (n.status === "canonical" && supporters.length === 0 && contradictors.length === 0) verdict = "canonical-only";
    else if (supporters.length > 0 && contradictors.length === 0) verdict = "corroborated";
    else if (contradictors.length > 0 && supporters.length === 0) verdict = "un-corroborated";
    else verdict = "contested";
    out.push({ factId: n.id, status: n.status, supporters, contradictors, verdict });
  }
  return out;
}

export interface Lead {
  factId: string;
  /** how many edges currently touch this node (more = more central). */
  degree: number;
  /** unresolved if status is contested/testimony/rumor/hypothesis/unknown. */
  unresolved: boolean;
  label: string;
}

/**
 * Rank open leads — facts still carrying a non-canonical status — by graph
 * centrality (degree). A lead with high degree is one whose resolution would
 * reconnect the most loose ends. Purely a prioritization heuristic; the engine
 * uses it to suggest "what to investigate next" without asserting an answer.
 */
export function rankLeads(g: InvestigationGraph): Lead[] {
  const leads: Lead[] = [];
  for (const n of g.nodes.values()) {
    if (n.kind !== "fact") continue;
    const status = n.status;
    const unresolved =
      status === "testimony" || status === "rumor" || status === "hypothesis" || status === "unknown";
    const degree = (g.in.get(n.id)?.length ?? 0) + (g.out.get(n.id)?.length ?? 0);
    if (unresolved) {
      leads.push({ factId: n.id, degree, unresolved, label: n.label });
    }
  }
  return leads.sort((a, b) => b.degree - a.degree);
}

/** Neighborhood of a node (for "show me everything touching this fact"). */
export function neighborhood(g: InvestigationGraph, nodeId: string): { node: GraphNode | undefined; edges: GraphEdge[] } {
  const node = g.nodes.get(nodeId);
  const edges = [...(g.out.get(nodeId) ?? []), ...(g.in.get(nodeId) ?? [])];
  return { node, edges };
}

/**
 * Build the live graph from the current canonical catalog. Cached at module
 * load — the catalog is static, so the graph is static too (the player's
 * *progress* is tracked separately in WorldState, see below).
 */
let _graph: InvestigationGraph | null = null;
export function getInvestigationGraph(): InvestigationGraph {
  if (!_graph) _graph = buildGraph();
  return _graph;
}

// ---------------------------------------------------------------------------
// Player progress overlay (deterministic, derived from WorldState)
// ---------------------------------------------------------------------------

import { WorldState } from "./types";

export interface PlayerInvestigationState {
  /** facts the player has established (from WorldState.knownFacts). */
  established: string[];
  /** evidence the player has discovered (from WorldState.evidenceIds). */
  discovered: string[];
  /** contradictions the player CAN currently see (both endpoints discovered/known). */
  visibleContradictions: Contradiction[];
  /** open leads the player has the evidence to pursue. */
  openLeads: Lead[];
}

/**
 * Overlay the player's discovered evidence + known facts onto the static graph
 * so the UI only shows what the player is actually in a position to see. A
 * contradiction is "visible" only when the player has either the contradicting
 * evidence OR the contested claim in hand — otherwise it stays hidden (they
 * haven't found the thread yet).
 */
export function playerInvestigation(state: WorldState): PlayerInvestigationState {
  const g = getInvestigationGraph();
  const known = new Set(state.knownFacts);
  const discovered = new Set(state.evidenceIds);
  const all = new Set<string>([...known, ...discovered, ...known]); // knownFacts ∪ evidenceIds

  const established = state.knownFacts.filter((f) => g.nodes.has(f));

  const visibleContradictions = findContradictions(g).filter((c) => {
    // visible if the player has the fact known OR the contradicting node discovered/known
    return all.has(c.factId) || c.claimNodeIds.some((id) => all.has(id));
  });

  const openLeads = rankLeads(g).filter((l) => all.has(l.factId));

  return { established, discovered: [...discovered], visibleContradictions, openLeads };
}

/**
 * Build a UI-ready "consistency board" payload from a live WorldState. This is
 * what the /api/investigation endpoint returns. It NEVER asserts world-truth —
 * it reports corroboration and divergence so the player reasons for themselves.
 */
export function buildInvestigationPayload(state: WorldState) {
  const g = getInvestigationGraph();
  const pi = playerInvestigation(state);
  const corrob = corroborationReport(g);
  return {
    episodeId: state.episodeId,
    established: pi.established,
    discovered: pi.discovered,
    corroboration: corrob.map((c) => ({
      factId: c.factId,
      status: c.status,
      verdict: c.verdict,
      supporters: c.supporters.length,
      contradictors: c.contradictors.length,
    })),
    visibleContradictions: pi.visibleContradictions.map((c) => ({
      factId: c.factId,
      report: c.report,
      claimLabels: c.claimNodeIds.map((id) => g.nodes.get(id)?.label ?? id),
    })),
    openLeads: pi.openLeads.map((l) => ({ factId: l.factId, label: l.label, degree: l.degree })),
  };
}
