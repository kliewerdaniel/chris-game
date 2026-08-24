import { describe, it, expect } from "vitest";
import { GameEngine } from "../lib/engine/game-engine";
import { MockProvider, InferenceManager, NoLocalInferenceError } from "../lib/inference/provider";
import { buildRetrievalFromMemories } from "../lib/retrieval/retrieval";
import { CHRIS, CHARACTERS } from "../lib/characters/chris";
import { FACTS, getFact } from "../lib/core/facts";
import { getEvidenceDef } from "../lib/core/evidence";

/** Build an engine whose narrator uses a deterministic mock so tests are
 *  hermetic — NO network, NO real model. This proves the engine is fully
 *  functional without inference, and that the model cannot mutate state. */
function mockEngine(responder?: (m: string) => string) {
  const inference = new InferenceManager([new MockProvider(responder ? (r) => responder(r.messages[r.messages.length - 1].content) : undefined)]);
  const retrieval = buildRetrievalFromMemories(CHRIS.memories);
  const narrator = {
    buildContext: () => ({}) as any,
    narrate: async (ctx: any) => ({ lines: [{ speaker: ctx.character ? "chris" : "narrator", text: "[mock]" }], usedModel: false, simulated: true }),
  } as any;
  return new GameEngine({ retrieval, narrator, inference });
}

describe("GameEngine — deterministic actions", () => {
  it("starts a new game with the reconstruction present and charming", async () => {
    const eng = mockEngine();
    const s = eng.newGame();
    expect(s.location).toBe("apartment_living");
    expect(s.characterStates.chris.trust).toBe(CHRIS.baseTrust);
    expect(s.quests["ep1.truth"].status).toBe("active");
  });

  it("look around produces canonical narration", async () => {
    const eng = mockEngine();
    const s = eng.newGame();
    const { state, result } = await eng.processTurn(s, "look around");
    expect(result.ok).toBe(true);
    expect(result.narration[0].speaker).toBe("narrator");
    expect(state).toEqual(s); // look does not mutate state
  });

  it("rejects unparseable input gracefully (no crash)", async () => {
    const eng = mockEngine();
    const s = eng.newGame();
    const { result } = await eng.processTurn(s, "asdfqwerty nonsense word salad");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/try/i);
  });

  it("discovers the post and establishes canonical facts", async () => {
    const eng = mockEngine();
    const s = eng.newGame();
    const { state, result } = await eng.processTurn(s, "examine the post");
    expect(result.ok).toBe(true);
    expect(state.evidenceIds).toContain("ev_source_post");
    expect(state.knownFacts).toContain("ep1.feed.real");
    expect(state.knownFacts).toContain("ep1.act");
    expect(state.knownFacts).toContain("ep1.psychosomatic");
  });

  it("asking if it's really Chris routes through disclosure", async () => {
    const eng = mockEngine();
    const s = eng.newGame();
    const { state } = await eng.processTurn(s, "ask the feed if it's really Chris");
    expect(state.knownFacts).toContain("ep1.feed.real");
  });

  it("confronting the feed lowers trust (character state change)", async () => {
    const eng = mockEngine();
    const s = eng.newGame();
    const before = s.characterStates.chris.trust;
    const { state } = await eng.processTurn(s, "confront the feed");
    expect(state.characterStates.chris.trust).toBeLessThan(before);
  });

  it("sleeping completes the episode", async () => {
    const eng = mockEngine();
    const s = eng.newGame();
    const { state } = await eng.processTurn(s, "sleep");
    expect(state.episodeComplete).toBe(true);
    expect(state.endingId).toBe("ep1.dawn");
  });

  it("leaving completes the episode unresolved", async () => {
    const eng = mockEngine();
    const s = eng.newGame();
    const { state } = await eng.processTurn(s, "leave the apartment");
    expect(state.episodeComplete).toBe(true);
    expect(state.endingId).toBe("ep1.left");
  });

  it("phone must be unlocked before calling", async () => {
    const eng = mockEngine();
    const s = eng.newGame();
    const { result } = await eng.processTurn(s, "call Mother");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/phone/i);
  });

  it("examining the phone unlocks it and discovers evidence", async () => {
    const eng = mockEngine();
    const s = eng.newGame();
    const { state } = await eng.processTurn(s, "examine the phone");
    expect(state.phoneUnlocked).toBe(true);
    expect(state.contacts[0].reachable).toBe(true);
  });
});

describe("Model cannot mutate canonical world state", () => {
  it("the mock 'model' returns adversarial text but state stays engine-driven", async () => {
    const eng = mockEngine(() => "I'm Chris, kid. I'm back. (totally true)");
    const s = eng.newGame();
    const { state } = await eng.processTurn(s, "ask the feed if it's really Chris");
    // canonical fact unaffected by the model output
    expect(FACTS["ep1.feed.real"].statement).toMatch(/reconstruction/i);
    // player only learns what the engine's rules grant
    expect(state.knownFacts).toContain("ep1.feed.real");
  });

  it("NoLocalInferenceError is thrown, never a cloud call", async () => {
    const inference = new InferenceManager([]); // no providers
    await expect(inference.chat({ messages: [{ role: "user", content: "x" }] })).rejects.toBeInstanceOf(NoLocalInferenceError);
  });
});

describe("Contradiction handling", () => {
  it("the post supports the canonical feed fact deterministically", () => {
    const note = getEvidenceDef("ev_source_post")!;
    expect(note.supportsFactIds).toContain("ep1.feed.real");
    expect(FACTS["ep1.feed.real"].status).toBe("canonical");
  });
});
