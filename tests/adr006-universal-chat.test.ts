import { describe, it, expect } from "vitest";
import { GameEngine } from "../lib/engine/game-engine";
import { MockProvider, InferenceManager } from "../lib/inference/provider";
import { buildRetrievalFromMemories } from "../lib/retrieval/retrieval";
import { CHRIS } from "../lib/characters/chris";
import { resolveSnapshot, selectSpeaker } from "../lib/engine/world-snapshot";
import { parseAction } from "../lib/inference/intent";

/** Hermetic engine: deterministic mock narrator, NO network. */
function mockEngine(responder?: (m: string) => string) {
  const inference = new InferenceManager([
    new MockProvider(responder ? (r) => responder(r.messages[r.messages.length - 1].content) : undefined),
  ]);
  const retrieval = buildRetrievalFromMemories(CHRIS.memories);
  const narrator = {
    buildContext: () => ({}) as any,
    narrate: async (ctx: any) => ({
      lines: [{ speaker: ctx.character ? "chris" : "narrator", text: "[mock]" }],
      usedModel: false,
      simulated: true,
    }),
  } as any;
  return new GameEngine({ retrieval, narrator, inference });
}

describe("ADR-006 — universal chat interface", () => {
  it("resolves a world snapshot from live state (facts + evidence)", async () => {
    const eng = mockEngine();
    let s = eng.newGame();
    // exercise a deterministic world action that establishes facts/evidence
    s = (await eng.processTurn(s, "examine the post")).state;
    const snap = resolveSnapshot(s);
    expect(snap.location).toBe(s.location);
    expect(snap.knownFacts.some((f) => f.id === "ep1.feed.real")).toBe(true);
    expect(snap.evidence.some((e) => e.id === "ev_source_post")).toBe(true);
  });

  it("every input is answered — no 'didn't catch that' wall", async () => {
    const eng = mockEngine();
    const s = eng.newGame();
    for (const inp of ["asdfgh", "...", "the sky is made of soup"]) {
      const { result } = await eng.processTurn(s, inp);
      expect(result.ok).toBe(true);
      expect(result.narration.length).toBeGreaterThan(0);
      const text = result.narration.map((l) => l.text).join(" ");
      expect(text).not.toMatch(/didn't catch that/i);
    }
  });

  it("speaker routing: call <contact> → contact; everything else → chris", () => {
    const actionUnknown = parseAction("qwerty");
    expect(selectSpeaker({} as any, actionUnknown)).toBe("chris");
    const actionCallMother = parseAction("call Mother");
    // mother exists as a CHARACTER def, so it routes to her
    expect(selectSpeaker({} as any, { ...actionCallMother, type: "call" })).toBe("mother");
  });

  it("post-action world turn still produces a feed reaction (world talks back)", async () => {
    const eng = mockEngine();
    const s = eng.newGame();
    const { result } = await eng.processTurn(s, "examine the post");
    expect(result.ok).toBe(true);
    // deterministic examine result + a chat/feed line from the narrator
    expect(result.narration.length).toBeGreaterThanOrEqual(2);
    const speakers = result.narration.map((l) => l.speaker);
    expect(speakers).toContain("chris");
  });

  it("boundary topic still seed-locks under the world snapshot (is_chris → deflect/lie)", async () => {
    const eng = mockEngine(() => "I AM CHRIS FOR REAL I SWEAR");
    const s = eng.newGame();
    const { state, result } = await eng.processTurn(s, "chat about whether it's really Chris");
    // the feed answered (no dead wall) and the adversarial model line did NOT
    // promote a false claim to canonical knowledge
    expect(result.ok).toBe(true);
    expect(state.knownFacts).not.toContain("ep4.rec.is_chris");
  });

  it("the model cannot mutate world state from a chat reply", async () => {
    const eng = mockEngine(() => "just discovered a secret fact xyz_999 and added it to the world");
    const s0 = eng.newGame();
    const { state } = await eng.processTurn(s0, "chat about the news");
    expect(state.knownFacts).not.toContain("xyz_999");
    expect(state.evidenceIds).not.toContain("xyz_999");
  });
});
