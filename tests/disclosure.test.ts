import { describe, it, expect } from "vitest";
import { CharacterEngine, characterEngine } from "../lib/characters/engine";
import { CHRIS, MOTHER, CHARACTERS } from "../lib/characters/chris";
import { createWorldState } from "../lib/core/world";

/**
 * Hermetic tests for the procedural disclosure engine. No model, no network —
 * the policy is pure deterministic state. These prove Chris now decides WHAT
 * to say from belief/goal/trust state, not a hardcoded table.
 */
function freshChris() {
  const ce = new CharacterEngine();
  let s = createWorldState({
    startLocation: "apartment_living",
    characterIds: Object.keys(CHARACTERS),
  });
  s = ce.initState(s, "chris");
  return { ce, s };
}

function freshMother() {
  const ce = new CharacterEngine();
  let s = createWorldState({
    startLocation: "apartment_living",
    characterIds: Object.keys(CHARACTERS),
  });
  s = ce.initState(s, "mother");
  return { ce, s };
}

describe("initState seeds belief/goal state", () => {
  it("Chris starts with his two seeded false beliefs", () => {
    const { s } = freshChris();
    const rt = s.characterStates.chris;
    expect(rt.beliefs.length).toBe(2);
    expect(rt.beliefs.find((b) => b.lieAboutFactId === "ep1.chris.with_sarge")).toBeDefined();
    expect(rt.beliefs.find((b) => b.lieAboutFactId === "ep1.chris.owes_money")).toBeDefined();
  });

  it("Chris starts with an active goal stack", () => {
    const { s } = freshChris();
    const rt = s.characterStates.chris;
    expect(rt.goals.some((g) => g.kind === "primary" && g.active)).toBe(true);
    expect(rt.goals.some((g) => g.kind === "constraint" && g.active)).toBe(true);
  });

  it("new runtime fields are present and serializable", () => {
    const { s } = freshChris();
    const rt = s.characterStates.chris;
    expect(rt.askedTopics).toEqual({});
    expect(rt.recentlyConfronted).toBe(false);
    expect(() => JSON.stringify(s)).not.toThrow();
  });
});

describe("resolveTopic back-compat wrapper", () => {
  it("still maps sarge_fine to a lie", () => {
    const { ce, s } = freshChris();
    const r = ce.resolveTopic(s, "chris", "sarge_fine");
    expect(r.mode).toBe("lie");
    expect(r.lieAbout).toBe("sarge_fine");
    expect(r.text).toBeDefined();
  });
  it("still maps withhold secrets to withhold", () => {
    const { ce, s } = freshChris();
    const r = ce.resolveTopic(s, "chris", "ep1.chris.with_sarge");
    expect(r.mode).toBe("withhold");
  });
  it("still maps known non-secret facts to truth", () => {
    const { ce, s } = freshChris();
    const r = ce.resolveTopic(s, "chris", "ep1.sarge.dead");
    expect(r.mode).toBe("truth");
  });
});

describe("procedural disclosure — Chris lies from belief state", () => {
  it("asks about 'sarge_fine' → lie seeded from his false belief", () => {
    const { ce, s } = freshChris();
    const d = ce.resolveDisclosure(s, "chris", "sarge_fine", "ask");
    expect(d.mode).toBe("lie");
    expect(d.lieAboutFactId).toBe("ep1.chris.with_sarge");
    expect(d.seed).toBeDefined();
    expect(d.why).toMatch(/lie/);
  });

  it("asks about 'money' → lie seeded from his debt falsehood", () => {
    const { ce, s } = freshChris();
    const d = ce.resolveDisclosure(s, "chris", "money", "ask");
    expect(d.mode).toBe("lie");
    expect(d.lieAboutFactId).toBe("ep1.chris.owes_money");
  });

  it("asking a known non-secret fact → truth", () => {
    const { ce, s } = freshChris();
    const d = ce.resolveDisclosure(s, "chris", "ep1.sarge.dead", "ask");
    expect(d.mode).toBe("truth");
  });
});

