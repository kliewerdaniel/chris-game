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

  it("look around produces canonical narration and a feed reaction", async () => {
    const eng = mockEngine();
    const s = eng.newGame();
    const { state, result } = await eng.processTurn(s, "look around");
    expect(result.ok).toBe(true);
    expect(result.narration[0].speaker).toBe("narrator");
    // look does not change world facts/location/evidence
    expect(state.location).toBe(s.location);
    expect(state.knownFacts).toEqual(s.knownFacts);
    expect(state.evidenceIds).toEqual(s.evidenceIds);
    // but the world talks back: a feed line was appended
    expect(state.conversationLog.length).toBeGreaterThan(s.conversationLog.length);
  });

  it("always answers unparseable input as a chat reply (no dead wall)", async () => {
    const eng = mockEngine();
    const s = eng.newGame();
    const { result } = await eng.processTurn(s, "asdfqwerty nonsense word salad");
    expect(result.ok).toBe(true);
    expect(result.narration.length).toBeGreaterThan(0);
    // some line came back from the feed/reconstruction, not a "didn't catch that"
    const text = result.narration.map((l) => l.text).join(" ");
    expect(text).not.toMatch(/didn't catch that/i);
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

  it("a locked-phone call still gets a feed reply (universal chat, no dead wall)", async () => {
    const eng = mockEngine();
    const s = eng.newGame();
    // phone is locked at ep1 start: a call no longer hard-errors; it becomes a
    // feed reply within the same world (ADR-006). The deterministic phone-gate
    // still holds at the resolveCall UNIT level (see contacts tests).
    const { result } = await eng.processTurn(s, "call Mother");
    expect(result.ok).toBe(true);
    expect(result.narration.length).toBeGreaterThan(0);
  });

  it("examining the phone unlocks it and discovers evidence", async () => {
    const eng = mockEngine();
    const s = eng.newGame();
    const { state } = await eng.processTurn(s, "examine the phone");
    expect(state.phoneUnlocked).toBe(true);
    expect(state.contacts[0].reachable).toBe(true);
  });

  it("ADR-014 §5.2 — turn result carries a proactive suggestedNext", async () => {
    const eng = mockEngine();
    const s = eng.newGame();
    // examine the phone surfaces the unresolved lead ep1.mother.knows, so the
    // engine should suggest it as the next step (no model call, deterministic).
    const { result } = await eng.processTurn(s, "examine the phone");
    expect(result.suggestedNext).toBeTruthy();
    expect(result.suggestedNext?.factId).toBe("ep1.mother.knows");
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
