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
    expect(g.nodes.has("ep1.chris.with_sarge")).toBe(true);
    // evidence present
    expect(g.nodes.has("ev_chris_note")).toBe(true);
    // character node present
    expect(g.nodes.has("char:chris")).toBe(true);
  });

  it("creates correct supports/contrs edges (note contradicts chris_argument)", () => {
    const g = getInvestigationGraph();
    const noteIn = g.in.get("ep1.sarge.chris_argument") ?? [];
    const contradictByNote = noteIn.find((e) => e.from === "ev_chris_note" && e.kind === "contradicts");
    expect(contradictByNote).toBeDefined();
  });
});

describe("investigation graph — contradictions", () => {
  it("detects the note-vs-chris-argument contradiction", () => {
    const g = getInvestigationGraph();
    const cs = findContradictions(g);
    const hit = cs.find((c) => c.factId === "ep1.sarge.chris_argument");
    expect(hit).toBeDefined();
    expect(hit!.claimNodeIds).toContain("ev_chris_note");
  });

  it("detects the debt-collector truth contradicting the 'fine' claim (ep3)", () => {
    const g = getInvestigationGraph();
    const cs = findContradictions(g);
    const hit = cs.find((c) => c.factId === "ep3.chris.fine");
    expect(hit).toBeDefined();
  });

  it("reports corroboration verdicts, never asserts truth", () => {
    const g = getInvestigationGraph();
    const rep = corroborationReport(g);
    const sargeDead = rep.find((r) => r.factId === "ep1.sarge.dead");
    expect(sargeDead).toBeDefined();
    // verbatim verdict is a corroboration-label, not a world-truth claim
    expect(["corroborated", "contested", "un-corroborated", "canonical-only"]).toContain(sargeDead!.verdict);
  });
});

describe("investigation graph — leads", () => {
  it("ranks unresolved (non-canonical status) leads by degree", () => {
    const g = getInvestigationGraph();
    const leads = rankLeads(g);
    expect(leads.length).toBeGreaterThan(0);
    // all returned are unresolved by status (sanity: each resolves to a fact node)
    for (const l of leads) {
      const node = g.nodes.get(l.factId);
      expect(node?.kind).toBe("fact");
    }
    // sorted descending by degree
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

  it("hides contradictions until the player has the thread", () => {
    const pi = playerInvestigation(state);
    // fresh game: note not discovered, so the chris_argument contradiction is not visible
    expect(pi.visibleContradictions.find((c) => c.factId === "ep1.sarge.chris_argument")).toBeUndefined();
  });

  it("reveals the contradiction once the note is discovered", () => {
    state = { ...state, evidenceIds: [...state.evidenceIds, "ev_chris_note"] };
    const pi = playerInvestigation(state);
    const hit = pi.visibleContradictions.find((c) => c.factId === "ep1.sarge.chris_argument");
    expect(hit).toBeDefined();
  });

  it("neighborhood returns the node + touching edges", () => {
    const g = getInvestigationGraph();
    const { node, edges } = neighborhood(g, "ev_chris_note");
    expect(node?.id).toBe("ev_chris_note");
    expect(edges.length).toBeGreaterThan(0);
  });
});