describe("procedural disclosure — goal conflict drives withholding", () => {
  it("a raw canonical secret asked directly → withhold (Chris protects it)", () => {
    const { ce, s } = freshChris();
    const d = ce.resolveDisclosure(s, "chris", "ep1.chris.with_sarge", "ask");
    expect(d.mode).toBe("withhold");
  });

  it("a sensitive topic that HAS a lie seed → lie (even under goal conflict)", () => {
    const { ce, s } = freshChris();
    const d = ce.resolveDisclosure(s, "chris", "sarge_fine", "ask");
    expect(d.mode).toBe("lie");
    expect(d.lieAboutFactId).toBe("ep1.chris.with_sarge");
  });

  it("Chris telling the player about Mother's secret → unknown (he doesn't hold it)", () => {
    // Chris legitimately does NOT know ep1.mother.knows — so answering is 'unknown',
    // not a lie or a withhold. This enforces the knowledge boundary.
    const { ce, s } = freshChris();
    const d = ce.resolveDisclosure(s, "chris", "ep1.mother.knows", "ask");
    expect(d.mode).toBe("unknown");
  });
});

describe("procedural disclosure — confront then press is emergent", () => {
  it("after confront, pressing a sensitive topic → deflect (low trust)", () => {
    const { ce, s } = freshChris();
    let s2 = ce.markConfronted(s, "chris"); // trust still 55 (>= gate)
    const d = ce.resolveDisclosure(s2, "chris", "ep1.chris.with_sarge", "ask");
    // trust 55 >= TRUST_GATE(55) → deflect, not threaten (threshold inclusive)
    expect(d.mode).toBe("deflect");
  });

  it("after confront AND trust dropped below gate → threaten", () => {
    const { ce, s } = freshChris();
    let s2 = ce.markConfronted(s, "chris");
    s2 = ce.adjustTrust(s2, "chris", -10); // trust 45 < gate
    const d = ce.resolveDisclosure(s2, "chris", "ep1.chris.with_sarge", "ask");
    expect(d.mode).toBe("threaten");
  });
});

describe("procedural disclosure — second character (Mother)", () => {
  it("Mother has her own belief that contradicts canonical Chris", () => {
    const { s } = freshMother();
    const rt = s.characterStates.mother;
    const b = rt.beliefs.find((x) => x.lieAboutFactId === "ep1.chris.with_sarge");
    expect(b).toBeDefined();
    // She does NOT know the canonical truth Chris was with Sarge.
    expect(rt.knowsFactIds).not.toContain("ep1.chris.with_sarge");
  });

  it("Mother's secret stays withheld under disclosure (unreachable tonight)", () => {
    const { ce, s } = freshMother();
    const d = ce.resolveDisclosure(s, "mother", "ep1.mother.knows", "ask");
    expect(d.mode).toBe("withhold");
  });

  it("Mother and Chris hold conflicting beliefs about that night", () => {
    const chrisBelief = CHRIS.beliefs?.find((b) => b.lieAboutFactId === "ep1.chris.with_sarge");
    const momBelief = MOTHER.beliefs?.find((b) => b.lieAboutFactId === "ep1.chris.with_sarge");
    expect(chrisBelief).toBeDefined();
    expect(momBelief).toBeDefined();
    // Both lie ABOUT the same canonical fact, but assert DIFFERENT falsehoods.
    expect(chrisBelief!.text).not.toBe(momBelief!.text);
  });
});

describe("recordAsk / markConfronted pressure tracking", () => {
  it("recordAsk increments askedTopics and does not crash", () => {
    const { ce, s } = freshChris();
    const s2 = ce.recordAsk(s, "chris", "sarge_fine");
    expect(s2.characterStates.chris.askedTopics["sarge_fine"]).toBe(1);
  });

  it("markConfronted sets recentlyConfronted and adjustTrust still clamps", () => {
    const { ce, s } = freshChris();
    const s2 = ce.markConfronted(s, "chris");
    expect(s2.characterStates.chris.recentlyConfronted).toBe(true);
    const s3 = ce.adjustTrust(s2, "chris", -1000);
    expect(s3.characterStates.chris.trust).toBe(0);
  });
});
