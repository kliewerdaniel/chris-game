import { describe, it, expect } from "vitest";
import { CharacterEngine } from "../lib/characters/engine";
import { CHRIS, CHARACTERS } from "../lib/characters/chris";
import { createWorldState } from "../lib/core/world";

function fresh() {
  const ce = new CharacterEngine();
  let s = createWorldState({ startLocation: "apartment_living", characterIds: Object.keys(CHARACTERS) });
  s = ce.initState(s, "chris");
  return { ce, s };
}

describe("Character knowledge boundaries", () => {
  it("Chris KNOWS canonical facts he holds", () => {
    const { ce, s } = fresh();
    expect(ce.knows(s, "chris", "ep1.sarge.dead")).toBe(true);
    expect(ce.knows(s, "chris", "ep1.chris.with_sarge")).toBe(true);
  });

  it("Chris does NOT know facts outside his boundary", () => {
    const { ce, s } = fresh();
    // ep1.mother.knows is in doesNotKnow
    expect(ce.doesNotKnow(s, "chris", "ep1.mother.knows")).toBe(true);
    expect(ce.knows(s, "chris", "ep1.mother.knows")).toBe(false);
  });

  it("resolves LIE handling for guarded topics", () => {
    const { ce, s } = fresh();
    const r = ce.resolveTopic(s, "chris", "sarge_fine");
    expect(r.mode).toBe("lie");
    expect(r.lieAbout).toBe("sarge_fine");
  });

  it("resolves WITHHOLD handling for secrets", () => {
    const { ce, s } = fresh();
    const r = ce.resolveTopic(s, "chris", "ep1.chris.with_sarge");
    expect(r.mode).toBe("withhold");
  });

  it("resolves TRUTH handling for known, non-secret topics", () => {
    const { ce, s } = fresh();
    const r = ce.resolveTopic(s, "chris", "ep1.sarge.dead");
    expect(r.mode).toBe("truth");
  });

  it("teaching grants knowledge; lifting withhold opens a topic", () => {
    const { ce, s } = fresh();
    let s2 = ce.teach(s, "chris", "ep1.mother.knows");
    expect(ce.knows(s2, "chris", "ep1.mother.knows")).toBe(true);
    s2 = ce.liftWithhold(s2, "chris", "ep1.chris.with_sarge");
    expect(ce.resolveTopic(s2, "chris", "ep1.chris.with_sarge").mode).not.toBe("withhold");
  });

  it("adjusts trust within 0..100", () => {
    const { ce, s } = fresh();
    let t = ce.adjustTrust(s, "chris", -1000);
    expect(t.characterStates.chris.trust).toBe(0);
    t = ce.adjustTrust(s, "chris", 1000);
    expect(t.characterStates.chris.trust).toBe(100);
  });
});

describe("Chris is not a flattening of the author", () => {
  it("has an explicit fictional identity and secrets", () => {
    expect(CHRIS.identity).toMatch(/Marine/i);
    expect(CHRIS.secrets).toContain("ep1.chris.with_sarge");
    expect(CHRIS.voice.mannerisms.length).toBeGreaterThan(0);
  });
});
