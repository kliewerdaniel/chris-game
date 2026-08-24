import { describe, it, expect } from "vitest";
import { createWorldState, serializeWorldState, deserializeWorldState, advanceTime, addEvent, discoverEvidence } from "../lib/core/world";
import { markDiscovered, instantiateEvidence, getEvidenceDef } from "../lib/core/evidence";
import { FACTS, getFact, factStatus } from "../lib/core/facts";

describe("WorldState", () => {
  it("creates a serializable, complete baseline", () => {
    const s = createWorldState({ startLocation: "apartment_living", characterIds: ["chris", "player"] });
    expect(s.version).toBe(1);
    expect(s.location).toBe("apartment_living");
    expect(s.characterStates.chris).toBeDefined();
    expect(s.characterStates.player).toBeDefined();
    expect(s.inventory).toEqual([]);
    expect(s.episodeComplete).toBe(false);
    // round-trips losslessly
    const rt = deserializeWorldState(serializeWorldState(s));
    expect(rt).toEqual(s);
  });

  it("advances time and rolls over midnight", () => {
    const s = createWorldState({ startLocation: "x", characterIds: [] });
    const t = advanceTime(s, 90); // 22:14 + 90m = 23:44
    expect(t.time.hour).toBe(23);
    expect(t.time.minute).toBe(44);
    const wrap = advanceTime(s, 600); // +10h
    expect(wrap.time.day).toBe(2);
    expect(wrap.time.hour).toBe(8);
    expect(wrap.time.minute).toBe(14);
  });

  it("adds events with engine timestamp", () => {
    const s = createWorldState({ startLocation: "x", characterIds: [] });
    const e = addEvent(s, { id: "e1", type: "test", description: "d" });
    expect(e.events).toHaveLength(1);
    expect(e.events[0].timestamp).toEqual(s.time);
  });

  it("discovers evidence idempotently", () => {
    const s = createWorldState({ startLocation: "x", characterIds: [] });
    const ev = markDiscovered(instantiateEvidence("ev_chris_note"));
    const a = discoverEvidence(s, ev);
    const b = discoverEvidence(a, ev);
    expect(a.evidenceIds).toEqual(["ev_chris_note"]);
    expect(b.evidenceIds).toEqual(a.evidenceIds);
  });
});

describe("Evidence", () => {
  it("is immutable once instantiated (content fixed, only discovery flips)", () => {
    const ev = instantiateEvidence("ev_chris_note");
    expect(ev.discovered).toBe(false);
    const disc = markDiscovered(ev);
    expect(disc.discovered).toBe(true);
    expect(disc.content).toBe(ev.content);
    // re-mark is a no-op new object
    expect(markDiscovered(disc)).toBe(disc);
  });

  it("carries provenance and fact links", () => {
    const ev = getEvidenceDef("ev_chris_note")!;
    expect(ev.provenance.sourceType).toBe("author");
    expect(ev.contradictsFactIds).toContain("ep1.sarge.chris_argument");
    expect(ev.supportsFactIds).toContain("ep1.chris.with_sarge");
  });
});

describe("Facts / Epistemics", () => {
  it("canonical facts are the deterministic source of truth", () => {
    const f = getFact("ep1.sarge.dead")!;
    expect(f.status).toBe("canonical");
    expect(factStatus("ep1.chris.with_sarge")).toBe("canonical");
  });

  it("contested claims carry testimony status, not canon", () => {
    expect(factStatus("ep1.sarge.chris_argument")).toBe("testimony");
    expect(FACTS["ep1.sarge.chris_argument"].claimedBy).toBe("chris");
  });

  it("unresolved items stay unknown (gameplay material)", () => {
    expect(factStatus("ep1.mother.knows")).toBe("unknown");
  });
});
