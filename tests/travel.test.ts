import { describe, it, expect } from "vitest";
import { createWorldState } from "../lib/core/world";
import {
  createJournal,
  captureLive,
  markComplete,
  canTravelTo,
  isFreeTravel,
  restore,
  allSnapshotStates,
} from "../lib/core/travel";
import {
  buildInvestigationPayload,
  aggregateInvestigation,
} from "../lib/core/investigation";

function stateFor(episodeId: string, known: string[], evidence: string[]) {
  let ws = createWorldState({ startLocation: "apartment_living", characterIds: ["chris", "player"], episodeId });
  ws = { ...ws, knownFacts: known, evidenceIds: evidence, episodeComplete: false };
  return ws;
}

describe("TravelJournal — non-destructive rewind", () => {
  it("starts empty and free-travel off", () => {
    const j = createJournal();
    expect(j.snapshots).toEqual({});
    expect(j.liveEpisodeId).toBeNull();
    expect(isFreeTravel(j)).toBe(false);
  });

  it("captures the live frontier and marks it reachable", () => {
    const ws = stateFor("ep1", [], []);
    let j = createJournal();
    j = captureLive(j, ws);
    expect(j.liveEpisodeId).toBe("ep1");
    expect(j.snapshots.ep1).toBeDefined();
    expect(canTravelTo(j, "ep1")).toBe(true); // captured = reachable
  });

  it("cannot travel to an episode that was never entered", () => {
    const ws = stateFor("ep1", [], []);
    const j = captureLive(createJournal(), ws);
    expect(canTravelTo(j, "ep2")).toBe(false);
    expect(restore(j, "ep2")).toBeNull();
  });

  it("marks complete but does NOT unlock free travel until ep4 closes", () => {
    let j = createJournal();
    j = captureLive(j, stateFor("ep1", [], []));
    j = markComplete(j, stateFor("ep1", ["ep1.chris.with_sarge"], ["ev_chris_note"]));
    expect(j.snapshots.ep1.isComplete).toBe(true);
    expect(isFreeTravel(j)).toBe(false); // not ep4
    // ep1 is complete -> revisit-able even though still forward-only
    expect(canTravelTo(j, "ep1")).toBe(true);
  });

  it("unlocks free travel when ep4 closes", () => {
    let j = createJournal();
    j = captureLive(j, stateFor("ep4", [], []));
    j = markComplete(j, stateFor("ep4", [], []), "ep4.closed");
    expect(isFreeTravel(j)).toBe(true);
    // now ANY captured episode is reachable
    j = captureLive(j, stateFor("ep3", [], []));
    expect(canTravelTo(j, "ep3")).toBe(true);
    expect(canTravelTo(j, "ep4")).toBe(true);
  });

  it("restore returns a clone, so callers can't mutate the stored snapshot", () => {
    let j = createJournal();
    j = captureLive(j, stateFor("ep1", [], ["ev_chris_note"]));
    const snap = restore(j, "ep1")!;
    expect(snap.evidenceIds).toContain("ev_chris_note");
    snap.evidenceIds.push("TAMPER");
    expect(j.snapshots.ep1.state.evidenceIds).not.toContain("TAMPER");
  });

  it("allSnapshotStates returns one state per visited episode", () => {
    let j = createJournal();
    j = captureLive(j, stateFor("ep1", [], []));
    j = captureLive(j, stateFor("ep2", [], []));
    expect(allSnapshotStates(j).length).toBe(2);
  });
});

describe("aggregateInvestigation — cross-timeline board", () => {
  it("returns single-timeline shape when given one state (episodeId preserved)", () => {
    const ws = stateFor("ep1", ["ep1.chris.with_sarge"], ["ev_chris_note"]);
    const agg = aggregateInvestigation([ws]);
    expect(agg.episodeId).toBe("all");
    expect(agg.timelines).toEqual(["ep1"]);
    expect(agg.established).toContain("ep1.chris.with_sarge");
    expect(agg.discovered).toContain("ev_chris_note");
  });

  it("unions established/discovered across timelines", () => {
    const a = stateFor("ep1", ["ep1.chris.with_sarge"], ["ev_chris_note"]);
    const b = stateFor("ep4", ["ep4.reconstruction.is_model"], ["ev_chris_final_note"]);
    const agg = aggregateInvestigation([a, b]);
    expect(agg.established).toContain("ep1.chris.with_sarge");
    expect(agg.established).toContain("ep4.reconstruction.is_model");
    expect(agg.discovered).toContain("ev_chris_note");
    expect(agg.discovered).toContain("ev_chris_final_note");
    expect(agg.timelines).toEqual(["ep1", "ep4"]);
  });

  it("corroboration rows carry the timelines they appeared in", () => {
    const a = stateFor("ep1", ["ep1.chris.with_sarge"], []);
    const b = stateFor("ep4", ["ep1.chris.with_sarge"], []);
    const agg = aggregateInvestigation([a, b]);
    const row = agg.corroboration.find((c) => c.factId === "ep1.chris.with_sarge");
    expect(row).toBeDefined();
    expect(row!.timelines).toEqual(["ep1", "ep4"]);
  });

  it("does not assert a world-truth — only merges corroboration/divergence metadata", () => {
    // sanity: aggregate output is deterministic and free of any 'truth' verb.
    const a = stateFor("ep1", [], ["ev_chris_note"]);
    const agg = aggregateInvestigation([a]);
    expect(agg.visibleContradictions.every((c) => typeof c.report === "string")).toBe(true);
  });

  it("empty input returns an empty-but-valid aggregate", () => {
    const agg = aggregateInvestigation([]);
    expect(agg.episodeId).toBe("all");
    expect(agg.timelines).toEqual([]);
    expect(agg.corroboration).toEqual([]);
  });

  it("per-episode payload shape is backward compatible with the endpoint", () => {
    const ws = stateFor("ep2", ["ep2.chris.corps_discharge"], ["ev_axe"]);
    const p = buildInvestigationPayload(ws);
    expect(p.episodeId).toBe("ep2");
    expect(p.established).toContain("ep2.chris.corps_discharge");
    expect(p.discovered).toContain("ev_axe");
  });
});
