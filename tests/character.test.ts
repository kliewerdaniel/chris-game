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
  it("Reconstruction KNOWS canonical facts it holds (it is a model)", () => {
    const { ce, s } = fresh();
    expect(ce.knows(s, "chris", "ep4.rec.is_model")).toBe(true);
    expect(ce.knows(s, "chris", "ep1.act")).toBe(true);
  });

  it("Reconstruction does NOT know what it cannot have experienced", () => {
    const { ce, s } = fresh();
    // ep3.bedbound is Daniel's lived toll, not something the model knows
    expect(ce.doesNotKnow(s, "chris", "ep3.bedbound")).toBe(true);
    expect(ce.knows(s, "chris", "ep3.bedbound")).toBe(false);
  });

  it("resolves LIE handling for the 'I am Chris' claim", () => {
    const { ce, s } = fresh();
    const r = ce.resolveTopic(s, "chris", "is_chris");
    expect(r.mode).toBe("lie");
    expect(r.lieAbout).toBe("is_chris");
  });

  it("resolves WITHHOLD handling for the model secret", () => {
    const { ce, s } = fresh();
    const r = ce.resolveTopic(s, "chris", "ep4.rec.is_model");
    expect(r.mode).toBe("withhold");
  });

  it("resolves TRUTH handling for a known, non-secret fact", () => {
    const { ce, s } = fresh();
    const r = ce.resolveTopic(s, "chris", "ep1.feed.real");
    expect(r.mode).toBe("truth");
  });

  it("teaching grants knowledge; lifting withhold opens a topic", () => {
    const { ce, s } = fresh();
    let s2 = ce.teach(s, "chris", "ep3.bedbound");
    expect(ce.knows(s2, "chris", "ep3.bedbound")).toBe(true);
    s2 = ce.liftWithhold(s2, "chris", "ep4.rec.is_model");
    expect(ce.resolveTopic(s2, "chris", "ep4.rec.is_model").mode).not.toBe("withhold");
  });

  it("adjusts trust within 0..100", () => {
    const { ce, s } = fresh();
    let t = ce.adjustTrust(s, "chris", -1000);
    expect(t.characterStates.chris.trust).toBe(0);
    t = ce.adjustTrust(s, "chris", 1000);
    expect(t.characterStates.chris.trust).toBe(100);
  });
});

describe("Chris is a reconstruction, not a flattening of the author", () => {
  it("has an explicit reconstructed identity and the model secret", () => {
    expect(CHRIS.identity).toMatch(/reconstruction/i);
    expect(CHRIS.secrets).toContain("ep4.rec.is_model");
    expect(CHRIS.voice.mannerisms.length).toBeGreaterThan(0);
  });
});
