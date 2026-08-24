import { describe, it, expect, beforeEach } from "vitest";
import {
  getInvestigationGraph,
  findContradictions,
  corroborationReport,
  rankLeads,
  playerInvestigation,
  neighborhood,
} from "../lib/core/investigation";
import { createWorldState } from "../lib/core/world";

describe("investigation graph — build", () => {
  it("builds a non-empty graph from canonical facts + evidence + characters", () => {
    const g = getInvestigationGraph();
    expect(g.nodes.size).toBeGreaterThan(20);
    expect(g.edges.length).toBeGreaterThan(20);
    // canonical secret fact present
    expect(g.nodes.has("ep4.rec.is_model")).toBe(true);
    // evidence present
    expect(g.nodes.has("ev_source_post")).toBe(true);
    // character node present
    expect(g.nodes.has("char:chris")).toBe(true);
  });
});

describe("investigation graph — contradictions", () => {
  it("detects the reconstruction's 'I am Chris' claim contradicting the model fact", () => {
    const g = getInvestigationGraph();
    const cs = findContradictions(g);
    const hit = cs.find((c) => c.factId === "ep4.rec.is_model");
    expect(hit).toBeDefined();
    expect(hit!.claimNodeIds).toContain("belief:chris.belief.is_chris");
  });

  it("reports corroboration verdicts, never asserts truth", () => {
    const g = getInvestigationGraph();
    const rep = corroborationReport(g);
    const feedReal = rep.find((r) => r.factId === "ep1.feed.real");
    expect(feedReal).toBeDefined();
    expect(["corroborated", "contested", "un-corroborated", "canonical-only"]).toContain(feedReal!.verdict);
  });
});

describe("investigation graph — leads", () => {
  it("ranks unresolved (non-canonical status) leads by degree", () => {
    const g = getInvestigationGraph();
    const leads = rankLeads(g);
    expect(leads.length).toBeGreaterThan(0);
    for (const l of leads) {
      const node = g.nodes.get(l.factId);
      expect(node?.kind).toBe("fact");
    }
    for (let i = 1; i < leads.length; i++) {
      expect(leads[i - 1].degree).toBeGreaterThanOrEqual(leads[i].degree);
    }
  });
});

describe("investigation graph — player overlay", () => {
  let state: ReturnType<typeof createWorldState>;
  beforeEach(() => {
    state = createWorldState({ startLocation: "apartment_living", characterIds: ["chris"] });
  });

  it("neighborhood returns the node + touching edges", () => {
    const g = getInvestigationGraph();
    const { node, edges } = neighborhood(g, "ev_source_post");
    expect(node?.id).toBe("ev_source_post");
    expect(edges.length).toBeGreaterThan(0);
  });
});
