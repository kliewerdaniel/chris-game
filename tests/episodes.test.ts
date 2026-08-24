import { describe, it, expect } from "vitest";
import { GameEngine } from "../lib/engine/game-engine";
import { MockProvider, InferenceManager } from "../lib/inference/provider";
import { buildRetrievalFromMemories } from "../lib/retrieval/retrieval";
import { CHRIS } from "../lib/characters/chris";
import { FACTS2, FACTS3, FACTS4, allFacts } from "../lib/core/facts";

function mockEngine() {
  const inference = new InferenceManager([new MockProvider(() => "[mock]")]);
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

describe("Episode 2 — THE FEED", () => {
  const eng = mockEngine();

  it("starts with the feed running and the living-with-it quest active", () => {
    const s = eng.newGame("ep2");
    expect(s.episodeId).toBe("ep2");
    expect(s.location).toBe("apartment_living");
    expect(s.quests["ep2.live"].status).toBe("active");
    expect(FACTS2["ep2.captain"].status).toBe("canonical");
  });

  it("carries Ep1 evidence + known facts forward (continuity)", () => {
    let carry = eng.newGame("ep1");
    carry = { ...carry, evidenceIds: ["ev_source_post"], knownFacts: ["ep1.feed.real", "ep1.act"] };
    const ep2 = eng.nextEpisode(carry);
    expect(ep2).not.toBeNull();
    expect(ep2!.episodeId).toBe("ep2");
    expect(ep2!.evidenceIds).toContain("ev_source_post");
    expect(ep2!.knownFacts).toContain("ep1.feed.real");
  });

  it("examining the photo establishes Chris-and-Captain canonically", async () => {
    const s = eng.newGame("ep2");
    const { state } = await eng.processTurn(s, "examine the photo");
    expect(state.evidenceIds).toContain("ev_captain_photo");
    expect(state.knownFacts).toContain("ep2.captain");
    expect(FACTS2["ep2.captain"].status).toBe("canonical");
  });
});

describe("Episode 3 — THE TOLL", () => {
  const eng = mockEngine();

  it("starts with the toll quest active and the bedbound fact canonical", () => {
    const s = eng.newGame("ep3");
    expect(s.episodeId).toBe("ep3");
    expect(s.quests["ep3.toll"].status).toBe("active");
    expect(FACTS3["ep3.toll"].status).toBe("canonical");
    expect(FACTS3["ep3.bedbound"].status).toBe("canonical");
  });

  it("the post surfaces the bedbound toll when examined", async () => {
    const s = eng.newGame("ep3");
    const { state } = await eng.processTurn(s, "examine the post");
    expect(state.evidenceIds).toContain("ev_source_post");
    expect(state.knownFacts).toContain("ep3.bedbound");
  });

  it("confronting the feed names the toll (canonical)", async () => {
    const s = eng.newGame("ep3");
    const { state } = await eng.processTurn(s, "confront the feed");
    expect(state.evidenceIds).toContain("ev_source_post");
    expect(state.knownFacts).toContain("ep3.bedbound");
  });
});

describe("Episode 4 — THE ACT", () => {
  const eng = mockEngine();

  it("Chris is gone; the reconstruction is the interlocutor", () => {
    const s = eng.newGame("ep4");
    expect(s.episodeId).toBe("ep4");
    expect(FACTS4["ep4.rec.is_model"].status).toBe("canonical");
    expect(FACTS4["ep4.rec.remembers"].status).toBe("rumor");
  });

  it("examining the letter establishes the echo-vs-voice crux", async () => {
    const s = eng.newGame("ep4");
    const { state } = await eng.processTurn(s, "examine the letter");
    expect(state.evidenceIds).toContain("ev_chris_final_note");
    expect(state.knownFacts).toContain("ep4.rec.is_model");
  });

  it("examining the output log establishes the reconstruction-as-model fact", async () => {
    const s = eng.newGame("ep4");
    const { state } = await eng.processTurn(s, "examine the output log");
    expect(state.evidenceIds).toContain("ev_reconstruction_log");
    expect(state.knownFacts).toContain("ep4.rec.is_model");
  });

  it("the reconstruction's 'remembering' is only rumor, never canonical", () => {
    expect(FACTS4["ep4.rec.remembers"].status).toBe("rumor");
    expect(FACTS4["ep4.rec.remembers"].claimedBy).toBe("reconstruction");
  });

  it("closing the model completes the finale", async () => {
    const s = eng.newGame("ep4");
    const { state } = await eng.processTurn(s, "close the laptop");
    expect(state.episodeComplete).toBe(true);
    expect(state.endingId).toBe("ep4.closed");
  });
});

describe("Episode continuity chain", () => {
  const eng = mockEngine();

  it("ep1 -> ep2 -> ep3 -> ep4 all reachable and ordered", () => {
    let s = eng.newGame("ep1");
    s = eng.nextEpisode(s)!;
    expect(s.episodeId).toBe("ep2");
    s = eng.nextEpisode(s)!;
    expect(s.episodeId).toBe("ep3");
    s = eng.nextEpisode(s)!;
    expect(s.episodeId).toBe("ep4");
    expect(eng.nextEpisode(s)).toBeNull(); // ep4 is the finale
  });

  it("all episode fact catalogs merge without collision", () => {
    const merged = allFacts();
    expect(Object.keys(merged).length).toBeGreaterThan(0);
    expect(merged["ep1.feed.real"]).toBeDefined();
    expect(merged["ep2.captain"]).toBeDefined();
    expect(merged["ep3.toll"]).toBeDefined();
    expect(merged["ep4.rec.is_model"]).toBeDefined();
  });
});

describe("Epistemic integrity preserved across episodes", () => {
  it("every canonical fact carries provenance; testimony carries claimedBy", () => {
    const merged = allFacts();
    for (const f of Object.values(merged)) {
      expect(f.provenance).toBeDefined();
      if (f.status === "testimony") expect(f.claimedBy).toBeDefined();
    }
  });
});
